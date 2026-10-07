import { useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, CheckCircle, Loader2, Plus, Trash2 } from 'lucide-react';
import {
  BUSINESS_TEMPLATES,
  businessProfileSchema,
  fieldKeyFromLabel,
  MODULE_LABELS,
  ORDER_FIELD_TYPE_LABELS,
  ORDER_FIELD_TYPES,
  profileFromTemplate,
  TEMPLATE_INFO,
  TOGGLEABLE_MODULES,
  type BusinessProfile,
  type BusinessTemplate,
  type OrderField,
  type OrderFieldType,
} from '@sipnato/shared';
import { ApiError } from '@/lib/api-client';
import { useBusiness } from '../auth/useCurrentUser';
import { businessApi } from './api';

const inputCls =
  'h-9 w-full rounded-lg border border-border bg-surface-input px-3 text-sm text-text-primary outline-none transition-all placeholder:text-text-muted focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/20';
const iconBtn =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-bg hover:text-text-primary disabled:opacity-30 disabled:hover:bg-transparent';

function Block({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="py-8 sm:grid sm:grid-cols-3 sm:gap-8">
      <div>
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-text-muted">{description}</p>
      </div>
      <div className="mt-6 space-y-4 sm:col-span-2 sm:mt-0">{children}</div>
    </div>
  );
}

// Un campo de la orden. La clave interna se fija al crearlo y no cambia al renombrar:
// así las órdenes viejas y nuevas del mismo campo siguen siendo comparables.
function FieldRow({
  field,
  index,
  total,
  onChange,
  onMove,
  onRemove,
}: {
  field: OrderField;
  index: number;
  total: number;
  onChange: (f: OrderField) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const [optionsText, setOptionsText] = useState(field.options?.join(', ') ?? '');

  return (
    <li className="space-y-2 border-b border-border px-3 py-3 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label={`Nombre del campo ${index + 1}`}
          value={field.label}
          onChange={(e) => onChange({ ...field, label: e.target.value })}
          placeholder="Nombre del campo"
          className={`${inputCls} min-w-40 flex-1`}
        />
        <select
          aria-label="Tipo de campo"
          value={field.type}
          onChange={(e) => {
            const type = e.target.value as OrderFieldType;
            const { options: _o, ...rest } = field;
            onChange(type === 'select' ? { ...rest, type, options: field.options ?? [] } : { ...rest, type });
          }}
          className={`${inputCls} w-auto`}
        >
          {ORDER_FIELD_TYPES.map((t) => <option key={t} value={t}>{ORDER_FIELD_TYPE_LABELS[t]}</option>)}
        </select>
        <label className="flex h-9 items-center gap-2 px-1 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={field.required}
            onChange={(e) => onChange({ ...field, required: e.target.checked })}
            className="h-4 w-4 accent-[var(--color-brand-blue)]"
          />
          Obligatorio
        </label>
        <div className="ml-auto flex">
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0} className={iconBtn} aria-label="Subir campo">
            <ArrowUp size={14} strokeWidth={1.5} aria-hidden />
          </button>
          <button type="button" onClick={() => onMove(1)} disabled={index === total - 1} className={iconBtn} aria-label="Bajar campo">
            <ArrowDown size={14} strokeWidth={1.5} aria-hidden />
          </button>
          <button type="button" onClick={onRemove} className={`${iconBtn} hover:text-brand-error`} aria-label="Quitar campo">
            <Trash2 size={14} strokeWidth={1.5} aria-hidden />
          </button>
        </div>
      </div>
      {field.type === 'select' && (
        <input
          aria-label="Opciones separadas por coma"
          value={optionsText}
          onChange={(e) => {
            setOptionsText(e.target.value);
            onChange({ ...field, options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) });
          }}
          placeholder="Opciones separadas por coma: Gasolina, Diésel, Eléctrico"
          className={inputCls}
        />
      )}
      {field.type === 'secret' && (
        <p className="text-xs text-text-muted">Se guarda sin cifrar; el formulario lo advierte al llenarlo.</p>
      )}
    </li>
  );
}

export function BusinessProfileEditor() {
  const router = useRouter();
  const saved = useBusiness();
  const [draft, setDraft] = useState<BusinessProfile>(saved);
  const [pendingTemplate, setPendingTemplate] = useState<BusinessTemplate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // Fuerza a remontar las filas (y su texto de opciones) al aplicar una plantilla.
  const [revision, setRevision] = useState(0);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const mutation = useMutation({
    mutationFn: async () => {
      const parsed = businessProfileSchema.safeParse(draft);
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Revisa los campos');
      return businessApi.update(parsed.data);
    },
    onSuccess: async () => {
      setError(null);
      setDone(true);
      setTimeout(() => setDone(false), 3000);
      // Menú, formularios de órdenes y guards leen el perfil del contexto del router.
      await router.invalidate();
    },
    onError: (err) => setError(err instanceof ApiError || err instanceof Error ? err.message : 'No se pudo guardar'),
  });

  function update(patch: Partial<BusinessProfile>) {
    setDraft((d) => ({ ...d, ...patch }));
    setDone(false);
  }

  function setField(i: number, f: OrderField) {
    update({ fields: draft.fields.map((x, j) => (j === i ? f : x)) });
  }

  function moveField(i: number, dir: -1 | 1) {
    const fields = [...draft.fields];
    const [item] = fields.splice(i, 1);
    fields.splice(i + dir, 0, item!);
    update({ fields });
  }

  function addField() {
    const label = 'Nuevo campo';
    const key = fieldKeyFromLabel(label, draft.fields.map((f) => f.key));
    update({ fields: [...draft.fields, { key, label, type: 'text', required: false }] });
  }

  function applyTemplate(t: BusinessTemplate) {
    setDraft(profileFromTemplate(t));
    setPendingTemplate(null);
    setRevision((r) => r + 1);
  }

  return (
    <div className="divide-y divide-border">
      <Block title="Tipo de negocio" description="La plantilla propone los campos de las órdenes y los módulos. Después puedes ajustarlos.">
        <div role="radiogroup" aria-label="Tipo de negocio" className="overflow-hidden rounded-xl border border-border">
          {BUSINESS_TEMPLATES.map((t) => {
            const selected = draft.template === t;
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => (selected ? undefined : setPendingTemplate(t))}
                className={[
                  'flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left transition-colors last:border-0',
                  selected ? 'bg-brand-blue/[0.06]' : 'hover:bg-surface-bg',
                ].join(' ')}
              >
                <span className={[
                  'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                  selected ? 'border-brand-blue' : 'border-border',
                ].join(' ')}>
                  {selected && <span className="h-2 w-2 rounded-full bg-brand-blue" />}
                </span>
                <span>
                  <span className="block text-sm font-medium text-text-primary">{TEMPLATE_INFO[t].name}</span>
                  <span className="block text-xs text-text-muted">{TEMPLATE_INFO[t].description}</span>
                </span>
              </button>
            );
          })}
        </div>
        {pendingTemplate && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-brand-warning/30 bg-brand-warning/[0.07] px-4 py-3" role="alert">
            <p className="flex-1 text-sm text-text-primary">
              Usar <strong>{TEMPLATE_INFO[pendingTemplate].name}</strong> reemplaza los nombres, campos y módulos de abajo. Las órdenes ya creadas no cambian.
            </p>
            <button type="button" onClick={() => applyTemplate(pendingTemplate)} className="h-9 rounded-lg bg-brand-blue px-3 text-sm font-medium text-white hover:brightness-110">
              Usar plantilla
            </button>
            <button type="button" onClick={() => setPendingTemplate(null)} className="h-9 rounded-lg px-3 text-sm text-text-secondary hover:bg-surface-bg">
              Cancelar
            </button>
          </div>
        )}
      </Block>

      <Block title="Órdenes de servicio" description="Cómo se llaman en el menú y qué datos se piden al recibir algo del cliente.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="bp-orders-label" className="mb-1.5 block text-sm font-medium text-text-secondary">Nombre en el menú</label>
            <input id="bp-orders-label" value={draft.ordersLabel} onChange={(e) => update({ ordersLabel: e.target.value })} placeholder="Boletas" className={inputCls} />
          </div>
          <div>
            <label htmlFor="bp-item-label" className="mb-1.5 block text-sm font-medium text-text-secondary">Qué se recibe</label>
            <input id="bp-item-label" value={draft.itemLabel} onChange={(e) => update({ itemLabel: e.target.value })} placeholder="Modelo del equipo" className={inputCls} />
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-medium text-text-secondary">Campos adicionales</p>
          {draft.fields.length > 0 ? (
            <ul key={revision} className="m-0 list-none overflow-hidden rounded-xl border border-border bg-surface-card p-0">
              {draft.fields.map((f, i) => (
                <FieldRow
                  key={f.key}
                  field={f}
                  index={i}
                  total={draft.fields.length}
                  onChange={(nf) => setField(i, nf)}
                  onMove={(dir) => moveField(i, dir)}
                  onRemove={() => update({ fields: draft.fields.filter((_, j) => j !== i) })}
                />
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-text-muted">
              Solo se piden {draft.itemLabel.toLowerCase() || 'el artículo'} y la descripción.
            </p>
          )}
          <button
            type="button"
            onClick={addField}
            disabled={draft.fields.length >= 15}
            className="mt-2 flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-brand-blue transition-colors hover:bg-brand-blue/10 disabled:opacity-40"
          >
            <Plus size={14} strokeWidth={1.5} aria-hidden />
            Agregar campo
          </button>
        </div>
      </Block>

      <Block title="Módulos" description="Los módulos apagados desaparecen del menú y quedan bloqueados. Sus datos se conservan.">
        <div className="grid gap-2 sm:grid-cols-2">
          {TOGGLEABLE_MODULES.map((m) => (
            <label key={m} className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-sm text-text-primary hover:bg-surface-bg">
              <input
                type="checkbox"
                checked={draft.modules.includes(m)}
                onChange={(e) =>
                  update({ modules: e.target.checked ? [...draft.modules, m] : draft.modules.filter((x) => x !== m) })
                }
                className="h-4 w-4 accent-[var(--color-brand-blue)]"
              />
              {m === 'ordenes' ? draft.ordersLabel || MODULE_LABELS[m] : MODULE_LABELS[m]}
            </label>
          ))}
        </div>
      </Block>

      <div className="flex flex-wrap items-center justify-end gap-3 py-6">
        {error && <p role="alert" className="mr-auto text-sm text-brand-error">{error}</p>}
        {done && (
          <span className="mr-auto flex items-center gap-1.5 text-sm text-brand-success">
            <CheckCircle size={15} strokeWidth={1.5} aria-hidden /> Guardado
          </span>
        )}
        {dirty && (
          <button type="button" onClick={() => { setDraft(saved); setRevision((r) => r + 1); setError(null); }} className="h-10 rounded-lg px-4 text-sm text-text-secondary hover:bg-surface-bg">
            Descartar cambios
          </button>
        )}
        <button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={!dirty || mutation.isPending}
          className="flex h-10 items-center gap-1.5 rounded-lg bg-brand-blue px-4 text-sm font-medium text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
        >
          {mutation.isPending && <Loader2 size={14} strokeWidth={1.5} className="animate-spin" aria-hidden />}
          Guardar tipo de negocio
        </button>
      </div>
    </div>
  );
}
