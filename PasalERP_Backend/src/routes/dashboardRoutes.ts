import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { getPool } from '../config/db.js';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  const pool = await getPool();
  const period = String(req.query.period || 'fiscal_year');
  const fiscalYear = String(req.query.fiscalYear || '').trim();
  const from = String(req.query.from || '').trim();
  const to = String(req.query.to || '').trim();

  if (!['fiscal_year', 'all', 'custom'].includes(period)) {
    return res.status(400).json({ success: false, message: 'period must be fiscal_year, all or custom' });
  }
  if (period === 'fiscal_year' && !/^\d{4}\/\d{2}$/.test(fiscalYear)) {
    return res.status(400).json({ success: false, message: 'A valid fiscalYear is required for fiscal_year period' });
  }
  if (period === 'custom' && from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    return res.status(400).json({ success: false, message: 'from must use YYYY-MM-DD format' });
  }
  if (period === 'custom' && to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return res.status(400).json({ success: false, message: 'to must use YYYY-MM-DD format' });
  }

  const salesReq = () => pool.request();
  const purchaseReq = () => pool.request();
  const trendReq = () => pool.request();
  const topReq = () => pool.request();
  const recentSalesReq = () => pool.request();
  const recentPurchaseReq = () => pool.request();
  const where = (alias: string, request: any) => {
    if (period === 'fiscal_year') { request.input('fy', fiscalYear); return ` AND ${alias}.fiscalYear=@fy`; }
    if (period === 'custom') {
      let q = '';
      if (from) { request.input('fromDate', from); q += ` AND ${alias}.adDate>=@fromDate`; }
      if (to) { request.input('toDate', to); q += ` AND ${alias}.adDate<=@toDate`; }
      return q;
    }
    return '';
  };
  const salesSummaryReq = salesReq();
  const purchaseSummaryReq = purchaseReq();
  const salesCountReq = salesReq();
  const purchaseCountReq = purchaseReq();
  const trendQueryReq = trendReq();
  const topQueryReq = topReq();
  const sw = where('s', salesSummaryReq);
  const pw = where('p', purchaseSummaryReq);
  const scw = where('s', salesCountReq);
  const pcw = where('p', purchaseCountReq);
  const tw = where('s', trendQueryReq);
  const iw = where('s', topQueryReq);
  const recentSalesQueryReq = recentSalesReq();
  const recentPurchaseQueryReq = recentPurchaseReq();
  const rsw = where('s', recentSalesQueryReq);
  const rpw = where('p', recentPurchaseQueryReq);

  const [salesSummary, purchaseSummary, salesCount, purchaseCount, salesTrend, topItems, inventory, lowStock, warehouses, partners, recentSales, recentPurchases] = await Promise.all([
    salesSummaryReq.query(`SELECT
      COALESCE(SUM(CASE WHEN s.transactionType IN ('sales_return','credit_note') THEN -s.grandTotal ELSE s.grandTotal END),0) salesTotal,
      COALESCE(SUM(CASE WHEN s.transactionType IN ('sales_return','credit_note') THEN -s.taxableAmount ELSE s.taxableAmount END),0) taxableSales,
      COALESCE(SUM(CASE WHEN s.transactionType IN ('sales_return','credit_note') THEN -s.vatAmount ELSE s.vatAmount END),0) outputVat,
      COALESCE(SUM(CASE WHEN s.transactionType='sales_return' THEN -s.totalCogs ELSE s.totalCogs END),0) cogs
      FROM dbo.SalesInvoices s WHERE 1=1${sw}`),
    purchaseSummaryReq.query(`SELECT
      COALESCE(SUM(CASE WHEN p.transactionType IN ('purchase_return','credit_note') THEN -p.grandTotal ELSE p.grandTotal END),0) purchaseTotal,
      COALESCE(SUM(CASE WHEN p.transactionType IN ('purchase_return','credit_note') THEN -p.taxableAmount ELSE p.taxableAmount END),0) taxablePurchases,
      COALESCE(SUM(CASE WHEN p.transactionType IN ('purchase_return','credit_note') THEN -p.vatAmount ELSE p.vatAmount END),0) inputVat
      FROM dbo.PurchaseBills p WHERE 1=1${pw}`),
    salesCountReq.query(`SELECT COUNT(*) count FROM dbo.SalesInvoices s WHERE 1=1${scw}`),
    purchaseCountReq.query(`SELECT COUNT(*) count FROM dbo.PurchaseBills p WHERE 1=1${pcw}`),
    trendQueryReq.query(`SELECT CONVERT(varchar(10),s.adDate,23) date,
      COALESCE(SUM(CASE WHEN s.transactionType IN ('sales_return','credit_note') THEN -s.grandTotal ELSE s.grandTotal END),0) sales,
      COALESCE(SUM(CASE WHEN s.transactionType='sales_return' THEN -s.totalCogs ELSE s.totalCogs END),0) cogs,
      COALESCE(SUM(CASE WHEN s.transactionType IN ('sales_return','credit_note') THEN -s.vatAmount ELSE s.vatAmount END),0) vat
      FROM dbo.SalesInvoices s WHERE 1=1${tw} GROUP BY CONVERT(varchar(10),s.adDate,23) ORDER BY date DESC`),
    topQueryReq.query(`SELECT TOP 8 l.itemId, MAX(l.name) name, MAX(l.sku) sku,
      COALESCE(SUM(CASE WHEN s.transactionType IN ('sales_return','credit_note') THEN -l.quantity ELSE l.quantity END),0) qty,
      COALESCE(SUM(CASE WHEN s.transactionType IN ('sales_return','credit_note') THEN -l.lineTotal ELSE l.lineTotal END),0) value
      FROM dbo.SalesInvoiceLines l INNER JOIN dbo.SalesInvoices s ON s.id=l.invoiceId WHERE 1=1${iw}
      GROUP BY l.itemId ORDER BY value DESC`),
    pool.request().query(`SELECT COALESCE(SUM(remainingQty*unitCost),0) valuation, COALESCE(SUM(remainingQty),0) units FROM dbo.FifoBatches WHERE remainingQty>0`),
    pool.request().query(`SELECT i.id, i.sku, i.name, i.size, i.color, i.minStockAlert, COALESCE(SUM(b.remainingQty),0) stock
      FROM dbo.Items i LEFT JOIN dbo.FifoBatches b ON b.itemId=i.id GROUP BY i.id,i.sku,i.name,i.size,i.color,i.minStockAlert
      HAVING COALESCE(SUM(b.remainingQty),0) < i.minStockAlert ORDER BY stock ASC, i.name`),
    pool.request().query(`SELECT w.id,w.code,w.name,w.isDefault,COALESCE(SUM(b.remainingQty),0) units,COALESCE(SUM(b.remainingQty*b.unitCost),0) value
      FROM dbo.Warehouses w LEFT JOIN dbo.FifoBatches b ON b.warehouseId=w.id AND b.remainingQty>0 GROUP BY w.id,w.code,w.name,w.isDefault ORDER BY w.name`),
    pool.request().query(`SELECT COALESCE(SUM(CASE WHEN currentBalance>0 THEN currentBalance ELSE 0 END),0) receivables,
      COALESCE(SUM(CASE WHEN currentBalance<0 THEN -currentBalance ELSE 0 END),0) payables FROM dbo.BusinessPartners`),
    recentSalesQueryReq.query(`SELECT TOP 5 * FROM dbo.SalesInvoices s WHERE 1=1${rsw} ORDER BY s.adDate DESC,s.createdAt DESC`),
    recentPurchaseQueryReq.query(`SELECT TOP 5 * FROM dbo.PurchaseBills p WHERE 1=1${rpw} ORDER BY p.adDate DESC,p.createdAt DESC`),
  ]);

  const s = salesSummary.recordset[0] || {};
  const p = purchaseSummary.recordset[0] || {};
  const sales = Number(s.salesTotal || 0);
  const purchases = Number(p.purchaseTotal || 0);
  const outputVat = Number(s.outputVat || 0);
  const inputVat = Number(p.inputVat || 0);
  const cogs = Number(s.cogs || 0);
  const taxableSales = Number(s.taxableSales || 0);
  const grossProfit = taxableSales - cogs;
  const totalInventoryValuation = Number(inventory.recordset[0]?.valuation || 0);
  const totalStockUnits = Number(inventory.recordset[0]?.units || 0);
  const receivables = Number(partners.recordset[0]?.receivables || 0);
  const payables = Number(partners.recordset[0]?.payables || 0);
  const warehouseRows = warehouses.recordset.map((w: any) => ({ ...w, units: Number(w.units || 0), value: Number(w.value || 0) }));
  const lowStockRows = lowStock.recordset.map((x: any) => ({ ...x, stock: Number(x.stock || 0), minStockAlert: Number(x.minStockAlert || 0) }));
  const trend = salesTrend.recordset.map((x: any) => ({ date: x.date, sales: Number(x.sales || 0), cogs: Number(x.cogs || 0), vat: Number(x.vat || 0) })).reverse().slice(-12);
  const top = topItems.recordset.map((x: any) => ({ itemId: x.itemId, name: x.name, sku: x.sku, qty: Number(x.qty || 0), value: Number(x.value || 0) }));

  res.json({ success: true, data: {
    period,
    fiscalYear: fiscalYear || null,
    from: from || null,
    to: to || null,
    salesTotal: sales,
    purchaseTotal: purchases,
    salesCount: Number(salesCount.recordset[0]?.count || 0),
    purchaseCount: Number(purchaseCount.recordset[0]?.count || 0),
    taxableSales,
    taxablePurchases: Number(p.taxablePurchases || 0),
    outputVat,
    inputVat,
    netVat: outputVat - inputVat,
    cogs,
    grossProfit,
    grossProfitMargin: taxableSales > 0 ? (grossProfit / taxableSales) * 100 : 0,
    totalInventoryValuation,
    totalStockUnits,
    receivables,
    payables,
    warehouseDistribution: warehouseRows,
    lowStockItems: lowStockRows,
    salesByDay: trend,
    topItems: top,
    recentSales: recentSales.recordset,
    recentPurchases: recentPurchases.recordset,
  }});
}));

export default router;
