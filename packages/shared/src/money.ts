// Colones costarricenses — siempre enteros, nunca decimales.
// Este es el ÚNICO archivo que formatea montos en ₡.

export function formatColones(amount: number): string {
  const n = Math.floor(amount);
  return '₡' + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ─── Dólares (Fase E) ─────────────────────────────────────────────────────────
// La contabilidad sigue en colones. Los dólares solo se RECIBEN en caja y se convierten.
// Todo entero, sin flotantes: USD en centavos y tipo de cambio en centésimas de colón
// (₡505.23 por dólar = 50523).

export function formatUsd(cents: number): string {
  const c = Math.floor(cents);
  const dollars = Math.floor(c / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `$${dollars}.${String(c % 100).padStart(2, '0')}`;
}

export function formatExchangeRate(rateHundredths: number): string {
  return `₡${Math.floor(rateHundredths / 100)}.${String(rateHundredths % 100).padStart(2, '0')}`;
}

// Colones que valen `cents` dólares, redondeado al colón más cercano.
export function usdCentsToColones(cents: number, rateHundredths: number): number {
  return Math.round((cents * rateHundredths) / 10_000);
}

// "20", "20.5", "20,50" → 2050 centavos. null si no es un monto válido.
export function parseUsdToCents(raw: string): number | null {
  const m = /^\s*(\d{1,7})(?:[.,](\d{1,2}))?\s*$/.exec(raw);
  if (!m) return null;
  return parseInt(m[1]!, 10) * 100 + (m[2] ? parseInt(m[2].padEnd(2, '0'), 10) : 0);
}

export function parseColones(raw: string): number {
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) throw new Error(`Monto inválido: "${raw}"`);
  const value = parseInt(digits, 10);
  if (!Number.isFinite(value) || value < 0) throw new Error(`Monto inválido: "${raw}"`);
  return value;
}
