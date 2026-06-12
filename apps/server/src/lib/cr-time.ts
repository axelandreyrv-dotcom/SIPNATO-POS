// Costa Rica is permanently UTC-6 (no DST).
const CR_OFFSET_HOURS = 6;
const CR_OFFSET_PAD = String(CR_OFFSET_HOURS).padStart(2, '0');

export function todayCR(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica' }).format(new Date());
}

/**
 * Convert YYYY-MM-DD date strings (interpreted as CR calendar days)
 * to UTC ISO strings bounding that range:
 *   from → start of that CR day = date at 00:00 CR = date at 06:00 UTC
 *   to   → end of that CR day   = next-day at 05:59:59.999 UTC
 */
export function crDayRangeToUtc(from: string, to: string): { fromUtc: string; toUtc: string } {
  const fromUtc = new Date(`${from}T${CR_OFFSET_PAD}:00:00.000Z`);
  const toNext = new Date(`${to}T${CR_OFFSET_PAD}:00:00.000Z`);
  toNext.setUTCDate(toNext.getUTCDate() + 1);
  toNext.setUTCMilliseconds(toNext.getUTCMilliseconds() - 1);
  return { fromUtc: fromUtc.toISOString(), toUtc: toNext.toISOString() };
}
