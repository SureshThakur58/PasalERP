import sql from 'mssql';
import { AsyncLocalStorage } from 'node:async_hooks';
import { env } from './env.js';

const databaseContext = new AsyncLocalStorage<{ database: string }>();
const pools = new Map<string, Promise<sql.ConnectionPool>>();

const makeConfig = (database: string): sql.config => ({
  server: env.DB_SERVER,
  port: env.DB_PORT,
  database,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  options: {
    encrypt: env.DB_ENCRYPT,
    trustServerCertificate: env.DB_TRUST_SERVER_CERTIFICATE,
    enableArithAbort: true,
  },
  pool: {
    max: env.DB_POOL_MAX,
    min: env.DB_POOL_MIN,
    idleTimeoutMillis: env.DB_POOL_IDLE_TIMEOUT,
  },
});

export function runWithDatabase<T>(database: string, fn: () => T): T {
  return databaseContext.run({ database }, fn);
}

export function getSelectedDatabase(): string {
  return databaseContext.getStore()?.database ?? env.DB_NAME;
}

export function getPool(database?: string): Promise<sql.ConnectionPool> {
  const dbName = database ?? getSelectedDatabase();
  let promise = pools.get(dbName);

  if (!promise) {
    promise = new sql.ConnectionPool(makeConfig(dbName)).connect();
    pools.set(dbName, promise);
    promise.catch(() => {
      if (pools.get(dbName) === promise) pools.delete(dbName);
    });
  }

  return promise;
}

export async function closePool(): Promise<void> {
  const entries = [...pools.entries()];
  pools.clear();
  await Promise.all(entries.map(async ([, promise]) => {
    try {
      const pool = await promise;
      await pool.close();
    } catch {
      // Ignore already-failed/closed pools during shutdown.
    }
  }));
}

export { sql };
