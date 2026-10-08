// Cliente del API SDDE del Banco Central de Costa Rica (sistema nuevo, 2025).
// GET {BASE}/indicadoresEconomicos/{codigo}/series?fechaInicio=YYYY/MM/DD&fechaFin=...&idioma=es
// con token Bearer. Indicadores: 317 = tipo de cambio de compra, 318 = de venta.

const BASE_URL = 'https://apim.bccr.fi.cr/SDDE/api/Bccr.GE.SDDE.Publico.Indicadores.API';
const TIMEOUT_MS = 20_000;
const COMPRA = '317';
const VENTA = '318';

interface SeriesPoint {
  date: string; // YYYY-MM-DD
  hundredths: number;
}

function apiDate(isoDay: string): string {
  return isoDay.replaceAll('-', '/');
}

async function fetchSeries(
  code: string,
  from: string,
  to: string,
  token: string,
): Promise<SeriesPoint[]> {
  const url = `${BASE_URL}/indicadoresEconomicos/${code}/series?fechaInicio=${apiDate(from)}&fechaFin=${apiDate(to)}&idioma=es`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 401 || res.status === 403)
    throw new Error(`BCCR rechazó el token (HTTP ${res.status})`);
  if (!res.ok) throw new Error(`BCCR respondió HTTP ${res.status}`);

  const payload = (await res.json()) as {
    estado?: boolean;
    mensaje?: string;
    datos?: {
      codigoIndicador?: string | number;
      series?: { fecha?: string; valorDatoPorPeriodo?: number | null }[];
    }[];
  };
  if (payload.estado === false) throw new Error(`BCCR: ${payload.mensaje ?? 'consulta rechazada'}`);

  const item = payload.datos?.find((d) => String(d.codigoIndicador) === code) ?? payload.datos?.[0];
  if (!item?.series) throw new Error(`BCCR: respuesta sin series para ${code}`);

  return (
    item.series
      .filter(
        (s): s is { fecha: string; valorDatoPorPeriodo: number } =>
          typeof s.fecha === 'string' &&
          typeof s.valorDatoPorPeriodo === 'number' &&
          s.valorDatoPorPeriodo > 0,
      )
      // Único punto donde un decimal del BCCR (505.23) pasa a entero (50523).
      .map((s) => ({
        date: s.fecha.slice(0, 10),
        hundredths: Math.round(s.valorDatoPorPeriodo * 100),
      }))
  );
}

// Compra y venta por día para el rango, solo los días que traen ambos valores.
export async function fetchBccrRates(
  from: string,
  to: string,
  token: string,
): Promise<{ date: string; buy: number; sell: number }[]> {
  const [buy, sell] = await Promise.all([
    fetchSeries(COMPRA, from, to, token),
    fetchSeries(VENTA, from, to, token),
  ]);
  const sellByDate = new Map(sell.map((p) => [p.date, p.hundredths]));
  return buy
    .filter((p) => sellByDate.has(p.date))
    .map((p) => ({ date: p.date, buy: p.hundredths, sell: sellByDate.get(p.date)! }));
}
