import {
  formatUsd,
  parseUsdToCents,
  renderMessage,
  usdCentsToColones,
  whatsappLink,
} from '@sipnato/shared';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { fetchBccrRates } from '../lib/bccr.js';
import { call, createTestTenant, loginToken, type Method } from './helpers.js';

const SLUG = 'dolares';

describe('utilidades de dólares y mensajes', () => {
  it('convierte con enteros, sin flotantes', () => {
    expect(usdCentsToColones(2000, 50000)).toBe(10_000);
    expect(usdCentsToColones(2000, 50523)).toBe(10_105); // 10104.6 → 10105
    expect(parseUsdToCents('20')).toBe(2000);
    expect(parseUsdToCents('20,5')).toBe(2050);
    expect(parseUsdToCents('20.05')).toBe(2005);
    expect(parseUsdToCents('abc')).toBeNull();
    expect(formatUsd(123456)).toBe('$1,234.56');
  });

  it('arma el mensaje y el enlace de WhatsApp', () => {
    const msg = renderMessage('Hola {cliente}, orden #{numero} {desconocida}', {
      cliente: 'Ana',
      numero: '7',
    });
    expect(msg).toBe('Hola Ana, orden #7 {desconocida}');
    expect(whatsappLink('8888-7777', 'hola')).toBe('https://wa.me/50688887777?text=hola');
    expect(whatsappLink(null, 'a b')).toBe('https://wa.me/?text=a%20b');
  });
});

describe('cliente del API SDDE del BCCR', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('combina compra (317) y venta (318) por fecha y pasa a centésimas', async () => {
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      calls.push(url);
      expect((init?.headers as Record<string, string>)['Authorization']).toBe('Bearer tok');
      const code = url.includes('/317/') ? '317' : '318';
      const values = code === '317' ? [505.23, 506.1] : [511.8, 512.4];
      return Response.json({
        estado: true,
        datos: [
          {
            codigoIndicador: code,
            series: [
              { fecha: '2026-10-06T00:00:00', valorDatoPorPeriodo: values[0] },
              { fecha: '2026-10-07T00:00:00', valorDatoPorPeriodo: values[1] },
            ],
          },
        ],
      });
    });

    const rates = await fetchBccrRates('2026-10-01', '2026-10-07', 'tok');
    expect(rates).toEqual([
      { date: '2026-10-06', buy: 50523, sell: 51180 },
      { date: '2026-10-07', buy: 50610, sell: 51240 },
    ]);
    expect(calls[0]).toMatch(/fechaInicio=2026\/10\/01&fechaFin=2026\/10\/07/);
  });

  it('un token rechazado es un error claro', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 401 }));
    await expect(fetchBccrRates('2026-10-01', '2026-10-07', 'malo')).rejects.toThrow(
      /rechazó el token/,
    );
  });
});

// Hasta la Tarea 5 la plataforma no entrega tipo de cambio del BCCR: rige el de respaldo.
describe('cobro en dólares', () => {
  let token = '';

  const api = (method: Method, url: string, body?: object) =>
    call(SLUG, method, url, { token, body });
  const json = async <T = Record<string, unknown>>(res: Response | Promise<Response>) =>
    (await (await res).json()) as T;

  async function setManualRate(rate: string) {
    const settings = await json(api('GET', '/api/settings'));
    expect((await api('PUT', '/api/settings', { ...settings, usd_manual_rate: rate })).status).toBe(
      200,
    );
  }

  const saleUsd = (amount: number, usdReceivedCents: number) =>
    api('POST', '/api/sales', { amount, paymentMethod: 'dolares', usdReceivedCents });

  beforeAll(async () => {
    await createTestTenant(SLUG, { owner: { username: 'dueno', password: 'clave-dueno-1' } });
    token = await loginToken(SLUG, 'dueno', 'clave-dueno-1');
    expect((await api('POST', '/api/cash-registers/open', { openingAmount: 0 })).status).toBe(201);
  });

  it('sin tipo de cambio no se puede cobrar en dólares', async () => {
    expect((await json(api('GET', '/api/exchange-rate'))).source).toBeNull();
    const res = await saleUsd(8000, 2000);
    expect(res.status).toBe(400);
    expect((await json<{ error: { code: string } }>(res)).error.code).toBe(
      'TIPO_CAMBIO_NO_DISPONIBLE',
    );
  });

  it('con el tipo de respaldo calcula el vuelto en colones', async () => {
    await setManualRate('500');
    const info = await json(api('GET', '/api/exchange-rate'));
    expect([info.rate, info.source]).toEqual([50000, 'manual']);

    const sale = await json(saleUsd(8000, 2000));
    expect(sale.amount, 'la venta se registra en colones').toBe(8000);
    expect([sale.usdReceivedCents, sale.exchangeRate, sale.changeColones]).toEqual([
      2000, 50000, 2000,
    ]);
  });

  it('dólares insuficientes se rechazan indicando el mínimo', async () => {
    const res = await saleUsd(8000, 1000);
    expect(res.status).toBe(400);
    expect((await json<{ error: { message: string } }>(res)).error.message).toMatch(
      /Mínimo: \$16\.00/,
    );
  });

  it('el respaldo admite centésimas y redondea el vuelto a colones enteros', async () => {
    await setManualRate('505.23');
    const sale = await json(saleUsd(8000, 2000));
    expect(sale.exchangeRate).toBe(50523);
    expect(sale.changeColones).toBe(10_105 - 8000);
  });

  it('la caja separa los dólares recibidos y los vueltos en colones', async () => {
    await api('POST', '/api/sales', { amount: 3000, paymentMethod: 'efectivo' });
    const { totals } = await json<{ totals: Record<string, number> }>(
      api('GET', '/api/cash-registers/current'),
    );
    expect(totals['salesDolares']).toBe(16_000);
    expect(totals['usdReceivedCents']).toBe(4000);
    expect(totals['usdChangeColones']).toBe(2000 + 2105);
    expect(totals['salesEfectivo']).toBe(3000);
    expect(totals['totalSales']).toBe(19_000);
  });

  it('un tipo de respaldo con formato inválido se rechaza', async () => {
    const settings = await json(api('GET', '/api/settings'));
    expect(
      (await api('PUT', '/api/settings', { ...settings, usd_manual_rate: 'quinientos' })).status,
    ).toBe(400);
  });

  it('registra los avisos enviados por WhatsApp', async () => {
    const ok = await api('POST', '/api/notifications', {
      event: 'orden_lista',
      entityType: 'boleta',
      entityId: 5,
      phone: '88887777',
    });
    expect(ok.status).toBe(201);
    const list = await json<{ event: string; username: string }[]>(
      api('GET', '/api/notifications?entityType=boleta&entityId=5'),
    );
    expect(list[0]!.event).toBe('orden_lista');
    expect(list[0]!.username).toBe('dueno');

    const bad = await api('POST', '/api/notifications', {
      event: 'spam',
      entityType: 'boleta',
      entityId: 5,
      phone: null,
    });
    expect(bad.status).toBe(400);
  });
});
