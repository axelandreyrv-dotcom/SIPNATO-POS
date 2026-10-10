import type { Settings } from '@sipnato/shared';
import { exportTenant, type TenantExport } from '../../lib/export.js';
import {
  getAllSettings,
  insertBackupAudit,
  setAllSettings,
  type SettingKey,
} from './repository.js';

export function getSettings(): Settings {
  const raw = getAllSettings();
  return { ...raw, auto_close_enabled: raw.auto_close_enabled === 'true' };
}

export function updateSettings(
  data: Settings,
  meta: { ip: string | null; userAgent: string | null },
): Settings {
  // Todas las claves se guardan como texto; el único booleano es auto_close_enabled.
  const entries = Object.entries(data).map(
    ([key, value]) => [key as SettingKey, String(value)] as [SettingKey, string],
  );

  setAllSettings(entries, {
    payloadSnapshot: JSON.stringify(data),
    ip: meta.ip ?? null,
    userAgent: meta.userAgent ?? null,
  });

  return data;
}

// Respaldo bajo demanda: todas las tablas del negocio como JSON. Queda registrado quién lo bajó.
export function downloadBackup(
  storage: DurableObjectStorage,
  meta: { ip: string | null; userAgent: string | null },
): TenantExport {
  const backup = exportTenant(storage);
  insertBackupAudit(backup.schemaVersion, meta);
  return backup;
}
