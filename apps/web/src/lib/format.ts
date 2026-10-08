const CR_TZ = 'America/Costa_Rica';

const dateTimeFmt = new Intl.DateTimeFormat('es-CR', {
  timeZone: CR_TZ,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const dateFmt = new Intl.DateTimeFormat('es-CR', {
  timeZone: CR_TZ,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const timeFmt = new Intl.DateTimeFormat('es-CR', {
  timeZone: CR_TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const dateShortFmt = new Intl.DateTimeFormat('es-CR', {
  timeZone: CR_TZ,
  day: '2-digit',
  month: 'short',
});

// Una fecha sin hora ("2026-10-20", p. ej. el vencimiento de un crédito) es ese día en
// Costa Rica. `new Date('2026-10-20')` la toma como medianoche UTC, que en CR es el 19.
function parse(iso: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00-06:00`) : new Date(iso);
}

export function fmtDateTime(iso: string): string {
  return dateTimeFmt.format(parse(iso));
}

export function fmtDate(iso: string): string {
  return dateFmt.format(parse(iso));
}

export function fmtTime(iso: string): string {
  return timeFmt.format(parse(iso));
}

export function fmtDateShort(iso: string): string {
  return dateShortFmt.format(parse(iso));
}
