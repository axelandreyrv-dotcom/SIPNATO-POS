export const COOKIE_NAME = 'sipnato_session';

// Sesión del panel de superadministrador (admin.<dominio>). Otro nombre a propósito: nunca
// se confunde con la de un negocio, y sin `Domain` solo viaja al subdominio del panel.
export const PLATFORM_COOKIE_NAME = 'dosuxsoft_platform';

// El Worker la fija (sobrescribiendo la del cliente) con el negocio que resolvió del Host; el
// Durable Object la compara con el negocio que guarda.
export const TENANT_HEADER = 'X-Dosuxsoft-Tenant';

// El Worker la fija (sobrescribiendo la del cliente) con el host con el que eligió el negocio o el
// panel; la API compara contra él el Origin de las escrituras.
export const HOST_HEADER = 'X-Dosuxsoft-Host';
