import sql from 'mssql';
import { getPool } from '../config/db.js';
import { HttpError } from '../middleware/errorHandler.js';

const tables = [
  ['warehouses', 'Warehouses'],
  ['partners', 'BusinessPartners'],
  ['items', 'Items'],
  ['batches', 'FifoBatches'],
  ['salesInvoices', 'SalesInvoices'],
  ['purchaseBills', 'PurchaseBills'],
  ['accounts', 'Accounts'],
  ['journalEntries', 'JournalEntries'],
  ['stockTransfers', 'StockTransfers'],
  ['stockMovements', 'StockMovements'],
] as const;

export async function migrationStatus() {
  const pool = await getPool();
  const counts: Record<string, number> = {};
  for (const [key, table] of tables) {
    const row = (await pool.request().query(`SELECT COUNT_BIG(1) AS count FROM dbo.${table}`)).recordset[0];
    counts[key] = Number(row.count);
  }
  const settings = (await pool.request().query('SELECT COUNT_BIG(1) AS count FROM dbo.CompanySettings')).recordset[0];
  return {
    backend: { online: true, service: 'nepal-ird-erp-backend', time: new Date().toISOString() },
    database: { connected: true, database: pool.config.database },
    counts,
    settingsPresent: Number(settings.count) > 0,
  };
}

function arrays(bundle: any) {
  const b = bundle?.bundle ?? bundle;
  if (!b || typeof b !== 'object') throw new HttpError(400, 'Migration bundle must be a JSON object.');
  return { b, sourceCounts: Object.fromEntries(tables.map(([key]) => [key, Array.isArray(b[key]) ? b[key].length : 0])) };
}

export async function previewMigration(bundle: any, mode: 'merge' | 'replace' = 'merge') {
  if (!['merge', 'replace'].includes(mode)) throw new HttpError(400, 'Migration mode must be merge or replace.');
  const { b, sourceCounts } = arrays(bundle);
  const status = await migrationStatus();
  const conflicts: string[] = [];
  const warnings: string[] = [];
  const pool = await getPool();

  const checkIds = async (key: string, table: string) => {
    const rows = Array.isArray(b[key]) ? b[key] : [];
    if (!rows.length) return;
    const ids = rows.map((r: any) => r.id).filter(Boolean);
    if (!ids.length) return;
    const request = pool.request();
    const placeholders = ids.map((_: string, i: number) => `@id${i}`).join(',');
    ids.forEach((id: string, i: number) => request.input(`id${i}`, sql.NVarChar(80), id));
    const result = await request.query(`SELECT id FROM dbo.${table} WHERE id IN (${placeholders})`);
    if (result.recordset.length) conflicts.push(`${key}: ${result.recordset.length} record(s) already exist on the server.`);
  };

  await checkIds('warehouses', 'Warehouses');
  await checkIds('partners', 'BusinessPartners');
  await checkIds('items', 'Items');
  await checkIds('batches', 'FifoBatches');
  await checkIds('salesInvoices', 'SalesInvoices');
  await checkIds('purchaseBills', 'PurchaseBills');
  await checkIds('journalEntries', 'JournalEntries');
  await checkIds('stockTransfers', 'StockTransfers');

  const checkField = async (key: string, table: string, field: string, label: string) => {
    const rows = Array.isArray(b[key]) ? b[key] : [];
    const values = [...new Set(rows.map((r: any) => String(r?.[field] ?? '')).filter(Boolean))];
    if (!values.length) return;
    const request = pool.request();
    const placeholders = values.map((_: string, i: number) => `@v${i}`).join(',');
    values.forEach((value: string, i: number) => request.input(`v${i}`, value));
    const result = await request.query(`SELECT ${field} FROM dbo.${table} WHERE ${field} IN (${placeholders})`);
    if (result.recordset.length) conflicts.push(`${label}: ${result.recordset.length} ${field} value(s) already exist on the server.`);
  };
  await checkField('warehouses','Warehouses','code','Warehouses');
  await checkField('partners','BusinessPartners','code','Partners');
  await checkField('items','Items','sku','Items');
  await checkField('salesInvoices','SalesInvoices','invoiceNo','Sales invoices');
  await checkField('purchaseBills','PurchaseBills','billNo','Purchase bills');
  await checkField('stockTransfers','StockTransfers','transferNo','Stock transfers');
  await checkField('journalEntries','JournalEntries','entryNo','Journal entries');
  await checkField('purchaseBills','PurchaseBills','supplierBillNo','Supplier bills');
  await checkField('accounts','Accounts','code','Accounts');

  const duplicateIds = (key: string, label: string) => {
    const rows = Array.isArray(b[key]) ? b[key] : [];
    const seen = new Set<string>();
    for (const row of rows) {
      const value = String(row?.id ?? '');
      if (!value) { warnings.push(`${label} contains a missing id.`); continue; }
      if (seen.has(value)) warnings.push(`${label} contains duplicate id: ${value}.`);
      seen.add(value);
    }
  };
  duplicateIds('warehouses','Warehouses');
  duplicateIds('partners','Partners');
  duplicateIds('items','Items');
  duplicateIds('batches','FIFO batches');
  duplicateIds('salesInvoices','Sales invoices');
  duplicateIds('purchaseBills','Purchase bills');
  duplicateIds('journalEntries','Journal entries');
  duplicateIds('stockTransfers','Stock transfers');

  const warehouseIds = new Set((b.warehouses ?? []).map((x:any) => String(x.id)));
  const partnerIds = new Set((b.partners ?? []).map((x:any) => String(x.id)));
  const itemIds = new Set((b.items ?? []).map((x:any) => String(x.id)));
  const accountCodes = new Set((b.accounts ?? []).map((x:any) => String(x.code)));
  const journalIds = new Set((b.journalEntries ?? []).map((x:any) => String(x.id)));
  for (const x of b.batches ?? []) {
    if (!itemIds.has(String(x.itemId)) || !warehouseIds.has(String(x.warehouseId))) warnings.push(`FIFO batch ${x.id} references missing item or warehouse.`);
    if (Number(x.originalQty) < 0 || Number(x.remainingQty) < 0 || Number(x.remainingQty) > Number(x.originalQty) || Number(x.unitCost) < 0) warnings.push(`FIFO batch ${x.id} has invalid quantity/cost.`);
  }
  for (const x of b.salesInvoices ?? []) {
    if (!partnerIds.has(String(x.customerId)) || !warehouseIds.has(String(x.warehouseId))) warnings.push(`Sales invoice ${x.invoiceNo} references missing customer or warehouse.`);
    if (x.journalEntryId && !journalIds.has(String(x.journalEntryId))) warnings.push(`Sales invoice ${x.invoiceNo} references journal ${x.journalEntryId} not included in this backup.`);
  }
  for (const x of b.purchaseBills ?? []) {
    if (!partnerIds.has(String(x.vendorId)) || !warehouseIds.has(String(x.warehouseId))) warnings.push(`Purchase bill ${x.billNo} references missing vendor or warehouse.`);
    if (x.journalEntryId && !journalIds.has(String(x.journalEntryId))) warnings.push(`Purchase bill ${x.billNo} references journal ${x.journalEntryId} not included in this backup.`);
  }
  for (const x of b.journalEntries ?? []) {
    const lines = Array.isArray(x.lines) ? x.lines : [];
    const debit = lines.reduce((n:number,l:any)=>n+Number(l.debit||0),0);
    const credit = lines.reduce((n:number,l:any)=>n+Number(l.credit||0),0);
    if (lines.length < 2 || Math.abs(debit-credit) > 0.01 || debit <= 0) warnings.push(`Journal ${x.entryNo} is not balanced.`);
    for (const l of lines) {
      if (!accountCodes.has(String(l.accountCode))) warnings.push(`Journal ${x.entryNo} references missing account ${l.accountCode}.`);
      if (l.partnerId && !partnerIds.has(String(l.partnerId))) warnings.push(`Journal ${x.entryNo} references missing partner ${l.partnerId}.`);
    }
  }
  for (const x of b.stockTransfers ?? []) {
    if (!warehouseIds.has(String(x.sourceWarehouseId)) || !warehouseIds.has(String(x.targetWarehouseId))) warnings.push(`Stock transfer ${x.transferNo} references missing warehouse.`);
    for (const l of x.items ?? []) if (!itemIds.has(String(l.itemId))) warnings.push(`Stock transfer ${x.transferNo} references missing item ${l.itemId}.`);
  }
  for (const x of b.stockMovements ?? []) {
    if (!itemIds.has(String(x.itemId)) || !warehouseIds.has(String(x.warehouseId))) warnings.push(`Stock movement ${x.referenceNo || x.referenceId} references missing item or warehouse.`);
  }

  const duplicate = (rows: any[], field: string, label: string) => {
    const seen = new Set<string>();
    for (const row of rows) {
      const value = String(row?.[field] ?? '');
      if (!value) continue;
      if (seen.has(value)) warnings.push(`${label} contains duplicate ${field}: ${value}.`);
      seen.add(value);
    }
  };
  duplicate(b.warehouses ?? [], 'code', 'Warehouses');
  duplicate(b.partners ?? [], 'code', 'Partners');
  duplicate(b.items ?? [], 'sku', 'Items');
  duplicate(b.salesInvoices ?? [], 'invoiceNo', 'Sales invoices');
  duplicate(b.purchaseBills ?? [], 'billNo', 'Purchase bills');
  duplicate(b.stockTransfers ?? [], 'transferNo', 'Stock transfers');

  if (mode === 'merge' && conflicts.length) warnings.push('Merge mode will skip records whose IDs already exist on the server.');
  if (mode === 'replace') warnings.push('Replace mode deletes server transactions, stock, masters, accounts, sequences, and settings before import.');
  const hasDuplicateWarning = warnings.some((warning) => /contains duplicate|missing id|not balanced/i.test(warning));
  const hasUniqueKeyConflict = conflicts.some((conflict) => /code value|sku value|invoiceNo value|billNo value|transferNo value|entryNo value|supplierBillNo value/i.test(conflict));
  return { canImport: !hasDuplicateWarning && !hasUniqueKeyConflict, mode, sourceCounts, serverCounts: status.counts, conflicts, warnings };
}


export async function exportServerBundle() {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin(sql.ISOLATION_LEVEL.REPEATABLE_READ);
  try {
    const one = async (sqlText: string) => (await new sql.Request(tx).query(sqlText)).recordset;
    const settingsRows = await one('SELECT TOP 1 companyName,tradeName,panNumber,businessNature,address,city,district,phone,email,vatRate,fiscalYear,irdApprovalNo,invoicePrefix,purchasePrefix,bankName,accountNumber,accountName,qrCodeText,termsAndConditions FROM dbo.CompanySettings WHERE id=1');
    const warehouses = await one('SELECT id,code,name,address,phone,isDefault FROM dbo.Warehouses ORDER BY code');
    const partners = await one('SELECT id,code,name,type,panNumber,email,phone,address,currentBalance,creditLimit,isVatApplicable FROM dbo.BusinessPartners ORDER BY code');
    const items = await one('SELECT id,sku,barcode,name,category,size,color,fabric,hsnCode,costPrice,sellingPrice,minStockAlert,isVatApplicable,description FROM dbo.Items ORDER BY sku');
    const accounts = await one('SELECT code,name,category,description,balance FROM dbo.Accounts ORDER BY code');
    const batches = await one('SELECT id,itemId,warehouseId,purchaseId,purchaseBillNo,purchaseDate,unitCost,originalQty,remainingQty FROM dbo.FifoBatches ORDER BY purchaseDate,id');
    const stockMovements = await one('SELECT movementType,referenceId,referenceNo,itemId,warehouseId,quantity,unitCost,movementDate FROM dbo.StockMovements ORDER BY id');
    const journalRows = await one('SELECT id,entryNo,fiscalYear,mitiDate,adDate,referenceType,referenceNo,narration,totalDebit,totalCredit,isBalanced FROM dbo.JournalEntries ORDER BY adDate,id');
    const journalLines = await one('SELECT journalEntryId,accountCode,accountName,debit,credit,partnerId,partnerName,description FROM dbo.JournalLines ORDER BY journalEntryId,id');
    const journals = journalRows.map((j:any) => ({...j, lines: journalLines.filter((l:any)=>l.journalEntryId===j.id).map(({journalEntryId,...l}:any)=>l)}));
    const salesRows = await one('SELECT id,transactionType,invoiceNo,refInvoiceNo,reason,fiscalYear,mitiDate,adDate,customerId,customerName,customerPan,customerAddress,warehouseId,warehouseName,paymentMode,subtotal,discountAmount,taxableAmount,nonTaxableAmount,vatAmount,grandTotal,totalCogs,journalEntryId,notes,syncWithIrd FROM dbo.SalesInvoices ORDER BY adDate,id');
    const salesLines = await one('SELECT invoiceId,itemId,sku,name,size,color,hsnCode,quantity,unitPrice,discountPercent,isVatApplicable,taxableAmount,vatAmount,lineTotal,cogsAmount FROM dbo.SalesInvoiceLines ORDER BY invoiceId,id');
    const salesInvoices = salesRows.map((x:any)=>({...x,items:salesLines.filter((l:any)=>l.invoiceId===x.id).map(({invoiceId,...l}:any)=>l)}));
    const purchaseRows = await one('SELECT id,transactionType,billNo,supplierBillNo,refBillNo,reason,fiscalYear,mitiDate,adDate,vendorId,vendorName,vendorPan,warehouseId,warehouseName,paymentMode,subtotal,taxableAmount,nonTaxableAmount,vatAmount,grandTotal,journalEntryId,notes,isVatBill,isCapitalizedVat FROM dbo.PurchaseBills ORDER BY adDate,id');
    const purchaseLines = await one('SELECT billId,itemId,sku,name,size,color,hsnCode,quantity,unitCost,isVatApplicable,taxableAmount,vatAmount,lineTotal FROM dbo.PurchaseBillLines ORDER BY billId,id');
    const purchaseBills = purchaseRows.map((x:any)=>({...x,items:purchaseLines.filter((l:any)=>l.billId===x.id).map(({billId,...l}:any)=>l)}));
    const transferRows = await one('SELECT id,transferNo,fiscalYear,mitiDate,adDate,sourceWarehouseId,sourceWarehouseName,targetWarehouseId,targetWarehouseName,totalValue,remarks FROM dbo.StockTransfers ORDER BY adDate,id');
    const transferLines = await one('SELECT transferId,itemId,sku,name,quantity,unitCost FROM dbo.StockTransferLines ORDER BY transferId,id');
    const stockTransfers = transferRows.map((x:any)=>({...x,items:transferLines.filter((l:any)=>l.transferId===x.id).map(({transferId,...l}:any)=>l)}));
    await tx.commit();
    return { format:'AGS-NEPAL-IRD-ERP', version:3, exportDate:new Date().toISOString(), fiscalYear:settingsRows[0]?.fiscalYear??'', company:settingsRows[0]??null, warehouses, partners, items, batches, salesInvoices, purchaseBills, accounts, journalEntries:journals, stockTransfers, stockMovements, source:'sql-server' };
  } catch (e) { try { await tx.rollback(); } catch {} throw e; }
}
