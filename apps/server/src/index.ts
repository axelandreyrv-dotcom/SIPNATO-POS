import { bootstrapDb, runMigrations } from './db/client.js';
import { buildApp } from './app.js';
import { config } from './config.js';

runMigrations();
await bootstrapDb();

const app = buildApp();

const start = async () => {
  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
