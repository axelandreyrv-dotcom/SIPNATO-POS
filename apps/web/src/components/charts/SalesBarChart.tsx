import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatColones } from '@sipnato/shared';

// Ventas por día (dashboard y reportes). Se importa con lazy(): Recharts es pesado y solo
// lo necesitan estas dos pantallas.

export interface DailySales {
  date: string; // YYYY-MM-DD en hora de CR
  total: number;
  count: number;
}

interface Props {
  data: DailySales[];
  height: number;
  xTick: (date: string) => string;
  tooltipLabel: (date: string) => string;
  // Resalta una barra (hoy, en el dashboard) y atenúa las demás.
  highlightDate?: string;
  yAxisWidth?: number;
}

function axisColones(v: number): string {
  if (v >= 1_000_000) return `₡${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1000) return `₡${Math.round(v / 1000)}k`;
  return `₡${v}`;
}

function SalesTooltip({
  active,
  payload,
  formatDate,
}: {
  active?: boolean;
  payload?: Array<{ payload?: DailySales }>;
  // No se llama `label`: Recharts inyecta su propio `label` al clonar el tooltip.
  formatDate: (date: string) => string;
}) {
  const entry = payload?.[0]?.payload;
  if (!active || !entry) return null;
  return (
    <div className="rounded-lg border border-border bg-surface-card px-3 py-2 shadow-md">
      <p className="text-xs capitalize text-text-muted">{formatDate(entry.date)}</p>
      <p className="text-sm font-semibold tabular-nums text-text-primary">
        {formatColones(entry.total)}
      </p>
      <p className="text-xs text-text-muted">
        {entry.count} {entry.count === 1 ? 'venta' : 'ventas'}
      </p>
    </div>
  );
}

export default function SalesBarChart({
  data,
  height,
  xTick,
  tooltipLabel,
  highlightDate,
  yAxisWidth = 48,
}: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickFormatter={xTick}
          tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={axisColones}
          tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={yAxisWidth}
        />
        <Tooltip
          content={<SalesTooltip formatDate={tooltipLabel} />}
          cursor={{ fill: 'transparent' }}
        />
        <Bar
          dataKey="total"
          fill="var(--color-brand-blue)"
          radius={[3, 3, 0, 0]}
          {...(highlightDate
            ? {}
            : { activeBar: { fill: 'var(--color-brand-blue)', opacity: 0.8 } })}
        >
          {highlightDate &&
            data.map((d) => (
              <Cell
                key={d.date}
                fill="var(--color-brand-blue)"
                fillOpacity={d.date === highlightDate ? 1 : 0.32}
              />
            ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
