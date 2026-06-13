import type { CreateFacturaInput, Factura, FacturaList, FacturaWithItems } from '@sipnato/shared';

const BASE = '/api/facturas';

export async function fetchFacturas(page = 1, search?: string): Promise<FacturaList> {
  const params = new URLSearchParams({ page: String(page) });
  if (search) params.set('search', search);
  const res = await fetch(`${BASE}?${params}`, { credentials: 'include' });
  if (!res.ok) throw new Error('Error cargando facturas');
  return res.json() as Promise<FacturaList>;
}

export async function fetchFactura(id: number): Promise<FacturaWithItems> {
  const res = await fetch(`${BASE}/${id}`, { credentials: 'include' });
  if (!res.ok) throw new Error('Error cargando factura');
  return res.json() as Promise<FacturaWithItems>;
}

export async function createFactura(input: CreateFacturaInput): Promise<FacturaWithItems> {
  const res = await fetch(BASE, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = (await res.json()) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? 'Error creando factura');
  }
  return res.json() as Promise<FacturaWithItems>;
}

export async function anularFactura(id: number): Promise<Factura> {
  const res = await fetch(`${BASE}/${id}/anular`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) {
    const body = (await res.json()) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? 'Error anulando factura');
  }
  return res.json() as Promise<Factura>;
}
