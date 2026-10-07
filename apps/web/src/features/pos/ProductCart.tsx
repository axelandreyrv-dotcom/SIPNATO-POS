import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Minus, Plus, ScanBarcode, X } from 'lucide-react';
import { formatColones, type Product } from '@sipnato/shared';
import { ApiError } from '@/lib/api-client';
import { productsApi } from '../products/api';

export interface CartLine {
  product: Product;
  quantity: number;
}

export function cartTotal(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.product.price * l.quantity, 0);
}

// Debounce corto: suficiente para no consultar en cada tecla al escribir un nombre.
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// Buscador de productos. Un lector de código de barras "escribe" el código y envía Enter:
// con Enter se busca la coincidencia exacta por código y se agrega sin tocar el mouse.
export function ProductSearch({
  onAdd,
  disabled,
}: {
  onAdd: (p: Product) => void;
  disabled: boolean;
}) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const q = useDebounced(text.trim(), 150);

  const { data } = useQuery({
    queryKey: ['products', 'pos-search', q],
    queryFn: () => productsApi.list(q),
    enabled: q.length >= 2,
    staleTime: 15_000,
  });
  const results = q.length >= 2 ? (data?.products ?? []).slice(0, 8) : [];

  function add(p: Product) {
    onAdd(p);
    setText('');
    setOpen(false);
    setNotice(null);
    inputRef.current?.focus();
  }

  async function handleEnter() {
    const value = text.trim();
    if (!value) return;
    const visible = results[highlight];
    if (open && visible && q === value) return add(visible);
    try {
      add(await productsApi.lookup(value));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        if (results.length === 1) return add(results[0]!);
        setNotice(`No hay un producto con el código "${value}".`);
      }
    }
  }

  return (
    <div className="relative">
      <label
        htmlFor="pos-product-search"
        className="mb-1.5 block text-sm font-medium text-text-secondary"
      >
        Productos
      </label>
      <div className="relative">
        <ScanBarcode
          size={16}
          strokeWidth={1.5}
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
        />
        <input
          id="pos-product-search"
          ref={inputRef}
          type="text"
          autoComplete="off"
          disabled={disabled}
          value={text}
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls="pos-product-results"
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            setHighlight(0);
            setNotice(null);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void handleEnter();
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setHighlight((h) => Math.min(h + 1, results.length - 1));
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            }
            if (e.key === 'Escape') setOpen(false);
          }}
          placeholder="Buscar producto o escanear código"
          className="h-10 w-full rounded-lg border border-border bg-surface-input pl-9 pr-3 text-sm text-text-primary outline-none transition-all placeholder:text-text-muted focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/20"
        />
      </div>

      {open && results.length > 0 && (
        <ul
          id="pos-product-results"
          role="listbox"
          className="absolute inset-x-0 top-full z-30 m-0 mt-1 list-none overflow-hidden rounded-lg border border-border bg-surface-card p-0 shadow-md"
        >
          {results.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(p)}
                onMouseEnter={() => setHighlight(i)}
                className={[
                  'flex w-full items-center gap-3 px-3 py-2 text-left',
                  i === highlight ? 'bg-brand-blue/10' : '',
                ].join(' ')}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-text-primary">{p.name}</span>
                  {p.code && (
                    <span className="block truncate text-xs text-text-muted">{p.code}</span>
                  )}
                </span>
                {p.trackStock && (
                  <span
                    className={[
                      'shrink-0 text-xs tabular-nums',
                      p.stock <= 0 ? 'text-brand-error' : 'text-text-muted',
                    ].join(' ')}
                  >
                    {p.stock <= 0 ? 'Sin stock' : `${p.stock} disp.`}
                  </span>
                )}
                <span className="shrink-0 text-sm font-medium tabular-nums text-text-primary">
                  {formatColones(p.price)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {notice && (
        <p className="mt-1.5 text-xs text-brand-warning" role="status">
          {notice}
        </p>
      )}
    </div>
  );
}

export function CartLines({
  lines,
  onChangeQty,
  onRemove,
}: {
  lines: CartLine[];
  onChangeQty: (productId: number, quantity: number) => void;
  onRemove: (productId: number) => void;
}) {
  if (lines.length === 0) return null;

  return (
    <ul className="m-0 list-none divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface-card p-0">
      {lines.map(({ product, quantity }) => {
        const short = product.trackStock && quantity > product.stock;
        return (
          <li key={product.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-text-primary">{product.name}</span>
              <span className="block text-xs tabular-nums text-text-muted">
                {formatColones(product.price)} c/u
              </span>
            </span>

            <div
              className="flex items-center rounded-lg border border-border"
              role="group"
              aria-label={`Cantidad de ${product.name}`}
            >
              <button
                type="button"
                onClick={() =>
                  quantity > 1 ? onChangeQty(product.id, quantity - 1) : onRemove(product.id)
                }
                className="flex h-9 w-9 items-center justify-center text-text-muted transition-colors hover:text-text-primary"
                aria-label="Quitar uno"
              >
                <Minus size={14} strokeWidth={1.5} aria-hidden />
              </button>
              <span
                className="w-8 text-center text-sm font-medium tabular-nums text-text-primary"
                aria-live="polite"
              >
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => onChangeQty(product.id, quantity + 1)}
                className="flex h-9 w-9 items-center justify-center text-text-muted transition-colors hover:text-text-primary"
                aria-label="Agregar uno"
              >
                <Plus size={14} strokeWidth={1.5} aria-hidden />
              </button>
            </div>

            <span className="w-24 text-right text-sm font-semibold tabular-nums text-text-primary">
              {formatColones(product.price * quantity)}
            </span>
            <button
              type="button"
              onClick={() => onRemove(product.id)}
              className="flex h-9 w-9 items-center justify-center rounded text-text-muted transition-colors hover:bg-brand-error/10 hover:text-brand-error"
              aria-label={`Quitar ${product.name}`}
            >
              <X size={14} strokeWidth={1.5} aria-hidden />
            </button>

            {short && (
              <p className="flex w-full items-center gap-1.5 text-xs text-brand-warning">
                <AlertTriangle size={12} strokeWidth={1.5} aria-hidden />
                {product.stock <= 0
                  ? 'Sin stock registrado. Se puede vender; el inventario quedará en negativo.'
                  : `Solo hay ${product.stock} registrados. Se puede vender; el inventario quedará en negativo.`}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
