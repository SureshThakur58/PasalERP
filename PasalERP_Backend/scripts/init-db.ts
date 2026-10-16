import fs from 'node:fs/promises';
import path from 'node:path';
import sql from 'mssql';
import 'dotenv/config';

const server=process.env.DB_SERVER||'localhost'; const port=Number(process.env.DB_PORT||1433); const user=process.env.DB_USER||'sa'; const password=process.env.DB_PASSWORD||''; const dbName=process.env.DB_NAME||'NepalIRDERP';
const master=await new sql.ConnectionPool({server,port,user,password,database:'master',options:{encrypt:process.env.DB_ENCRYPT==='true',trustServerCertificate:process.env.DB_TRUST_SERVER_CERTIFICATE!=='false'}}).connect();
const exists=await master.request().input('db',dbName).query('SELECT DB_ID(@db) id');
if(!exists.recordset[0].id) await master.request().input('db',dbName).query(`CREATE DATABASE [${dbName.replace(/]/g,']]')}]`);
await master.close();
const pool=await new sql.ConnectionPool({server,port,user,password,database:dbName,options:{encrypt:process.env.DB_ENCRYPT==='true',trustServerCertificate:process.env.DB_TRUST_SERVER_CERTIFICATE!=='false'}}).connect();
let sqlText=await fs.readFile(path.resolve('sql/001_schema.sql'),'utf8'); sqlText=sqlText.replace(/GO\s*$/gmi,'').replace(/^GO\s*$/gmi,'');
// The schema file contains only statements separated by GO; execute each batch independently.
for(const batch of sqlText.split(/^GO\s*$/gmi).map(s=>s.trim()).filter(Boolean)) await pool.request().batch(batch);
console.log(`Database ${dbName} initialized.`); await pool.close();
