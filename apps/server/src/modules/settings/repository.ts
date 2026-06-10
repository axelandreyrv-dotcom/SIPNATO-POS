import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { settings } from '../../db/schema.js';

const SETTING_KEYS = [
  'shop_name',
  'shop_phone',
  'shop_id_number',
  'receipt_footer',
  'boleta_footer',
  'quote_footer',
  'auto_close_enabled',
  'auto_close_time',
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

export type RawSettings = Record<SettingKey, string>;

export async function getAllSettings(): Promise<RawSettings> {
  const rows = await db.select().from(settings);
  const map: Partial<RawSettings> = {};
  for (const row of rows) {
    if ((SETTING_KEYS as readonly string[]).includes(row.key)) {
      map[row.key as SettingKey] = row.value;
    }
  }
  return {
    shop_name: map.shop_name ?? '',
    shop_phone: map.shop_phone ?? '',
    shop_id_number: map.shop_id_number ?? '',
    receipt_footer: map.receipt_footer ?? '',
    boleta_footer: map.boleta_footer ?? '',
    quote_footer: map.quote_footer ?? '',
    auto_close_enabled: map.auto_close_enabled ?? 'false',
    auto_close_time: map.auto_close_time ?? '00:00',
  };
}

export async function setSetting(key: SettingKey, value: string): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: new Date().toISOString() },
    });
}

export async function getSetting(key: SettingKey): Promise<string | null> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  return row?.value ?? null;
}
