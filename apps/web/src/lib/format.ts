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

export function fmtDateTime(iso: string): string {
  return dateTimeFmt.format(new Date(iso));
}

export function fmtDate(iso: string): string {
  return dateFmt.format(new Date(iso));
}

export function fmtTime(iso: string): string {
  return timeFmt.format(new Date(iso));
}

export function fmtDateShort(iso: string): string {
  return dateShortFmt.format(new Date(iso));
}
