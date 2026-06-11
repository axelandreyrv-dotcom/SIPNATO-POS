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
