import { ClienteNoEncontrado } from '../../lib/errors.js';
import type { BoletaSummary, Customer, CustomerList } from '@sipnato/shared';
import {
  findCustomerById,
  getCustomerBoletasRows,
  listCustomersRows,
} from './repository.js';

const PAGE_SIZE = 50;

export function listCustomers(q: string, page: number): CustomerList {
  return listCustomersRows(q.trim(), page, PAGE_SIZE);
}

export function getCustomer(id: number): { customer: Customer; boletas: BoletaSummary[] } {
  const customer = findCustomerById(id);
  if (!customer) throw new ClienteNoEncontrado();

  const boletaList = getCustomerBoletasRows(id);
  return { customer, boletas: boletaList };
}
