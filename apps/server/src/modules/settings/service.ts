import type { Settings } from '@sipnato/shared';
import { getAllSettings, setAllSettings, type SettingKey } from './repository.js';

export function getSettings(): Settings {
  const raw = getAllSettings();
  return {
    shop_name: raw.shop_name,
    shop_address: raw.shop_address,
    shop_phone: raw.shop_phone,
    shop_mobile: raw.shop_mobile,
    shop_id_number: raw.shop_id_number,
    receipt_footer: raw.receipt_footer,
    boleta_footer: raw.boleta_footer,
    quote_footer: raw.quote_footer,
    auto_close_enabled: raw.auto_close_enabled === 'true',
    auto_close_time: raw.auto_close_time,
  };
}

export function updateSettings(
  data: Settings,
  meta: { ip: string | null; userAgent: string | null },
): Settings {
  const entries: [SettingKey, string][] = [
    ['shop_name', data.shop_name],
    ['shop_address', data.shop_address],
    ['shop_phone', data.shop_phone],
    ['shop_mobile', data.shop_mobile],
    ['shop_id_number', data.shop_id_number],
    ['receipt_footer', data.receipt_footer],
    ['boleta_footer', data.boleta_footer],
    ['quote_footer', data.quote_footer],
    ['auto_close_enabled', String(data.auto_close_enabled)],
    ['auto_close_time', data.auto_close_time],
  ];

  setAllSettings(entries, {
    payloadSnapshot: JSON.stringify(data),
    ip: meta.ip ?? null,
    userAgent: meta.userAgent ?? null,
  });

  return data;
}
