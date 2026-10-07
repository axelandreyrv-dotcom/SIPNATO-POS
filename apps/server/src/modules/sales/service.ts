import type { Actor } from '../../db/client.js';
import {
  CajaNoAbierta,
  ProductoInactivo,
  ProductoNoEncontrado,
  VentaNoEnCajaActiva,
  VentaNoEncontrada,
} from '../../lib/errors.js';
import { findOpenRegister } from '../cash-registers/repository.js';
import { findProductById } from '../products/repository.js';
import type { CreateSaleInput, CreateSaleResult, SaleItemInput, SaleList } from '@sipnato/shared';
import {
  createSaleRow,
  findSaleById,
  listSalesRows,
  softDeleteSaleRow,
  type ResolvedSaleItem,
} from './repository.js';

interface Meta {
  ip: string | null;
  userAgent: string | null;
}

// Precio y costo de los productos salen del catálogo: el cliente solo dice qué y cuánto.
function resolveItem(item: SaleItemInput): ResolvedSaleItem {
  if ('productId' in item) {
    const product = findProductById(item.productId);
    if (!product) throw new ProductoNoEncontrado();
    if (!product.active) throw new ProductoInactivo(product.name);
    return {
      productId: product.id,
      description: product.name,
      quantity: item.quantity,
      unitPrice: product.price,
      unitCost: product.cost,
      total: product.price * item.quantity,
      trackStock: product.trackStock,
    };
  }
  return {
    productId: null,
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    unitCost: null,
    total: item.unitPrice * item.quantity,
    trackStock: false,
  };
}

// "2× Protector templado, Cargador USB-C": las ventas con carrito se siguen leyendo bien
// en reportes, caja y dashboard, que muestran la descripción de la venta.
function summarize(items: ResolvedSaleItem[]): string {
  const text = items.map((i) => (i.quantity > 1 ? `${i.quantity}× ${i.description}` : i.description)).join(', ');
  return text.length > 500 ? `${text.slice(0, 497)}...` : text;
}

export function createSale(input: CreateSaleInput, meta: Meta): CreateSaleResult {
  const register = findOpenRegister();
  if (!register) throw new CajaNoAbierta();

  if (input.items) {
    const items = input.items.map(resolveItem);
    return createSaleRow(
      {
        description: input.description?.trim() || summarize(items),
        amount: items.reduce((sum, i) => sum + i.total, 0),
        paymentMethod: input.paymentMethod,
        items,
      },
      register.id,
      meta,
    );
  }

  return createSaleRow(
    {
      description: input.description ?? null,
      amount: input.amount!,
      paymentMethod: input.paymentMethod,
      items: [],
    },
    register.id,
    meta,
  );
}

export function deleteSale(id: number, meta: Meta, authorizedBy: Actor): void {
  const register = findOpenRegister();
  if (!register) throw new CajaNoAbierta();

  const sale = findSaleById(id);
  if (!sale || sale.deletedAt !== null) throw new VentaNoEncontrada();
  if (sale.cashRegisterId !== register.id) throw new VentaNoEnCajaActiva();

  softDeleteSaleRow(id, meta, {
    amount: sale.amount,
    paymentMethod: sale.paymentMethod,
    authorizedBy: { id: authorizedBy.id, username: authorizedBy.username },
  });
}

export function listSales(page: number): SaleList {
  const limit = 50;
  const register = findOpenRegister();

  if (!register) {
    return { sales: [], total: 0, page: 1, totalPages: 1 };
  }

  const { sales, total } = listSalesRows(register.id, page, limit);
  return {
    sales,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}
