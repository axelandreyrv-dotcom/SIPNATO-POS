import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  can,
  createProductSchema,
  stockMovementSchema,
  updateProductSchema,
} from '@sipnato/shared';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import type { ProductFilter } from './repository.js';
import {
  createProduct,
  listMovements,
  listProducts,
  lookupByCode,
  recordMovement,
  updateProduct,
} from './service.js';

function meta(request: FastifyRequest) {
  return { ip: request.ip ?? null, userAgent: request.headers['user-agent'] ?? null };
}

const validationError = (message = 'Datos inválidos') => ({
  error: { code: 'VALIDATION_ERROR', message },
});
const FILTERS: ProductFilter[] = ['activos', 'stock-bajo', 'inactivos'];

function parseId(request: FastifyRequest): number | null {
  const id = Number((request.params as { id: string }).id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export default async function productsRoutes(app: FastifyInstance) {
  const managers = { preHandler: [requireAuth, requireRole('dueno', 'admin')] };
  const showCost = (request: FastifyRequest) => can(request.user.role, 'viewCosts');

  // ── GET /api/products?q=&filter= ──────────────────────────────────────────
  // Todos los roles: el cajero busca productos para vender.
  app.get('/', { preHandler: [requireAuth] }, async (request) => {
    const query = request.query as { q?: string; filter?: string };
    const filter = FILTERS.includes(query.filter as ProductFilter)
      ? (query.filter as ProductFilter)
      : 'activos';
    return listProducts(query.q?.slice(0, 100), filter, showCost(request));
  });

  // ── GET /api/products/lookup?code= ────────────────────────────────────────
  app.get('/lookup', { preHandler: [requireAuth] }, async (request, reply) => {
    const { code } = request.query as { code?: string };
    if (!code || code.length > 64)
      return reply.status(400).send(validationError('Código inválido'));
    const product = lookupByCode(code, showCost(request));
    if (!product)
      return reply
        .status(404)
        .send({ error: { code: 'PRODUCTO_NO_ENCONTRADO', message: 'Producto no encontrado' } });
    return product;
  });

  // ── POST /api/products ────────────────────────────────────────────────────
  app.post('/', managers, async (request, reply) => {
    const body = createProductSchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send(validationError(body.error.issues[0]?.message));
    return reply.status(201).send(createProduct(body.data, meta(request)));
  });

  // ── PATCH /api/products/:id ───────────────────────────────────────────────
  app.patch('/:id', managers, async (request, reply) => {
    const id = parseId(request);
    if (!id) return reply.status(400).send(validationError('ID inválido'));
    const body = updateProductSchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send(validationError(body.error.issues[0]?.message));
    return updateProduct(id, body.data, meta(request));
  });

  // ── POST /api/products/:id/movements ──────────────────────────────────────
  app.post('/:id/movements', managers, async (request, reply) => {
    const id = parseId(request);
    if (!id) return reply.status(400).send(validationError('ID inválido'));
    const body = stockMovementSchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send(validationError(body.error.issues[0]?.message));
    return reply.status(201).send(recordMovement(id, body.data, meta(request)));
  });

  // ── GET /api/products/:id/movements ───────────────────────────────────────
  app.get('/:id/movements', managers, async (request, reply) => {
    const id = parseId(request);
    if (!id) return reply.status(400).send(validationError('ID inválido'));
    return listMovements(id);
  });
}
