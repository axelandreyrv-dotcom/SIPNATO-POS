import {
  BUSINESS_TEMPLATES,
  MODULE_LABELS,
  TEMPLATE_INFO,
  TOGGLEABLE_MODULES,
  type BusinessTemplate,
  type ModuleKey,
} from '@sipnato/shared';
import { FieldLabel, inputClass } from './ui';

export interface BusinessTypeValue {
  template: BusinessTemplate;
  modules: ModuleKey[];
}

export function templateDefaults(template: BusinessTemplate): BusinessTypeValue {
  return { template, modules: [...TEMPLATE_INFO[template].profile.modules] };
}

// Tipo de negocio + módulos. Elegir otro tipo propone sus módulos; después se ajustan a mano.
export function BusinessTypeFields({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string;
  value: BusinessTypeValue;
  onChange: (value: BusinessTypeValue) => void;
}) {
  function toggle(m: ModuleKey, on: boolean) {
    const modules = on ? [...value.modules, m] : value.modules.filter((x) => x !== m);
    // Mismo orden que la lista, para que comparar con el guardado no dé falsos cambios.
    onChange({ ...value, modules: TOGGLEABLE_MODULES.filter((x) => modules.includes(x)) });
  }

  return (
    <div className="space-y-4">
      <div>
        <FieldLabel htmlFor={`${idPrefix}-template`}>Tipo de negocio</FieldLabel>
        <select
          id={`${idPrefix}-template`}
          value={value.template}
          onChange={(e) => onChange(templateDefaults(e.target.value as BusinessTemplate))}
          className={inputClass}
          aria-describedby={`${idPrefix}-template-hint`}
        >
          {BUSINESS_TEMPLATES.map((t) => (
            <option key={t} value={t}>
              {TEMPLATE_INFO[t].name}
            </option>
          ))}
        </select>
        <p id={`${idPrefix}-template-hint`} className="mt-1.5 text-xs text-text-muted">
          {TEMPLATE_INFO[value.template].description}
        </p>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-text-secondary">Módulos</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {TOGGLEABLE_MODULES.map((m) => (
            <label
              key={m}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm text-text-primary transition-colors hover:bg-brand-blue/[0.04]"
            >
              <input
                type="checkbox"
                checked={value.modules.includes(m)}
                onChange={(e) => toggle(m, e.target.checked)}
                className="h-4 w-4 accent-[var(--color-brand-blue)]"
              />
              {MODULE_LABELS[m]}
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-text-muted">
          Punto de venta, caja, clientes, gastos, reportes y notas siempre están incluidos.
        </p>
      </fieldset>
    </div>
  );
}
