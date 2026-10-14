import type { Settings } from '@dosuxsoft/shared';
import { ApiError, apiFetch } from '../../lib/api-client';

export const settingsApi = {
  get: () => apiFetch<Settings>('/api/settings'),
  update: (data: Settings) =>
    apiFetch<Settings>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  // No pasa por apiFetch porque la respuesta es un archivo, no JSON para la app.
  downloadBackup: async (): Promise<{ blob: Blob; filename: string }> => {
    const res = await fetch('/api/settings/backup/download', { credentials: 'include' });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        error?: { code?: string; message?: string };
      };
      throw new ApiError(
        res.status,
        body.error?.code ?? 'UNKNOWN',
        body.error?.message ?? 'Error inesperado',
      );
    }
    const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1];
    return { blob: await res.blob(), filename: name ?? 'dosuxsoft-respaldo.json' };
  },
};
