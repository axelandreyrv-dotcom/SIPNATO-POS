import { buildApp } from './app.js';
import { config } from './config.js';
import { openTenantDb } from './db/client.js';
import { listActiveTenants } from './db/control.js';
import { checkRetroactiveAutoClose } from './jobs/auto-close.js';

const app = await buildApp();

// Abrir cada negocio activo aplica sus migraciones pendientes. Se hace al arrancar
// para que un fallo de migración aparezca en el log de inicio y no en el primer request.
for (const { slug } of listActiveTenants()) {
  try {
    openTenantDb(slug);
  } catch (err) {
    app.log.error({ err, tenant: slug }, 'No se pudo abrir/migrar la BD del negocio');
  }
}

await checkRetroactiveAutoClose(app.log);

const start = async () => {
  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
