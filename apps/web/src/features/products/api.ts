import type {
  CreateProductInput,
  Product,
  StockMovement,
  StockMovementInput,
  UpdateProductInput,
} from '@sipnato/shared';
import { apiFetch } from '../../lib/api-client';

export type ProductFilter = 'activos' | 'stock-bajo' | 'inactivos';

export const productsApi = {
  list: (q: string, filter: ProductFilter = 'activos') =>
    apiFetch<{ products: Product[]; lowStockCount: number }>(
      `/api/products?filter=${filter}${q ? `&q=${encodeURIComponent(q)}` : ''}`,
    ),

  lookup: (code: string) =>
    apiFetch<Product>(`/api/products/lookup?code=${encodeURIComponent(code)}`),

  create: (data: CreateProductInput) =>
    apiFetch<Product>('/api/products', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: number, data: UpdateProductInput) =>
    apiFetch<Product>(`/api/products/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  addMovement: (id: number, data: StockMovementInput) =>
    apiFetch<Product>(`/api/products/${id}/movements`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  movements: (id: number) => apiFetch<StockMovement[]>(`/api/products/${id}/movements`),
};
