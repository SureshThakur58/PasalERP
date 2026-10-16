import fs from 'node:fs/promises';
import path from 'node:path';
import sql from 'mssql';
import 'dotenv/config';

const server=process.env.DB_SERVER||'localhost';
const port=Number(process.env.DB_PORT||1433);
const user=process.env.DB_USER||'sa';
const password=process.env.DB_PASSWORD||'';
const dbName=process.env.DB_NAME||'NepalIRDERP';
const pool=await new sql.ConnectionPool({server,port,user,password,database:dbName,options:{encrypt:process.env.DB_ENCRYPT==='true',trustServerCertificate:process.env.DB_TRUST_SERVER_CERTIFICATE!=='false'}}).connect();
const text=await fs.readFile(path.resolve('sql/002_b1_master_data.sql'),'utf8');
for(const batch of text.split(/^GO\s*$/gmi).map(s=>s.trim()).filter(Boolean)) await pool.request().batch(batch);
console.log('B1 master-data migration applied.');
await pool.close();
