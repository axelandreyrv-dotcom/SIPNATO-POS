import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { auditLog, settings } from '../../db/schema.js';

const SETTING_KEYS = [
  'shop_name',
  'shop_phone',
  'shop_mobile',
  'shop_id_number',
  'receipt_footer',
  'boleta_footer',
  'quote_footer',
  'auto_close_enabled',
  'auto_close_time',
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

export type RawSettings = Record<SettingKey, string>;

export function getAllSettings(): RawSettings {
  const rows = db.select().from(settings).all();
  const map: Partial<RawSettings> = {};
  for (const row of rows) {
    if ((SETTING_KEYS as readonly string[]).includes(row.key)) {
      map[row.key as SettingKey] = row.value;
    }
  }
  return {
    shop_name: map.shop_name ?? '',
    shop_phone: map.shop_phone ?? '',
    shop_mobile: map.shop_mobile ?? '',
    shop_id_number: map.shop_id_number ?? '',
    receipt_footer: map.receipt_footer ?? '',
    boleta_footer: map.boleta_footer ?? '',
    quote_footer: map.quote_footer ?? '',
    auto_close_enabled: map.auto_close_enabled ?? 'false',
    auto_close_time: map.auto_close_time ?? '00:00',
  };
}

export function setSetting(key: SettingKey, value: string): void {
  db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: new Date().toISOString() },
    })
    .run();
}

export function setAllSettings(
  entries: [SettingKey, string][],
  audit: { payloadSnapshot: string; ip: string | null; userAgent: string | null },
): void {
  const now = new Date().toISOString();
  db.transaction((tx) => {
    for (const [key, value] of entries) {
      tx
        .insert(settings)
        .values({ key, value })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value, updatedAt: now },
        })
        .run();
    }
    tx.insert(auditLog).values({
      action: 'SETTINGS_UPDATED',
      entityType: null,
      entityId: null,
      payloadSnapshot: audit.payloadSnapshot,
      ip: audit.ip,
      userAgent: audit.userAgent,
    }).run();
  });
}

export function getSetting(key: SettingKey): string | null {
  const row = db.select().from(settings).where(eq(settings.key, key)).limit(1).get();
  return row?.value ?? null;
}
