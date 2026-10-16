import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { getPool } from '../config/db.js';

const router = Router();

const fiscalWhere = (hasFiscal: boolean) => hasFiscal ? ' WHERE fiscalYear=@fy' : '';

router.get('/sales-book', asyncHandler(async (req, res) => {
  const pool = await getPool();
  const r = pool.request();
  const hasFiscal = Boolean(req.query.fiscalYear);
  if (hasFiscal) r.input('fy', String(req.query.fiscalYear));
  const where = fiscalWhere(hasFiscal);
  const result = await r.query(`
    SELECT id, fiscalYear, mitiDate, adDate, invoiceNo, customerName, customerPan,
           grandTotal, nonTaxableAmount, taxableAmount, vatAmount, transactionType,
           refInvoiceNo, reason, syncWithIrd
    FROM dbo.SalesInvoices${where}
    ORDER BY mitiDate, adDate, invoiceNo`);
  res.json({ success: true, data: result.recordset });
}));

router.get('/purchase-book', asyncHandler(async (req, res) => {
  const pool = await getPool();
  const r = pool.request();
  const hasFiscal = Boolean(req.query.fiscalYear);
  if (hasFiscal) r.input('fy', String(req.query.fiscalYear));
  const where = fiscalWhere(hasFiscal);
  const result = await r.query(`
    SELECT id, fiscalYear, mitiDate, adDate, billNo, supplierBillNo, vendorName, vendorPan,
           grandTotal, nonTaxableAmount, taxableAmount, vatAmount, transactionType,
           refBillNo, reason, isVatBill
    FROM dbo.PurchaseBills${where}
    ORDER BY mitiDate, adDate, billNo`);
  res.json({ success: true, data: result.recordset });
}));

router.get('/vat-summary', asyncHandler(async (req, res) => {
  const pool = await getPool();
  const r = pool.request();
  const hasFiscal = Boolean(req.query.fiscalYear);
  if (hasFiscal) r.input('fy', String(req.query.fiscalYear));
  const salesWhere = fiscalWhere(hasFiscal);
  const purchaseWhere = fiscalWhere(hasFiscal);
  const result = await r.query(`
    SELECT
      COALESCE((SELECT SUM(CASE WHEN transactionType IN ('tax_invoice','debit_note') THEN vatAmount
                                WHEN transactionType IN ('sales_return','credit_note') THEN -vatAmount ELSE 0 END)
               FROM dbo.SalesInvoices${salesWhere}), 0) AS outputVat,
      COALESCE((SELECT SUM(CASE WHEN transactionType IN ('purchase_invoice','debit_note') THEN vatAmount
                                WHEN transactionType IN ('purchase_return','credit_note') THEN -vatAmount ELSE 0 END)
               FROM dbo.PurchaseBills${purchaseWhere}), 0) AS inputVat,
      COALESCE((SELECT SUM(CASE WHEN transactionType IN ('tax_invoice','debit_note') THEN taxableAmount
                                WHEN transactionType IN ('sales_return','credit_note') THEN -taxableAmount ELSE 0 END)
               FROM dbo.SalesInvoices${salesWhere}), 0) AS taxableSales,
      COALESCE((SELECT SUM(nonTaxableAmount) FROM dbo.SalesInvoices${salesWhere}), 0) AS exemptSales,
      COALESCE((SELECT SUM(CASE WHEN transactionType IN ('purchase_invoice','debit_note') AND ISNULL(isCapitalizedVat, 0) = 0 THEN vatAmount
                                WHEN transactionType IN ('purchase_return','credit_note') AND ISNULL(isCapitalizedVat, 0) = 0 THEN -vatAmount ELSE 0 END)
               FROM dbo.PurchaseBills${purchaseWhere}), 0) AS inputVatRecoverable,
      COALESCE((SELECT SUM(CASE WHEN transactionType IN ('purchase_invoice','debit_note') THEN taxableAmount
                                WHEN transactionType IN ('purchase_return','credit_note') THEN -taxableAmount ELSE 0 END)
               FROM dbo.PurchaseBills${purchaseWhere}), 0) AS taxablePurchases,
      COALESCE((SELECT SUM(nonTaxableAmount) FROM dbo.PurchaseBills${purchaseWhere}), 0) AS exemptPurchases`);
  const row = result.recordset[0] || {};
  const outputVat = Number(row.outputVat || 0);
  const inputVat = Number(row.inputVatRecoverable || 0);
  res.json({ success: true, data: {
    outputVat,
    inputVat,
    netVatPayable: outputVat - inputVat,
    taxableSales: Number(row.taxableSales || 0),
    exemptSales: Number(row.exemptSales || 0),
    taxablePurchases: Number(row.taxablePurchases || 0),
    exemptPurchases: Number(row.exemptPurchases || 0),
  }});
}));

router.get('/compliance', asyncHandler(async (req, res) => {
  const pool = await getPool();
  const fy = req.query.fiscalYear ? String(req.query.fiscalYear) : undefined;
  const r = pool.request();
  if (fy) r.input('fy', fy);
  const where = fy ? ' WHERE fiscalYear=@fy' : '';
  const [settingsResult, salesResult, purchaseResult, salesLineResult, purchaseLineResult] = await Promise.all([
    pool.request().query('SELECT TOP 1 companyName,panNumber,businessNature,vatRate,fiscalYear FROM dbo.CompanySettings WHERE id=1'),
    r.query(`SELECT id,invoiceNo,customerPan,mitiDate,adDate,itemsCount=(SELECT COUNT(*) FROM dbo.SalesInvoiceLines l WHERE l.invoiceId=s.id),vatAmount,grandTotal,taxableAmount,nonTaxableAmount FROM dbo.SalesInvoices s${where}`),
    (fy ? pool.request().input('fy', fy) : pool.request()).query(`SELECT id,billNo,vendorPan,supplierBillNo,mitiDate,adDate,itemsCount=(SELECT COUNT(*) FROM dbo.PurchaseBillLines l WHERE l.billId=p.id),vatAmount,grandTotal,taxableAmount,nonTaxableAmount,isVatBill FROM dbo.PurchaseBills p${where}`),
    (fy ? pool.request().input('fy', fy) : pool.request()).query(`SELECT invoiceId, SUM(l.vatAmount) lineVat, SUM(l.lineTotal) lineTotal FROM dbo.SalesInvoiceLines l INNER JOIN dbo.SalesInvoices s ON s.id=l.invoiceId${fy ? ' WHERE s.fiscalYear=@fy' : ''} GROUP BY invoiceId`),
    (fy ? pool.request().input('fy', fy) : pool.request()).query(`SELECT billId, SUM(l.vatAmount) lineVat, SUM(l.lineTotal) lineTotal FROM dbo.PurchaseBillLines l INNER JOIN dbo.PurchaseBills p ON p.id=l.billId${fy ? ' WHERE p.fiscalYear=@fy' : ''} GROUP BY billId`),
  ]);

  const errors: Array<{ severity: 'error'; document: string; message: string }> = [];
  const warnings: Array<{ severity: 'warning'; document: string; message: string }> = [];
  const settings = settingsResult.recordset[0];
  const pan = /^\d{9}$/;
  if (!settings) errors.push({ severity: 'error', document: 'Company', message: 'Company settings have not been configured.' });
  else {
    if (!String(settings.companyName || '').trim()) errors.push({ severity: 'error', document: 'Company', message: 'Company name is required for statutory documents.' });
    if (!pan.test(String(settings.panNumber || '').trim())) errors.push({ severity: 'error', document: 'Company', message: 'Company PAN must be exactly 9 digits.' });
    if (String(settings.businessNature) === 'VAT' && (Number(settings.vatRate) <= 0 || Number(settings.vatRate) > 100)) errors.push({ severity: 'error', document: 'Company', message: 'VAT business must have a valid VAT rate.' });
  }

  const duplicate = (rows: any[], field: string, label: string) => {
    const seen = new Set<string>();
    for (const row of rows) {
      const value = String(row[field] || '').trim();
      if (value && seen.has(value)) errors.push({ severity: 'error', document: value, message: `Duplicate ${label}.` });
      if (value) seen.add(value);
    }
  };
  duplicate(salesResult.recordset, 'invoiceNo', 'invoice number');
  duplicate(purchaseResult.recordset, 'billNo', 'purchase document number');

  const salesLines = new Map(salesLineResult.recordset.map((x: any) => [x.invoiceId, x]));
  for (const row of salesResult.recordset) {
    const doc = String(row.invoiceNo);
    if (!pan.test(String(row.customerPan || '').trim())) warnings.push({ severity: 'warning', document: doc, message: 'Buyer PAN is missing or not 9 digits.' });
    if (!row.mitiDate || !row.adDate) errors.push({ severity: 'error', document: doc, message: 'Both B.S. and A.D. invoice dates are required.' });
    if (Number(row.itemsCount) < 1) errors.push({ severity: 'error', document: doc, message: 'Invoice has no item lines.' });
    const line = salesLines.get(row.id) as any;
    if (line && Math.abs(Number(row.vatAmount) - Number(line.lineVat)) > 0.02) errors.push({ severity: 'error', document: doc, message: 'VAT total does not reconcile with invoice lines.' });
    if (Math.abs(Number(row.grandTotal) - (Number(row.taxableAmount) + Number(row.nonTaxableAmount) + Number(row.vatAmount))) > 0.02) errors.push({ severity: 'error', document: doc, message: 'Grand total does not reconcile with taxable, exempt and VAT amounts.' });
  }
  const purchaseLines = new Map(purchaseLineResult.recordset.map((x: any) => [x.billId, x]));
  for (const row of purchaseResult.recordset) {
    const doc = String(row.billNo);
    if (!pan.test(String(row.vendorPan || '').trim())) warnings.push({ severity: 'warning', document: doc, message: 'Supplier PAN is missing or not 9 digits.' });
    if (!String(row.supplierBillNo || '').trim()) warnings.push({ severity: 'warning', document: doc, message: 'Supplier invoice number is missing.' });
    if (!row.mitiDate || !row.adDate) errors.push({ severity: 'error', document: doc, message: 'Both B.S. and A.D. purchase dates are required.' });
    if (Number(row.itemsCount) < 1) errors.push({ severity: 'error', document: doc, message: 'Purchase document has no item lines.' });
    const line = purchaseLines.get(row.id) as any;
    if (line && Math.abs(Number(row.vatAmount) - Number(line.lineVat)) > 0.02) errors.push({ severity: 'error', document: doc, message: 'Purchase VAT total does not reconcile with purchase lines.' });
    if (Math.abs(Number(row.grandTotal) - (Number(row.taxableAmount) + Number(row.nonTaxableAmount) + Number(row.vatAmount))) > 0.02) errors.push({ severity: 'error', document: doc, message: 'Grand total does not reconcile with taxable, exempt and VAT amounts.' });
    if (String(settings?.businessNature) === 'VAT' && row.isVatBill === false && Number(row.vatAmount) > 0) warnings.push({ severity: 'warning', document: doc, message: 'Non-VAT supplier bill contains input VAT.' });
  }
  res.json({ success: true, data: { errors, warnings, fiscalYear: fy || settings?.fiscalYear || null } });
}));

export default router;
