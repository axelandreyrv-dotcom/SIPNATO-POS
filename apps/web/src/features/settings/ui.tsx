// Piezas de UI compartidas por las secciones de Configuración.

export const inputClass = [
  'h-9 w-full rounded-lg border px-3 text-sm text-text-primary',
  'bg-surface-input outline-none transition-all duration-150',
  'border-border focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/20',
  'placeholder:text-text-muted',
].join(' ');

export const textareaClass = [
  'w-full rounded-lg border px-3 py-2 text-sm text-text-primary',
  'bg-surface-input outline-none transition-all duration-150 resize-none',
  'border-border focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/20',
  'placeholder:text-text-muted',
].join(' ');

export function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-text-secondary mb-1.5">
      {children}
    </label>
  );
}

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-8 sm:grid sm:grid-cols-3 sm:gap-8">
      <div>
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
        <p className="mt-1 text-sm text-text-muted leading-relaxed">{description}</p>
      </div>
      <div className="mt-6 sm:col-span-2 sm:mt-0 space-y-4">{children}</div>
    </div>
  );
}
