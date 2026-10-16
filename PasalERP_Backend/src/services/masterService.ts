import sql from 'mssql';
import { getPool } from '../config/db.js';
import { HttpError } from '../middleware/errorHandler.js';
import { id } from '../utils/ids.js';

const mapDate = (v:any) => v instanceof Date ? v.toISOString() : v;

export async function getSettings() {
  const pool = await getPool();
  const r = await pool.request().query('SELECT TOP 1 * FROM dbo.CompanySettings WHERE id=1');
  return r.recordset[0] ?? null;
}

// export async function upsertSettings(body:any) {
//   const pool = await getPool();
//   const req = pool.request();
//   const fields = ['companyName','tradeName','panNumber','businessNature','address','city','district','phone','email','vatRate','fiscalYear','irdApprovalNo','invoicePrefix','purchasePrefix','bankName','accountNumber','accountName','qrCodeText','termsAndConditions'];
//   // for (const f of fields) req.input(f, body[f] ?? null);

//   const businessNature =
//   body.businessNature === 'PAN' ? 'PAN' : 'VAT';

//   const parsedVatRate = Number(body.vatRate);

//   const vatRate =
//     Number.isFinite(parsedVatRate) &&
//     parsedVatRate >= 0 &&
//     parsedVatRate <= 100
//       ? parsedVatRate
//       : 13;

//   for (const f of fields) {
//     if (f === 'businessNature') {
//       req.input(f, businessNature);
//     } else if (f === 'vatRate') {
//       req.input(f, vatRate);
//     } else {
//       req.input(f, body[f] ?? null);
//     }
//   }

//   await req.query(`
//     MERGE dbo.CompanySettings AS t
//     USING (SELECT CAST(1 AS tinyint) id) AS s ON t.id=s.id
//     WHEN MATCHED THEN UPDATE SET
//       companyName=@companyName,tradeName=@tradeName,panNumber=@panNumber,businessNature=@businessNature,address=@address,city=@city,district=@district,
//       phone=@phone,email=@email,vatRate=@vatRate,fiscalYear=@fiscalYear,irdApprovalNo=@irdApprovalNo,invoicePrefix=@invoicePrefix,
//       purchasePrefix=@purchasePrefix,bankName=@bankName,accountNumber=@accountNumber,accountName=@accountName,qrCodeText=@qrCodeText,
//       termsAndConditions=@termsAndConditions,updatedAt=SYSUTCDATETIME()
//     WHEN NOT MATCHED THEN INSERT(id,companyName,tradeName,panNumber,businessNature,address,city,district,phone,email,vatRate,fiscalYear,irdApprovalNo,invoicePrefix,purchasePrefix,bankName,accountNumber,accountName,qrCodeText,termsAndConditions)
//       VALUES(1,@companyName,@tradeName,@panNumber,@businessNature,@address,@city,@district,@phone,@email,@vatRate,@fiscalYear,@irdApprovalNo,@invoicePrefix,@purchasePrefix,@bankName,@accountNumber,@accountName,@qrCodeText,@termsAndConditions);
//   `);
//   return getSettings();
// }

export async function upsertSettings(body: any) {
  const pool = await getPool();

  // Read existing settings first so omitted optional/legacy
  // fields never overwrite required DB columns with NULL.
  const existingResult = await pool
    .request()
    .query(`
      SELECT TOP 1 *
      FROM dbo.CompanySettings
      WHERE id = 1
    `);

  const existing = existingResult.recordset[0] ?? {};

  const merged = {
    ...existing,
    ...body,

    // The UI currently has one "City & District" field.
    // If district is missing, use city.
    district:
      body.district ??
      body.city ??
      existing.district ??
      '',

    city:
      body.city ??
      existing.city ??
      '',

    businessNature:
      body.businessNature === 'PAN'
        ? 'PAN'
        : body.businessNature === 'VAT'
          ? 'VAT'
          : existing.businessNature ?? 'VAT',

    vatRate:
      body.vatRate ??
      existing.vatRate ??
      13,
  };

  const req = pool.request();

  const fields = [
    'companyName',
    'tradeName',
    'panNumber',
    'businessNature',
    'address',
    'city',
    'district',
    'phone',
    'email',
    'vatRate',
    'fiscalYear',
    'irdApprovalNo',
    'invoicePrefix',
    'purchasePrefix',
    'bankName',
    'accountNumber',
    'accountName',
    'qrCodeText',
    'termsAndConditions',
  ];

  for (const f of fields) {
    req.input(f, merged[f] ?? null);
  }

  await req.query(`
    MERGE dbo.CompanySettings AS t
    USING (SELECT CAST(1 AS tinyint) id) AS s
      ON t.id = s.id

    WHEN MATCHED THEN
      UPDATE SET
        companyName = @companyName,
        tradeName = @tradeName,
        panNumber = @panNumber,
        businessNature = @businessNature,
        address = @address,
        city = @city,
        district = @district,
        phone = @phone,
        email = @email,
        vatRate = @vatRate,
        fiscalYear = @fiscalYear,
        irdApprovalNo = @irdApprovalNo,
        invoicePrefix = @invoicePrefix,
        purchasePrefix = @purchasePrefix,
        bankName = @bankName,
        accountNumber = @accountNumber,
        accountName = @accountName,
        qrCodeText = @qrCodeText,
        termsAndConditions = @termsAndConditions,
        updatedAt = SYSUTCDATETIME()

    WHEN NOT MATCHED THEN
      INSERT (
        id,
        companyName,
        tradeName,
        panNumber,
        businessNature,
        address,
        city,
        district,
        phone,
        email,
        vatRate,
        fiscalYear,
        irdApprovalNo,
        invoicePrefix,
        purchasePrefix,
        bankName,
        accountNumber,
        accountName,
        qrCodeText,
        termsAndConditions
      )
      VALUES (
        1,
        @companyName,
        @tradeName,
        @panNumber,
        @businessNature,
        @address,
        @city,
        @district,
        @phone,
        @email,
        @vatRate,
        @fiscalYear,
        @irdApprovalNo,
        @invoicePrefix,
        @purchasePrefix,
        @bankName,
        @accountNumber,
        @accountName,
        @qrCodeText,
        @termsAndConditions
      );
  `);

  return getSettings();
}

export async function listWarehouses() { const pool=await getPool(); return (await pool.request().query('SELECT * FROM dbo.Warehouses ORDER BY isDefault DESC,name')).recordset.map(mapDate); }
export async function createWarehouse(b:any) {
  const pool=await getPool(); const warehouseId=b.id || id('wh'); const req=pool.request();
  req.input('id',warehouseId).input('code',b.code).input('name',b.name).input('address',b.address||'').input('phone',b.phone||'').input('isDefault',b.isDefault?1:0);
  const tx=new sql.Transaction(pool); await tx.begin();
  try { const tr=new sql.Request(tx); tr.input('id',warehouseId).input('code',b.code).input('name',b.name).input('address',b.address||'').input('phone',b.phone||'').input('isDefault',b.isDefault?1:0);
    if(b.isDefault) await new sql.Request(tx).query('UPDATE dbo.Warehouses SET isDefault=0');
    await tr.query('INSERT INTO dbo.Warehouses(id,code,name,address,phone,isDefault) VALUES(@id,@code,@name,@address,@phone,@isDefault)'); await tx.commit();
    return (await pool.request().input('id',warehouseId).query('SELECT * FROM dbo.Warehouses WHERE id=@id')).recordset[0];
  } catch(e){ await tx.rollback(); throw e; }
}
export async function updateWarehouse(idv:string,b:any){ const pool=await getPool(); const tx=new sql.Transaction(pool); await tx.begin(); try { if(b.isDefault) await new sql.Request(tx).query('UPDATE dbo.Warehouses SET isDefault=0'); const r=new sql.Request(tx); r.input('id',idv).input('code',b.code).input('name',b.name).input('address',b.address||'').input('phone',b.phone||'').input('isDefault',b.isDefault?1:0); const x=await r.query('UPDATE dbo.Warehouses SET code=@code,name=@name,address=@address,phone=@phone,isDefault=@isDefault,updatedAt=SYSUTCDATETIME() WHERE id=@id'); if(!x.rowsAffected[0]) throw new HttpError(404,'Warehouse not found'); await tx.commit(); return (await pool.request().input('id',idv).query('SELECT * FROM dbo.Warehouses WHERE id=@id')).recordset[0]; } catch(e){await tx.rollback();throw e;} }
export async function deleteWarehouse(idv:string){ const pool=await getPool(); const r=await pool.request().input('id',idv).query('DELETE FROM dbo.Warehouses WHERE id=@id'); if(!r.rowsAffected[0]) throw new HttpError(404,'Warehouse not found'); }

export async function listPartners(){ const pool=await getPool(); return (await pool.request().query('SELECT * FROM dbo.BusinessPartners ORDER BY name')).recordset; }
export async function createPartner(b:any){ const pool=await getPool(); const partnerId=b.id||id('bp'); const r=pool.request(); r.input('id',partnerId).input('code',b.code).input('name',b.name).input('type',b.type).input('panNumber',b.panNumber).input('email',b.email||'').input('phone',b.phone||'').input('address',b.address||'').input('currentBalance',b.currentBalance||0).input('creditLimit',b.creditLimit??null).input('isVatApplicable',b.isVatApplicable===false?0:1); await r.query('INSERT INTO dbo.BusinessPartners(id,code,name,type,panNumber,email,phone,address,currentBalance,creditLimit,isVatApplicable) VALUES(@id,@code,@name,@type,@panNumber,@email,@phone,@address,@currentBalance,@creditLimit,@isVatApplicable)'); return (await pool.request().input('id',partnerId).query('SELECT * FROM dbo.BusinessPartners WHERE id=@id')).recordset[0]; }
export async function updatePartner(idv:string,b:any){ const pool=await getPool(); const r=pool.request(); r.input('id',idv).input('code',b.code).input('name',b.name).input('type',b.type).input('panNumber',b.panNumber).input('email',b.email||'').input('phone',b.phone||'').input('address',b.address||'').input('creditLimit',b.creditLimit??null).input('isVatApplicable',b.isVatApplicable===false?0:1); const x=await r.query('UPDATE dbo.BusinessPartners SET code=@code,name=@name,type=@type,panNumber=@panNumber,email=@email,phone=@phone,address=@address,creditLimit=@creditLimit,isVatApplicable=@isVatApplicable,updatedAt=SYSUTCDATETIME() WHERE id=@id'); if(!x.rowsAffected[0]) throw new HttpError(404,'Business partner not found'); return (await pool.request().input('id',idv).query('SELECT * FROM dbo.BusinessPartners WHERE id=@id')).recordset[0]; }
export async function deletePartner(idv:string){ const pool=await getPool(); const x=await pool.request().input('id',idv).query('DELETE FROM dbo.BusinessPartners WHERE id=@id'); if(!x.rowsAffected[0]) throw new HttpError(404,'Business partner not found'); }

export async function listItems(){ const pool=await getPool(); return (await pool.request().query('SELECT * FROM dbo.Items ORDER BY name')).recordset; }
export async function createItem(b:any){
  const pool=await getPool(); const itemId=b.id||id('item');
  const r=pool.request();
  r.input('id',itemId).input('sku',b.sku).input('barcode',b.barcode||`8901${Date.now()}`).input('name',b.name).input('category',b.category).input('size',b.size).input('color',b.color||'Standard').input('fabric',b.fabric||'Cotton').input('hsnCode',b.hsnCode||'6205.20.00').input('costPrice',b.costPrice??0).input('sellingPrice',b.sellingPrice??0).input('minStockAlert',b.minStockAlert??0).input('isVatApplicable',b.isVatApplicable?1:0).input('description',b.description??null);
  await r.query('INSERT INTO dbo.Items(id,sku,barcode,name,category,size,color,fabric,hsnCode,costPrice,sellingPrice,minStockAlert,isVatApplicable,description) VALUES(@id,@sku,@barcode,@name,@category,@size,@color,@fabric,@hsnCode,@costPrice,@sellingPrice,@minStockAlert,@isVatApplicable,@description)');
  return (await pool.request().input('id',itemId).query('SELECT * FROM dbo.Items WHERE id=@id')).recordset[0];
}
export async function updateItem(idv:string,b:any){
  const pool=await getPool();
  const current=(await pool.request().input('id',idv).query('SELECT * FROM dbo.Items WHERE id=@id')).recordset[0];
  if(!current) throw new HttpError(404,'Item not found');
  const x={...current,...b}; const r=pool.request();
  r.input('id',idv).input('sku',x.sku).input('barcode',x.barcode).input('name',x.name).input('category',x.category).input('size',x.size).input('color',x.color).input('fabric',x.fabric).input('hsnCode',x.hsnCode).input('costPrice',x.costPrice).input('sellingPrice',x.sellingPrice).input('minStockAlert',x.minStockAlert).input('isVatApplicable',x.isVatApplicable?1:0).input('description',x.description??null);
  await r.query('UPDATE dbo.Items SET sku=@sku,barcode=@barcode,name=@name,category=@category,size=@size,color=@color,fabric=@fabric,hsnCode=@hsnCode,costPrice=@costPrice,sellingPrice=@sellingPrice,minStockAlert=@minStockAlert,isVatApplicable=@isVatApplicable,description=@description,updatedAt=SYSUTCDATETIME() WHERE id=@id');
  return (await pool.request().input('id',idv).query('SELECT * FROM dbo.Items WHERE id=@id')).recordset[0];
}
export async function deleteItem(idv:string){ const pool=await getPool(); try { const x=await pool.request().input('id',idv).query('DELETE FROM dbo.Items WHERE id=@id'); if(!x.rowsAffected[0]) throw new HttpError(404,'Item not found'); } catch(e:any){ if(e instanceof HttpError) throw e; throw new HttpError(409,'Item cannot be deleted because it is referenced by transactions or stock.'); } }

export async function listAccounts(){ const pool=await getPool(); return (await pool.request().query('SELECT * FROM dbo.Accounts ORDER BY code')).recordset; }
export async function listBatches(itemId?:string,warehouseId?:string){ const pool=await getPool(); const r=pool.request(); let q='SELECT * FROM dbo.FifoBatches WHERE 1=1'; if(itemId){q+=' AND itemId=@itemId';r.input('itemId',itemId);} if(warehouseId){q+=' AND warehouseId=@warehouseId';r.input('warehouseId',warehouseId);} q+=' ORDER BY itemId,warehouseId,purchaseDate,id'; return (await r.query(q)).recordset; }

export async function dashboard(){ const pool=await getPool(); const [sales,purchases,stock,low,receivable,payable] = await Promise.all([
  pool.request().query(`SELECT COALESCE(SUM(grandTotal),0) totalSales,COALESCE(SUM(vatAmount),0) outputVat FROM dbo.SalesInvoices WHERE transactionType='tax_invoice'`),
  pool.request().query(`SELECT COALESCE(SUM(grandTotal),0) totalPurchases,COALESCE(SUM(vatAmount),0) inputVat FROM dbo.PurchaseBills WHERE transactionType='purchase_invoice'`),
  pool.request().query(`SELECT COALESCE(SUM(remainingQty*unitCost),0) inventoryValue,COALESCE(SUM(remainingQty),0) units FROM dbo.FifoBatches`),
  pool.request().query(`SELECT COUNT(*) count FROM dbo.Items i WHERE (SELECT COALESCE(SUM(remainingQty),0) FROM dbo.FifoBatches b WHERE b.itemId=i.id)<i.minStockAlert`),
  pool.request().query(`SELECT COALESCE(SUM(CASE WHEN currentBalance>0 THEN currentBalance ELSE 0 END),0) value FROM dbo.BusinessPartners WHERE type IN ('customer','both')`),
  pool.request().query(`SELECT COALESCE(SUM(CASE WHEN currentBalance<0 THEN -currentBalance ELSE 0 END),0) value FROM dbo.BusinessPartners WHERE type IN ('vendor','both')`)
 ]); return {sales:sales.recordset[0],purchases:purchases.recordset[0],stock:stock.recordset[0],lowStock:low.recordset[0].count,receivable:receivable.recordset[0].value,payable:payable.recordset[0].value}; }
