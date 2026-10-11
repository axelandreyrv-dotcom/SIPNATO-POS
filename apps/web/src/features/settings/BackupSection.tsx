import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { ApiError } from '@/lib/api-client';
import { settingsApi } from './api';
import { Section } from './ui';

export function BackupSection() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setPending(true);
    setError(null);
    try {
      const { blob, filename } = await settingsApi.downloadBackup();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      // Safari (sobre todo en iOS) cancela la descarga si el enlace se revoca en el mismo turno.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'No se pudo descargar el respaldo. Intenta de nuevo.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Section
      title="Respaldo"
      description="Copia de todos los datos del negocio en un archivo JSON. Solo el dueño puede descargarla."
    >
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void download()}
          disabled={pending}
          className="flex h-9 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-text-primary transition-all duration-150 hover:bg-surface-input active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? (
            <Loader2 size={14} strokeWidth={1.5} className="animate-spin" aria-hidden />
          ) : (
            <Download size={14} strokeWidth={1.5} aria-hidden />
          )}
          Descargar respaldo (JSON)
        </button>
        {error && <span className="text-sm text-brand-error">{error}</span>}
      </div>
      <p className="text-xs text-text-muted">
        Contiene datos confidenciales (contraseñas de equipos de clientes). Guárdalo en un lugar
        seguro.
      </p>
    </Section>
  );
}
