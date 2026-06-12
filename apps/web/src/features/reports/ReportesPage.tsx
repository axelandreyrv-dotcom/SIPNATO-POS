import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { formatColones } from '@sipnato/shared';
import type { DailyEntry, ReportSaleRow, ReportSummary } from '@sipnato/shared';
import { fmtDate, fmtDateTime } from '../../lib/format';
import { reportsApi } from './api';

// ── CR date helpers ────────────────────────────────────────────────────────

function todayCR(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica' }).format(new Date());
}

function mondayOfWeekCR(): string {
  const today = todayCR();
  const parts = today.split('-');
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  const dow = date.getDay(); // 0=Sun, 1=Mon
  const diff = dow === 0 ? -6 : 1 - dow;
  date.setDate(date.getDate() + diff);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function firstOfMonthCR(): string {
  return todayCR().slice(0, 8) + '01';
}

// ── CSV download ───────────────────────────────────────────────────────────

function downloadCsv(rows: ReportSaleRow[], filename: string): void {
  const header = ['#', 'Descripción', 'Método', 'Monto (₡)', 'Fecha'].join(',');
  const lines = rows.map((r) =>
    [
      r.consecutive,
      `"${(r.description ?? '').replace(/"/g, '""')}"`,
      r.paymentMethod,
      r.amount,
      fmtDateTime(r.createdAt),
    ].join(','),
  );
  const csv = '﻿' + [header, ...lines].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Method display maps ────────────────────────────────────────────────────

const METHOD_BADGE: Record<string, string> = {
  efectivo: 'bg-brand-success/10 text-brand-success',
  tarjeta: 'bg-brand-warning/10 text-brand-warning',
  transferencia: 'bg-text-muted/10 text-text-secondary',
  sinpe: 'bg-brand-blue/10 text-brand-blue',
};

const METHOD_LABEL: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transfer.',
  sinpe: 'SINPE',
};

// ── Chart custom tooltip ───────────────────────────────────────────────────

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value?: number; payload?: DailyEntry }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  const total = entry?.value ?? 0;
  const count = entry?.payload?.count ?? 0;
  return (
    <div className="rounded-lg border border-border bg-surface-card px-3 py-2 shadow-md">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="text-sm font-semibold tabular-nums text-text-primary">{formatColones(total)}</p>
      <p className="text-xs text-text-muted">
        {count} {count === 1 ? 'venta' : 'ventas'}
      </p>
    </div>
  );
}

// ── Summary grid ───────────────────────────────────────────────────────────

interface SummaryCell {
  label: string;
  value: number | undefined;
  color: string;
  prefix?: string;
}

function SummaryGrid({ data, loading }: { data: ReportSummary | undefined; loading: boolean }) {
  const cells: SummaryCell[] = [
    { label: 'Efectivo', value: data?.byPaymentMethod.efectivo, color: 'text-brand-success' },
    { label: 'Tarjeta', value: data?.byPaymentMethod.tarjeta, color: 'text-brand-warning' },
    { label: 'SINPE', value: data?.byPaymentMethod.sinpe, color: 'text-brand-blue' },
    {
      label: 'Transferencia',
      value: data?.byPaymentMethod.transferencia,
      color: 'text-text-secondary',
    },
    { label: 'Gastos', value: data?.totalExpenses, color: 'text-brand-error', prefix: '−' },
    {
      label: 'Balance neto',
      value: data?.netBalance,
      color:
        data === undefined
          ? 'text-text-primary'
          : data.netBalance >= 0
            ? 'text-brand-success'
            : 'text-brand-error',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
      {cells.map(({ label, value, color, prefix }) => (
        <div key={label} className="bg-surface-card px-4 py-4">
          <p className="mb-1.5 text-xs text-text-muted">{label}</p>
          {loading || value === undefined ? (
            <div className="h-5 w-24 animate-pulse rounded bg-border" />
          ) : (
            <p className={`text-lg font-semibold tabular-nums ${color}`}>
              {prefix ?? ''}
              {formatColones(Math.abs(value))}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

type Preset = 'hoy' | 'semana' | 'mes' | 'personalizado';
type PmFilter = '' | 'efectivo' | 'tarjeta' | 'transferencia' | 'sinpe';

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'hoy', label: 'Hoy' },
  { key: 'semana', label: 'Esta semana' },
  { key: 'mes', label: 'Este mes' },
  { key: 'personalizado', label: 'Personalizado' },
];

export function ReportesPage() {
  const [preset, setPreset] = useState<Preset>('hoy');
  const [customFrom, setCustomFrom] = useState<string>(todayCR);
  const [customTo, setCustomTo] = useState<string>(todayCR);
  const [pmFilter, setPmFilter] = useState<PmFilter>('');
  const [qFilter, setQFilter] = useState('');
  const [page, setPage] = useState(1);
  const [isExporting, setIsExporting] = useState(false);

  // Derived date range
  const today = todayCR();
  const from =
    preset === 'personalizado'
      ? customFrom
      : preset === 'hoy'
        ? today
        : preset === 'semana'
          ? mondayOfWeekCR()
          : firstOfMonthCR();
  const to = preset === 'personalizado' ? customTo : today;
  const rangeValid = rangeValid_(from, to);

  function rangeValid_(f: string, t: string): boolean {
    return f <= t;
  }

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [from, to, pmFilter, qFilter]);

  const summaryQuery = useQuery({
    queryKey: ['reports', 'summary', from, to],
    queryFn: () => reportsApi.getSummary(from, to),
    staleTime: 120_000,
    enabled: rangeValid,
  });

  const dailyQuery = useQuery({
    queryKey: ['reports', 'daily', from, to],
    queryFn: () => reportsApi.getDaily(from, to),
    staleTime: 120_000,
    enabled: rangeValid,
  });

  const salesQuery = useQuery({
    queryKey: ['reports', 'sales', from, to, pmFilter, qFilter, page],
    queryFn: () => {
      const opts: { paymentMethod?: string; q?: string; page: number } = { page };
      if (pmFilter) opts.paymentMethod = pmFilter;
      if (qFilter) opts.q = qFilter;
      return reportsApi.getSales(from, to, opts);
    },
    staleTime: 30_000,
    enabled: rangeValid,
    placeholderData: (prev) => prev,
  });

  async function handleExport() {
    if (isExporting || !rangeValid) return;
    setIsExporting(true);
    try {
      const opts: { paymentMethod?: string; q?: string } = {};
      if (pmFilter) opts.paymentMethod = pmFilter;
      if (qFilter) opts.q = qFilter;
      const rows = await reportsApi.exportSales(from, to, opts);
      downloadCsv(rows, `ventas-${from}-${to}.csv`);
    } finally {
      setIsExporting(false);
    }
  }

  const dailyData = dailyQuery.data ?? [];
  const salesData = salesQuery.data;
  const summary = summaryQuery.data;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-text-primary">Reportes</h1>
        <p className="mt-1 text-sm text-text-muted">Análisis de ventas y gastos por período.</p>
      </div>

      {/* ── Filter bar ───────────────────────────────────────────────────── */}
      <div className="mb-6 space-y-3">
        {/* Preset buttons */}
        <div className="flex flex-wrap gap-2">
          {PRESETS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setPreset(key)}
              className={[
                'h-8 rounded-md px-3 text-sm font-medium transition-colors',
                preset === key
                  ? 'bg-brand-blue text-white'
                  : 'border border-border bg-surface-card text-text-secondary hover:border-brand-blue/40 hover:text-text-primary',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Custom date inputs */}
        {preset === 'personalizado' && (
          <div className="flex flex-wrap items-center gap-2">
            <CalendarDays size={14} strokeWidth={1.5} className="shrink-0 text-text-muted" aria-hidden />
            <label htmlFor="rep-from" className="sr-only">
              Desde
            </label>
            <input
              id="rep-from"
              type="date"
              value={customFrom}
              max={customTo}
              onChange={(e) => {
                setCustomFrom(e.target.value);
              }}
              className="h-8 rounded-md border border-border bg-surface-input px-2 text-sm text-text-primary outline-none focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/20"
            />
            <span className="text-xs text-text-muted">hasta</span>
            <label htmlFor="rep-to" className="sr-only">
              Hasta
            </label>
            <input
              id="rep-to"
              type="date"
              value={customTo}
              min={customFrom}
              max={today}
              onChange={(e) => {
                setCustomTo(e.target.value);
              }}
              className="h-8 rounded-md border border-border bg-surface-input px-2 text-sm text-text-primary outline-none focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/20"
            />
            {!rangeValid && (
              <p className="text-xs text-brand-error">
                La fecha de inicio debe ser anterior o igual al fin.
              </p>
            )}
          </div>
        )}

        {/* Secondary filters: search + method */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1 max-w-xs">
            <Search
              size={14}
              strokeWidth={1.5}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
              aria-hidden
            />
            <input
              type="search"
              value={qFilter}
              onChange={(e) => setQFilter(e.target.value)}
              placeholder="Buscar descripción..."
              className="h-8 w-full rounded-md border border-border bg-surface-input pl-8 pr-3 text-sm text-text-primary outline-none transition-all focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/20 placeholder:text-text-muted"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <SlidersHorizontal size={13} strokeWidth={1.5} className="shrink-0 text-text-muted" aria-hidden />
            <label htmlFor="rep-pm" className="sr-only">
              Método de pago
            </label>
            <select
              id="rep-pm"
              value={pmFilter}
              onChange={(e) => setPmFilter(e.target.value as PmFilter)}
              className="h-8 rounded-md border border-border bg-surface-input pl-2 pr-7 text-sm text-text-primary outline-none focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/20"
            >
              <option value="">Todos los métodos</option>
              <option value="efectivo">Efectivo</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="sinpe">SINPE</option>
              <option value="transferencia">Transferencia</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Summary grid ─────────────────────────────────────────────────── */}
      <section aria-label="Resumen del período" className="mb-8">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-semibold text-text-primary">
            Resumen
            {summary !== undefined && (
              <span className="ml-2 text-xs font-normal text-text-muted">
                · {summary.saleCount} {summary.saleCount === 1 ? 'venta' : 'ventas'}
              </span>
            )}
          </h2>
          {summaryQuery.isFetching && !summaryQuery.isLoading && (
            <Loader2 size={12} strokeWidth={1.5} className="animate-spin text-text-muted" aria-hidden />
          )}
        </div>
        {summaryQuery.isError ? (
          <div className="flex h-20 items-center justify-center rounded-xl border border-dashed border-brand-error/30 bg-brand-error/[0.03]">
            <p className="text-sm text-brand-error">Error al cargar el resumen.</p>
          </div>
        ) : (
          <SummaryGrid data={summary} loading={summaryQuery.isLoading} />
        )}
      </section>

      {/* ── Daily bar chart ───────────────────────────────────────────────── */}
      <section aria-label="Ventas diarias" className="mb-8">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-semibold text-text-primary">Ventas diarias</h2>
          {dailyQuery.isFetching && !dailyQuery.isLoading && (
            <Loader2 size={12} strokeWidth={1.5} className="animate-spin text-text-muted" aria-hidden />
          )}
        </div>
        <div className="rounded-xl border border-border bg-surface-card px-2 pb-2 pt-4">
          {dailyQuery.isLoading ? (
            <div className="flex h-[220px] items-center justify-center">
              <Loader2 size={20} strokeWidth={1.5} className="animate-spin text-text-muted" aria-hidden />
            </div>
          ) : dailyQuery.isError ? (
            <div className="flex h-[220px] items-center justify-center">
              <p className="text-sm text-brand-error">Error al cargar el gráfico.</p>
            </div>
          ) : dailyData.length === 0 ? (
            <div className="flex h-[220px] items-center justify-center">
              <p className="text-sm text-text-muted">Sin ventas en el período.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dailyData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid
                  vertical={false}
                  stroke="var(--color-border)"
                  strokeDasharray="3 3"
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d: string) => {
                    const p = d.split('-');
                    return `${p[2] ?? ''}/${p[1] ?? ''}`;
                  }}
                  tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickFormatter={(v: number) =>
                    v >= 1_000_000
                      ? `₡${(v / 1_000_000).toFixed(1)}M`
                      : v >= 1000
                        ? `₡${Math.round(v / 1000)}k`
                        : `₡${v}`
                  }
                  tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={60}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'transparent' }} />
                <Bar
                  dataKey="total"
                  fill="var(--color-brand-blue)"
                  radius={[3, 3, 0, 0]}
                  activeBar={{ fill: 'var(--color-brand-blue)', opacity: 0.8 }}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* ── Sales table ───────────────────────────────────────────────────── */}
      <section aria-label="Lista de ventas">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-text-primary">
            Ventas
            {salesData !== undefined && (
              <span className="ml-2 text-xs font-normal text-text-muted">({salesData.total})</span>
            )}
          </h2>
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={isExporting || !rangeValid}
            className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface-card px-3 text-xs font-medium text-text-secondary transition-colors hover:border-brand-blue/40 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isExporting ? (
              <Loader2 size={12} strokeWidth={1.5} className="animate-spin" aria-hidden />
            ) : (
              <Download size={12} strokeWidth={1.5} aria-hidden />
            )}
            Exportar CSV
          </button>
        </div>

        {salesQuery.isLoading ? (
          /* Skeleton table */
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-bg">
                  {['6%', '44%', '16%', '18%', '16%'].map((w, i) => (
                    <th key={i} style={{ width: w }} className="px-4 py-2.5">
                      <div className="h-2.5 rounded bg-border animate-pulse" />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 8 }, (_, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5">
                      <div className="h-3 w-8 animate-pulse rounded bg-border" />
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="h-3 w-full max-w-[180px] animate-pulse rounded bg-border" />
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="h-5 w-16 animate-pulse rounded-full bg-border" />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="ml-auto h-3 w-20 animate-pulse rounded bg-border" />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="ml-auto h-3 w-20 animate-pulse rounded bg-border" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : salesQuery.isError ? (
          <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-brand-error/30">
            <p className="text-sm text-brand-error">Error al cargar las ventas.</p>
          </div>
        ) : !salesData?.sales.length ? (
          <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-border">
            <p className="text-sm text-text-muted">
              {qFilter || pmFilter
                ? 'Sin resultados con los filtros aplicados.'
                : 'Sin ventas en el período seleccionado.'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-border bg-surface-card">
              <table className="w-full min-w-[540px] table-fixed text-sm">
                <colgroup>
                  <col style={{ width: '6%' }} />
                  <col style={{ width: '44%' }} />
                  <col style={{ width: '16%' }} />
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '16%' }} />
                </colgroup>
                <thead>
                  <tr className="border-b border-border">
                    <th
                      scope="col"
                      className="px-4 py-2.5 text-left text-xs font-medium text-text-muted"
                    >
                      #
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-2.5 text-left text-xs font-medium text-text-muted"
                    >
                      Descripción
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-2.5 text-left text-xs font-medium text-text-muted"
                    >
                      Método
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-2.5 text-right text-xs font-medium text-text-muted"
                    >
                      Monto
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-2.5 text-right text-xs font-medium text-text-muted"
                    >
                      Fecha
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {salesData.sales.map((sale) => (
                    <tr
                      key={sale.id}
                      className="border-b border-border last:border-0 transition-colors hover:bg-surface-bg/60"
                    >
                      <td className="px-4 py-2.5 tabular-nums text-xs text-text-muted">
                        {sale.consecutive}
                      </td>
                      <td className="overflow-hidden px-4 py-2.5">
                        {sale.description ? (
                          <span
                            className="block overflow-hidden text-ellipsis whitespace-nowrap text-text-primary"
                            title={sale.description}
                          >
                            {sale.description}
                          </span>
                        ) : (
                          <span className="italic text-text-muted">Sin descripción</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${METHOD_BADGE[sale.paymentMethod] ?? 'bg-border text-text-secondary'}`}
                        >
                          {METHOD_LABEL[sale.paymentMethod] ?? sale.paymentMethod}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums text-text-primary">
                        {formatColones(sale.amount)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right text-xs text-text-muted">
                        {fmtDate(sale.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {salesData.totalPages > 1 && (
              <div className="mt-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="flex h-8 items-center gap-1 rounded-md border border-border px-3 text-xs font-medium text-text-secondary transition-colors hover:border-brand-blue/30 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft size={14} strokeWidth={1.5} aria-hidden />
                  Anterior
                </button>
                <span className="text-xs text-text-muted">
                  Página {salesData.page} de {salesData.totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(salesData.totalPages, p + 1))}
                  disabled={page === salesData.totalPages}
                  className="flex h-8 items-center gap-1 rounded-md border border-border px-3 text-xs font-medium text-text-secondary transition-colors hover:border-brand-blue/30 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Siguiente
                  <ChevronRight size={14} strokeWidth={1.5} aria-hidden />
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
