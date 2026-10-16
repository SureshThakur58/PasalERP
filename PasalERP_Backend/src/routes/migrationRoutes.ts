import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { HttpError } from '../middleware/errorHandler.js';
import { getPool } from '../config/db.js';
import sql from 'mssql';
import { migrationStatus, previewMigration, exportServerBundle } from '../services/migrationService.js';

const router = Router();

async function exists(tx: sql.Transaction, table: string, field: string, value: string) {
  const r = new sql.Request(tx);
  r.input('value', value);
  const result = await r.query(`SELECT TOP 1 1 AS found FROM dbo.${table} WHERE ${field}=@value`);
  return result.recordset.length > 0;
}

async function insertSettings(tx: sql.Transaction, s: any) {
  const r = new sql.Request(tx);
  const businessNature = s.businessNature === 'PAN' ? 'PAN' : 'VAT';
  r.input('companyName', s.companyName ?? '').input('tradeName', s.tradeName ?? '').input('panNumber', s.panNumber ?? '')
    .input('businessNature', businessNature).input('address', s.address ?? '').input('city', s.city ?? '').input('district', s.district ?? '')
    .input('phone', s.phone ?? '').input('email', s.email ?? '').input('vatRate', Number(s.vatRate ?? 13)).input('fiscalYear', s.fiscalYear ?? '')
    .input('irdApprovalNo', s.irdApprovalNo ?? '').input('invoicePrefix', s.invoicePrefix ?? '').input('purchasePrefix', s.purchasePrefix ?? '')
    .input('bankName', s.bankName ?? null).input('accountNumber', s.accountNumber ?? null).input('accountName', s.accountName ?? null)
    .input('qrCodeText', s.qrCodeText ?? null).input('termsAndConditions', s.termsAndConditions ?? null);
  await r.query(`MERGE dbo.CompanySettings AS t USING (SELECT CAST(1 AS tinyint) id) AS s ON t.id=s.id
    WHEN MATCHED THEN UPDATE SET companyName=@companyName,tradeName=@tradeName,panNumber=@panNumber,businessNature=@businessNature,address=@address,city=@city,district=@district,phone=@phone,email=@email,vatRate=@vatRate,fiscalYear=@fiscalYear,irdApprovalNo=@irdApprovalNo,invoicePrefix=@invoicePrefix,purchasePrefix=@purchasePrefix,bankName=@bankName,accountNumber=@accountNumber,accountName=@accountName,qrCodeText=@qrCodeText,termsAndConditions=@termsAndConditions,updatedAt=SYSUTCDATETIME()
    WHEN NOT MATCHED THEN INSERT(id,companyName,tradeName,panNumber,businessNature,address,city,district,phone,email,vatRate,fiscalYear,irdApprovalNo,invoicePrefix,purchasePrefix,bankName,accountNumber,accountName,qrCodeText,termsAndConditions)
    VALUES(1,@companyName,@tradeName,@panNumber,@businessNature,@address,@city,@district,@phone,@email,@vatRate,@fiscalYear,@irdApprovalNo,@invoicePrefix,@purchasePrefix,@bankName,@accountNumber,@accountName,@qrCodeText,@termsAndConditions);`);
}

async function ensureSequenceFloors(tx: sql.Transaction) {
  const sequenceRows: Array<{ fiscalYear:string; documentType:string; number:number }> = [];
  const add = async (query:string, documentType:string) => {
    const rows = (await new sql.Request(tx).query(query)).recordset;
    for (const row of rows) {
      const match = String(row.documentNo ?? '').match(/(\d+)$/);
      if (match) sequenceRows.push({ fiscalYear:String(row.fiscalYear), documentType, number:Number(match[1]) });
    }
  };
  await add('SELECT fiscalYear,entryNo AS documentNo FROM dbo.JournalEntries','journal');
  await add("SELECT fiscalYear,invoiceNo AS documentNo,transactionType FROM dbo.SalesInvoices WHERE transactionType='tax_invoice'",'sales_tax_invoice');
  await add("SELECT fiscalYear,invoiceNo AS documentNo,transactionType FROM dbo.SalesInvoices WHERE transactionType='sales_return'",'sales_sales_return');
  await add("SELECT fiscalYear,invoiceNo AS documentNo,transactionType FROM dbo.SalesInvoices WHERE transactionType='debit_note'",'sales_debit_note');
  await add("SELECT fiscalYear,invoiceNo AS documentNo,transactionType FROM dbo.SalesInvoices WHERE transactionType='credit_note'",'sales_credit_note');
  await add("SELECT fiscalYear,billNo AS documentNo FROM dbo.PurchaseBills WHERE transactionType='purchase_invoice'",'purchase_purchase_invoice');
  await add("SELECT fiscalYear,billNo AS documentNo FROM dbo.PurchaseBills WHERE transactionType='purchase_return'",'purchase_purchase_return');
  await add("SELECT fiscalYear,billNo AS documentNo FROM dbo.PurchaseBills WHERE transactionType='debit_note'",'purchase_debit_note');
  await add("SELECT fiscalYear,billNo AS documentNo FROM dbo.PurchaseBills WHERE transactionType='credit_note'",'purchase_credit_note');
  await add('SELECT fiscalYear,transferNo AS documentNo FROM dbo.StockTransfers','stock_transfer');
  const floors = new Map<string,number>();
  for (const x of sequenceRows) { const key=`${x.fiscalYear}\0${x.documentType}`; floors.set(key,Math.max(floors.get(key)??1,x.number+1)); }
  for (const [key,nextNumber] of floors) { const [fiscalYear,documentType]=key.split('\0'); const r=new sql.Request(tx); r.input('fiscalYear',fiscalYear).input('documentType',documentType).input('nextNumber',nextNumber); await r.query(`MERGE dbo.DocumentSequences AS t USING (SELECT @fiscalYear AS fiscalYear,@documentType AS documentType) AS s ON t.fiscalYear=s.fiscalYear AND t.documentType=s.documentType WHEN MATCHED AND t.nextNumber < @nextNumber THEN UPDATE SET nextNumber=@nextNumber WHEN NOT MATCHED THEN INSERT(fiscalYear,documentType,nextNumber) VALUES(@fiscalYear,@documentType,@nextNumber);`); }
}

export async function importBundle(bundle: any, mode: 'merge' | 'replace') {
  const b = bundle?.bundle ?? bundle;
  const pool = await getPool();
  const serializedSize = Buffer.byteLength(JSON.stringify(bundle ?? {}), 'utf8');
  if (serializedSize > 20 * 1024 * 1024) throw new HttpError(413, 'Migration bundle exceeds the 20 MB safety limit.');
  const tx = new sql.Transaction(pool);
  await tx.begin();
  const imported: Record<string, number> = {};
  const skipped: Record<string, number> = {};
  const inc = (map: Record<string, number>, key: string) => { map[key] = (map[key] ?? 0) + 1; };
  try {
    await new sql.Request(tx).query("DECLARE @result int; EXEC @result = sp_getapplock @Resource='AGS:ERP:MIGRATION', @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=15000; IF @result < 0 THROW 51000, 'Another migration is already running. Try again later.', 1;");
    if (mode === 'replace') {
      await new sql.Request(tx).query(`DELETE FROM dbo.StockTransferLines; DELETE FROM dbo.StockTransfers; DELETE FROM dbo.StockMovements; DELETE FROM dbo.SalesInvoiceLines; DELETE FROM dbo.PurchaseBillLines; DELETE FROM dbo.JournalLines; DELETE FROM dbo.SalesInvoices; DELETE FROM dbo.PurchaseBills; DELETE FROM dbo.JournalEntries; DELETE FROM dbo.FifoBatches; DELETE FROM dbo.BusinessPartners; DELETE FROM dbo.Items; DELETE FROM dbo.Warehouses; DELETE FROM dbo.Accounts; DELETE FROM dbo.DocumentSequences; DELETE FROM dbo.CompanySettings;`);
    }
    if (b.settings || b.company) { await insertSettings(tx, b.settings || b.company); inc(imported, 'settings'); }

    for (const w of b.warehouses ?? []) {
      if (mode === 'merge' && await exists(tx, 'Warehouses', 'id', w.id)) { inc(skipped, 'warehouses'); continue; }
      const r = new sql.Request(tx); r.input('id',w.id).input('code',w.code).input('name',w.name).input('address',w.address||'').input('phone',w.phone||'').input('isDefault',w.isDefault?1:0);
      if (w.isDefault) await new sql.Request(tx).query('UPDATE dbo.Warehouses SET isDefault=0');
      await r.query('INSERT INTO dbo.Warehouses(id,code,name,address,phone,isDefault) VALUES(@id,@code,@name,@address,@phone,@isDefault)'); inc(imported,'warehouses');
    }
    for (const a of b.accounts ?? []) {
      if (mode === 'merge' && await exists(tx, 'Accounts', 'code', a.code)) { inc(skipped,'accounts'); continue; }
      const r = new sql.Request(tx); r.input('code',a.code).input('name',a.name).input('category',a.category).input('description',a.description||'').input('balance',Number(a.balance||0));
      await r.query('INSERT INTO dbo.Accounts(code,name,category,description,balance) VALUES(@code,@name,@category,@description,@balance)'); inc(imported,'accounts');
    }
    for (const p of b.partners ?? []) {
      if (mode === 'merge' && await exists(tx, 'BusinessPartners', 'id', p.id)) { inc(skipped,'partners'); continue; }
      const r = new sql.Request(tx); Object.entries({id:p.id,code:p.code,name:p.name,type:p.type,panNumber:p.panNumber,email:p.email||'',phone:p.phone||'',address:p.address||'',currentBalance:Number(p.currentBalance||0),creditLimit:p.creditLimit??null,isVatApplicable:p.isVatApplicable===false?0:1}).forEach(([k,v])=>r.input(k,v as any));
      await r.query('INSERT INTO dbo.BusinessPartners(id,code,name,type,panNumber,email,phone,address,currentBalance,creditLimit,isVatApplicable) VALUES(@id,@code,@name,@type,@panNumber,@email,@phone,@address,@currentBalance,@creditLimit,@isVatApplicable)'); inc(imported,'partners');
    }
    for (const i of b.items ?? []) {
      if (mode === 'merge' && await exists(tx, 'Items', 'id', i.id)) { inc(skipped,'items'); continue; }
      const r = new sql.Request(tx); Object.entries({id:i.id,sku:i.sku,barcode:i.barcode||'',name:i.name,category:i.category,size:i.size,color:i.color||'Standard',fabric:i.fabric||'Cotton',hsnCode:i.hsnCode||'6205.20.00',costPrice:Number(i.costPrice||0),sellingPrice:Number(i.sellingPrice||0),minStockAlert:Number(i.minStockAlert||0),isVatApplicable:i.isVatApplicable?1:0,description:i.description??null}).forEach(([k,v])=>r.input(k,v as any));
      await r.query('INSERT INTO dbo.Items(id,sku,barcode,name,category,size,color,fabric,hsnCode,costPrice,sellingPrice,minStockAlert,isVatApplicable,description) VALUES(@id,@sku,@barcode,@name,@category,@size,@color,@fabric,@hsnCode,@costPrice,@sellingPrice,@minStockAlert,@isVatApplicable,@description)'); inc(imported,'items');
    }
    for (const j of b.journalEntries ?? []) {
      if (mode === 'merge' && await exists(tx,'JournalEntries','id',j.id)) { inc(skipped,'journalEntries'); continue; }
      const r=new sql.Request(tx); Object.entries(j).filter(([k])=>k!=='lines').forEach(([k,v])=>r.input(k,v as any));
      await r.query('INSERT INTO dbo.JournalEntries(id,entryNo,fiscalYear,mitiDate,adDate,referenceType,referenceNo,narration,totalDebit,totalCredit,isBalanced) VALUES(@id,@entryNo,@fiscalYear,@mitiDate,@adDate,@referenceType,@referenceNo,@narration,@totalDebit,@totalCredit,@isBalanced)');
      for(const l of j.lines??[]){const lr=new sql.Request(tx);lr.input('journalEntryId',j.id);Object.entries(l).forEach(([k,v])=>lr.input(k,v as any));await lr.query('INSERT INTO dbo.JournalLines(journalEntryId,accountCode,accountName,debit,credit,partnerId,partnerName,description) VALUES(@journalEntryId,@accountCode,@accountName,@debit,@credit,@partnerId,@partnerName,@description)'); const ar=new sql.Request(tx); ar.input('code',l.accountCode).input('debit',Number(l.debit||0)).input('credit',Number(l.credit||0)); await ar.query("UPDATE dbo.Accounts SET balance=balance + CASE WHEN category IN ('asset','expense') THEN @debit-@credit ELSE @credit-@debit END WHERE code=@code");}
      inc(imported,'journalEntries');
    }
    for (const p of b.purchaseBills ?? []) {
      if (mode === 'merge' && await exists(tx,'PurchaseBills','id',p.id)) { inc(skipped,'purchaseBills'); continue; }
      const r=new sql.Request(tx); Object.entries(p).filter(([k])=>k!=='items').forEach(([k,v])=>r.input(k,v as any));
      await r.query('INSERT INTO dbo.PurchaseBills(id,transactionType,billNo,supplierBillNo,refBillNo,reason,fiscalYear,mitiDate,adDate,vendorId,vendorName,vendorPan,warehouseId,warehouseName,paymentMode,subtotal,taxableAmount,nonTaxableAmount,vatAmount,grandTotal,journalEntryId,notes,isVatBill,isCapitalizedVat) VALUES(@id,@transactionType,@billNo,@supplierBillNo,@refBillNo,@reason,@fiscalYear,@mitiDate,@adDate,@vendorId,@vendorName,@vendorPan,@warehouseId,@warehouseName,@paymentMode,@subtotal,@taxableAmount,@nonTaxableAmount,@vatAmount,@grandTotal,@journalEntryId,@notes,@isVatBill,@isCapitalizedVat)');
      for(const l of p.items??[]){const lr=new sql.Request(tx);lr.input('billId',p.id);Object.entries(l).forEach(([k,v])=>lr.input(k,v as any));await lr.query('INSERT INTO dbo.PurchaseBillLines(billId,itemId,sku,name,size,color,hsnCode,quantity,unitCost,isVatApplicable,taxableAmount,vatAmount,lineTotal) VALUES(@billId,@itemId,@sku,@name,@size,@color,@hsnCode,@quantity,@unitCost,@isVatApplicable,@taxableAmount,@vatAmount,@lineTotal)');}
      inc(imported,'purchaseBills');
    }
    for (const s of b.salesInvoices ?? []) {
      if (mode === 'merge' && await exists(tx,'SalesInvoices','id',s.id)) { inc(skipped,'salesInvoices'); continue; }
      const r=new sql.Request(tx); Object.entries(s).filter(([k])=>k!=='items').forEach(([k,v])=>r.input(k,v as any));
      await r.query('INSERT INTO dbo.SalesInvoices(id,transactionType,invoiceNo,refInvoiceNo,reason,fiscalYear,mitiDate,adDate,customerId,customerName,customerPan,customerAddress,warehouseId,warehouseName,paymentMode,subtotal,discountAmount,taxableAmount,nonTaxableAmount,vatAmount,grandTotal,totalCogs,journalEntryId,notes,syncWithIrd) VALUES(@id,@transactionType,@invoiceNo,@refInvoiceNo,@reason,@fiscalYear,@mitiDate,@adDate,@customerId,@customerName,@customerPan,@customerAddress,@warehouseId,@warehouseName,@paymentMode,@subtotal,@discountAmount,@taxableAmount,@nonTaxableAmount,@vatAmount,@grandTotal,@totalCogs,@journalEntryId,@notes,@syncWithIrd)');
      for(const l of s.items??[]){const lr=new sql.Request(tx);lr.input('invoiceId',s.id);Object.entries(l).forEach(([k,v])=>lr.input(k,v as any));await lr.query('INSERT INTO dbo.SalesInvoiceLines(invoiceId,itemId,sku,name,size,color,hsnCode,quantity,unitPrice,discountPercent,isVatApplicable,taxableAmount,vatAmount,lineTotal,cogsAmount) VALUES(@invoiceId,@itemId,@sku,@name,@size,@color,@hsnCode,@quantity,@unitPrice,@discountPercent,@isVatApplicable,@taxableAmount,@vatAmount,@lineTotal,@cogsAmount)');}
      inc(imported,'salesInvoices');
    }
    for (const batch of b.batches ?? []) {
      if (mode === 'merge' && await exists(tx,'FifoBatches','id',batch.id)) { inc(skipped,'batches'); continue; }
      const r=new sql.Request(tx); Object.entries(batch).forEach(([k,v])=>r.input(k,v as any));
      await r.query('INSERT INTO dbo.FifoBatches(id,itemId,warehouseId,purchaseId,purchaseBillNo,purchaseDate,unitCost,originalQty,remainingQty) VALUES(@id,@itemId,@warehouseId,@purchaseId,@purchaseBillNo,@purchaseDate,@unitCost,@originalQty,@remainingQty)'); inc(imported,'batches');
    }
    for (const t of b.stockTransfers ?? []) {
      if (mode === 'merge' && await exists(tx,'StockTransfers','id',t.id)) { inc(skipped,'stockTransfers'); continue; }
      const r=new sql.Request(tx); Object.entries(t).filter(([k])=>k!=='items').forEach(([k,v])=>r.input(k,v as any));
      await r.query('INSERT INTO dbo.StockTransfers(id,transferNo,fiscalYear,mitiDate,adDate,sourceWarehouseId,sourceWarehouseName,targetWarehouseId,targetWarehouseName,totalValue,remarks) VALUES(@id,@transferNo,@fiscalYear,@mitiDate,@adDate,@sourceWarehouseId,@sourceWarehouseName,@targetWarehouseId,@targetWarehouseName,@totalValue,@remarks)');
      for(const l of t.items??[]){const lr=new sql.Request(tx);lr.input('transferId',t.id);Object.entries(l).forEach(([k,v])=>lr.input(k,v as any));await lr.query('INSERT INTO dbo.StockTransferLines(transferId,itemId,sku,name,quantity,unitCost) VALUES(@transferId,@itemId,@sku,@name,@quantity,@unitCost)');}
      inc(imported,'stockTransfers');
    }
    for (const m of b.stockMovements ?? []) {
      if (mode === 'merge') {
        const chk = new sql.Request(tx);
        chk.input('referenceId',m.referenceId).input('movementType',m.movementType).input('itemId',m.itemId).input('warehouseId',m.warehouseId).input('quantity',Number(m.quantity||0)).input('unitCost',Number(m.unitCost||0)).input('movementDate',m.movementDate);
        const existsMovement = await chk.query('SELECT TOP 1 1 AS found FROM dbo.StockMovements WHERE referenceId=@referenceId AND movementType=@movementType AND itemId=@itemId AND warehouseId=@warehouseId AND quantity=@quantity AND unitCost=@unitCost AND movementDate=@movementDate');
        if (existsMovement.recordset.length) { inc(skipped,'stockMovements'); continue; }
      }
      const r = new sql.Request(tx);
      r.input('movementType',m.movementType).input('referenceId',m.referenceId).input('referenceNo',m.referenceNo).input('itemId',m.itemId).input('warehouseId',m.warehouseId).input('quantity',Number(m.quantity||0)).input('unitCost',Number(m.unitCost||0)).input('movementDate',m.movementDate);
      await r.query('INSERT INTO dbo.StockMovements(movementType,referenceId,referenceNo,itemId,warehouseId,quantity,unitCost,movementDate) VALUES(@movementType,@referenceId,@referenceNo,@itemId,@warehouseId,@quantity,@unitCost,@movementDate)');
      inc(imported,'stockMovements');
    }
    await ensureSequenceFloors(tx);
    await tx.commit();
    return { imported, skipped };
  } catch (e) { await tx.rollback(); throw e; }
}

router.get('/status', asyncHandler(async (_req,res) => {
  res.json({ success:true, data: await migrationStatus() });
}));

router.get('/export', asyncHandler(async (_req,res) => {
  const bundle = await exportServerBundle();
  const size = Buffer.byteLength(JSON.stringify(bundle), 'utf8');
  if (size > 20 * 1024 * 1024) throw new HttpError(413, 'Server backup exceeds the 20 MB safety limit.');
  res.json({ success:true, data: bundle });
}));

router.post('/validate', asyncHandler(async (req,res) => {
  const bundle = req.body?.bundle ?? req.body;
  const preview = await previewMigration(bundle, 'merge');
  res.json({ success:true, data:{valid:preview.canImport, errors:preview.canImport?[]:preview.conflicts, warnings:preview.warnings, sourceCounts:preview.sourceCounts} });
}));

router.post('/preview', asyncHandler(async (req,res) => {
  const mode = req.body?.mode === 'replace' ? 'replace' : 'merge';
  const bundle = req.body?.bundle ?? req.body;
  const data = await previewMigration(bundle, mode);
  res.json({ success:true, data });
}));

router.post('/import-localstorage', asyncHandler(async(req,res)=>{
  const mode: 'merge'|'replace' = req.body?.mode === 'replace' ? 'replace' : 'merge';
  const bundle = req.body?.bundle ?? req.body;
  if (mode === 'replace' && req.body?.confirmReset !== true) throw new HttpError(400,'Replace migration requires confirmReset=true.');
  const preview = await previewMigration(bundle, mode);
  if (!preview.canImport) throw new HttpError(400,'Migration bundle failed validation.');
  const result = await importBundle(bundle, mode);
  res.status(201).json({success:true,message:`Migration completed in ${mode} mode.`,data:result});
}));
export default router;
