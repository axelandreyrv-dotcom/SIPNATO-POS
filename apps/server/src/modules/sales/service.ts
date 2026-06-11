import { CajaNoAbierta, VentaNoEnCajaActiva, VentaNoEncontrada } from '../../lib/errors.js';
import { findOpenRegister } from '../cash-registers/repository.js';
import type { CreateSaleInput, Sale, SaleList } from '@sipnato/shared';
import {
  createSaleRow,
  findSaleById,
  listSalesRows,
  softDeleteSaleRow,
} from './repository.js';

interface Meta {
  ip: string | null;
  userAgent: string | null;
}

export function createSale(input: CreateSaleInput, meta: Meta): Sale {
  const register = findOpenRegister();
  if (!register) throw new CajaNoAbierta();

  return createSaleRow(input, register.id, meta);
}

export function deleteSale(id: number, meta: Meta): void {
  const register = findOpenRegister();
  if (!register) throw new CajaNoAbierta();

  const sale = findSaleById(id);
  if (!sale || sale.deletedAt !== null) throw new VentaNoEncontrada();
  if (sale.cashRegisterId !== register.id) throw new VentaNoEnCajaActiva();

  softDeleteSaleRow(id, meta, { amount: sale.amount, paymentMethod: sale.paymentMethod });
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
