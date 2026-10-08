import {
  applyAssignment,
  type AssignBusinessInput,
  type BusinessProfile,
  type OwnerProfileInput,
} from '@sipnato/shared';
import { getProfile, saveProfile } from './repository.js';

interface AuditMeta {
  ip: string | null;
  userAgent: string | null;
}

// El dueño edita nombres y campos; tipo de negocio y módulos se conservan aunque los envíe.
export function updateOwnerProfile(input: OwnerProfileInput, meta: AuditMeta): BusinessProfile {
  const current = getProfile();
  saveProfile({ ...current, ...input, template: current.template, modules: current.modules }, meta);
  return getProfile();
}

// Asignación desde la plataforma (panel o consola). Corre dentro del contexto del negocio.
export function assignBusiness(
  input: AssignBusinessInput,
  meta: AuditMeta,
): { before: BusinessProfile; after: BusinessProfile } {
  const before = getProfile();
  const after = applyAssignment(before, input);
  saveProfile(after, meta);
  return { before, after };
}
