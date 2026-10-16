import 'dotenv/config';
import { getPool } from '../src/config/db.js';

async function main() {
  const pool = await getPool();
  await pool.request().batch(`
    IF COL_LENGTH('dbo.BusinessPartners','isVatApplicable') IS NULL
      ALTER TABLE dbo.BusinessPartners ADD isVatApplicable bit NOT NULL CONSTRAINT DF_BusinessPartners_IsVatApplicable DEFAULT 1;
    IF COL_LENGTH('dbo.PurchaseBills','isVatBill') IS NULL
      ALTER TABLE dbo.PurchaseBills ADD isVatBill bit NOT NULL CONSTRAINT DF_PurchaseBills_IsVatBill DEFAULT 0;
    IF COL_LENGTH('dbo.PurchaseBills','isCapitalizedVat') IS NULL
      ALTER TABLE dbo.PurchaseBills ADD isCapitalizedVat bit NOT NULL CONSTRAINT DF_PurchaseBills_IsCapitalizedVat DEFAULT 0;
  `);
  console.log('B4 purchase migration completed.');
  await pool.close();
}

main().catch((error) => { console.error(error); process.exit(1); });
