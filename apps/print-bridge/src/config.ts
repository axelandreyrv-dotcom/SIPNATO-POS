// Configuración del puente de impresión — valores desde variables de entorno
export const bridgeConfig = {
  serverUrl: process.env['SERVER_URL'] ?? 'ws://localhost:3000/ws/print',
  bridgeToken: process.env['BRIDGE_TOKEN'] ?? '',
  printerPath: process.env['PRINTER_PATH'] ?? '',
};
