import { Hono } from 'hono';
import {
  can,
  createProductSchema,
  stockMovementSchema,
  updateProductSchema,
} from '@sipnato/shared';
import { readJson, requestMeta, type AppContext, type AppEnv } from '../../lib/http.js';
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

const validationError = (message = 'Datos inválidos') => ({
  error: { code: 'VALIDATION_ERROR', message },
});
const FILTERS: ProductFilter[] = ['activos', 'stock-bajo', 'inactivos'];

function parseId(c: AppContext): number | null {
  const id = Number(c.req.param('id'));
  return Number.isInteger(id) && id > 0 ? id : null;
}

const showCost = (c: AppContext) => can(c.var.user.role, 'viewCosts');

const productsRoutes = new Hono<AppEnv>();
const managers = [requireAuth, requireRole('dueno', 'admin')] as const;

// ── GET /api/products?q=&filter= ──────────────────────────────────────────
// Todos los roles: el cajero busca productos para vender.
productsRoutes.get('/', requireAuth, (c) => {
  const requested = c.req.query('filter') as ProductFilter;
  const filter = FILTERS.includes(requested) ? requested : 'activos';
  return c.json(listProducts(c.req.query('q')?.slice(0, 100), filter, showCost(c)));
});

// ── GET /api/products/lookup?code= ────────────────────────────────────────
productsRoutes.get('/lookup', requireAuth, (c) => {
  const code = c.req.query('code');
  if (!code || code.length > 64) return c.json(validationError('Código inválido'), 400);
  const product = lookupByCode(code, showCost(c));
  if (!product) {
    return c.json(
      { error: { code: 'PRODUCTO_NO_ENCONTRADO', message: 'Producto no encontrado' } },
      404,
    );
  }
  return c.json(product);
});

// ── POST /api/products ────────────────────────────────────────────────────
productsRoutes.post('/', ...managers, async (c) => {
  const body = createProductSchema.safeParse(await readJson(c));
  if (!body.success) return c.json(validationError(body.error.issues[0]?.message), 400);
  return c.json(createProduct(body.data, requestMeta(c)), 201);
});

// ── PATCH /api/products/:id ───────────────────────────────────────────────
productsRoutes.patch('/:id', ...managers, async (c) => {
  const id = parseId(c);
  if (!id) return c.json(validationError('ID inválido'), 400);
  const body = updateProductSchema.safeParse(await readJson(c));
  if (!body.success) return c.json(validationError(body.error.issues[0]?.message), 400);
  return c.json(updateProduct(id, body.data, requestMeta(c)));
});

// ── POST /api/products/:id/movements ──────────────────────────────────────
productsRoutes.post('/:id/movements', ...managers, async (c) => {
  const id = parseId(c);
  if (!id) return c.json(validationError('ID inválido'), 400);
  const body = stockMovementSchema.safeParse(await readJson(c));
  if (!body.success) return c.json(validationError(body.error.issues[0]?.message), 400);
  return c.json(recordMovement(id, body.data, requestMeta(c)), 201);
});

// ── GET /api/products/:id/movements ───────────────────────────────────────
productsRoutes.get('/:id/movements', ...managers, (c) => {
  const id = parseId(c);
  if (!id) return c.json(validationError('ID inválido'), 400);
  return c.json(listMovements(id));
});

export default productsRoutes;
