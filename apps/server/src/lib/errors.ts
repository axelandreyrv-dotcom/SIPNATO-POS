export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class CajaYaAbierta extends AppError {
  constructor() {
    super('CAJA_YA_ABIERTA', 'Ya existe una caja abierta', 409);
  }
}

export class CajaNoAbierta extends AppError {
  constructor() {
    super('CAJA_NO_ABIERTA', 'No hay una caja abierta actualmente', 400);
  }
}

export class SesionExpirada extends AppError {
  constructor() {
    super('SESION_EXPIRADA', 'La sesión ha expirado', 401);
  }
}

export class NoAutorizado extends AppError {
  constructor() {
    super('NO_AUTORIZADO', 'No autorizado', 401);
  }
}

export class RecursoNoEncontrado extends AppError {
  constructor(recurso: string) {
    super('NO_ENCONTRADO', `${recurso} no encontrado`, 404);
  }
}

export class VentaNoEncontrada extends AppError {
  constructor() {
    super('VENTA_NO_ENCONTRADA', 'Venta no encontrada', 404);
  }
}

export class VentaNoEnCajaActiva extends AppError {
  constructor() {
    super('VENTA_NO_EN_CAJA_ACTIVA', 'Esta venta no pertenece a la caja activa', 403);
  }
}

export class GastoNoEncontrado extends AppError {
  constructor() {
    super('GASTO_NO_ENCONTRADO', 'Gasto no encontrado', 404);
  }
}

export class GastoNoEnCajaActiva extends AppError {
  constructor() {
    super('GASTO_NO_EN_CAJA_ACTIVA', 'Este gasto no pertenece a la caja activa', 403);
  }
}

export class ClienteNoEncontrado extends AppError {
  constructor() {
    super('CLIENTE_NO_ENCONTRADO', 'Cliente no encontrado', 404);
  }
}

export class BoletaNoEncontrada extends AppError {
  constructor() {
    super('BOLETA_NO_ENCONTRADA', 'Boleta no encontrada', 404);
  }
}

export class CotizacionNoEncontrada extends AppError {
  constructor() {
    super('COTIZACION_NO_ENCONTRADA', 'Cotización no encontrada', 404);
  }
}

export class NotaNoEncontrada extends AppError {
  constructor() {
    super('NOTA_NO_ENCONTRADA', 'Nota no encontrada', 404);
  }
}

export class ApartadoNoEncontrado extends AppError {
  constructor() {
    super('APARTADO_NO_ENCONTRADO', 'Apartado no encontrado', 404);
  }
}

export class ApartadoNoActivo extends AppError {
  constructor() {
    super('APARTADO_NO_ACTIVO', 'Este apartado no está activo', 400);
  }
}

export class FacturaNoEncontrada extends AppError {
  constructor() {
    super('FACTURA_NO_ENCONTRADA', 'Factura no encontrada', 404);
  }
}

export class FacturaYaAnulada extends AppError {
  constructor() {
    super('FACTURA_YA_ANULADA', 'Esta factura ya está anulada', 400);
  }
}

export class CreditoNoEncontrado extends AppError {
  constructor() {
    super('CREDITO_NO_ENCONTRADO', 'Crédito no encontrado', 404);
  }
}

export class CreditoNoActivo extends AppError {
  constructor() {
    super('CREDITO_NO_ACTIVO', 'Este crédito no está activo', 400);
  }
}

export class AbonoPagoExcede extends AppError {
  constructor() {
    super('ABONO_EXCEDE_TOTAL', 'El abono excede el saldo pendiente', 400);
  }
}
