// Colones costarricenses — siempre enteros, nunca decimales.
// Este es el ÚNICO archivo que formatea montos en ₡.

export function formatColones(amount: number): string {
  const n = Math.floor(amount);
  return '₡' + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function parseColones(raw: string): number {
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) throw new Error(`Monto inválido: "${raw}"`);
  const value = parseInt(digits, 10);
  if (!Number.isFinite(value) || value < 0) throw new Error(`Monto inválido: "${raw}"`);
  return value;
}
