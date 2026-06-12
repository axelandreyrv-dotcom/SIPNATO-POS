import { z } from 'zod';

export const printJobTypeSchema = z.enum(['sale', 'boleta', 'quote', 'test']);
export type PrintJobType = z.infer<typeof printJobTypeSchema>;

// ── Payload shapes ─────────────────────────────────────────────────────────────

export const salePrintPayloadSchema = z.object({
  type: z.literal('sale'),
  saleId: z.number().int(),
  consecutive: z.number().int(),
  description: z.string().nullable(),
  amount: z.number().int(),
  paymentMethod: z.string(),
  createdAt: z.string(),
  shopName: z.string(),
  shopPhone: z.string(),
  shopIdNumber: z.string(),
  footer: z.string(),
});

export const boletaPrintPayloadSchema = z.object({
  type: z.literal('boleta'),
  boletaId: z.number().int(),
  consecutive: z.number().int(),
  customerName: z.string(),
  customerPhone: z.string(),
  device: z.string(),
  imei: z.string().nullable(),
  issueDescription: z.string(),
  estimatedCost: z.number().int().nullable(),
  createdAt: z.string(),
  shopName: z.string(),
  shopPhone: z.string(),
  shopIdNumber: z.string(),
  footer: z.string(),
});

export const quotePrintPayloadSchema = z.object({
  type: z.literal('quote'),
  quoteId: z.number().int(),
  consecutive: z.number().int(),
  items: z.array(z.object({ description: z.string(), amount: z.number().int() })),
  total: z.number().int(),
  createdAt: z.string(),
  shopName: z.string(),
  shopPhone: z.string(),
  shopIdNumber: z.string(),
  footer: z.string(),
});

export const testPrintPayloadSchema = z.object({
  type: z.literal('test'),
  message: z.string(),
  timestamp: z.string(),
});

export const printPayloadSchema = z.discriminatedUnion('type', [
  salePrintPayloadSchema,
  boletaPrintPayloadSchema,
  quotePrintPayloadSchema,
  testPrintPayloadSchema,
]);

export type SalePrintPayload = z.infer<typeof salePrintPayloadSchema>;
export type BoletaPrintPayload = z.infer<typeof boletaPrintPayloadSchema>;
export type QuotePrintPayload = z.infer<typeof quotePrintPayloadSchema>;
export type TestPrintPayload = z.infer<typeof testPrintPayloadSchema>;
export type PrintPayload = z.infer<typeof printPayloadSchema>;

// ── API types ──────────────────────────────────────────────────────────────────

export const createPrintJobSchema = z.object({
  payload: printPayloadSchema,
});

export interface PrintJob {
  id: number;
  type: PrintJobType;
  payload: PrintPayload;
  status: 'pending' | 'printed' | 'failed';
  attempts: number;
  createdAt: string;
  updatedAt: string;
}

export interface PrintBridgeStatus {
  connected: boolean;
  tokenSet: boolean;
}
