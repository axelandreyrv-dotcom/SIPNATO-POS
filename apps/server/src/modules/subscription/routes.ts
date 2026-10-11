import { Hono } from 'hono';
import { currentTenant } from '../../db/client.js';
import type { AppEnv } from '../../lib/http.js';
import { platformClient } from '../../lib/platform-client.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';

// El negocio consulta su propia suscripción a la plataforma. El slug es el del Durable Object
// que atiende la petición, nunca uno que mande el cliente.
const subscriptionRoutes = new Hono<AppEnv>();

subscriptionRoutes.get('/', requireAuth, requireRole('dueno', 'admin'), async (c) =>
  c.json(await platformClient(c.env).subscriptionInfo(currentTenant().slug)),
);

export default subscriptionRoutes;
