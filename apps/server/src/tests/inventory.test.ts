import { beforeAll, describe, expect, it } from 'vitest';
import { call, createTestTenant, loginToken, type Method } from './helpers.js';

const SLUG = 'inventario';

interface Product {
  id: number;
  name: string;
  stock: number;
  cost: number | null;
  price: number;
}

describe('inventario y ventas con carrito', () => {
  const tokens: Record<string, string> = {};
  let funda: { id: number };

  const api = (who: string, method: Method, url: string, body?: object) =>
    call(SLUG, method, url, { token: tokens[who], body });
  const json = async <T = Record<string, unknown>>(res: Response | Promise<Response>) =>
    (await (await res).json()) as T;

  const product = async (id: number) =>
    (
      await json<{ products: Product[] }>(api('admin', 'GET', '/api/products?filter=activos'))
    ).products.find((p) => p.id === id)!;

  beforeAll(async () => {
    await createTestTenant(SLUG, { owner: { username: 'dueno', password: 'clave-dueno-1' } });
    tokens['dueno'] = await loginToken(SLUG, 'dueno', 'clave-dueno-1');

    for (const [username, role, secret] of [
      ['admin', 'admin', 'clave-admin-1'],
      ['caja', 'cajero', '135790'],
    ] as const) {
      const res = await api('dueno', 'POST', '/api/users', {
        username,
        displayName: username,
        role,
        secret,
      });
      expect(res.status).toBe(201);
      tokens[username] = await loginToken(SLUG, username, secret);
    }

    expect(
      (await api('caja', 'POST', '/api/cash-registers/open', { openingAmount: 0 })).status,
    ).toBe(201);
  });

  it('el admin crea un producto con stock inicial; el código es único', async () => {
    const res = await api('admin', 'POST', '/api/products', {
      name: 'Funda iPhone 15',
      code: '7501234567890',
      category: 'Fundas',
      price: 8000,
      cost: 3000,
      initialStock: 5,
      minStock: 2,
    });
    expect(res.status).toBe(201);
    const created = await json<Product>(res);
    funda = created;
    expect(created.stock).toBe(5);

    const dup = await api('admin', 'POST', '/api/products', {
      name: 'Otra',
      code: '7501234567890',
      price: 1,
    });
    expect(dup.status).toBe(409);
  });

  it('el cajero consulta productos pero no ve costos ni puede editarlos', async () => {
    const list = await json<{ products: Product[] }>(api('caja', 'GET', '/api/products?q=funda'));
    expect(list.products[0]!.name).toBe('Funda iPhone 15');
    expect(list.products[0]!.cost, 'el cajero no ve el costo').toBeNull();
    expect((await product(funda.id)).cost, 'el admin sí').toBe(3000);

    expect((await api('caja', 'POST', '/api/products', { name: 'X', price: 1 })).status).toBe(403);
    expect((await api('caja', 'PATCH', `/api/products/${funda.id}`, { price: 1 })).status).toBe(
      403,
    );
    expect(
      (
        await api('caja', 'POST', `/api/products/${funda.id}/movements`, {
          type: 'entrada',
          quantity: 1,
        })
      ).status,
    ).toBe(403);
  });

  it('el lector de código encuentra el producto exacto', async () => {
    expect(
      (await json<Product>(api('caja', 'GET', '/api/products/lookup?code=7501234567890'))).id,
    ).toBe(funda.id);
    expect((await api('caja', 'GET', '/api/products/lookup?code=000')).status).toBe(404);
  });

  let saleId = 0;

  it('una venta con carrito usa el precio del catálogo, suma líneas libres y descuenta stock', async () => {
    const res = await api('caja', 'POST', '/api/sales', {
      paymentMethod: 'sinpe',
      items: [
        { productId: funda.id, quantity: 2, unitPrice: 1 }, // unitPrice del cliente se ignora
        { description: 'Instalación', quantity: 1, unitPrice: 2000 },
      ],
    });
    expect(res.status).toBe(201);
    const sale = await json<{
      id: number;
      amount: number;
      description: string;
      items: { unitPrice: number }[];
      stockWarnings: unknown[];
    }>(res);
    saleId = sale.id;
    expect(sale.amount).toBe(2 * 8000 + 2000);
    expect(sale.items[0]!.unitPrice).toBe(8000);
    expect(sale.description).toBe('2× Funda iPhone 15, Instalación');
    expect(sale.stockWarnings).toEqual([]);
    expect((await product(funda.id)).stock).toBe(3);
  });

  it('vender sin stock se permite y avisa (stock negativo)', async () => {
    const res = await api('caja', 'POST', '/api/sales', {
      paymentMethod: 'efectivo',
      items: [{ productId: funda.id, quantity: 5 }],
    });
    expect(res.status).toBe(201);
    const sale = await json<{ id: number; stockWarnings: { stock: number }[] }>(res);
    expect(sale.stockWarnings[0]!.stock).toBe(-2);
    expect((await product(funda.id)).stock).toBe(-2);

    // Eliminar esa venta devuelve las 5 unidades.
    expect((await api('admin', 'DELETE', `/api/sales/${sale.id}`, {})).status).toBe(200);
    expect((await product(funda.id)).stock).toBe(3);
  });

  it('la lista de ventas incluye las líneas (para reimprimir el ticket)', async () => {
    const list = await json<{ sales: { id: number; items: unknown[] }[] }>(
      api('caja', 'GET', '/api/sales'),
    );
    expect(list.sales.find((s) => s.id === saleId)!.items).toHaveLength(2);
  });

  it('cambiar el precio no altera ventas pasadas, y queda en la bitácora', async () => {
    expect(
      (await json<Product>(api('admin', 'PATCH', `/api/products/${funda.id}`, { price: 9500 })))
        .price,
    ).toBe(9500);
    const list = await json<{ sales: { id: number; items: { unitPrice: number }[] }[] }>(
      api('caja', 'GET', '/api/sales'),
    );
    expect(list.sales.find((s) => s.id === saleId)!.items[0]!.unitPrice).toBe(8000);
  });

  it('entradas y ajustes quedan en el historial con su saldo', async () => {
    const entrada = await api('admin', 'POST', `/api/products/${funda.id}/movements`, {
      type: 'entrada',
      quantity: 10,
      unitCost: 3500,
    });
    expect(entrada.status).toBe(201);
    const afterEntrada = await json<Product>(entrada);
    expect(afterEntrada.stock).toBe(13);
    expect(afterEntrada.cost, 'el costo pasa a ser el de la última entrada').toBe(3500);

    const ajuste = await api('admin', 'POST', `/api/products/${funda.id}/movements`, {
      type: 'ajuste',
      newStock: 11,
      reason: 'Conteo: 2 dañadas',
    });
    expect((await json<Product>(ajuste)).stock).toBe(11);

    const sinMotivo = await api('admin', 'POST', `/api/products/${funda.id}/movements`, {
      type: 'ajuste',
      newStock: 1,
      reason: '',
    });
    expect(sinMotivo.status, 'el ajuste exige motivo').toBe(400);

    const history = await json<
      { type: string; quantity: number; stockAfter: number; username: string }[]
    >(api('admin', 'GET', `/api/products/${funda.id}/movements`));
    expect(history.map((m) => [m.type, m.quantity, m.stockAfter]).slice(0, 4)).toEqual([
      ['ajuste', -2, 11],
      ['entrada', 10, 13],
      ['anulacion_venta', 5, 3],
      ['venta', -5, -2],
    ]);
    expect(history[0]!.username).toBe('admin');
  });

  it('un servicio sin control de stock se vende sin tocar existencias', async () => {
    const svc = await json<Product>(
      api('admin', 'POST', '/api/products', {
        name: 'Cambio de pantalla',
        price: 25000,
        trackStock: false,
      }),
    );
    const sale = await api('caja', 'POST', '/api/sales', {
      paymentMethod: 'tarjeta',
      items: [{ productId: svc.id, quantity: 1 }],
    });
    expect(sale.status).toBe(201);
    expect((await product(svc.id)).stock).toBe(0);
    expect(
      (
        await api('admin', 'POST', `/api/products/${svc.id}/movements`, {
          type: 'entrada',
          quantity: 1,
        })
      ).status,
    ).toBe(400);
  });

  it('un producto desactivado no se vende ni aparece en el lector', async () => {
    await api('admin', 'PATCH', `/api/products/${funda.id}`, { active: false });
    const sale = await api('caja', 'POST', '/api/sales', {
      paymentMethod: 'efectivo',
      items: [{ productId: funda.id, quantity: 1 }],
    });
    expect(sale.status).toBe(400);
    expect((await api('caja', 'GET', '/api/products/lookup?code=7501234567890')).status).toBe(404);
  });

  it('la venta de monto libre sigue funcionando como antes', async () => {
    const res = await api('caja', 'POST', '/api/sales', {
      amount: 1500,
      paymentMethod: 'efectivo',
      description: 'Varios',
    });
    expect(res.status).toBe(201);
    expect((await json<{ items: unknown[] }>(res)).items).toEqual([]);
  });
});
