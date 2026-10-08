import { useState } from 'react';
import { Check, Copy, MessageCircle } from 'lucide-react';
import { whatsappLink, type PlatformTenant } from '@sipnato/shared';
import { secondaryButton, tenantUrl } from './ui';

// El código se muestra una sola vez: el servidor solo guarda su hash.
export function SetupCodePanel({ tenant, code }: { tenant: PlatformTenant; code: string }) {
  const [copied, setCopied] = useState(false);
  const url = tenantUrl(tenant.slug);

  const message = [
    `Hola${tenant.contactName ? ` ${tenant.contactName}` : ''}, el sistema Dosuxsoft POS de ${tenant.name} ya está listo.`,
    `Entre a ${url} y cree su cuenta con este código de activación: ${code}`,
    'El código sirve una sola vez.',
  ].join('\n');

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin permiso de portapapeles el código sigue visible para copiarlo a mano.
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface-card p-4">
      <p className="text-xs font-medium text-text-muted">Código de activación</p>
      <p className="mt-1 select-all font-mono text-2xl font-semibold tracking-wider text-text-primary">
        {code}
      </p>
      <p className="mt-2 text-xs text-text-muted">
        Se usa en <span className="text-text-secondary">{url}/setup</span>. No se vuelve a mostrar;
        si se pierde, genera otro.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => void copy()} className={secondaryButton}>
          {copied ? (
            <Check size={16} strokeWidth={1.5} aria-hidden />
          ) : (
            <Copy size={16} strokeWidth={1.5} aria-hidden />
          )}
          {copied ? 'Copiado' : 'Copiar código'}
        </button>
        <a
          href={whatsappLink(tenant.contactPhone, message)}
          target="_blank"
          rel="noopener noreferrer"
          className={secondaryButton}
        >
          <MessageCircle size={16} strokeWidth={1.5} aria-hidden />
          Enviar por WhatsApp
        </a>
      </div>
    </div>
  );
}
