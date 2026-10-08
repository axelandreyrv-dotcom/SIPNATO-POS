import cron from 'node-cron';
import type { FastifyBaseLogger } from 'fastify';
import { config } from '../config.js';
import { latestExchangeRate, saveExchangeRate } from '../db/control.js';
import { fetchBccrRates } from '../lib/bccr.js';
import { todayCR } from '../lib/cr-time.js';

function daysAgo(isoDay: string, days: number): string {
  const d = new Date(`${isoDay}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// Trae la última semana (cubre fines de semana y feriados sin dato) y guarda cada día.
export async function refreshExchangeRate(log: FastifyBaseLogger): Promise<void> {
  const token = config.BCCR_API_TOKEN;
  if (!token) return;

  const today = todayCR();
  if (latestExchangeRate()?.date === today) return;

  try {
    const rates = await fetchBccrRates(daysAgo(today, 7), today, token);
    for (const r of rates) saveExchangeRate(r.date, r.buy, r.sell);
    const latest = latestExchangeRate();
    log.info(
      { date: latest?.date, buy: latest?.buy, sell: latest?.sell },
      'tipo de cambio BCCR actualizado',
    );
  } catch (err) {
    // No es fatal: se reintenta en la próxima hora y mientras tanto rige el último guardado
    // o el tipo de respaldo de cada negocio.
    log.warn({ err: (err as Error).message }, 'no se pudo consultar el tipo de cambio del BCCR');
  }
}

// Global (no por negocio): el tipo de cambio del BCCR es el mismo para todos.
export function startExchangeRateCron(log: FastifyBaseLogger): void {
  if (!config.BCCR_API_TOKEN) {
    log.warn('BCCR_API_TOKEN no configurado: cada negocio usará su tipo de cambio de respaldo');
    return;
  }
  void refreshExchangeRate(log);
  cron.schedule('15 * * * *', () => {
    void refreshExchangeRate(log);
  });
  log.info('tipo de cambio BCCR: consulta cada hora hasta tener el del día');
}
