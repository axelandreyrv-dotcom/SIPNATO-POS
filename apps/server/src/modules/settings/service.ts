import type { Settings } from '@sipnato/shared';
import { db } from '../../db/client.js';
import { auditLog } from '../../db/schema.js';
import { getAllSettings, setSetting, type SettingKey } from './repository.js';

export async function getSettings(): Promise<Settings> {
  const raw = await getAllSettings();
  return {
    shop_name: raw.shop_name,
    shop_phone: raw.shop_phone,
    shop_id_number: raw.shop_id_number,
    receipt_footer: raw.receipt_footer,
    boleta_footer: raw.boleta_footer,
    quote_footer: raw.quote_footer,
    auto_close_enabled: raw.auto_close_enabled === 'true',
    auto_close_time: raw.auto_close_time,
  };
}

export async function updateSettings(
  data: Settings,
  meta: { ip: string | null; userAgent: string | null },
): Promise<Settings> {
  const entries: [SettingKey, string][] = [
    ['shop_name', data.shop_name],
    ['shop_phone', data.shop_phone],
    ['shop_id_number', data.shop_id_number],
    ['receipt_footer', data.receipt_footer],
    ['boleta_footer', data.boleta_footer],
    ['quote_footer', data.quote_footer],
    ['auto_close_enabled', String(data.auto_close_enabled)],
    ['auto_close_time', data.auto_close_time],
  ];

  for (const [key, value] of entries) {
    await setSetting(key, value);
  }

  await db.insert(auditLog).values({
    action: 'SETTINGS_UPDATED',
    entityType: null,
    entityId: null,
    payloadSnapshot: JSON.stringify(data),
    ip: meta.ip ?? null,
    userAgent: meta.userAgent ?? null,
  });

  return data;
}
