import { strict as assert } from 'assert';
import { after, before, describe, it } from 'node:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// config.ts lee process.env al importarse: el entorno debe fijarse antes de cargar la app.
const dataDir = mkdtempSync(join(tmpdir(), 'dosuxsoft-currency-'));
process.env['DATA_DIR'] = dataDir;
process.env['TENANT_BASE_DOMAIN'] = 'dosuxsoft.test';
process.env['NODE_ENV'] = 'development';
delete process.env['BCCR_API_TOKEN'];

const { buildApp } = await import('../app.js');
const { closeAllTenantDbs } = await import('../db/client.js');
const { closeControlDb, insertTenant, saveExchangeRate, setSetupCodeHash } = await import('../db/control.js');
const { COOKIE_NAME } = await import('../lib/constants.js');
const { generateSetupCode, hashSetupCode } = await import('../lib/crypto.js');
const { todayCR } = await import('../lib/cr-time.js');
const { fetchBccrRates } = await import('../lib/bccr.js');
const { formatUsd, parseUsdToCents, usdCentsToColones, renderMessage, whatsappLink } = await import('@sipnato/shared');

type App = Awaited<ReturnType<typeof buildApp>>;
const HOST = 'tienda.dosuxsoft.test';

function daysAgo(n: number): string {
  const d = new Date(`${todayCR()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

describe('utilidades de dólares y mensajes', () => {
  it('convierte con enteros, sin flotantes', () => {
    assert.equal(usdCentsToColones(2000, 50000), 10_000);
    assert.equal(usdCentsToColones(2000, 50523), 10_105); // 10104.6 → 10105
    assert.equal(parseUsdToCents('20'), 2000);
    assert.equal(parseUsdToCents('20,5'), 2050);
    assert.equal(parseUsdToCents('20.05'), 2005);
    assert.equal(parseUsdToCents('abc'), null);
    assert.equal(formatUsd(123456), '$1,234.56');
  });

  it('arma el mensaje y el enlace de WhatsApp', () => {
    const msg = renderMessage('Hola {cliente}, orden #{numero} {desconocida}', { cliente: 'Ana', numero: '7' });
    assert.equal(msg, 'Hola Ana, orden #7 {desconocida}');
    assert.equal(whatsappLink('8888-7777', 'hola'), 'https://wa.me/50688887777?text=hola');
    assert.equal(whatsappLink(null, 'a b'), 'https://wa.me/?text=a%20b');
  });
});

describe('cliente del API SDDE del BCCR', () => {
  it('combina compra (317) y venta (318) por fecha y pasa a centésimas', async () => {
    const original = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push(url);
      assert.equal((init?.headers as Record<string, string>)['Authorization'], 'Bearer tok');
      const code = url.includes('/317/') ? '317' : '318';
      const values = code === '317' ? [505.23, 506.1] : [511.8, 512.4];
      return new Response(JSON.stringify({
        estado: true,
        datos: [{
          codigoIndicador: code,
          series: [
            { fecha: '2026-10-06T00:00:00', valorDatoPorPeriodo: values[0] },
            { fecha: '2026-10-07T00:00:00', valorDatoPorPeriodo: values[1] },
          ],
        }],
      }), { status: 200 });
    }) as typeof fetch;
    try {
      const rates = await fetchBccrRates('2026-10-01', '2026-10-07', 'tok');
      assert.deepEqual(rates, [
        { date: '2026-10-06', buy: 50523, sell: 51180 },
        { date: '2026-10-07', buy: 50610, sell: 51240 },
      ]);
      assert.match(calls[0]!, /fechaInicio=2026\/10\/01&fechaFin=2026\/10\/07/);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('un token rechazado es un error claro', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response('', { status: 401 })) as typeof fetch;
    try {
      await assert.rejects(fetchBccrRates('2026-10-01', '2026-10-07', 'malo'), /rechazó el token/);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('cobro en dólares', () => {
  let app: App;
  let token = '';

  const call = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) =>
    app.inject({ method, url, headers: { host: HOST, cookie: `${COOKIE_NAME}=${token}` }, ...(payload ? { payload } : {}) });

  async function setManualRate(rate: string) {
    const settings = (await call('GET', '/api/settings')).json();
    assert.equal((await call('PUT', '/api/settings', { ...settings, usd_manual_rate: rate })).statusCode, 200);
  }

  const saleUsd = (amount: number, usdReceivedCents: number) =>
    call('POST', '/api/sales', { amount, paymentMethod: 'dolares', usdReceivedCents });

  before(async () => {
    insertTenant('tienda', 'Tienda');
    const code = generateSetupCode();
    setSetupCodeHash('tienda', await hashSetupCode(code));
    app = await buildApp({ startJobs: false });
    const setup = await app.inject({
      method: 'POST', url: '/auth/setup', headers: { host: HOST },
      payload: { setupCode: code, username: 'dueno', displayName: 'Dueño', password: 'clave-dueno-1', confirmPassword: 'clave-dueno-1' },
    });
    token = setup.cookies.find((c) => c.name === COOKIE_NAME)!.value;
    assert.equal((await call('POST', '/api/cash-registers/open', { openingAmount: 0 })).statusCode, 201);
  });

  after(async () => {
    await app.close();
    closeAllTenantDbs();
    closeControlDb();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('sin tipo de cambio no se puede cobrar en dólares', async () => {
    assert.deepEqual((await call('GET', '/api/exchange-rate')).json().source, null);
    const res = await saleUsd(8000, 2000);
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error.code, 'TIPO_CAMBIO_NO_DISPONIBLE');
  });

  it('con el tipo de respaldo calcula el vuelto en colones', async () => {
    await setManualRate('500');
    const info = (await call('GET', '/api/exchange-rate')).json();
    assert.deepEqual([info.rate, info.source], [50000, 'manual']);

    const sale = (await saleUsd(8000, 2000)).json();
    assert.equal(sale.amount, 8000, 'la venta se registra en colones');
    assert.deepEqual([sale.usdReceivedCents, sale.exchangeRate, sale.changeColones], [2000, 50000, 2000]);
  });

  it('dólares insuficientes se rechazan indicando el mínimo', async () => {
    const res = await saleUsd(8000, 1000);
    assert.equal(res.statusCode, 400);
    assert.match(res.json().error.message, /Mínimo: \$16\.00/);
  });

  it('un dato viejo del BCCR no se usa; uno reciente manda sobre el respaldo', async () => {
    saveExchangeRate(daysAgo(10), 49000, 49500);
    assert.equal((await call('GET', '/api/exchange-rate')).json().source, 'manual');

    saveExchangeRate(todayCR(), 50523, 51180);
    const info = (await call('GET', '/api/exchange-rate')).json();
    assert.deepEqual([info.rate, info.source, info.bccrSell], [50523, 'bccr', 51180], 'recibir USD usa el tipo de compra');

    const sale = (await saleUsd(8000, 2000)).json();
    assert.equal(sale.changeColones, 10_105 - 8000);
  });

  it('la caja separa los dólares recibidos y los vueltos en colones', async () => {
    await call('POST', '/api/sales', { amount: 3000, paymentMethod: 'efectivo' });
    const { totals } = (await call('GET', '/api/cash-registers/current')).json();
    assert.equal(totals.salesDolares, 16_000);
    assert.equal(totals.usdReceivedCents, 4000);
    assert.equal(totals.usdChangeColones, 2000 + 2105);
    assert.equal(totals.salesEfectivo, 3000);
    assert.equal(totals.totalSales, 19_000);
  });

  it('un tipo de respaldo con formato inválido se rechaza', async () => {
    const settings = (await call('GET', '/api/settings')).json();
    assert.equal((await call('PUT', '/api/settings', { ...settings, usd_manual_rate: 'quinientos' })).statusCode, 400);
  });

  it('registra los avisos enviados por WhatsApp', async () => {
    const ok = await call('POST', '/api/notifications', { event: 'orden_lista', entityType: 'boleta', entityId: 5, phone: '88887777' });
    assert.equal(ok.statusCode, 201);
    const list = (await call('GET', '/api/notifications?entityType=boleta&entityId=5')).json();
    assert.equal(list[0].event, 'orden_lista');
    assert.equal(list[0].username, 'dueno');

    const bad = await call('POST', '/api/notifications', { event: 'spam', entityType: 'boleta', entityId: 5, phone: null });
    assert.equal(bad.statusCode, 400);
  });
});
