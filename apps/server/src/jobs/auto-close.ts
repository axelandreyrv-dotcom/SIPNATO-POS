import cron from 'node-cron';
import type { FastifyBaseLogger } from 'fastify';
import { findOpenRegister } from '../modules/cash-registers/repository.js';
import { closeCashRegister } from '../modules/cash-registers/service.js';
import { getAllSettings } from '../modules/settings/repository.js';

// Costa Rica is UTC-6 permanently (no DST).
const CR_OFFSET_MS = 6 * 60 * 60 * 1000;

function nowCRParts(): { hours: number; minutes: number } {
  const crMs = Date.now() - CR_OFFSET_MS;
  const d = new Date(crMs);
  return { hours: d.getUTCHours(), minutes: d.getUTCMinutes() };
}

function parseHHMM(value: string): { hours: number; minutes: number } | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  return { hours: parseInt(match[1]!, 10), minutes: parseInt(match[2]!, 10) };
}

export function startAutoCloseCron(log: FastifyBaseLogger): void {
  cron.schedule('* * * * *', async () => {
    try {
      const settingsMap = await getAllSettings();
      if (settingsMap.auto_close_enabled !== 'true') return;

      const target = parseHHMM(settingsMap.auto_close_time);
      if (!target) return;

      const { hours, minutes } = nowCRParts();
      if (hours !== target.hours || minutes !== target.minutes) return;

      const open = findOpenRegister();
      if (!open) return;

      log.info({ cashRegisterId: open.id }, 'Auto-close: cerrando caja programada');
      closeCashRegister('auto', new Date().toISOString(), { ip: null, userAgent: 'auto-close-cron' });
      log.info({ cashRegisterId: open.id }, 'Auto-close: caja cerrada correctamente');
    } catch (err) {
      log.error({ err }, 'Auto-close: error inesperado cerrando caja');
    }
  });

  log.info('Auto-close cron iniciado (cada minuto)');
}

export async function checkRetroactiveAutoClose(log: FastifyBaseLogger): Promise<void> {
  try {
    const settingsMap = await getAllSettings();
    if (settingsMap.auto_close_enabled !== 'true') return;

    const target = parseHHMM(settingsMap.auto_close_time);
    if (!target) return;

    const open = findOpenRegister();
    if (!open) return;

    // If the scheduled close time already passed since the register was opened,
    // the server was likely down during that window — close retroactively.
    const utcNow = Date.now();
    const crNowMs = utcNow - CR_OFFSET_MS;
    const crToday = new Date(crNowMs);
    crToday.setUTCHours(target.hours, target.minutes, 0, 0);
    const scheduledCloseUtcMs = crToday.getTime() + CR_OFFSET_MS;

    const openedAtMs = new Date(open.openedAt).getTime();
    if (scheduledCloseUtcMs > openedAtMs && scheduledCloseUtcMs < utcNow) {
      log.warn(
        { cashRegisterId: open.id, scheduledClose: new Date(scheduledCloseUtcMs).toISOString() },
        'Retroactive auto-close: servidor estuvo apagado durante la hora programada',
      );
      const closedAt = new Date(scheduledCloseUtcMs).toISOString();
      closeCashRegister('auto', closedAt, { ip: null, userAgent: 'retroactive-auto-close' });
      log.info({ cashRegisterId: open.id }, 'Retroactive auto-close: caja cerrada');
    }
  } catch (err) {
    log.error({ err }, 'Retroactive auto-close: error en verificación de startup');
  }
}
