import sql from 'mssql';
import { getPool } from '../config/db.js';
import { HttpError } from '../middleware/errorHandler.js';
import { id } from '../utils/ids.js';
import { round2 } from '../utils/money.js';
import { depleteFifoRows, type BatchRow } from '../utils/fifo.js';
import { assertBalanced, buildPurchaseJournal, buildSalesJournal } from '../utils/accounting.js';
import { nextDocumentNumber, nextJournalNumber } from './sequenceService.js';
import type { CreatePurchaseInput, CreateSaleInput, CreateTransferInput, CreateJournalInput } from '../types/api.js';
import type { PurchaseBill, SalesInvoice, JournalEntry } from '../types.js';
import { getAccountDetermination } from './accountDeterminationService.js';

const vatRateFromSettings = async (tx: sql.Transaction) => {
  const r = await new sql.Request(tx).query(`
    SELECT TOP 1
      vatRate,
      businessNature,
      invoicePrefix,
      purchasePrefix
    FROM dbo.CompanySettings
    WHERE id = 1
  `);

  if (!r.recordset[0]) {
    throw new HttpError(
      400,
      'Company settings have not been configured'
    );
  }

  return r.recordset[0];
};

async function getItem(tx:sql.Transaction,itemId:string){ const r=new sql.Request(tx); r.input('id',itemId); const x=await r.query('SELECT * FROM dbo.Items WITH (UPDLOCK,HOLDLOCK) WHERE id=@id'); if(!x.recordset[0]) throw new HttpError(404,`Item ${itemId} not found`); return x.recordset[0]; }
async function getPartner(tx:sql.Transaction,idv:string){ const r=new sql.Request(tx); r.input('id',idv); const x=await r.query('SELECT * FROM dbo.BusinessPartners WITH (UPDLOCK,HOLDLOCK) WHERE id=@id'); if(!x.recordset[0]) throw new HttpError(404,'Business partner not found'); return x.recordset[0]; }
async function getWarehouse(tx:sql.Transaction,idv:string){ const r=new sql.Request(tx); r.input('id',idv); const x=await r.query('SELECT * FROM dbo.Warehouses WHERE id=@id'); if(!x.recordset[0]) throw new HttpError(404,'Warehouse not found'); return x.recordset[0]; }

async function loadBatches(tx:sql.Transaction,itemId:string,warehouseId:string):Promise<BatchRow[]> { const r=new sql.Request(tx); r.input('itemId',itemId).input('warehouseId',warehouseId); return (await r.query(`SELECT id,itemId,warehouseId,purchaseId,purchaseBillNo,purchaseDate,unitCost,originalQty,remainingQty FROM dbo.FifoBatches WITH (UPDLOCK,ROWLOCK) WHERE itemId=@itemId AND warehouseId=@warehouseId AND remainingQty>0 ORDER BY purchaseDate,id`)).recordset; }

async function applyDepletion(tx:sql.Transaction, details:any[], dateBs:string, refId:string, refNo:string, movementType:string) {
  for(const d of details){ const r=new sql.Request(tx); r.input('id',d.batchId).input('qty',d.qtyTaken); await r.query('UPDATE dbo.FifoBatches SET remainingQty=remainingQty-@qty WHERE id=@id AND remainingQty>=@qty');
    const m=new sql.Request(tx); m.input('movementType',movementType).input('referenceId',refId).input('referenceNo',refNo).input('itemId',d.itemId ?? '').input('warehouseId',d.warehouseId ?? '').input('quantity',-d.qtyTaken).input('unitCost',d.unitCost).input('movementDate',dateBs);
    // item/warehouse are supplied on details by caller; movement insertion is done there when absent.
  }
}

async function insertJournal(tx:sql.Transaction, fiscalYear:string, mitiDate:string, adDate:string, referenceType:string, referenceNo:string, narration:string, lines:any[]):Promise<JournalEntry> {
  if (!referenceNo?.trim()) {
    throw new HttpError(400, 'Journal reference number is required');
  }

  if (!narration?.trim()) {
    throw new HttpError(400, 'Journal narration is required');
  }

  const totals = assertBalanced(lines);

  if (!totals.isBalanced) {
    throw new HttpError(
      400,
      `Generated journal is not balanced: Dr ${totals.totalDebit} / Cr ${totals.totalCredit}`
    );
  }
 
  for (const line of lines) {
    const accountRequest = new sql.Request(tx);

    accountRequest.input('code', String(line.accountCode).trim());

    const accountResult = await accountRequest.query(`
      SELECT code, name
      FROM dbo.Accounts
      WHERE code = @code
    `);

    if (!accountResult.recordset[0]) {
      throw new HttpError(
        400,
        `Account ${line.accountCode} does not exist in the Chart of Accounts`
      );
    }
  }

 // const totals=assertBalanced(lines); if(!totals.isBalanced) throw new HttpError(400,`Generated journal is not balanced: Dr ${totals.totalDebit} / Cr ${totals.totalCredit}`);
  const journalId=id('jv'); const entryNo=await nextJournalNumber(tx,fiscalYear);
  const r=new sql.Request(tx); r.input('id',journalId).input('entryNo',entryNo).input('fiscalYear',fiscalYear).input('mitiDate',mitiDate).input('adDate',adDate).input('referenceType',referenceType).input('referenceNo',referenceNo).input('narration',narration).input('totalDebit',totals.totalDebit).input('totalCredit',totals.totalCredit).input('isBalanced',1);
  await r.query('INSERT INTO dbo.JournalEntries(id,entryNo,fiscalYear,mitiDate,adDate,referenceType,referenceNo,narration,totalDebit,totalCredit,isBalanced) VALUES(@id,@entryNo,@fiscalYear,@mitiDate,@adDate,@referenceType,@referenceNo,@narration,@totalDebit,@totalCredit,@isBalanced)');
  for(const l of lines){ const lr=new sql.Request(tx); lr.input('journalEntryId',journalId).input('accountCode',l.accountCode).input('accountName',l.accountName).input('debit',l.debit).input('credit',l.credit).input('partnerId',l.partnerId??null).input('partnerName',l.partnerName??null).input('description',l.description??null); await lr.query('INSERT INTO dbo.JournalLines(journalEntryId,accountCode,accountName,debit,credit,partnerId,partnerName,description) VALUES(@journalEntryId,@accountCode,@accountName,@debit,@credit,@partnerId,@partnerName,@description)');
    const ar=new sql.Request(tx); ar.input('code',l.accountCode).input('debit',l.debit).input('credit',l.credit); const a=await ar.query(`UPDATE dbo.Accounts SET balance=balance + CASE WHEN category IN ('asset','expense') THEN @debit-@credit ELSE @credit-@debit END WHERE code=@code`); if(!a.rowsAffected[0]) throw new HttpError(400,`Account ${l.accountCode} does not exist`);
  }
  return {id:journalId,entryNo,fiscalYear,mitiDate,adDate,referenceType:referenceType as any,referenceNo,narration,lines,totalDebit:totals.totalDebit,totalCredit:totals.totalCredit,isBalanced:true};
}


export async function createManualJournal(input: CreateJournalInput): Promise<JournalEntry> {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    if (!/^\d{4}\/\d{2}$/.test(input.fiscalYear)) throw new HttpError(400, 'Fiscal year must use YYYY/YY format');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.mitiDate)) throw new HttpError(400, 'Miti date must use YYYY-MM-DD format');
    if (!input.adDate || Number.isNaN(Date.parse(input.adDate))) throw new HttpError(400, 'A valid AD date is required');
    if (!input.referenceNo?.trim()) throw new HttpError(400, 'Reference number is required');
    if (!input.narration?.trim()) throw new HttpError(400, 'Narration is required');
    if (!Array.isArray(input.lines) || input.lines.length < 2) throw new HttpError(400, 'A journal voucher must contain at least two lines');

    const cleanLines: any[] = [];
    for (const line of input.lines) {
      const debit = round2(Number(line.debit));
      const credit = round2(Number(line.credit));
      if (!line.accountCode?.trim()) throw new HttpError(400, 'Every journal line requires an account code');
      if (!Number.isFinite(debit) || !Number.isFinite(credit) || debit < 0 || credit < 0) throw new HttpError(400, `Invalid debit/credit for account ${line.accountCode}`);
      if (debit > 0 && credit > 0) throw new HttpError(400, `Account ${line.accountCode} cannot have both debit and credit`);
      if (debit === 0 && credit === 0) throw new HttpError(400, `Account ${line.accountCode} must have a debit or credit amount`);
      if (line.partnerId) {
        const pr = new sql.Request(tx);
        pr.input('id', line.partnerId);
        const partner = await pr.query('SELECT id,name FROM dbo.BusinessPartners WHERE id=@id');
        if (!partner.recordset[0]) throw new HttpError(400, `Partner ${line.partnerId} does not exist`);
      }
      const ar = new sql.Request(tx);
      ar.input('code', line.accountCode.trim());
      const account = await ar.query('SELECT code,name FROM dbo.Accounts WITH (UPDLOCK,HOLDLOCK) WHERE code=@code');
      if (!account.recordset[0]) throw new HttpError(400, `Account ${line.accountCode} does not exist`);
      const accountName = String(line.accountName || account.recordset[0].name);
      cleanLines.push({ accountCode: line.accountCode.trim(), accountName, debit, credit, partnerId: line.partnerId ?? null, partnerName: line.partnerName ?? null, description: line.description?.trim() || null });
    }
    const totals = assertBalanced(cleanLines);
    if (!totals.isBalanced || totals.totalDebit <= 0) throw new HttpError(400, `Journal is unbalanced. Dr ${totals.totalDebit.toFixed(2)} ≠ Cr ${totals.totalCredit.toFixed(2)}`);
    const journal = await insertJournal(tx, input.fiscalYear, input.mitiDate, input.adDate, 'Opening Balance', input.referenceNo.trim(), input.narration.trim(), cleanLines);
    await tx.commit();
    return journal;
  } catch (e) {
    try { await tx.rollback(); } catch { /* transaction may already be closed */ }
    throw e;
  }
}

export async function createSale(input:CreateSaleInput){
  const pool=await getPool(); const tx=new sql.Transaction(pool); await tx.begin();
  try {
    const settings=await vatRateFromSettings(tx); 
    const customer=await getPartner(tx,input.customerId); 
    const warehouse=await getWarehouse(tx,input.warehouseId);
    if(!['customer','both'].includes(customer.type)) throw new HttpError(400,'Selected partner is not a customer');
    if(!input.lines?.length) throw new HttpError(400,'At least one sales line is required');
    const txType=input.transactionType??'tax_invoice';
    if(txType!=='tax_invoice' && !input.refInvoiceNo) throw new HttpError(400,'Reference invoice is required for return/debit/credit note');
    const businessNature=String(settings.businessNature||'VAT')==='PAN'?'PAN':'VAT';
    const vatRate=Number(settings.vatRate||13)/100;
    const accountMap = await getAccountDetermination(tx);
    const fiscalYear=input.fiscalYear; 
    const prefix=txType==='tax_invoice' ? String(settings.invoicePrefix||'INV-') : txType==='sales_return' ? 'SR-' : txType==='debit_note' ? 'DN-' : 'CN-';
    const docType=`sales_${txType}`; 
    const invoiceNo=await nextDocumentNumber(tx,fiscalYear,docType,prefix);
    const invoiceId=id('sal');
    let originalInvoice:any=null;
    if(txType!=='tax_invoice'){
      const rr=new sql.Request(tx); rr.input('refInvoiceNo',input.refInvoiceNo!.trim());
      const found=await rr.query(`SELECT TOP 1 * FROM dbo.SalesInvoices WITH (UPDLOCK,HOLDLOCK) WHERE invoiceNo=@refInvoiceNo AND transactionType='tax_invoice'`);
      if(!found.recordset[0]) throw new HttpError(404,`Original tax invoice ${input.refInvoiceNo!.trim()} was not found.`);
      originalInvoice=found.recordset[0];
      if(originalInvoice.customerId!==customer.id) throw new HttpError(400,'Referenced invoice belongs to a different customer');
      if(txType==='sales_return' && originalInvoice.warehouseId!==warehouse.id) throw new HttpError(400,'Sales return must use the original invoice warehouse');
    }
    const finalLines:any[]=[]; 
    let subtotal=0,discountAmount=0,taxableAmount=0,nonTaxableAmount=0,vatAmount=0,totalCogs=0;
    const seenItemIds=new Set<string>();
    for(const line of input.lines){
      if(seenItemIds.has(line.itemId)) throw new HttpError(400,`Duplicate item line ${line.itemId} is not allowed`);
      seenItemIds.add(line.itemId);
      const item=await getItem(tx,line.itemId); 
      const qty=Number(line.quantity); 
      const unitPrice=Number(line.unitPrice); 
      const discountPercent=Number(line.discountPercent??0);
      if(qty<=0||unitPrice<0||discountPercent<0||discountPercent>100) throw new HttpError(400,`Invalid sales line for ${item.name}`);
      const gross=qty*unitPrice; 
      const discount=gross*discountPercent/100; 
      const net=round2(gross-discount);
      const isVatApplicable = businessNature === 'VAT';

      const vat = isVatApplicable ? round2(net * vatRate) : 0;

      const lineTaxable = isVatApplicable ? net : 0;

      const lineNonTaxable = isVatApplicable ? 0 : net;

      const lineTotal = round2(net + vat);
      subtotal+=gross; discountAmount+=discount; taxableAmount+=lineTaxable; nonTaxableAmount+=lineNonTaxable; vatAmount+=vat;
      let cogs=0;
      if(txType==='tax_invoice'){
        const batches=await loadBatches(tx,item.id,input.warehouseId); 
        const res=depleteFifoRows(batches,item.id,input.warehouseId,qty);
        if(!res.success) throw new HttpError(409,`Insufficient stock for ${item.name}. Available ${res.availableQty}, required ${qty}`);
        cogs=res.totalCogs; totalCogs+=cogs;
        for(const d of res.details){ const r=new sql.Request(tx); r.input('id',d.batchId).input('qty',d.qtyTaken); await r.query('UPDATE dbo.FifoBatches SET remainingQty=remainingQty-@qty WHERE id=@id AND remainingQty>=@qty');
          const m=new sql.Request(tx); m.input('movementType','SALE').input('referenceId',invoiceId).input('referenceNo',invoiceNo).input('itemId',item.id).input('warehouseId',input.warehouseId).input('quantity',-d.qtyTaken).input('unitCost',d.unitCost).input('movementDate',input.mitiDate); await m.query('INSERT INTO dbo.StockMovements(movementType,referenceId,referenceNo,itemId,warehouseId,quantity,unitCost,movementDate) VALUES(@movementType,@referenceId,@referenceNo,@itemId,@warehouseId,@quantity,@unitCost,@movementDate)'); }
      } else if(txType==='sales_return'){
        const originalLineResult=await new sql.Request(tx).input('invoiceId',originalInvoice.id).input('itemId',item.id).query('SELECT TOP 1 quantity,cogsAmount FROM dbo.SalesInvoiceLines WHERE invoiceId=@invoiceId AND itemId=@itemId');
        if(!originalLineResult.recordset[0]) throw new HttpError(400,`Item ${item.name} is not present on original invoice ${originalInvoice.invoiceNo}`);
        const adjustedResult=await new sql.Request(tx).input('refInvoiceNo',originalInvoice.invoiceNo).input('itemId',item.id).query(`SELECT COALESCE(SUM(l.quantity),0) AS adjustedQty FROM dbo.SalesInvoices i JOIN dbo.SalesInvoiceLines l ON l.invoiceId=i.id WHERE i.refInvoiceNo=@refInvoiceNo AND i.transactionType='sales_return' AND l.itemId=@itemId`);
        const alreadyReturned=Number(adjustedResult.recordset[0]?.adjustedQty||0);
        const originalQty=Number(originalLineResult.recordset[0].quantity||0);
        if(alreadyReturned+qty>originalQty) throw new HttpError(409,`Return quantity for ${item.name} exceeds original sold quantity. Remaining: ${Math.max(0,originalQty-alreadyReturned)}`);
        // Use the original invoice's COGS per unit when possible; otherwise current item cost.
        let unitCost=Number(item.costPrice); if(Number(originalLineResult.recordset[0]?.quantity||0)>0) unitCost=Number(originalLineResult.recordset[0].cogsAmount||0)/Number(originalLineResult.recordset[0].quantity);
        cogs=round2(unitCost*qty); totalCogs-=cogs;
        const batchId=id('batch-ret'); const b=new sql.Request(tx); b.input('id',batchId).input('itemId',item.id).input('warehouseId',input.warehouseId).input('purchaseId',`ret-${invoiceId}`).input('purchaseBillNo',`RET-${invoiceNo}`).input('purchaseDate',input.mitiDate).input('unitCost',unitCost).input('originalQty',qty).input('remainingQty',qty); await b.query('INSERT INTO dbo.FifoBatches(id,itemId,warehouseId,purchaseId,purchaseBillNo,purchaseDate,unitCost,originalQty,remainingQty) VALUES(@id,@itemId,@warehouseId,@purchaseId,@purchaseBillNo,@purchaseDate,@unitCost,@originalQty,@remainingQty)');
        const m=new sql.Request(tx); m.input('movementType','SALES_RETURN').input('referenceId',invoiceId).input('referenceNo',invoiceNo).input('itemId',item.id).input('warehouseId',input.warehouseId).input('quantity',qty).input('unitCost',unitCost).input('movementDate',input.mitiDate); await m.query('INSERT INTO dbo.StockMovements(movementType,referenceId,referenceNo,itemId,warehouseId,quantity,unitCost,movementDate) VALUES(@movementType,@referenceId,@referenceNo,@itemId,@warehouseId,@quantity,@unitCost,@movementDate)');
      }
      finalLines.push({itemId:item.id,sku:item.sku,name:item.name,size:item.size,color:item.color,hsnCode:item.hsnCode,quantity:qty,unitPrice,discountPercent,isVatApplicable:isVatApplicable,taxableAmount:lineTaxable,vatAmount:vat,lineTotal,cogsAmount:cogs});
    }
    subtotal=round2(subtotal); discountAmount=round2(discountAmount); taxableAmount=round2(taxableAmount); nonTaxableAmount=round2(nonTaxableAmount); vatAmount=round2(vatAmount); const grandTotal=round2(taxableAmount+nonTaxableAmount+vatAmount);
    const invoice:SalesInvoice={id:invoiceId,transactionType:txType,invoiceNo,refInvoiceNo:input.refInvoiceNo,reason:input.reason,fiscalYear,mitiDate:input.mitiDate,adDate:input.adDate,customerId:customer.id,customerName:customer.name,customerPan:customer.panNumber,customerAddress:customer.address,warehouseId:warehouse.id,warehouseName:warehouse.name,paymentMode:input.paymentMode,items:finalLines,subtotal,discountAmount,taxableAmount,nonTaxableAmount,vatAmount,grandTotal,totalCogs,journalEntryId:'',notes:input.notes,syncWithIrd:input.syncWithIrd??false};
    const journal=buildSalesJournal(invoice, accountMap); 
    const je=await insertJournal(tx,fiscalYear,input.mitiDate,input.adDate,journal.referenceType,journal.referenceNo,journal.narration,journal.lines); invoice.journalEntryId=je.id;
    const ir=new sql.Request(tx); ir.input('id',invoice.id).input('transactionType',txType).input('invoiceNo',invoiceNo).input('refInvoiceNo',input.refInvoiceNo??null).input('reason',input.reason??null).input('fiscalYear',fiscalYear).input('mitiDate',input.mitiDate).input('adDate',input.adDate).input('customerId',customer.id).input('customerName',customer.name).input('customerPan',customer.panNumber).input('customerAddress',customer.address).input('warehouseId',warehouse.id).input('warehouseName',warehouse.name).input('paymentMode',input.paymentMode).input('subtotal',subtotal).input('discountAmount',discountAmount).input('taxableAmount',taxableAmount).input('nonTaxableAmount',nonTaxableAmount).input('vatAmount',vatAmount).input('grandTotal',grandTotal).input('totalCogs',totalCogs).input('journalEntryId',je.id).input('notes',input.notes??null).input('syncWithIrd',input.syncWithIrd??false);
    await ir.query(`INSERT INTO dbo.SalesInvoices(id,transactionType,invoiceNo,refInvoiceNo,reason,fiscalYear,mitiDate,adDate,customerId,customerName,customerPan,customerAddress,warehouseId,warehouseName,paymentMode,subtotal,discountAmount,taxableAmount,nonTaxableAmount,vatAmount,grandTotal,totalCogs,journalEntryId,notes,syncWithIrd) VALUES(@id,@transactionType,@invoiceNo,@refInvoiceNo,@reason,@fiscalYear,@mitiDate,@adDate,@customerId,@customerName,@customerPan,@customerAddress,@warehouseId,@warehouseName,@paymentMode,@subtotal,@discountAmount,@taxableAmount,@nonTaxableAmount,@vatAmount,@grandTotal,@totalCogs,@journalEntryId,@notes,@syncWithIrd)`);
    for(const l of finalLines){ const lr=new sql.Request(tx); Object.entries({invoiceId:invoice.id,...l}).forEach(([k,v])=>lr.input(k,v as any)); await lr.query(`INSERT INTO dbo.SalesInvoiceLines(invoiceId,itemId,sku,name,size,color,hsnCode,quantity,unitPrice,discountPercent,isVatApplicable,taxableAmount,vatAmount,lineTotal,cogsAmount) VALUES(@invoiceId,@itemId,@sku,@name,@size,@color,@hsnCode,@quantity,@unitPrice,@discountPercent,@isVatApplicable,@taxableAmount,@vatAmount,@lineTotal,@cogsAmount)`); }
    // Partner balance follows document semantics; cash/bank does not touch BP balance.
    if(input.paymentMode==='Credit') { const delta=(txType==='sales_return'||txType==='credit_note')?-grandTotal:grandTotal; const pr=new sql.Request(tx); pr.input('id',customer.id).input('delta',delta); await pr.query('UPDATE dbo.BusinessPartners SET currentBalance=currentBalance+@delta,updatedAt=SYSUTCDATETIME() WHERE id=@id'); }
    await tx.commit(); return invoice;
  } catch(e){ await tx.rollback(); throw e; }
}

/**
 * Apply a purchase debit/credit note as a VALUE adjustment to the remaining
 * FIFO inventory layers of the referenced purchase. No physical quantity is
 * added or removed. This keeps stock quantity unchanged while changing the
 * inventory asset value, which is the intended treatment for price
 * adjustments / supplier claims / supplier rebates.
 *
 * VAT registered business:
 *   debit note  -> inventory value decreases by NET adjustment
 *   credit note -> inventory value increases by NET adjustment
 *   Input VAT is adjusted separately in the journal.
 *
 * PAN business with supplier VAT bill:
 *   the VAT is capitalized, so the inventory value adjustment includes VAT.
 *
 * The adjustment is allocated FIFO across the remaining layers belonging to
 * the referenced purchase bill. If the referenced goods have no remaining
 * quantity in this warehouse, the note is rejected rather than silently
 * changing an unrelated stock layer.
 */
async function applyPurchaseValueAdjustment(
  tx: sql.Transaction,
  originalPurchaseId: string,
  itemId: string,
  warehouseId: string,
  quantity: number,
  unitAdjustment: number,
  increase: boolean,
  referenceId: string,
  referenceNo: string,
  movementType: string,
  movementDate: string,
): Promise<number> {
  const requestedQty = Number(quantity);
  const adjustmentPerUnit = round2(Number(unitAdjustment));

  if (!Number.isInteger(requestedQty) || requestedQty <= 0) {
    throw new HttpError(400, 'Purchase note quantity must be a positive whole number');
  }

  if (!Number.isFinite(adjustmentPerUnit) || adjustmentPerUnit <= 0) {
    throw new HttpError(400, 'Purchase note adjustment rate must be greater than zero');
  }

  const q = new sql.Request(tx);
  q.input('purchaseId', originalPurchaseId);
  q.input('itemId', itemId);
  q.input('warehouseId', warehouseId);

  const result = await q.query(`
    SELECT id, itemId, warehouseId, purchaseId, purchaseBillNo,
           purchaseDate, unitCost, originalQty, remainingQty
    FROM dbo.FifoBatches WITH (UPDLOCK, HOLDLOCK)
    WHERE purchaseId = @purchaseId
      AND itemId = @itemId
      AND warehouseId = @warehouseId
      AND remainingQty > 0
    ORDER BY purchaseDate, id
  `);

  const batches = result.recordset as BatchRow[];
  const availableQty = batches.reduce(
    (sum, batch) => sum + Number(batch.remainingQty),
    0,
  );

  if (availableQty + 1e-9 < requestedQty) {
    throw new HttpError(
      409,
      `Purchase note quantity ${requestedQty} for item ${itemId} exceeds the remaining quantity ${availableQty} from referenced purchase ${referenceNo}. Physical stock is not changed by a debit/credit note.`,
    );
  }

  let remaining = requestedQty;
  let totalAdjustment = 0;

  for (const batch of batches) {
    if (remaining <= 0) break;

    const takeQty = Math.min(Number(batch.remainingQty), remaining);
    const delta = adjustmentPerUnit;
    const oldUnitCost = Number(batch.unitCost);
    const newUnitCost = increase
      ? round2(oldUnitCost + delta)
      : round2(oldUnitCost - delta);

    if (newUnitCost < 0) {
      throw new HttpError(
        409,
        `Debit note adjustment would make FIFO unit cost negative for ${batch.purchaseBillNo}. Current unit cost: ${oldUnitCost.toFixed(2)}, adjustment: ${delta.toFixed(2)}.`,
      );
    }

    /*
     * If the note covers the whole remaining layer, update that layer.
     * If it covers only part of a layer, split the layer so the adjustment
     * applies only to the requested quantity and does not alter unrelated
     * stock units.
     */
    if (takeQty + 1e-9 >= Number(batch.remainingQty)) {
      const u = new sql.Request(tx);
      u.input('id', batch.id);
      u.input('unitCost', newUnitCost);
      await u.query(`
        UPDATE dbo.FifoBatches
        SET unitCost = @unitCost
        WHERE id = @id
      `);
    } else {
      const adjustedBatchId = id('batch-adj');
      const untouchedQty = round2(Number(batch.remainingQty) - takeQty);

      const reduce = new sql.Request(tx);
      reduce.input('id', batch.id);
      reduce.input('remainingQty', untouchedQty);
      await reduce.query(`
        UPDATE dbo.FifoBatches
        SET remainingQty = @remainingQty
        WHERE id = @id
      `);

      const insert = new sql.Request(tx);
      insert
        .input('id', adjustedBatchId)
        .input('itemId', batch.itemId)
        .input('warehouseId', batch.warehouseId)
        .input('purchaseId', batch.purchaseId)
        .input('purchaseBillNo', batch.purchaseBillNo)
        .input('purchaseDate', batch.purchaseDate)
        .input('unitCost', newUnitCost)
        .input('originalQty', takeQty)
        .input('remainingQty', takeQty);

      await insert.query(`
        INSERT INTO dbo.FifoBatches
          (id,itemId,warehouseId,purchaseId,purchaseBillNo,purchaseDate,unitCost,originalQty,remainingQty)
        VALUES
          (@id,@itemId,@warehouseId,@purchaseId,@purchaseBillNo,@purchaseDate,@unitCost,@originalQty,@remainingQty)
      `);
    }

    const valueAdjustment = round2(takeQty * delta);
    totalAdjustment = round2(totalAdjustment + valueAdjustment);

    /*
     * Keep an auditable zero-quantity movement. Quantity remains unchanged;
     * unitCost stores the adjustment-per-unit for the audit trail. The actual
     * current FIFO valuation comes from FifoBatches.unitCost.
     */
    const m = new sql.Request(tx);
    m.input('movementType', movementType);
    m.input('referenceId', referenceId);
    m.input('referenceNo', referenceNo);
    m.input('itemId', itemId);
    m.input('warehouseId', warehouseId);
    m.input('quantity', 0);
    m.input('unitCost', increase ? delta : -delta);
    m.input('movementDate', movementDate);

    await m.query(`
      INSERT INTO dbo.StockMovements
        (movementType,referenceId,referenceNo,itemId,warehouseId,quantity,unitCost,movementDate)
      VALUES
        (@movementType,@referenceId,@referenceNo,@itemId,@warehouseId,@quantity,@unitCost,@movementDate)
    `);

    remaining = round2(remaining - takeQty);
  }

  if (remaining > 0.0001) {
    throw new HttpError(409, `Unable to allocate purchase note quantity ${requestedQty}. Remaining allocation: ${remaining}.`);
  }

  return totalAdjustment;
}

export async function createPurchase(input:CreatePurchaseInput){
  const pool=await getPool(); const tx=new sql.Transaction(pool); await tx.begin();
  try {
    const settings=await vatRateFromSettings(tx);
    const vendor=await getPartner(tx,input.vendorId);
    const warehouse=await getWarehouse(tx,input.warehouseId);
    if(!['vendor','both'].includes(vendor.type)) throw new HttpError(400,'Selected partner is not a vendor');
    if(!input.lines?.length) throw new HttpError(400,'At least one purchase line is required');

    const txType=input.transactionType??'purchase_invoice';
    if(txType==='purchase_invoice'&&!input.supplierBillNo?.trim()) throw new HttpError(400,'Supplier bill number is required');
    if(txType!=='purchase_invoice'&&!input.refBillNo?.trim()) throw new HttpError(400,'Reference bill number is required');

    const fiscalYear=input.fiscalYear;
    const businessNature=String(settings.businessNature||'VAT')==='PAN'?'PAN':'VAT';
    const vatRate=Number(settings.vatRate||13)/100;
    const accountMap = await getAccountDetermination(tx);
    const supplierVatBill=input.supplierVatBill ?? (vendor.isVatApplicable !== false);

    if(txType==='purchase_invoice'){
      const dup=new sql.Request(tx);
      dup.input('vendorId',vendor.id).input('fiscalYear',fiscalYear).input('supplierBillNo',input.supplierBillNo.trim());
      const exists=await dup.query(`SELECT TOP 1 billNo FROM dbo.PurchaseBills WITH (UPDLOCK,HOLDLOCK) WHERE vendorId=@vendorId AND fiscalYear=@fiscalYear AND LOWER(LTRIM(RTRIM(supplierBillNo)))=LOWER(LTRIM(RTRIM(@supplierBillNo))) AND transactionType='purchase_invoice'`);
      if(exists.recordset[0]) throw new HttpError(409,`Supplier bill ${input.supplierBillNo.trim()} is already recorded for this supplier and fiscal year.`);
    }

    const prefix=txType==='purchase_invoice'?String(settings.purchasePrefix||'PUR-'):txType==='purchase_return'?'PR-':txType==='debit_note'?'DN-PUR-':'CN-PUR-';
    const billNo=await nextDocumentNumber(tx,fiscalYear,`purchase_${txType}`,prefix);
    const billId=id('pur');
    const finalLines:any[]=[];
    let subtotal=0,taxableAmount=0,nonTaxableAmount=0,vatAmount=0,inventoryCost=0;
    let inventoryAdjustment=0;

    let originalBill:any=null;
    if(txType!=='purchase_invoice'){
      const rr=new sql.Request(tx); rr.input('vendorId',vendor.id).input('billNo',input.refBillNo!.trim());
      const found=await rr.query(`SELECT TOP 1 * FROM dbo.PurchaseBills WITH (UPDLOCK,HOLDLOCK) WHERE vendorId=@vendorId AND LOWER(LTRIM(RTRIM(billNo)))=LOWER(LTRIM(RTRIM(@billNo))) AND transactionType='purchase_invoice'`);
      if(!found.recordset[0]) throw new HttpError(404,`Original purchase bill ${input.refBillNo!.trim()} was not found for this supplier.`);
      originalBill=found.recordset[0];
      if(originalBill.warehouseId!==warehouse.id && txType==='purchase_return') throw new HttpError(400,'Purchase return must use the original bill warehouse');
    }

    for(const line of input.lines){
      const item=await getItem(tx,line.itemId);
      const qty=Number(line.quantity), unitCost=Number(line.unitCost);
      if(!Number.isInteger(qty)||qty<=0||!Number.isFinite(unitCost)||unitCost<0) throw new HttpError(400,`Invalid purchase line for ${item.name}`);

      const base=round2(qty*unitCost);
      const vatEligible = supplierVatBill;
      const vat=vatEligible?round2(base*vatRate):0;
      const lineTotal=round2(base+vat);
      const lineInventoryUnitCost=(businessNature==='PAN' && vat>0)?round2(lineTotal/qty):unitCost;

      let cost=0;
      let noteInventoryValue=0;

      if(txType==='purchase_invoice'){
        cost=lineTotal;
        const batchId=id('batch');
        const br=new sql.Request(tx); br.input('id',batchId).input('itemId',item.id).input('warehouseId',warehouse.id).input('purchaseId',billId).input('purchaseBillNo',billNo).input('purchaseDate',input.mitiDate).input('unitCost',lineInventoryUnitCost).input('originalQty',qty).input('remainingQty',qty);
        await br.query('INSERT INTO dbo.FifoBatches(id,itemId,warehouseId,purchaseId,purchaseBillNo,purchaseDate,unitCost,originalQty,remainingQty) VALUES(@id,@itemId,@warehouseId,@purchaseId,@purchaseBillNo,@purchaseDate,@unitCost,@originalQty,@remainingQty)');
        const m=new sql.Request(tx); m.input('movementType','PURCHASE').input('referenceId',billId).input('referenceNo',billNo).input('itemId',item.id).input('warehouseId',warehouse.id).input('quantity',qty).input('unitCost',lineInventoryUnitCost).input('movementDate',input.mitiDate);
        await m.query('INSERT INTO dbo.StockMovements(movementType,referenceId,referenceNo,itemId,warehouseId,quantity,unitCost,movementDate) VALUES(@movementType,@referenceId,@referenceNo,@itemId,@warehouseId,@quantity,@unitCost,@movementDate)');

      } else if(txType==='purchase_return'){
        const batches=await loadBatches(tx,item.id,warehouse.id);
        const res=depleteFifoRows(batches,item.id,warehouse.id,qty);
        if(!res.success) throw new HttpError(409,`Insufficient stock for return of ${item.name}. Available ${res.availableQty}, required ${qty}`);
        cost=res.totalCogs; inventoryCost+=cost;
        for(const d of res.details){
          const u=new sql.Request(tx); u.input('id',d.batchId).input('qty',d.qtyTaken); await u.query('UPDATE dbo.FifoBatches SET remainingQty=remainingQty-@qty WHERE id=@id AND remainingQty>=@qty');
          const m=new sql.Request(tx); m.input('movementType','PURCHASE_RETURN').input('referenceId',billId).input('referenceNo',billNo).input('itemId',item.id).input('warehouseId',warehouse.id).input('quantity',-d.qtyTaken).input('unitCost',d.unitCost).input('movementDate',input.mitiDate);
          await m.query('INSERT INTO dbo.StockMovements(movementType,referenceId,referenceNo,itemId,warehouseId,quantity,unitCost,movementDate) VALUES(@movementType,@referenceId,@referenceNo,@itemId,@warehouseId,@quantity,@unitCost,@movementDate)');
        }

      } else if(txType==='debit_note' || txType==='credit_note'){
        /*
         * Price/value adjustment only. There is deliberately NO FIFO
         * depletion and NO FIFO quantity addition here.
         *
         * VAT business: inventory is adjusted by NET amount and VAT is
         * separately reversed/recognized in Input VAT.
         * PAN business: VAT is capitalized, so inventory adjustment includes
         * the VAT amount too.
         */
        noteInventoryValue = businessNature==='PAN' && vat>0 ? lineTotal : base;
        const unitInventoryAdjustment = businessNature==='PAN' && vat>0 ? lineInventoryUnitCost : unitCost;

        const applied = await applyPurchaseValueAdjustment(
          tx,
          originalBill.id,
          item.id,
          warehouse.id,
          qty,
          unitInventoryAdjustment,
          txType==='credit_note',
          billId,
          billNo,
          txType==='credit_note' ? 'PURCHASE_CREDIT_NOTE' : 'PURCHASE_DEBIT_NOTE',
          input.mitiDate,
        );

        /* applyPurchaseValueAdjustment returns the positive absolute value. */
        inventoryAdjustment = round2(inventoryAdjustment + applied);
        cost=applied;
      }

      let effectiveVat=vat;
      let effectiveTaxable=(businessNature==='VAT' && vatEligible)?base:0;
      let effectiveLineTotal=lineTotal;

      if((txType==='purchase_return' || txType==='debit_note' || txType==='credit_note') && originalBill){
        const olr=new sql.Request(tx); olr.input('billId',originalBill.id).input('itemId',item.id);
        const ol=await olr.query('SELECT TOP 1 quantity,unitCost,isVatApplicable,taxableAmount,vatAmount FROM dbo.PurchaseBillLines WHERE billId=@billId AND itemId=@itemId ORDER BY id');
        if(ol.recordset[0]){
          const o=ol.recordset[0];
          /*
           * Notes use the amount entered by the user, but supplier VAT status
           * remains the source for whether a VAT component exists. Returns
           * continue to mirror the original bill's VAT treatment.
           */
          if(txType==='purchase_return'){
            effectiveVat=Number(o.isVatApplicable)?round2((Number(o.vatAmount)/Math.max(1,Number(o.quantity)))*qty):0;
            effectiveTaxable=Number(o.isVatApplicable)?round2((Number(o.taxableAmount)/Math.max(1,Number(o.quantity)))*qty):0;
            effectiveLineTotal=round2(effectiveTaxable + (Number(o.isVatApplicable)?effectiveVat:0) + (Number(o.isVatApplicable)?0:cost));
          } else {
            const originalHadVat = Number(o.vatAmount) > 0 || Number(o.isVatApplicable) === 1;
            effectiveVat = originalHadVat && supplierVatBill ? vat : 0;
            effectiveTaxable = businessNature==='VAT' && effectiveVat>0 ? base : 0;
            effectiveLineTotal = round2(base + effectiveVat);
          }
        }
      }

      const outputUnitCost=txType==='purchase_return' && qty>0 ? round2(cost/qty) : unitCost;
      const accountingBase=txType==='purchase_return'?cost:base;

      subtotal+=accountingBase;
      taxableAmount+=businessNature==='VAT' && effectiveVat>0?accountingBase:0;
      nonTaxableAmount+=businessNature==='VAT' && effectiveVat>0?0:accountingBase;
      vatAmount+=effectiveVat;
      inventoryCost+=txType==='purchase_invoice'?cost:0;

      finalLines.push({
        itemId:item.id,
        sku:item.sku,
        name:item.name,
        size:item.size,
        color:item.color,
        hsnCode:item.hsnCode,
        quantity:qty,
        unitCost:outputUnitCost,
        isVatApplicable:businessNature==='VAT' && Boolean(effectiveVat>0),
        taxableAmount:businessNature==='VAT' && effectiveVat>0?accountingBase:0,
        vatAmount:effectiveVat,
        lineTotal:txType==='purchase_return'?round2(accountingBase+effectiveVat):effectiveLineTotal
      });
    }

    subtotal=round2(subtotal);
    taxableAmount=round2(taxableAmount);
    nonTaxableAmount=round2(nonTaxableAmount);
    vatAmount=round2(vatAmount);
    const grandTotal=round2(taxableAmount+nonTaxableAmount+vatAmount);
    const isCapitalizedVat=businessNature==='PAN' && vatAmount>0;

    const bill:PurchaseBill={
      id:billId,
      transactionType:txType,
      billNo,
      supplierBillNo:input.supplierBillNo||input.refBillNo!,
      refBillNo:input.refBillNo,
      reason:input.reason,
      fiscalYear,
      mitiDate:input.mitiDate,
      adDate:input.adDate,
      vendorId:vendor.id,
      vendorName:vendor.name,
      vendorPan:vendor.panNumber,
      warehouseId:warehouse.id,
      warehouseName:warehouse.name,
      paymentMode:input.paymentMode,
      items:finalLines,
      subtotal,
      taxableAmount,
      nonTaxableAmount,
      vatAmount,
      grandTotal,
      journalEntryId:'',
      notes:input.notes,
      isVatBill:supplierVatBill,
      isCapitalizedVat:isCapitalizedVat
    };

    /*
     * For notes inventoryCost is the VALUE being adjusted, not physical
     * FIFO cost. Debit note is a negative inventory adjustment; credit note
     * is a positive inventory adjustment.
     */
    const journalInventoryAmount =
      txType==='purchase_return'
        ? inventoryCost
        : txType==='debit_note'
          ? round2(Math.abs(inventoryAdjustment))
          : txType==='credit_note'
            ? round2(Math.abs(inventoryAdjustment))
            : (isCapitalizedVat
                ? round2(taxableAmount+nonTaxableAmount+vatAmount)
                : round2(taxableAmount+nonTaxableAmount));

    const journal=buildPurchaseJournal(bill,journalInventoryAmount,accountMap);
    const je=await insertJournal(tx,fiscalYear,input.mitiDate,input.adDate,journal.referenceType,journal.referenceNo,journal.narration,journal.lines);
    bill.journalEntryId=je.id;

    const br=new sql.Request(tx);
    Object.entries({
      id:bill.id,
      transactionType:txType,
      billNo,
      supplierBillNo:bill.supplierBillNo,
      refBillNo:input.refBillNo??null,
      reason:input.reason??null,
      fiscalYear,
      mitiDate:input.mitiDate,
      adDate:input.adDate,
      vendorId:vendor.id,
      vendorName:vendor.name,
      vendorPan:vendor.panNumber,
      warehouseId:warehouse.id,
      warehouseName:warehouse.name,
      paymentMode:input.paymentMode,
      subtotal,
      taxableAmount,
      nonTaxableAmount,
      vatAmount,
      grandTotal,
      journalEntryId:je.id,
      notes:input.notes??null,
      isVatBill:supplierVatBill?1:0,
      isCapitalizedVat:isCapitalizedVat?1:0
    }).forEach(([k,v])=>br.input(k,v as any));

    await br.query(`INSERT INTO dbo.PurchaseBills(id,transactionType,billNo,supplierBillNo,refBillNo,reason,fiscalYear,mitiDate,adDate,vendorId,vendorName,vendorPan,warehouseId,warehouseName,paymentMode,subtotal,taxableAmount,nonTaxableAmount,vatAmount,grandTotal,journalEntryId,notes,isVatBill,isCapitalizedVat) VALUES(@id,@transactionType,@billNo,@supplierBillNo,@refBillNo,@reason,@fiscalYear,@mitiDate,@adDate,@vendorId,@vendorName,@vendorPan,@warehouseId,@warehouseName,@paymentMode,@subtotal,@taxableAmount,@nonTaxableAmount,@vatAmount,@grandTotal,@journalEntryId,@notes,@isVatBill,@isCapitalizedVat)`);

    for(const l of finalLines){
      const lr=new sql.Request(tx);
      Object.entries({billId:bill.id,...l}).forEach(([k,v])=>lr.input(k,v as any));
      await lr.query(`INSERT INTO dbo.PurchaseBillLines(billId,itemId,sku,name,size,color,hsnCode,quantity,unitCost,isVatApplicable,taxableAmount,vatAmount,lineTotal) VALUES(@billId,@itemId,@sku,@name,@size,@color,@hsnCode,@quantity,@unitCost,@isVatApplicable,@taxableAmount,@vatAmount,@lineTotal)`);
    }

    if(input.paymentMode==='Credit'){
      const delta=txType==='purchase_invoice'||txType==='purchase_return'||txType==='debit_note'?-grandTotal:grandTotal;
      const pr=new sql.Request(tx);
      pr.input('id',vendor.id).input('delta',delta);
      await pr.query('UPDATE dbo.BusinessPartners SET currentBalance=currentBalance+@delta,updatedAt=SYSUTCDATETIME() WHERE id=@id');
    }

    await tx.commit();
    return bill;
  } catch(e){
    try { await tx.rollback(); } catch { /* transaction may already be closed */ }
    throw e;
  }
}

export async function createTransfer(input:CreateTransferInput){ const pool=await getPool(); const tx=new sql.Transaction(pool); await tx.begin(); try { if(input.sourceWarehouseId===input.targetWarehouseId) throw new HttpError(400,'Source and target warehouse cannot be the same'); const src=await getWarehouse(tx,input.sourceWarehouseId), tgt=await getWarehouse(tx,input.targetWarehouseId); if(!input.items?.length) throw new HttpError(400,'At least one transfer line is required'); for(const line of input.items){ const qty=Number(line.quantity); if(!line.itemId || !Number.isInteger(qty) || qty<=0) throw new HttpError(400,'Transfer quantities must be whole numbers greater than zero'); } const transferId=id('trf'); const transferNo=await nextDocumentNumber(tx,input.fiscalYear,'stock_transfer','TRF'); let totalValue=0; const details:any[]=[];
  for(const line of input.items){ const item=await getItem(tx,line.itemId); const batches=await loadBatches(tx,item.id,src.id); const res=depleteFifoRows(batches,item.id,src.id,line.quantity); if(!res.success) throw new HttpError(409,`Insufficient stock in ${src.name} for ${item.name}. Available ${res.availableQty}, required ${line.quantity}`); let lineValue=0; for(const d of res.details){ const u=new sql.Request(tx); u.input('id',d.batchId).input('qty',d.qtyTaken); await u.query('UPDATE dbo.FifoBatches SET remainingQty=remainingQty-@qty WHERE id=@id AND remainingQty>=@qty'); const nb=id('batch-trf'); const b=new sql.Request(tx); b.input('id',nb).input('itemId',item.id).input('warehouseId',tgt.id).input('purchaseId',`transfer-${transferId}`).input('purchaseBillNo',`TRF: ${d.purchaseBillNo}`).input('purchaseDate',d.purchaseDate).input('unitCost',d.unitCost).input('originalQty',d.qtyTaken).input('remainingQty',d.qtyTaken); await b.query('INSERT INTO dbo.FifoBatches(id,itemId,warehouseId,purchaseId,purchaseBillNo,purchaseDate,unitCost,originalQty,remainingQty) VALUES(@id,@itemId,@warehouseId,@purchaseId,@purchaseBillNo,@purchaseDate,@unitCost,@originalQty,@remainingQty)'); lineValue+=d.totalCost; const m1=new sql.Request(tx); m1.input('movementType','TRANSFER_OUT').input('referenceId',transferId).input('referenceNo',transferNo).input('itemId',item.id).input('warehouseId',src.id).input('quantity',-d.qtyTaken).input('unitCost',d.unitCost).input('movementDate',input.mitiDate); await m1.query('INSERT INTO dbo.StockMovements(movementType,referenceId,referenceNo,itemId,warehouseId,quantity,unitCost,movementDate) VALUES(@movementType,@referenceId,@referenceNo,@itemId,@warehouseId,@quantity,@unitCost,@movementDate)'); const m2=new sql.Request(tx); m2.input('movementType','TRANSFER_IN').input('referenceId',transferId).input('referenceNo',transferNo).input('itemId',item.id).input('warehouseId',tgt.id).input('quantity',d.qtyTaken).input('unitCost',d.unitCost).input('movementDate',input.mitiDate); await m2.query('INSERT INTO dbo.StockMovements(movementType,referenceId,referenceNo,itemId,warehouseId,quantity,unitCost,movementDate) VALUES(@movementType,@referenceId,@referenceNo,@itemId,@warehouseId,@quantity,@unitCost,@movementDate)'); }
    totalValue+=lineValue; details.push({item,item,quantity:line.quantity,unitCost:lineValue/line.quantity}); }
  const r=new sql.Request(tx); r.input('id',transferId).input('transferNo',transferNo).input('fiscalYear',input.fiscalYear).input('mitiDate',input.mitiDate).input('adDate',input.adDate).input('sourceWarehouseId',src.id).input('sourceWarehouseName',src.name).input('targetWarehouseId',tgt.id).input('targetWarehouseName',tgt.name).input('totalValue',round2(totalValue)).input('remarks',input.remarks??'Internal inventory reallocation'); await r.query(`INSERT INTO dbo.StockTransfers(id,transferNo,fiscalYear,mitiDate,adDate,sourceWarehouseId,sourceWarehouseName,targetWarehouseId,targetWarehouseName,totalValue,remarks) VALUES(@id,@transferNo,@fiscalYear,@mitiDate,@adDate,@sourceWarehouseId,@sourceWarehouseName,@targetWarehouseId,@targetWarehouseName,@totalValue,@remarks)`);
  for(const d of details){ const lr=new sql.Request(tx); lr.input('transferId',transferId).input('itemId',d.item.id).input('sku',d.item.sku).input('name',d.item.name).input('quantity',d.quantity).input('unitCost',d.unitCost); await lr.query('INSERT INTO dbo.StockTransferLines(transferId,itemId,sku,name,quantity,unitCost) VALUES(@transferId,@itemId,@sku,@name,@quantity,@unitCost)'); }
  await tx.commit(); return (await getTransferById(transferId))!;
 } catch(e){await tx.rollback();throw e;} }

async function getTransferById(transferId:string){ const pool=await getPool(); const r=await pool.request().input('id',transferId).query('SELECT * FROM dbo.StockTransfers WHERE id=@id'); if(!r.recordset[0]) return null; const transfer=r.recordset[0]; const lines=await pool.request().input('transferId',transferId).query('SELECT itemId,sku,name,quantity,unitCost FROM dbo.StockTransferLines WHERE transferId=@transferId ORDER BY id'); transfer.items=lines.recordset; return transfer; }

export async function listTransfers(){ const pool=await getPool(); const rows=(await pool.request().query('SELECT * FROM dbo.StockTransfers ORDER BY adDate DESC,createdAt DESC')).recordset; for(const transfer of rows){ const lines=await pool.request().input('transferId',transfer.id).query('SELECT itemId,sku,name,quantity,unitCost FROM dbo.StockTransferLines WHERE transferId=@transferId ORDER BY id'); transfer.items=lines.recordset; } return rows; }

export async function listStockMovements(itemId?:string,warehouseId?:string){ const pool=await getPool(); const req=pool.request(); let q='SELECT * FROM dbo.StockMovements WHERE 1=1'; if(itemId){q+=' AND itemId=@itemId';req.input('itemId',itemId);} if(warehouseId){q+=' AND warehouseId=@warehouseId';req.input('warehouseId',warehouseId);} q+=' ORDER BY movementDate DESC,createdAt DESC,id DESC'; return (await req.query(q)).recordset; }

export async function listSales(){ const pool=await getPool(); const h=(await pool.request().query('SELECT * FROM dbo.SalesInvoices ORDER BY adDate DESC,createdAt DESC')).recordset; for(const inv of h){ const r=await pool.request().input('invoiceId',inv.id).query('SELECT * FROM dbo.SalesInvoiceLines WHERE invoiceId=@invoiceId ORDER BY id'); inv.items=r.recordset; } return h; }
export async function listPurchases(){ const pool=await getPool(); const h=(await pool.request().query('SELECT * FROM dbo.PurchaseBills ORDER BY adDate DESC,createdAt DESC')).recordset; for(const bill of h){ const r=await pool.request().input('billId',bill.id).query('SELECT * FROM dbo.PurchaseBillLines WHERE billId=@billId ORDER BY id'); bill.items=r.recordset; } return h; }
export async function listJournals(){ const pool=await getPool(); const h=(await pool.request().query('SELECT * FROM dbo.JournalEntries ORDER BY adDate DESC,createdAt DESC')).recordset; for(const j of h){ const r=await pool.request().input('id',j.id).query('SELECT * FROM dbo.JournalLines WHERE journalEntryId=@id ORDER BY id'); j.lines=r.recordset; } return h; }
