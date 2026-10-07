import type { Settings } from '@sipnato/shared';
import { getAllSettings, setAllSettings, type SettingKey } from './repository.js';

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
