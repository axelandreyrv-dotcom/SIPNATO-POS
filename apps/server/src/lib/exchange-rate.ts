import type { ExchangeRateInfo } from '@sipnato/shared';
import { latestExchangeRate } from '../db/control.js';
import { getSetting } from '../modules/settings/repository.js';
import { todayCR } from './cr-time.js';

// Un dato del BCCR más viejo que esto (p. ej. el token venció hace días) ya no se usa:
// cobrar con un tipo de cambio desactualizado es peor que pedir el de respaldo.
const MAX_BCCR_AGE_DAYS = 4;

function ageInDays(isoDay: string): number {
  return Math.round((Date.parse(`${todayCR()}T12:00:00Z`) - Date.parse(`${isoDay}T12:00:00Z`)) / 86_400_000);
}

// "505.5" → 50550. Vacío o inválido → null.
export function parseManualRate(raw: string | null): number | null {
  const m = /^\s*(\d{2,4})(?:[.,](\d{1,2}))?\s*$/.exec(raw ?? '');
  if (!m) return null;
  return parseInt(m[1]!, 10) * 100 + (m[2] ? parseInt(m[2].padEnd(2, '0'), 10) : 0);
}

// Tipo para RECIBIR dólares (el negocio compra USD al cliente): compra del BCCR.
// Si no hay dato reciente del BCCR, el de respaldo que configuró el negocio. Debe
// llamarse dentro del contexto de un negocio (lee su configuración).
export function getExchangeRateInfo(): ExchangeRateInfo {
  const bccr = latestExchangeRate();
  const bccrFresh = bccr !== null && ageInDays(bccr.date) <= MAX_BCCR_AGE_DAYS;
  const manual = parseManualRate(getSetting('usd_manual_rate'));

  if (bccrFresh) {
    return { rate: bccr.buy, source: 'bccr', date: bccr.date, bccrBuy: bccr.buy, bccrSell: bccr.sell };
  }
  return {
    rate: manual,
    source: manual !== null ? 'manual' : null,
    date: null,
    bccrBuy: bccr?.buy ?? null,
    bccrSell: bccr?.sell ?? null,
  };
}
