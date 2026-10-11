import { findOpenRegister } from '../modules/cash-registers/repository.js';
import { closeCashRegister } from '../modules/cash-registers/service.js';
import { getAllSettings } from '../modules/settings/repository.js';

// Costa Rica es UTC−6 todo el año (sin horario de verano).
const CR_OFFSET_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Hora programada de la alarma pendiente (ISO). La alarma en sí no lleva datos, y puede llegar
// tarde: con esto el cierre usa la hora programada y no la de llegada.
export const AUTO_CLOSE_KEY = 'auto-close-at';

// Próxima ocurrencia de "HH:MM" en hora de CR, estrictamente después de `now`.
export function nextAutoCloseAt(now: Date, autoCloseTime: string): Date {
  const match = HHMM.exec(autoCloseTime);
  if (!match) throw new Error(`Hora de cierre inválida: "${autoCloseTime}"`);
  const minutes = Number(match[1]) * 60 + Number(match[2]);

  // Medianoche de hoy en CR, expresada en UTC.
  const crNow = now.getTime() - CR_OFFSET_MS;
  const crMidnight = crNow - (((crNow % DAY_MS) + DAY_MS) % DAY_MS);
  const today = crMidnight + minutes * 60_000 + CR_OFFSET_MS;
  return new Date(today > now.getTime() ? today : today + DAY_MS);
}

// Debe correr en el contexto del negocio (lee su configuración). Lo llaman la inicialización, el
// arranque del DO, guardar la configuración y la propia alarma.
export async function scheduleAutoClose(storage: DurableObjectStorage): Promise<void> {
  const { auto_close_enabled: enabled, auto_close_time: time } = getAllSettings();
  if (enabled !== 'true' || !HHMM.test(time)) {
    storage.kv.delete(AUTO_CLOSE_KEY);
    await storage.deleteAlarm();
    return;
  }

  const now = Date.now();
  const pending = storage.kv.get<string>(AUTO_CLOSE_KEY);
  // Una alarma vencida que todavía no corrió (el DO despertó tarde, o se guardó la configuración
  // en ese momento) no se reemplaza por la de mañana: corre ya, con su hora original. Es lo que
  // hacía el cierre retroactivo al arrancar el servidor.
  if (pending !== undefined && Date.parse(pending) <= now) {
    await storage.setAlarm(now);
    return;
  }

  const at = nextAutoCloseAt(new Date(now), time);
  if (pending === at.toISOString() && (await storage.getAlarm()) === at.getTime()) return;
  storage.kv.put(AUTO_CLOSE_KEY, at.toISOString());
  await storage.setAlarm(at);
}

// Cuerpo de la alarma, en el contexto del negocio. Solo cierra una caja abierta antes de la hora
// programada, y con esa hora como cierre aunque la alarma llegue tarde.
export async function runAutoClose(storage: DurableObjectStorage): Promise<void> {
  const pending = storage.kv.get<string>(AUTO_CLOSE_KEY);
  if (pending !== undefined) {
    const scheduledAt = Date.parse(pending);
    if (scheduledAt > Date.now()) {
      // Llegó antes de su hora: se vuelve a poner en la hora programada sin cerrar nada.
      await storage.setAlarm(scheduledAt);
      return;
    }
    const open = findOpenRegister();
    if (open && Date.parse(open.openedAt) < scheduledAt) {
      closeCashRegister('auto', pending, { ip: null, userAgent: 'auto-close' });
    }
    // Si algo de arriba lanza, la clave queda y el reintento de la alarma vuelve a intentarlo.
    storage.kv.delete(AUTO_CLOSE_KEY);
  }
  await scheduleAutoClose(storage);
}
