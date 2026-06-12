import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Minus, Plus } from 'lucide-react';
import { formatColones } from '@sipnato/shared';
import type { CreateQuoteItemInput } from '@sipnato/shared';
import { quotesApi } from './api';

type ItemRow = { id: string; description: string; amountStr: string };

function newItem(): ItemRow {
  return { id: Math.random().toString(36).slice(2), description: '', amountStr: '' };
}

function parseAmount(str: string): number {
  return Math.max(0, Math.floor(Number(str) || 0));
}

export function NuevaCotizacionPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [items, setItems] = useState<ItemRow[]>(() => [newItem()]);

  const total = items.reduce((sum, item) => sum + parseAmount(item.amountStr), 0);

  const allValid =
    items.length >= 1 && items.every((item) => item.description.trim().length > 0);

  const createMutation = useMutation({
    mutationFn: quotesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes', 'list'] });
      void navigate({ to: '/cotizaciones' });
    },
  });

  function addItem() {
    setItems((prev) => [...prev, newItem()]);
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  function updateItem(id: string, field: 'description' | 'amountStr', value: string) {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!allValid) return;

    const payload: { items: CreateQuoteItemInput[] } = {
      items: items.map((item) => ({
        description: item.description.trim(),
        amount: parseAmount(item.amountStr),
      })),
    };
    createMutation.mutate(payload);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-8">
      {/* Back */}
      <Link
        to="/cotizaciones"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-text-primary"
      >
        <ArrowLeft size={14} strokeWidth={1.5} aria-hidden />
        Cotizaciones
      </Link>

      <h1 className="mb-8 text-xl font-semibold text-text-primary">Nueva cotización</h1>

      <form onSubmit={handleSubmit}>
        <fieldset disabled={createMutation.isPending} className="disabled:opacity-60">
          {/* Column headers */}
          <div className="mb-2 grid grid-cols-[1fr_144px_32px] gap-2 px-1">
            <span className="text-xs font-medium text-text-muted">Descripción</span>
            <span className="text-xs font-medium text-text-muted">Monto</span>
            <span />
          </div>

          {/* Item rows */}
          <div className="space-y-2">
            {items.map((item, index) => (
              <div key={item.id} className="grid grid-cols-[1fr_144px_32px] items-center gap-2">
                <input
                  type="text"
                  value={item.description}
                  onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                  placeholder={`Ítem ${index + 1}`}
                  maxLength={500}
                  required
                  className="h-9 w-full rounded-lg border border-border bg-surface-input px-3 text-sm text-text-primary outline-none transition-all focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/20 placeholder:text-text-muted"
                />

                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-text-muted">
                    ₡
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={item.amountStr}
                    onChange={(e) => updateItem(item.id, 'amountStr', e.target.value)}
                    placeholder="0"
                    className="h-9 w-full rounded-lg border border-border bg-surface-input pl-6 pr-2 text-sm tabular-nums text-text-primary outline-none transition-all focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/20 placeholder:text-text-muted"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  disabled={items.length <= 1}
                  className="flex h-9 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-brand-error/10 hover:text-brand-error disabled:pointer-events-none disabled:opacity-30"
                  aria-label="Eliminar ítem"
                >
                  <Minus size={13} strokeWidth={1.5} aria-hidden />
                </button>
              </div>
            ))}
          </div>

          {/* Add item */}
          <button
            type="button"
            onClick={addItem}
            className="mt-3 flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-text-muted transition-colors hover:border-brand-blue/40 hover:text-brand-blue"
          >
            <Plus size={12} strokeWidth={1.5} aria-hidden />
            Agregar ítem
          </button>

          {/* Total preview */}
          <div className="mt-6 flex items-center justify-between rounded-xl border border-border bg-surface-card px-5 py-4">
            <span className="text-sm font-medium text-text-secondary">Total</span>
            <span className="text-2xl font-semibold tabular-nums text-text-primary">
              {formatColones(total)}
            </span>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={!allValid || createMutation.isPending}
            className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-blue text-sm font-semibold text-white transition-all hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {createMutation.isPending ? (
              <>
                <Loader2 size={16} strokeWidth={1.5} className="animate-spin" aria-hidden />
                Creando...
              </>
            ) : (
              `Crear cotización ${formatColones(total)}`
            )}
          </button>

          {createMutation.isError && (
            <p className="mt-2 text-center text-xs text-brand-error">
              {createMutation.error?.message ?? 'Error al crear la cotización'}
            </p>
          )}
        </fieldset>
      </form>
    </div>
  );
}
