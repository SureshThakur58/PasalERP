import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.string().default('development'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  DB_SERVER: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive().default(1433),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string(),
  DB_ENCRYPT: z.enum(['true','false']).transform(v=>v==='true').default('false'),
  DB_TRUST_SERVER_CERTIFICATE: z.enum(['true','false']).transform(v=>v==='true').default('true'),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  DB_POOL_MIN: z.coerce.number().int().nonnegative().default(0),
  DB_POOL_IDLE_TIMEOUT: z.coerce.number().int().positive().default(30000),
  DB_TRUSTED_CONNECTION: z.enum(['true','false']).transform(v=>v==='true').default('false'),
  AUTH_SECRET: z.string().min(16).default('SmartERP-development-secret-change-me')
});

export const env = envSchema.parse(process.env);
