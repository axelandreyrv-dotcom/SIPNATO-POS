import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, ChevronDown, Loader2, Plus, Search } from 'lucide-react';
import {
  createProductSchema,
  formatColones,
  isLowStock,
  stockMovementSchema,
  type Product,
  type StockMovementType,
} from '@sipnato/shared';
import { ApiError } from '@/lib/api-client';
import { fmtDateTime } from '@/lib/format';
import { useCan } from '../auth/useCurrentUser';
import { productsApi, type ProductFilter } from './api';

const inputCls =
  'h-10 w-full rounded-lg border border-border bg-surface-input px-3 text-sm text-text-primary outline-none transition-all placeholder:text-text-muted focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/20';
const labelCls = 'block text-sm font-medium text-text-secondary';
const primaryBtn =
  'flex h-10 items-center justify-center gap-1.5 rounded-lg bg-brand-blue px-4 text-sm font-medium text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-60';
const secondaryBtn =
  'flex h-10 items-center justify-center rounded-lg border border-border px-4 text-sm text-text-secondary transition-colors hover:bg-surface-bg';

const MOVEMENT_LABELS: Record<StockMovementType, string> = {
  entrada: 'Entrada',
  ajuste: 'Ajuste',
  venta: 'Venta',
  anulacion_venta: 'Venta eliminada',
};

function errorText(err: unknown): string {
  return err instanceof ApiError ? err.message : 'No se pudo conectar con el servidor.';
}

// Montos y cantidades como texto en el input: '' = vacío, nunca NaN.
const toInt = (s: string) => (s.trim() === '' ? undefined : Math.floor(Number(s)));
const digits = (s: string) => s.replace(/\D/g, '');

function StockBadge({ product }: { product: Product }) {
  if (!product.trackStock) return <span className="text-xs text-text-muted">Servicio</span>;
  const tone = product.stock < 0
    ? 'text-brand-error'
    : isLowStock(product) ? 'text-brand-warning' : 'text-text-primary';
  return (
    <span className={['text-sm font-semibold tabular-nums', tone].join(' ')}>
      {product.stock}
      {isLowStock(product) && <span className="ml-1 text-xs font-normal">bajo</span>}
    </span>
  );
}

// ── Formulario de producto (alta y edición) ───────────────────────────────────
function ProductForm({ product, onDone }: { product?: Product; onDone: () => void }) {
  const queryClient = useQueryClient();
  const isNew = !product;
  const [name, setName] = useState(product?.name ?? '');
  const [code, setCode] = useState(product?.code ?? '');
  const [category, setCategory] = useState(product?.category ?? '');
  const [price, setPrice] = useState(product ? String(product.price) : '');
  const [cost, setCost] = useState(product?.cost != null ? String(product.cost) : '');
  const [trackStock, setTrackStock] = useState(product?.trackStock ?? true);
  const [initialStock, setInitialStock] = useState('');
  const [minStock, setMinStock] = useState(product ? String(product.minStock) : '');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const base = {
        name,
        code,
        category,
        price: toInt(price) ?? -1,
        cost: toInt(cost) ?? null,
        trackStock,
        minStock: toInt(minStock) ?? 0,
      };
      if (isNew) {
        const parsed = createProductSchema.safeParse({ ...base, initialStock: toInt(initialStock) ?? 0 });
        if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Datos inválidos');
        return productsApi.create(parsed.data);
      }
      return productsApi.update(product.id, base);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      onDone();
    },
    onError: (err) => setError(err instanceof Error && !(err instanceof ApiError) ? err.message : errorText(err)),
  });

  const margin = toInt(price) && toInt(cost) !== undefined
    ? Math.round(((toInt(price)! - toInt(cost)!) / toInt(price)!) * 100)
    : null;

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); setError(null); mutation.mutate(); }}
      noValidate
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor={`p-name-${product?.id ?? 'new'}`} className={labelCls}>Nombre</label>
          <input id={`p-name-${product?.id ?? 'new'}`} autoFocus={isNew} value={name} onChange={(e) => setName(e.target.value)} placeholder="Protector templado iPhone 13" className={inputCls} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`p-code-${product?.id ?? 'new'}`} className={labelCls}>Código o código de barras</label>
          <input id={`p-code-${product?.id ?? 'new'}`} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Escanea o escribe" className={inputCls} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`p-cat-${product?.id ?? 'new'}`} className={labelCls}>Categoría</label>
          <input id={`p-cat-${product?.id ?? 'new'}`} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Protectores" className={inputCls} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`p-price-${product?.id ?? 'new'}`} className={labelCls}>Precio de venta</label>
          <input id={`p-price-${product?.id ?? 'new'}`} inputMode="numeric" value={price} onChange={(e) => setPrice(digits(e.target.value))} placeholder="₡" className={`${inputCls} tabular-nums`} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`p-cost-${product?.id ?? 'new'}`} className={labelCls}>
            Costo <span className="font-normal text-text-muted">(opcional)</span>
          </label>
          <input id={`p-cost-${product?.id ?? 'new'}`} inputMode="numeric" value={cost} onChange={(e) => setCost(digits(e.target.value))} placeholder="₡" className={`${inputCls} tabular-nums`} />
          {margin !== null && (
            <p className={['text-xs', margin < 0 ? 'text-brand-error' : 'text-text-muted'].join(' ')}>Margen: {margin}%</p>
          )}
        </div>
      </div>

      <label className="flex cursor-pointer items-start gap-3 text-sm">
        <input type="checkbox" checked={trackStock} onChange={(e) => setTrackStock(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-brand-blue)]" />
        <span>
          <span className="font-medium text-text-primary">Controlar existencias</span>
          <span className="block text-xs text-text-muted">Desmárcalo para servicios como mano de obra o reparaciones.</span>
        </span>
      </label>

      {trackStock && (
        <div className="grid gap-4 sm:grid-cols-2">
          {isNew && (
            <div className="space-y-1.5">
              <label htmlFor="p-initial" className={labelCls}>Existencias actuales</label>
              <input id="p-initial" inputMode="numeric" value={initialStock} onChange={(e) => setInitialStock(digits(e.target.value))} placeholder="0" className={`${inputCls} tabular-nums`} />
            </div>
          )}
          <div className="space-y-1.5">
            <label htmlFor={`p-min-${product?.id ?? 'new'}`} className={labelCls}>Avisar cuando queden</label>
            <input id={`p-min-${product?.id ?? 'new'}`} inputMode="numeric" value={minStock} onChange={(e) => setMinStock(digits(e.target.value))} placeholder="0" className={`${inputCls} tabular-nums`} />
          </div>
        </div>
      )}

      {error && <p role="alert" className="text-sm text-brand-error">{error}</p>}

      <div className="flex flex-wrap justify-end gap-2">
        {!isNew && (
          <button
            type="button"
            onClick={() => productsApi.update(product.id, { active: !product.active }).then(() => {
              void queryClient.invalidateQueries({ queryKey: ['products'] });
              onDone();
            }, (err) => setError(errorText(err)))}
            className="mr-auto flex h-10 items-center rounded-lg px-3 text-sm text-text-muted transition-colors hover:bg-brand-error/10 hover:text-brand-error"
          >
            {product.active ? 'Desactivar producto' : 'Reactivar producto'}
          </button>
        )}
        <button type="button" onClick={onDone} className={secondaryBtn}>Cancelar</button>
        <button type="submit" disabled={mutation.isPending} className={primaryBtn}>
          {mutation.isPending && <Loader2 size={14} strokeWidth={1.5} className="animate-spin" aria-hidden />}
          {isNew ? 'Crear producto' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  );
}

// ── Entrada / ajuste de stock ─────────────────────────────────────────────────
function StockMovementForm({ product }: { product: Product }) {
  const queryClient = useQueryClient();
  const [type, setType] = useState<'entrada' | 'ajuste'>('entrada');
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [newStock, setNewStock] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const parsed = stockMovementSchema.safeParse(
        type === 'entrada'
          ? { type, quantity: toInt(quantity) ?? 0, unitCost: toInt(unitCost) ?? null, ...(reason ? { reason } : {}) }
          : { type, newStock: toInt(newStock) ?? -1, reason },
      );
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return productsApi.addMovement(product.id, parsed.data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['product-movements', product.id] });
      setQuantity(''); setUnitCost(''); setNewStock(''); setReason(''); setError(null);
    },
    onError: (err) => setError(err instanceof Error && !(err instanceof ApiError) ? err.message : errorText(err)),
  });

  const counted = toInt(newStock);
  const diff = counted !== undefined ? counted - product.stock : null;

  return (
    <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }} noValidate className="space-y-3">
      <div className="flex gap-2" role="group" aria-label="Tipo de movimiento">
        {(['entrada', 'ajuste'] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={type === t}
            onClick={() => { setType(t); setError(null); }}
            className={[
              'flex h-9 flex-1 items-center justify-center rounded-lg border text-sm transition-colors',
              type === t ? 'border-brand-blue bg-brand-blue/10 font-medium text-brand-blue' : 'border-border text-text-secondary hover:bg-surface-bg',
            ].join(' ')}
          >
            {t === 'entrada' ? 'Llegó mercadería' : 'Corregir conteo'}
          </button>
        ))}
      </div>

      {type === 'entrada' ? (
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_2fr]">
          <input aria-label="Cantidad que entra" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(digits(e.target.value))} placeholder="Cantidad" className={`${inputCls} tabular-nums`} />
          <input aria-label="Costo unitario" inputMode="numeric" value={unitCost} onChange={(e) => setUnitCost(digits(e.target.value))} placeholder="Costo c/u ₡" className={`${inputCls} tabular-nums`} />
          <input aria-label="Nota" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Nota (opcional): proveedor, factura…" className={inputCls} />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
          <div>
            <input aria-label="Existencias contadas" inputMode="numeric" value={newStock} onChange={(e) => setNewStock(digits(e.target.value))} placeholder={`Contadas (sistema: ${product.stock})`} className={`${inputCls} tabular-nums`} />
            {diff !== null && diff !== 0 && (
              <p className={['mt-1 text-xs tabular-nums', diff < 0 ? 'text-brand-error' : 'text-brand-success'].join(' ')}>
                {diff > 0 ? `+${diff}` : diff} respecto al sistema
              </p>
            )}
          </div>
          <input aria-label="Motivo" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo: conteo, dañado, pérdida…" className={inputCls} />
        </div>
      )}

      {error && <p role="alert" className="text-sm text-brand-error">{error}</p>}
      <div className="flex justify-end">
        <button type="submit" disabled={mutation.isPending} className={primaryBtn}>
          {mutation.isPending && <Loader2 size={14} strokeWidth={1.5} className="animate-spin" aria-hidden />}
          {type === 'entrada' ? 'Registrar entrada' : 'Guardar conteo'}
        </button>
      </div>
    </form>
  );
}

function MovementHistory({ productId }: { productId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['product-movements', productId],
    queryFn: () => productsApi.movements(productId),
  });

  if (isLoading) return <div className="h-16 animate-pulse rounded-lg bg-border/40" />;
  if (!data?.length) return <p className="text-sm text-text-muted">Todavía no hay movimientos.</p>;

  return (
    <ul className="m-0 list-none divide-y divide-border p-0 text-sm">
      {data.map((m) => (
        <li key={m.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2">
          <span className="w-28 shrink-0 text-xs text-text-muted">{fmtDateTime(m.createdAt)}</span>
          <span className="w-28 shrink-0 text-text-secondary">{MOVEMENT_LABELS[m.type]}</span>
          <span className={['w-12 shrink-0 text-right font-medium tabular-nums', m.quantity < 0 ? 'text-brand-error' : 'text-brand-success'].join(' ')}>
            {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
          </span>
          <span className="w-16 shrink-0 text-right tabular-nums text-text-muted">= {m.stockAfter}</span>
          <span className="min-w-0 flex-1 truncate text-xs text-text-muted">
            {[m.reason, m.unitCost != null ? `costo ${formatColones(m.unitCost)}` : null, m.username ? `@${m.username}` : null]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ── Fila ──────────────────────────────────────────────────────────────────────
function ProductRow({ product, canManage, showCost }: { product: Product; canManage: boolean; showCost: boolean }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const margin = showCost && product.cost != null && product.price > 0
    ? Math.round(((product.price - product.cost) / product.price) * 100)
    : null;

  const summary = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-text-primary">{product.name}</span>
        <span className="block truncate text-xs text-text-muted">
          {[product.code, product.category].filter(Boolean).join(' · ') || 'Sin código'}
        </span>
      </span>
      {showCost && (
        <span className="hidden w-24 shrink-0 text-right text-xs tabular-nums text-text-muted sm:block">
          {product.cost != null ? `${formatColones(product.cost)} · ${margin}%` : '—'}
        </span>
      )}
      <span className="w-24 shrink-0 text-right text-sm font-semibold tabular-nums text-text-primary">{formatColones(product.price)}</span>
      <span className="w-16 shrink-0 text-right"><StockBadge product={product} /></span>
    </>
  );

  if (!canManage) {
    return <li className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">{summary}</li>;
  }

  return (
    <li className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); setEditing(false); }}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-bg/60"
      >
        {summary}
        <ChevronDown size={16} strokeWidth={1.5} aria-hidden className={['shrink-0 text-text-muted transition-transform duration-150', open ? 'rotate-180' : ''].join(' ')} />
      </button>

      {open && (
        <div className="space-y-6 border-t border-border bg-surface-bg/40 px-4 py-5">
          {editing ? (
            <ProductForm product={product} onDone={() => setEditing(false)} />
          ) : (
            <div className="flex justify-end">
              <button type="button" onClick={() => setEditing(true)} className={secondaryBtn}>Editar datos y precio</button>
            </div>
          )}

          {product.trackStock && !editing && (
            <>
              <section aria-label="Movimiento de stock">
                <h3 className="mb-3 text-sm font-semibold text-text-primary">Existencias</h3>
                <StockMovementForm product={product} />
              </section>
              <section aria-label="Historial">
                <h3 className="mb-2 text-sm font-semibold text-text-primary">Historial</h3>
                <MovementHistory productId={product.id} />
              </section>
            </>
          )}
        </div>
      )}
    </li>
  );
}

// ── Página ────────────────────────────────────────────────────────────────────
export function InventoryPage() {
  const canManage = useCan('manageInventory');
  const showCost = useCan('viewCosts');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<ProductFilter>('activos');
  const [creating, setCreating] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['products', filter, q],
    queryFn: () => productsApi.list(q, filter),
    placeholderData: (prev) => prev,
  });

  const tabs: { key: ProductFilter; label: string }[] = [
    { key: 'activos', label: 'Activos' },
    { key: 'stock-bajo', label: `Stock bajo${data?.lowStockCount ? ` (${data.lowStockCount})` : ''}` },
    { key: 'inactivos', label: 'Desactivados' },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-text-primary">Inventario</h1>
        {canManage && !creating && (
          <button type="button" onClick={() => setCreating(true)} className={primaryBtn}>
            <Plus size={16} strokeWidth={1.5} aria-hidden />
            Nuevo producto
          </button>
        )}
      </div>

      {creating && (
        <div className="mb-6 rounded-xl border border-border bg-surface-card p-4 sm:p-5">
          <ProductForm onDone={() => setCreating(false)} />
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={16} strokeWidth={1.5} aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, código o categoría"
            aria-label="Buscar productos"
            className={`${inputCls} pl-9`}
          />
        </div>
        <div className="flex gap-1 rounded-lg border border-border bg-surface-card p-1" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={filter === t.key}
              onClick={() => setFilter(t.key)}
              className={[
                'h-8 whitespace-nowrap rounded-md px-3 text-xs transition-colors',
                filter === t.key ? 'bg-brand-blue/10 font-medium text-brand-blue' : 'text-text-secondary hover:text-text-primary',
                t.key === 'stock-bajo' && data?.lowStockCount && filter !== t.key ? 'text-brand-warning' : '',
              ].join(' ')}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="overflow-hidden rounded-xl border border-border bg-surface-card">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 border-b border-border px-4 py-4 last:border-0">
              <div className="h-4 w-48 animate-pulse rounded bg-border" />
              <div className="ml-auto h-4 w-20 animate-pulse rounded bg-border" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-border bg-surface-card p-6 text-center">
          <p className="text-sm text-text-muted">No se pudo cargar el inventario.</p>
          <button type="button" onClick={() => void refetch()} className="mt-2 text-sm font-medium text-brand-blue hover:underline">Reintentar</button>
        </div>
      ) : !data?.products.length ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-border px-6 py-10 text-center">
          <Boxes size={28} strokeWidth={1.5} className="text-text-muted" aria-hidden />
          <p className="mt-3 text-sm font-medium text-text-primary">
            {q ? 'Ningún producto coincide con la búsqueda' : filter === 'stock-bajo' ? 'Nada por reponer' : filter === 'inactivos' ? 'No hay productos desactivados' : 'Todavía no hay productos'}
          </p>
          {!q && filter === 'activos' && (
            <p className="mt-1 max-w-sm text-sm text-text-muted">
              {canManage
                ? 'Agrega lo que vendes con su precio y existencias. En el punto de venta se buscan por nombre o escaneando el código.'
                : 'Un administrador debe agregar los productos.'}
            </p>
          )}
        </div>
      ) : (
        <ul className="m-0 list-none overflow-hidden rounded-xl border border-border bg-surface-card p-0">
          <li className="hidden items-center gap-3 border-b border-border px-4 py-2 text-xs font-medium uppercase tracking-wide text-text-muted sm:flex" aria-hidden>
            <span className="flex-1">Producto</span>
            {showCost && <span className="w-24 text-right">Costo · margen</span>}
            <span className="w-24 text-right">Precio</span>
            <span className="w-16 text-right">Stock</span>
            {canManage && <span className="w-4" />}
          </li>
          {data.products.map((p) => (
            <ProductRow key={p.id} product={p} canManage={canManage} showCost={showCost} />
          ))}
        </ul>
      )}
    </div>
  );
}
