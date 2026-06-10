import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ─── admin ────────────────────────────────────────────────────────────────────
// Single row — created once at /auth/setup. id is always 1.
// CHECK (id = 1) enforced at DB level: a second INSERT is physically impossible.
export const admin = sqliteTable(
  'admin',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    passwordHash: text('password_hash').notNull(),
    recoveryCodeHash: text('recovery_code_hash').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  () => ({
    singleRow: check('admin_single_row', sql`id = 1`),
  }),
);

// ─── sessions ─────────────────────────────────────────────────────────────────
export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
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

// ─── boletas ──────────────────────────────────────────────────────────────────
export const boletas = sqliteTable('boletas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  customerId: integer('customer_id')
    .notNull()
    .references(() => customers.id),
  consecutive: integer('consecutive').notNull(),
  deviceModel: text('device_model').notNull(),
  imei: text('imei'),
  // Stored as plain text — this is the customer's device PIN, not a system secret.
  // The UI must display a clear "not stored securely" notice.
  unlockPassword: text('unlock_password'),
  description: text('description').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
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

// ─── print_jobs ───────────────────────────────────────────────────────────────
export const printJobs = sqliteTable('print_jobs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type', { enum: ['sale', 'boleta', 'quote', 'test'] }).notNull(),
  payload: text('payload').notNull(),
  status: text('status', { enum: ['pending', 'printed', 'failed'] })
    .notNull()
    .default('pending'),
  attempts: integer('attempts').notNull().default(0),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ─── counters ─────────────────────────────────────────────────────────────────
// Single row per document type — incremented inside a transaction.
export const counters = sqliteTable('counters', {
  type: text('type', { enum: ['sale', 'boleta', 'quote'] }).primaryKey(),
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
  ip: text('ip'),
  userAgent: text('user_agent'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});
