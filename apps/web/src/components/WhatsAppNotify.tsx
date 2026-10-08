import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle } from 'lucide-react';
import {
  DEFAULT_MESSAGES,
  MESSAGE_SETTING_KEYS,
  NOTIFICATION_LABELS,
  renderMessage,
  whatsappLink,
  type CustomerNotification,
  type NotificationEvent,
  type RecordNotificationInput,
} from '@sipnato/shared';
import { apiFetch } from '@/lib/api-client';
import { fmtDateTime } from '@/lib/format';
import { settingsApi } from '@/features/settings/api';

type EntityType = RecordNotificationInput['entityType'];

const notificationsApi = {
  list: (entityType: EntityType, entityId: number) =>
    apiFetch<CustomerNotification[]>(
      `/api/notifications?entityType=${entityType}&entityId=${entityId}`,
    ),
  record: (data: RecordNotificationInput) =>
    apiFetch<{ ok: boolean }>('/api/notifications', { method: 'POST', body: JSON.stringify(data) }),
};

// Abre WhatsApp con el mensaje del negocio ya escrito; quien atiende toca Enviar.
// El sistema no puede confirmar que se envió: registra que se abrió el aviso.
export function WhatsAppNotify({
  event,
  entityType,
  entityId,
  phone,
  vars,
  label,
}: {
  event: NotificationEvent;
  entityType: EntityType;
  entityId: number;
  phone: string | null;
  vars: Record<string, string>;
  label?: string;
}) {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
    staleTime: 5 * 60_000,
  });

  const record = useMutation({
    mutationFn: notificationsApi.record,
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['notifications', entityType, entityId] }),
  });

  function send() {
    const template = settings?.[MESSAGE_SETTING_KEYS[event]] || DEFAULT_MESSAGES[event];
    const message = renderMessage(template, {
      negocio: settings?.shop_name?.trim() || 'nuestro negocio',
      ...vars,
    });
    // Se abre primero (dentro del clic) para que el navegador no lo bloquee como popup.
    window.open(whatsappLink(phone, message), '_blank', 'noopener,noreferrer');
    record.mutate({ event, entityType, entityId, phone });
  }

  return (
    <button
      type="button"
      onClick={send}
      className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-text-secondary transition-colors hover:border-brand-success/50 hover:bg-brand-success/[0.06] hover:text-brand-success"
    >
      <MessageCircle size={15} strokeWidth={1.5} aria-hidden />
      {label ?? NOTIFICATION_LABELS[event]}
    </button>
  );
}

// "Avisado: Listo para retirar · 07 oct 2026, 14:30 · @caro"
export function NotificationHistory({
  entityType,
  entityId,
}: {
  entityType: EntityType;
  entityId: number;
}) {
  const { data } = useQuery({
    queryKey: ['notifications', entityType, entityId],
    queryFn: () => notificationsApi.list(entityType, entityId),
    staleTime: 30_000,
  });
  if (!data?.length) return null;

  return (
    <ul className="m-0 mt-2 list-none space-y-0.5 p-0 text-xs text-text-muted">
      {data.slice(0, 3).map((n, i) => (
        <li key={i}>
          Avisado: {NOTIFICATION_LABELS[n.event]} · {fmtDateTime(n.createdAt)}
          {n.username ? ` · @${n.username}` : ''}
        </li>
      ))}
    </ul>
  );
}
