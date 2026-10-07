import { strict as assert } from 'assert';
import { after, before, describe, it } from 'node:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// config.ts lee process.env al importarse: el entorno debe fijarse antes de cargar la app.
const dataDir = mkdtempSync(join(tmpdir(), 'dosuxsoft-inventory-'));
process.env['DATA_DIR'] = dataDir;
process.env['TENANT_BASE_DOMAIN'] = 'dosuxsoft.test';
process.env['NODE_ENV'] = 'development';

const { buildApp } = await import('../app.js');
const { closeAllTenantDbs } = await import('../db/client.js');
const { closeControlDb, insertTenant, setSetupCodeHash } = await import('../db/control.js');
const { COOKIE_NAME } = await import('../lib/constants.js');
const { generateSetupCode, hashSetupCode } = await import('../lib/crypto.js');

type App = Awaited<ReturnType<typeof buildApp>>;

const HOST = 'tienda.dosuxsoft.test';

describe('inventario y ventas con carrito', () => {
  let app: App;
  const tokens: Record<string, string> = {};
  let funda: { id: number };

  const call = (
    who: string,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    payload?: object,
  ) =>
    app.inject({
      method,
      url,
      headers: { host: HOST, cookie: `${COOKIE_NAME}=${tokens[who]}` },
      ...(payload ? { payload } : {}),
    });

  const product = async (id: number) =>
    (await call('admin', 'GET', '/api/products?filter=activos'))
      .json()
      .products.find((p: { id: number }) => p.id === id);

  before(async () => {
    insertTenant('tienda', 'Tienda');
    const code = generateSetupCode();
    setSetupCodeHash('tienda', await hashSetupCode(code));
    app = await buildApp({ startJobs: false });

    const setup = await app.inject({
      method: 'POST',
      url: '/auth/setup',
      headers: { host: HOST },
      payload: {
        setupCode: code,
        username: 'dueno',
        displayName: 'Dueño',
        password: 'clave-dueno-1',
        confirmPassword: 'clave-dueno-1',
      },
    });
    tokens['dueno'] = setup.cookies.find((c) => c.name === COOKIE_NAME)!.value;

    for (const [username, role, secret] of [
      ['admin', 'admin', 'clave-admin-1'],
      ['caja', 'cajero', '135790'],
    ] as const) {
      assert.equal(
        (
          await call('dueno', 'POST', '/api/users', {
            username,
            displayName: username,
            role,
            secret,
          })
        ).statusCode,
        201,
      );
      const login = await app.inject({
        method: 'POST',
        url: '/auth/login',
        headers: { host: HOST },
        remoteAddress: `10.1.0.${username.length}`,
        payload: { username, password: secret },
      });
      tokens[username] = login.cookies.find((c) => c.name === COOKIE_NAME)!.value;
    }

    assert.equal(
      (await call('caja', 'POST', '/api/cash-registers/open', { openingAmount: 0 })).statusCode,
      201,
    );
  });

  after(async () => {
    await app.close();
    closeAllTenantDbs();
    closeControlDb();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('el admin crea un producto con stock inicial; el código es único', async () => {
    const res = await call('admin', 'POST', '/api/products', {
      name: 'Funda iPhone 15',
      code: '7501234567890',
      category: 'Fundas',
      price: 8000,
      cost: 3000,
      initialStock: 5,
      minStock: 2,
    });
    assert.equal(res.statusCode, 201, res.body);
    funda = res.json();
    assert.equal(res.json().stock, 5);

    const dup = await call('admin', 'POST', '/api/products', {
      name: 'Otra',
      code: '7501234567890',
      price: 1,
    });
    assert.equal(dup.statusCode, 409);
  });

  it('el cajero consulta productos pero no ve costos ni puede editarlos', async () => {
    const list = (await call('caja', 'GET', '/api/products?q=funda')).json();
    assert.equal(list.products[0].name, 'Funda iPhone 15');
    assert.equal(list.products[0].cost, null, 'el cajero no ve el costo');
    assert.equal((await product(funda.id)).cost, 3000, 'el admin sí');

    assert.equal(
      (await call('caja', 'POST', '/api/products', { name: 'X', price: 1 })).statusCode,
      403,
    );
    assert.equal(
      (await call('caja', 'PATCH', `/api/products/${funda.id}`, { price: 1 })).statusCode,
      403,
    );
    assert.equal(
      (
        await call('caja', 'POST', `/api/products/${funda.id}/movements`, {
          type: 'entrada',
          quantity: 1,
        })
      ).statusCode,
      403,
    );
  });

  it('el lector de código encuentra el producto exacto', async () => {
    assert.equal(
      (await call('caja', 'GET', '/api/products/lookup?code=7501234567890')).json().id,
      funda.id,
    );
    assert.equal((await call('caja', 'GET', '/api/products/lookup?code=000')).statusCode, 404);
  });

  let saleId = 0;

  it('una venta con carrito usa el precio del catálogo, suma líneas libres y descuenta stock', async () => {
    const res = await call('caja', 'POST', '/api/sales', {
      paymentMethod: 'sinpe',
      items: [
        { productId: funda.id, quantity: 2, unitPrice: 1 }, // unitPrice del cliente se ignora
        { description: 'Instalación', quantity: 1, unitPrice: 2000 },
      ],
    });
    assert.equal(res.statusCode, 201, res.body);
    const sale = res.json();
    saleId = sale.id;
    assert.equal(sale.amount, 2 * 8000 + 2000);
    assert.equal(sale.items[0].unitPrice, 8000);
    assert.equal(sale.description, '2× Funda iPhone 15, Instalación');
    assert.deepEqual(sale.stockWarnings, []);
    assert.equal((await product(funda.id)).stock, 3);
  });

  it('vender sin stock se permite y avisa (stock negativo)', async () => {
    const res = await call('caja', 'POST', '/api/sales', {
      paymentMethod: 'efectivo',
      items: [{ productId: funda.id, quantity: 5 }],
    });
    assert.equal(res.statusCode, 201);
    assert.equal(res.json().stockWarnings[0].stock, -2);
    assert.equal((await product(funda.id)).stock, -2);

    // Eliminar esa venta devuelve las 5 unidades.
    assert.equal(
      (await call('admin', 'DELETE', `/api/sales/${res.json().id}`, {})).statusCode,
      200,
    );
    assert.equal((await product(funda.id)).stock, 3);
  });

  it('la lista de ventas incluye las líneas (para reimprimir el ticket)', async () => {
    const list = (await call('caja', 'GET', '/api/sales')).json();
    const sale = list.sales.find((s: { id: number }) => s.id === saleId);
    assert.equal(sale.items.length, 2);
  });

  it('cambiar el precio no altera ventas pasadas, y queda en la bitácora', async () => {
    assert.equal(
      (await call('admin', 'PATCH', `/api/products/${funda.id}`, { price: 9500 })).json().price,
      9500,
    );
    const sale = (await call('caja', 'GET', '/api/sales'))
      .json()
      .sales.find((s: { id: number }) => s.id === saleId);
    assert.equal(sale.items[0].unitPrice, 8000);
  });

  it('entradas y ajustes quedan en el historial con su saldo', async () => {
    const entrada = await call('admin', 'POST', `/api/products/${funda.id}/movements`, {
      type: 'entrada',
      quantity: 10,
      unitCost: 3500,
    });
    assert.equal(entrada.statusCode, 201, entrada.body);
    assert.equal(entrada.json().stock, 13);
    assert.equal(entrada.json().cost, 3500, 'el costo pasa a ser el de la última entrada');

    const ajuste = await call('admin', 'POST', `/api/products/${funda.id}/movements`, {
      type: 'ajuste',
      newStock: 11,
      reason: 'Conteo: 2 dañadas',
    });
    assert.equal(ajuste.json().stock, 11);

    const sinMotivo = await call('admin', 'POST', `/api/products/${funda.id}/movements`, {
      type: 'ajuste',
      newStock: 1,
      reason: '',
    });
    assert.equal(sinMotivo.statusCode, 400, 'el ajuste exige motivo');

    const history = (await call('admin', 'GET', `/api/products/${funda.id}/movements`)).json();
    assert.deepEqual(
      history
        .map((m: { type: string; quantity: number; stockAfter: number }) => [
          m.type,
          m.quantity,
          m.stockAfter,
        ])
        .slice(0, 4),
      [
        ['ajuste', -2, 11],
        ['entrada', 10, 13],
        ['anulacion_venta', 5, 3],
        ['venta', -5, -2],
      ],
    );
    assert.equal(history[0].username, 'admin');
  });

  it('un servicio sin control de stock se vende sin tocar existencias', async () => {
    const svc = (
      await call('admin', 'POST', '/api/products', {
        name: 'Cambio de pantalla',
        price: 25000,
        trackStock: false,
      })
    ).json();
    const sale = await call('caja', 'POST', '/api/sales', {
      paymentMethod: 'tarjeta',
      items: [{ productId: svc.id, quantity: 1 }],
    });
    assert.equal(sale.statusCode, 201);
    assert.equal((await product(svc.id)).stock, 0);
    assert.equal(
      (
        await call('admin', 'POST', `/api/products/${svc.id}/movements`, {
          type: 'entrada',
          quantity: 1,
        })
      ).statusCode,
      400,
    );
  });

  it('un producto desactivado no se vende ni aparece en el lector', async () => {
    await call('admin', 'PATCH', `/api/products/${funda.id}`, { active: false });
    const sale = await call('caja', 'POST', '/api/sales', {
      paymentMethod: 'efectivo',
      items: [{ productId: funda.id, quantity: 1 }],
    });
    assert.equal(sale.statusCode, 400);
    assert.equal(
      (await call('caja', 'GET', '/api/products/lookup?code=7501234567890')).statusCode,
      404,
    );
  });

  it('la venta de monto libre sigue funcionando como antes', async () => {
    const res = await call('caja', 'POST', '/api/sales', {
      amount: 1500,
      paymentMethod: 'efectivo',
      description: 'Varios',
    });
    assert.equal(res.statusCode, 201);
    assert.deepEqual(res.json().items, []);
  });
});
