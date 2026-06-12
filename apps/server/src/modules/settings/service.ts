import crypto from 'node:crypto';
import argon2 from 'argon2';
import type { Settings } from '@sipnato/shared';
import { getAllSettings, setAllSettings, setPrintBridgeTokenHash, getPrintBridgeTokenHash, type SettingKey } from './repository.js';
import { setTokenSetFlag } from '../print/service.js';

export function getSettings(): Settings {
  const raw = getAllSettings();
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

export function updateSettings(
  data: Settings,
  meta: { ip: string | null; userAgent: string | null },
): Settings {
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

  setAllSettings(entries, {
    payloadSnapshot: JSON.stringify(data),
    ip: meta.ip ?? null,
    userAgent: meta.userAgent ?? null,
  });

  return data;
}

export async function generatePrintToken(
  meta: { ip: string | null; userAgent: string | null },
): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const hash = await argon2.hash(token, { memoryCost: 65536, timeCost: 3, parallelism: 4 });
  setPrintBridgeTokenHash(hash, meta);
  setTokenSetFlag(true);
  return token;
}

export function isPrintTokenSet(): boolean {
  return getPrintBridgeTokenHash() !== null;
}
