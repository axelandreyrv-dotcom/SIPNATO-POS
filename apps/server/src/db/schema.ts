import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ─── users ────────────────────────────────────────────────────────────────────
// Un dueño por negocio (creado en /auth/setup; índice único parcial en la migración 0007),
// más administradores y cajeros. secret_hash = argon2id de la contraseña (dueño/admin) o
// del PIN de 6 dígitos (cajero). Nunca se borran: se desactivan (el audit_log los referencia).
export const USER_ROLES = ['dueno', 'admin', 'cajero'] as const;

export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    username: text('username').notNull(),
    displayName: text('display_name').notNull(),
    role: text('role', { enum: USER_ROLES }).notNull(),
    secretHash: text('secret_hash').notNull(),
    // Solo el dueño tiene recovery code.
    recoveryCodeHash: text('recovery_code_hash'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    failedAttempts: integer('failed_attempts').notNull().default(0),
    lockedUntil: text('locked_until'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    usernameIdx: uniqueIndex('users_username_idx').on(t.username),
    roleCheck: check('users_role_check', sql`${t.role} IN ('dueno', 'admin', 'cajero')`),
  }),
);

// ─── sessions ─────────────────────────────────────────────────────────────────
export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    tokenHash: text('token_hash').notNull(),
    expiresAt: text('expires_at').notNull(),
    lastActiveAt: text('last_active_at').notNull(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    tokenHashIdx: uniqueIndex('sessions_token_hash_idx').on(t.tokenHash),
    userIdx: index('sessions_user_idx').on(t.userId),
  }),
);

// ─── settings ─────────────────────────────────────────────────────────────────
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ─── cash_registers ───────────────────────────────────────────────────────────
export const cashRegisters = sqliteTable('cash_registers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  openedAt: text('opened_at').notNull(),
  closedAt: text('closed_at'),
  closeType: text('close_type', { enum: ['manual', 'auto'] }),
  openingAmount: integer('opening_amount').notNull().default(0),
  totalSalesCash: integer('total_sales_cash'),
  totalSalesCard: integer('total_sales_card'),
  totalSalesTransfer: integer('total_sales_transfer'),
  totalSalesSinpe: integer('total_sales_sinpe'),
  totalExpenses: integer('total_expenses'),
  netBalance: integer('net_balance'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ─── sales ────────────────────────────────────────────────────────────────────
export const sales = sqliteTable(
  'sales',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    cashRegisterId: integer('cash_register_id')
      .notNull()
      .references(() => cashRegisters.id),
    consecutive: integer('consecutive').notNull(),
    description: text('description'),
    amount: integer('amount').notNull(),
    paymentMethod: text('payment_method', {
      enum: ['efectivo', 'tarjeta', 'transferencia', 'sinpe'],
    }).notNull(),
    deletedAt: text('deleted_at'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    cashRegisterIdx: index('sales_cash_register_idx').on(t.cashRegisterId),
  }),
);

// ─── expenses ─────────────────────────────────────────────────────────────────
export const expenses = sqliteTable(
  'expenses',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    cashRegisterId: integer('cash_register_id')
      .notNull()
      .references(() => cashRegisters.id),
    description: text('description').notNull(),
    amount: integer('amount').notNull(),
    deletedAt: text('deleted_at'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    cashRegisterIdx: index('expenses_cash_register_idx').on(t.cashRegisterId),
  }),
);

// ─── customers ────────────────────────────────────────────────────────────────
export const customers = sqliteTable(
  'customers',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    phone: text('phone').notNull(),
    email: text('email'),
    address: text('address'),
    idNumber: text('id_number'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    phoneIdx: index('customers_phone_idx').on(t.phone),
  }),
);

// ─── boletas (órdenes de servicio) ────────────────────────────────────────────
export const boletas = sqliteTable(
  'boletas',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    customerId: integer('customer_id')
      .notNull()
      .references(() => customers.id),
    consecutive: integer('consecutive').notNull(),
    // Artículo recibido (modelo del equipo, vehículo...). Etiqueta según el perfil del negocio.
    deviceModel: text('device_model').notNull(),
    // JSON OrderFieldValue[] con la etiqueta de cada campo al momento de crear la orden.
    // Los campos tipo "secret" (contraseña del equipo del cliente) van en texto plano:
    // no es un secreto del sistema y la UI lo advierte.
    fields: text('fields').notNull().default('[]'),
    description: text('description').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    consecutiveIdx: index('boletas_consecutive_idx').on(t.consecutive),
  }),
);

// ─── business_profile ─────────────────────────────────────────────────────────
// Una fila (id = 1): tipo de negocio, campos de las órdenes y módulos activos.
export const businessProfile = sqliteTable('business_profile', {
  id: integer('id').primaryKey(),
  template: text('template').notNull(),
  ordersLabel: text('orders_label').notNull(),
  itemLabel: text('item_label').notNull(),
  fields: text('fields').notNull(),
  modules: text('modules').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// ─── quotes ───────────────────────────────────────────────────────────────────
export const quotes = sqliteTable('quotes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  consecutive: integer('consecutive').notNull(),
  total: integer('total').notNull().default(0),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ─── quote_items ──────────────────────────────────────────────────────────────
export const quoteItems = sqliteTable('quote_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  quoteId: integer('quote_id')
    .notNull()
    .references(() => quotes.id),
  description: text('description').notNull(),
  amount: integer('amount').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});

// ─── notes ────────────────────────────────────────────────────────────────────
export const notes = sqliteTable('notes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ─── apartados ────────────────────────────────────────────────────────────────
export const apartados = sqliteTable(
  'apartados',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    consecutive: integer('consecutive').notNull(),
    customerName: text('customer_name').notNull(),
    customerPhone: text('customer_phone').notNull(),
    description: text('description').notNull(),
    totalAmount: integer('total_amount').notNull(),
    status: text('status', { enum: ['activo', 'completado', 'cancelado'] })
      .notNull()
      .default('activo'),
    notes: text('notes'),
    deletedAt: text('deleted_at'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    phoneIdx: index('apartados_phone_idx').on(t.customerPhone),
    statusIdx: index('apartados_status_idx').on(t.status),
  }),
);

// ─── apartado_payments ────────────────────────────────────────────────────────
export const apartadoPayments = sqliteTable(
  'apartado_payments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    apartadoId: integer('apartado_id')
      .notNull()
      .references(() => apartados.id),
    amount: integer('amount').notNull(),
    paymentMethod: text('payment_method', {
      enum: ['efectivo', 'tarjeta', 'transferencia', 'sinpe'],
    }).notNull(),
    note: text('note'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    apartadoIdx: index('apartado_payments_apartado_idx').on(t.apartadoId),
  }),
);

// ─── facturas ─────────────────────────────────────────────────────────────────
export const facturas = sqliteTable(
  'facturas',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    consecutive: integer('consecutive').notNull(),
    date: text('date').notNull(),
    clientName: text('client_name').notNull(),
    clientCedula: text('client_cedula'),
    ivaPercent: integer('iva_percent').notNull().default(0),
    subtotal: integer('subtotal').notNull().default(0),
    ivaAmount: integer('iva_amount').notNull().default(0),
    total: integer('total').notNull().default(0),
    status: text('status', { enum: ['activa', 'anulada'] }).notNull().default('activa'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    consecutiveIdx: index('facturas_consecutive_idx').on(t.consecutive),
    statusIdx: index('facturas_status_idx').on(t.status),
  }),
);

// ─── factura_items ────────────────────────────────────────────────────────────
export const facturaItems = sqliteTable(
  'factura_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    facturaId: integer('factura_id')
      .notNull()
      .references(() => facturas.id),
    quantity: integer('quantity').notNull().default(1),
    description: text('description').notNull(),
    unitPrice: integer('unit_price').notNull().default(0),
    total: integer('total').notNull().default(0),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => ({
    facturaIdx: index('factura_items_factura_idx').on(t.facturaId),
  }),
);

// ─── creditos ─────────────────────────────────────────────────────────────────
export const creditos = sqliteTable(
  'creditos',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    consecutive: integer('consecutive').notNull(),
    debtorName: text('debtor_name').notNull(),
    debtorPhone: text('debtor_phone').notNull(),
    description: text('description').notNull(),
    totalAmount: integer('total_amount').notNull(),
    dueDate: text('due_date').notNull(),
    status: text('status', { enum: ['activo', 'pagado', 'cancelado'] })
      .notNull()
      .default('activo'),
    deletedAt: text('deleted_at'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    phoneIdx: index('creditos_phone_idx').on(t.debtorPhone),
    statusIdx: index('creditos_status_idx').on(t.status),
    dueDateIdx: index('creditos_due_date_idx').on(t.dueDate),
  }),
);

// ─── credito_payments ─────────────────────────────────────────────────────────
export const creditoPayments = sqliteTable(
  'credito_payments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    creditoId: integer('credito_id')
      .notNull()
      .references(() => creditos.id),
    amount: integer('amount').notNull(),
    note: text('note'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    creditoIdx: index('credito_payments_credito_idx').on(t.creditoId),
  }),
);

// ─── products ─────────────────────────────────────────────────────────────────
// `stock` es el saldo de stock_movements, actualizado en la misma transacción que
// cada movimiento. Puede quedar negativo: vender sin stock registrado se avisa, no se bloquea.
export const products = sqliteTable(
  'products',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    // Código interno o de barras. Único cuando existe (índice parcial en la migración 0008).
    code: text('code'),
    category: text('category'),
    price: integer('price').notNull(),
    cost: integer('cost'),
    trackStock: integer('track_stock', { mode: 'boolean' }).notNull().default(true),
    stock: integer('stock').notNull().default(0),
    minStock: integer('min_stock').notNull().default(0),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    nameIdx: index('products_name_idx').on(t.name),
  }),
);

// ─── stock_movements ──────────────────────────────────────────────────────────
// Historial de existencias. Solo inserción. quantity es la variación con signo.
export const STOCK_MOVEMENT_TYPES = ['entrada', 'ajuste', 'venta', 'anulacion_venta'] as const;

export const stockMovements = sqliteTable(
  'stock_movements',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id),
    type: text('type', { enum: STOCK_MOVEMENT_TYPES }).notNull(),
    quantity: integer('quantity').notNull(),
    stockAfter: integer('stock_after').notNull(),
    unitCost: integer('unit_cost'),
    reason: text('reason'),
    saleId: integer('sale_id').references(() => sales.id),
    userId: integer('user_id').references(() => users.id),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    productIdx: index('stock_movements_product_idx').on(t.productId),
  }),
);

// ─── sale_items ───────────────────────────────────────────────────────────────
// Líneas de una venta con carrito. Precio y costo se copian al vender: cambiar el
// precio del producto después no altera ventas pasadas. product_id NULL = línea libre.
export const saleItems = sqliteTable(
  'sale_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    saleId: integer('sale_id')
      .notNull()
      .references(() => sales.id),
    productId: integer('product_id').references(() => products.id),
    description: text('description').notNull(),
    quantity: integer('quantity').notNull(),
    unitPrice: integer('unit_price').notNull(),
    unitCost: integer('unit_cost'),
    total: integer('total').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => ({
    saleIdx: index('sale_items_sale_idx').on(t.saleId),
    productIdx: index('sale_items_product_idx').on(t.productId),
  }),
);

// ─── counters ─────────────────────────────────────────────────────────────────
// Single row per document type — incremented inside a transaction.
export const counters = sqliteTable('counters', {
  type: text('type', { enum: ['sale', 'boleta', 'quote', 'apartado', 'factura', 'credito'] }).primaryKey(),
  currentValue: integer('current_value').notNull().default(0),
});

// ─── audit_log ────────────────────────────────────────────────────────────────
// Append-only. Never UPDATE or DELETE rows in this table.
export const auditLog = sqliteTable('audit_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  action: text('action').notNull(),
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  payloadSnapshot: text('payload_snapshot'),
  // Quién hizo la acción. NULL = sistema (cron) o intento sin sesión (login fallido).
  userId: integer('user_id').references(() => users.id),
  ip: text('ip'),
  userAgent: text('user_agent'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});
