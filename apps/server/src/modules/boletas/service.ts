import { AppError, BoletaNoEncontrada } from '../../lib/errors.js';
import {
  validateOrderFields,
  type BoletaList,
  type BoletaWithCustomer,
  type CreateBoletaInput,
} from '@sipnato/shared';
import { getProfile } from '../business/repository.js';
import { createBoletaRow, findBoletaById, listBoletasRows } from './repository.js';

interface Meta {
  ip: string | null;
  userAgent: string | null;
}

const PAGE_SIZE = 50;

// Los campos variables se validan contra el perfil vigente del negocio: obligatorios,
// tipo (número, IMEI, opción de lista) y solo claves definidas.
export function createBoleta(input: CreateBoletaInput, meta: Meta): BoletaWithCustomer {
  const result = validateOrderFields(getProfile().fields, input.fields);
  if (!result.ok) {
    throw new AppError('VALIDATION_ERROR', Object.values(result.errors)[0]!, 400);
  }
  const { fields: _raw, ...rest } = input;
  return createBoletaRow(rest, result.values, meta);
}

export function getBoleta(id: number): BoletaWithCustomer {
  const boleta = findBoletaById(id);
  if (!boleta) throw new BoletaNoEncontrada();
  return boleta;
}

export function listBoletas(q: string, page: number): BoletaList {
  return listBoletasRows(q.trim(), page, PAGE_SIZE);
}
