import { app } from './app.js';
import { env } from './config/env.js';
import { getPool } from './config/db.js';
import { ensureAuthSchema } from './services/authService.js';

getPool().then(()=>ensureAuthSchema()).then(()=>{
  app.listen(env.PORT, '0.0.0.0', () => {console.log(`Nepal IRD ERP API listening on port ${env.PORT}`);});
}).catch(err=>{
  console.error('Database connection failed:',err);
  process.exit(1);
});
