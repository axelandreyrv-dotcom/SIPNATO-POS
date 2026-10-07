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

// ─── Inventario (Fase C) ──────────────────────────────────────────────────────

export class ProductoNoEncontrado extends AppError {
  constructor() {
    super('PRODUCTO_NO_ENCONTRADO', 'Producto no encontrado', 404);
  }
}

export class CodigoProductoDuplicado extends AppError {
  constructor() {
    super('CODIGO_DUPLICADO', 'Ya existe un producto con ese código', 409);
  }
}

export class ProductoInactivo extends AppError {
  constructor(name: string) {
    super('PRODUCTO_INACTIVO', `"${name}" está desactivado y no se puede vender`, 400);
  }
}

export class ProductoSinControlStock extends AppError {
  constructor() {
    super('PRODUCTO_SIN_STOCK', 'Este producto no lleva control de existencias', 400);
  }
}

// ─── Usuarios y permisos (Fase B) ─────────────────────────────────────────────

export class CredencialesInvalidas extends AppError {
  constructor() {
    super('INVALID_CREDENTIALS', 'Usuario o contraseña/PIN incorrectos', 401);
  }
}

export class UsuarioBloqueado extends AppError {
  constructor() {
    super('USUARIO_BLOQUEADO', 'Demasiados intentos fallidos. Espera 15 minutos o pide a un administrador que restablezca tu acceso.', 429);
  }
}

export class PermisoDenegado extends AppError {
  constructor(message = 'No tienes permiso para esta acción') {
    super('FORBIDDEN', message, 403);
  }
}

export class UsuarioNoEncontrado extends AppError {
  constructor() {
    super('USUARIO_NO_ENCONTRADO', 'Usuario no encontrado', 404);
  }
}

export class UsuarioYaExiste extends AppError {
  constructor() {
    super('USUARIO_YA_EXISTE', 'Ya existe un usuario con ese nombre de usuario', 409);
  }
}

// El cajero intentó una acción que requiere que un admin o dueño la autorice en el momento.
export class AutorizacionRequerida extends AppError {
  constructor() {
    super('AUTORIZACION_REQUERIDA', 'Esta acción requiere la autorización de un administrador', 403);
  }
}

export class AutorizacionInvalida extends AppError {
  constructor() {
    super('AUTORIZACION_INVALIDA', 'La autorización no es válida: usuario o contraseña/PIN incorrectos, o sin permiso', 403);
  }
}
