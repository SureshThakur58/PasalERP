import React, { useEffect, useMemo } from 'react';
import {
  BusinessPartner,
  CompanySettings,
  FIFOBatch,
  GarmentItem,
  PurchaseBill,
  SalesInvoice,
  Warehouse
} from '../types';
import { formatNPR } from '../utils/nepalIrdUtils';
import { getItemStock, getInventoryValuation } from '../utils/accountingEngine';
import type { DashboardReport } from '../api/repository';
import { downloadCsv } from '../utils/csv';
import { ActiveTab } from './Sidebar';
import {
  ShoppingCart,
  ShoppingBag,
  Package,
  TrendingUp,
  FileCheck,
  ShieldCheck,
  Building2,
  Users,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  FileText,
  Calendar,
  Layers,
  Database,
  Eye,
  CheckCircle2,
  Receipt,
  Sparkles,
  Download,
  BarChart3,
  PieChart,
  RefreshCcw
} from 'lucide-react';

interface DashboardModuleProps {
  salesInvoices: SalesInvoice[];
  purchaseBills: PurchaseBill[];
  items: GarmentItem[];
  partners: BusinessPartner[];
  warehouses: Warehouse[];
  batches: FIFOBatch[];
  settings: CompanySettings;
  setActiveTab: (tab: ActiveTab) => void;
  onViewTaxInvoice: (invoice: SalesInvoice) => void;
  onViewPurchaseBill: (bill: PurchaseBill) => void;
  setMasterDataSubTab?: (subTab: 'item_master' | 'bp_master') => void;
  onLoadDashboardReport?: (period: 'fiscal_year' | 'all' | 'custom', fiscalYear?: string, from?: string, to?: string) => Promise<DashboardReport>;
}

export const DashboardModule: React.FC<DashboardModuleProps> = ({
  salesInvoices,
  purchaseBills,
  items,
  partners,
  warehouses,
  batches,
  settings,
  setActiveTab,
  onViewTaxInvoice,
  onViewPurchaseBill,
  setMasterDataSubTab,
  onLoadDashboardReport,
}) => {
  const [reportPeriod, setReportPeriod] = React.useState<'fiscal_year' | 'all' | 'custom'>('fiscal_year');
  const [reportFrom, setReportFrom] = React.useState('');
  const [reportTo, setReportTo] = React.useState('');

  const localReportData = useMemo(() => {
    const inRange = (adDate: string, fiscalYear: string) => {
      if (reportPeriod === 'fiscal_year') return fiscalYear === settings.fiscalYear;
      if (reportPeriod === 'all') return true;
      if (reportFrom && adDate < reportFrom) return false;
      if (reportTo && adDate > reportTo) return false;
      return true;
    };
    const sales = salesInvoices.filter(x => inRange(x.adDate, x.fiscalYear));
    const purchases = purchaseBills.filter(x => inRange(x.adDate, x.fiscalYear));
    const salesByDay = new Map<string, { sales: number; cogs: number; vat: number }>();
    for (const inv of sales) {
      const sign = inv.transactionType === 'sales_return' || inv.transactionType === 'credit_note' ? -1 : 1;
      const row = salesByDay.get(inv.adDate) ?? { sales: 0, cogs: 0, vat: 0 };
      row.sales += sign * inv.grandTotal; row.cogs += sign * inv.totalCogs || 0; row.vat += sign * inv.vatAmount;
      salesByDay.set(inv.adDate, row);
    }
    const itemSales = new Map<string, { name: string; sku: string; qty: number; value: number }>();
    for (const inv of sales) for (const line of inv.items) {
      const sign = inv.transactionType === 'sales_return' || inv.transactionType === 'credit_note' ? -1 : 1;
      const row = itemSales.get(line.itemId) ?? { name: line.name, sku: line.sku, qty: 0, value: 0 };
      row.qty += sign * line.quantity; row.value += sign * line.lineTotal; itemSales.set(line.itemId, row);
    }
    const salesTotal = sales.reduce((a, x) => a + ((x.transactionType === 'sales_return' || x.transactionType === 'credit_note') ? -x.grandTotal : x.grandTotal), 0);
    const purchaseTotal = purchases.reduce((a, x) => a + ((x.transactionType === 'purchase_return' || x.transactionType === 'credit_note') ? -x.grandTotal : x.grandTotal), 0);
    const outputVat = sales.reduce((a, x) => a + ((x.transactionType === 'sales_return' || x.transactionType === 'credit_note') ? -x.vatAmount : x.vatAmount), 0);
    const inputVat = purchases.reduce((a, x) => a + ((x.transactionType === 'purchase_return' || x.transactionType === 'credit_note') ? -x.vatAmount : x.vatAmount), 0);
    const cogs = sales.reduce((a, x) => a + (x.transactionType === 'sales_return' ? -(x.totalCogs || 0) : (x.totalCogs || 0)), 0);
    const taxableSales = sales.reduce((a, x) => a + ((x.transactionType === 'sales_return' || x.transactionType === 'credit_note') ? -x.taxableAmount : x.taxableAmount), 0);
    return { sales, purchases, salesTotal, purchaseTotal, salesCount: sales.length, purchaseCount: purchases.length, taxableSales, taxablePurchases: purchases.reduce((a,x)=>a+((x.transactionType==='purchase_return'||x.transactionType==='credit_note')?-x.taxableAmount:x.taxableAmount),0), outputVat, inputVat, netVat: outputVat-inputVat, cogs, grossProfit: taxableSales-cogs, grossProfitMargin: taxableSales>0?((taxableSales-cogs)/taxableSales)*100:0, salesByDay: [...salesByDay.entries()].sort((a,b)=>a[0].localeCompare(b[0])).slice(-12).map(([date, row]) => ({ date, ...row })), topItems: [...itemSales.values()].sort((a,b)=>b.value-a.value).slice(0,8) };
  }, [salesInvoices, purchaseBills, reportPeriod, reportFrom, reportTo, settings.fiscalYear]);

  const [remoteReport, setRemoteReport] = React.useState<DashboardReport | null>(null);
  useEffect(() => {
    let cancelled = false;
    setRemoteReport(null);
    if (!onLoadDashboardReport) return;
    onLoadDashboardReport(reportPeriod, settings.fiscalYear, reportPeriod === 'custom' ? reportFrom : undefined, reportPeriod === 'custom' ? reportTo : undefined)
      .then(data => { if (!cancelled) setRemoteReport(data); })
      .catch(() => { if (!cancelled) setRemoteReport(null); });
    return () => { cancelled = true; };
  }, [onLoadDashboardReport, reportPeriod, reportFrom, reportTo, settings.fiscalYear]);

  const reportData = remoteReport ?? localReportData;


  const exportManagementReport = () => {
    const rows: Array<Array<string | number>> = [
      ['Sales', reportData.salesTotal],
      ['Purchases', reportData.purchaseTotal],
      ['Output VAT', reportData.outputVat],
      ['Input VAT', reportData.inputVat],
      ['Net VAT', reportData.outputVat - reportData.inputVat],
      ['COGS', reportData.cogs],
      ['Gross Profit', reportData.grossProfit],
    ];
    downloadCsv(`management-report-${settings.fiscalYear.replace('/', '-')}.csv`, ['Metric', 'Amount NPR'], rows);
  };

  // Financial Metrics Calculation
  const totalSalesAmount = reportData.salesTotal;
  const totalSalesTaxable = reportData.taxableSales;
  const totalOutputVat = reportData.outputVat;
  const totalPurchaseAmount = reportData.purchaseTotal;
  const totalPurchaseTaxable = reportData.taxablePurchases;
  const totalInputVat = reportData.inputVat;
  const netVatPosition = reportData.netVat;
  const totalInventoryValuation = remoteReport?.totalInventoryValuation ?? getInventoryValuation(batches);
  const totalStockUnits = remoteReport?.totalStockUnits ?? batches.reduce((sum, b) => sum + b.remainingQty, 0);
  const totalCogs = reportData.cogs;
  const estimatedGrossProfit = reportData.grossProfit;
  const grossProfitMargin = reportData.grossProfitMargin;
  const totalReceivables = remoteReport?.receivables ?? partners.filter((p) => p.currentBalance > 0).reduce((acc, p) => acc + p.currentBalance, 0);
  const totalPayables = remoteReport?.payables ?? partners.filter((p) => p.currentBalance < 0).reduce((acc, p) => acc + Math.abs(p.currentBalance), 0);

  // Low Stock Items
  const lowStockItems = remoteReport
    ? remoteReport.lowStockItems.map(row => ({ item: items.find(i => i.id === row.id) ?? ({ id: row.id, sku: row.sku, name: row.name, size: row.size, color: row.color, minStockAlert: row.minStockAlert } as GarmentItem), stock: row.stock }))
    : items.map((item) => ({ item, stock: getItemStock(batches, item.id) })).filter(({ item, stock }) => stock < item.minStockAlert);

  const warehouseDistribution = remoteReport?.warehouseDistribution ?? warehouses.map((wh) => {
    const whBatches = batches.filter((b) => b.warehouseId === wh.id);
    return { ...wh, units: whBatches.reduce((acc, b) => acc + b.remainingQty, 0), value: getInventoryValuation(batches, undefined, wh.id) };
  });

  const recentSales = remoteReport?.recentSales ?? [...salesInvoices].reverse().slice(0, 5);
  const recentPurchases = remoteReport?.recentPurchases ?? [...purchaseBills].reverse().slice(0, 5);

  return (
    <div className="space-y-6">
      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Sales Invoices */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition-hover hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Sales
            </span>
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <ShoppingCart className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 tracking-tight">
              {formatNPR(totalSalesAmount)}
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500 mt-1">
              <span>{salesInvoices.length} Tax Invoices</span>
              <span className="font-semibold text-indigo-600 cursor-pointer" onClick={() => setActiveTab('sales')}>
                Register →
              </span>
            </div>
          </div>
        </div>

        {/* Purchase Bills */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition-hover hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Purchases
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ShoppingBag className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 tracking-tight">
              {formatNPR(totalPurchaseAmount)}
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500 mt-1">
              <span>{reportData.purchaseCount} Supplier Bills</span>
              <span className="font-semibold text-emerald-600 cursor-pointer" onClick={() => setActiveTab('purchase')}>
                Inward →
              </span>
            </div>
          </div>
        </div>

        {/* Inventory FIFO Valuation */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition-hover hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Stock Valuation (FIFO)
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Package className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 tracking-tight">
              {formatNPR(totalInventoryValuation)}
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500 mt-1">
              <span>{totalStockUnits.toLocaleString()} Pcs in Stock</span>
              <span className="font-semibold text-amber-600 cursor-pointer" onClick={() => setActiveTab('inventory')}>
                Warehouses →
              </span>
            </div>
          </div>
        </div>

        {/* IRD Net VAT Position */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition-hover hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Net 13% VAT Position
            </span>
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                netVatPosition >= 0 ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'
              }`}
            >
              <FileCheck className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 tracking-tight">
              {formatNPR(Math.abs(netVatPosition))}
            </div>
            <div className="flex items-center justify-between text-xs mt-1">
              <span className={`font-semibold ${netVatPosition >= 0 ? 'text-purple-700' : 'text-blue-700'}`}>
                {netVatPosition >= 0 ? 'VAT Payable to IRD' : 'VAT Input Credit'}
              </span>
              <span className="font-semibold text-slate-600 cursor-pointer" onClick={() => setActiveTab('ird')}>
                Annex 7/8 →
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Secondary Financial Indicators Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Estimated Gross Profit */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500">Gross Margin & Profitability</div>
            <div className="text-lg font-bold text-slate-900 mt-0.5">
              {formatNPR(estimatedGrossProfit)}
            </div>
            <div className="text-xs text-emerald-600 font-medium">
              Margin: {grossProfitMargin.toFixed(1)}% on taxable turnover
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600">
            <TrendingUp className="h-6 w-6" />
          </div>
        </div>

        {/* Trade Receivables */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500">Trade Receivables (Debtors)</div>
            <div className="text-lg font-bold text-slate-900 mt-0.5">
              {formatNPR(totalReceivables)}
            </div>
            <div className="text-xs text-indigo-600 font-medium">
              Receivable from buyers & clients
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600">
            <ArrowDownRight className="h-6 w-6" />
          </div>
        </div>

        {/* Trade Payables */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500">Trade Payables (Creditors)</div>
            <div className="text-lg font-bold text-slate-900 mt-0.5">
              {formatNPR(totalPayables)}
            </div>
            <div className="text-xs text-rose-600 font-medium">
              Payable to garment mills & vendors
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600">
            <ArrowUpRight className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Warehouse Distribution & Low Stock Alerts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Multi-Warehouse Stock Status */}
        <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-indigo-600" />
                Multi-Warehouse Stock Valuation
              </h3>
              <p className="text-xs text-slate-500">
                Real-time stock valuation per outlet based on physical FIFO lots
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('inventory')}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
            >
              Stock Transfers →
            </button>
          </div>

          <div className="space-y-3">
            {warehouseDistribution.map((wh) => {
              const share =
                totalInventoryValuation > 0
                  ? Math.round((wh.value / totalInventoryValuation) * 100)
                  : 0;
              return (
                <div
                  key={wh.id}
                  className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/70 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <div className="font-bold text-slate-800 flex items-center gap-2">
                      <span>{wh.name}</span>
                      {wh.isDefault && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] bg-indigo-100 text-indigo-800 font-medium">
                          Primary Outlet
                        </span>
                      )}
                    </div>
                    <div className="font-mono font-bold text-slate-900">
                      {formatNPR(wh.value)}
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-indigo-600 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${share}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                    <span>{wh.units.toLocaleString()} units in lot storage</span>
                    <span>{share}% of total inventory</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Low Stock Items Alert Widget */}
        <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Low Stock Alerts
              </h3>
              <p className="text-xs text-slate-500">
                {lowStockItems.length} items requiring immediate procurement
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (setMasterDataSubTab) setMasterDataSubTab('item_master');
                setActiveTab('master_data');
              }}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
            >
              Item Master →
            </button>
          </div>

          <div className="flex-1 space-y-2.5 overflow-y-auto max-h-72 pr-1">
            {lowStockItems.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs">
                <CheckCircle2 className="h-8 w-8 mx-auto text-emerald-500 mb-2" />
                All garment inventory levels are healthy and above alert thresholds.
              </div>
            ) : (
              lowStockItems.map(({ item, stock }) => (
                <div
                  key={item.id}
                  className="p-3 rounded-xl border border-amber-200 bg-amber-50/50 flex items-center justify-between text-xs"
                >
                  <div className="min-w-0 pr-2">
                    <div className="font-bold text-slate-900 truncate">{item.name}</div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                      <span className="font-mono">{item.sku}</span>
                      <span>•</span>
                      <span>Size: {item.size}</span>
                      <span>•</span>
                      <span>{item.color}</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-bold font-mono text-amber-700">
                      {stock} / {item.minStockAlert} pcs
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('purchase')}
                      className="mt-1 px-2 py-0.5 text-[10px] font-semibold text-white bg-indigo-600 rounded hover:bg-indigo-700 transition-colors"
                    >
                      Restock +
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Recent Activity: Recent Sales & Inward Purchases */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Tax Invoices */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Receipt className="h-4 w-4 text-indigo-600" />
                Recent Sales Tax Invoices
              </h3>
              <p className="text-xs text-slate-500">
                Official Nepal IRD sequential sales records
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('sales')}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
            >
              All Invoices ({reportData.salesCount}) →
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {recentSales.map((inv) => (
              <div
                key={inv.id}
                className="py-3 flex items-center justify-between text-xs hover:bg-slate-50/80 px-2 rounded-lg transition-colors"
              >
                <div>
                  <div className="font-mono font-bold text-indigo-600">{inv.invoiceNo}</div>
                  <div className="text-slate-800 font-medium truncate max-w-[200px]">
                    {inv.customerName}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Date: {inv.mitiDate} ({inv.paymentMode})
                  </div>
                </div>

                <div className="flex items-center space-x-3 text-right">
                  <div>
                    <div className="font-bold text-slate-900">{formatNPR(inv.grandTotal)}</div>
                    <div className="text-[10px] text-slate-400">
                      VAT: {formatNPR(inv.vatAmount)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onViewTaxInvoice(inv)}
                    title="View & Print Official Nepal IRD Tax Invoice"
                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 transition-colors"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Inward Purchases */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-emerald-600" />
                Recent Inward Purchase Bills
              </h3>
              <p className="text-xs text-slate-500">
                Supplier deliveries entered into Annex 8 Purchase Book
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('purchase')}
              className="text-xs font-semibold text-emerald-600 hover:text-emerald-800"
            >
              All Purchases ({purchaseBills.length}) →
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {recentPurchases.map((bill) => (
              <div
                key={bill.id}
                className="py-3 flex items-center justify-between text-xs hover:bg-slate-50/80 px-2 rounded-lg transition-colors"
              >
                <div>
                  <div className="font-mono font-bold text-emerald-700">{bill.billNo}</div>
                  <div className="text-slate-800 font-medium truncate max-w-[200px]">
                    {bill.vendorName}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Supp. Bill: {bill.supplierBillNo} | Date: {bill.mitiDate}
                  </div>
                </div>

                <div className="flex items-center space-x-3 text-right">
                  <div>
                    <div className="font-bold text-slate-900">{formatNPR(bill.grandTotal)}</div>
                    <div className="text-[10px] text-slate-500">
                      Input VAT: {formatNPR(bill.vatAmount)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onViewPurchaseBill(bill)}
                    title="View & Print Purchase Bill"
                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-emerald-50 text-slate-600 hover:text-emerald-600 transition-colors"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Management Dashboard & Reports */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-5">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><BarChart3 className="h-4 w-4 text-indigo-600" /> Management Dashboard & Reports</h3>
            <p className="text-xs text-slate-500 mt-1">Sales, purchases, VAT, COGS and top-selling garment analysis.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={reportPeriod} onChange={e => setReportPeriod(e.target.value as typeof reportPeriod)} className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs bg-white">
              <option value="fiscal_year">Current Fiscal Year ({settings.fiscalYear})</option>
              <option value="all">All Transactions</option>
              <option value="custom">Custom AD Date Range</option>
            </select>
            {reportPeriod === 'custom' && <><input type="date" value={reportFrom} onChange={e=>setReportFrom(e.target.value)} className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs" /><input type="date" value={reportTo} onChange={e=>setReportTo(e.target.value)} className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs" /></>}
            <button type="button" onClick={exportManagementReport} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"><Download className="h-3.5 w-3.5" /> Export Summary</button>
            <button type="button" onClick={()=>{setReportPeriod('fiscal_year');setReportFrom('');setReportTo('')}} title="Reset report filters" className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><RefreshCcw className="h-3.5 w-3.5" /></button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {[['Sales', reportData.salesTotal, 'text-indigo-700'], ['Purchases', reportData.purchaseTotal, 'text-emerald-700'], ['Net VAT', reportData.outputVat-reportData.inputVat, reportData.outputVat-reportData.inputVat>=0?'text-purple-700':'text-blue-700'], ['Gross Profit', reportData.salesTotal-reportData.outputVat-reportData.cogs, 'text-emerald-700']].map(([label,value,cls])=><div key={String(label)} className="rounded-xl border border-slate-100 bg-slate-50 p-3"><div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">{label}</div><div className={`mt-1 text-base font-black ${cls}`}>{formatNPR(Number(value))}</div></div>)}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="rounded-xl border border-slate-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between"><div className="text-xs font-bold text-slate-800 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-indigo-600" /> Sales Trend</div><span className="text-[10px] text-slate-400">Last 12 transaction dates</span></div>
            <div className="p-3 space-y-2">
              {reportData.salesByDay.length===0 ? <div className="py-8 text-center text-xs text-slate-400">No sales in selected period.</div> : reportData.salesByDay.map((row)=><div key={row.date} className="flex items-center gap-3 text-xs"><span className="w-24 font-mono text-slate-500">{row.date}</span><div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-indigo-600 rounded-full" style={{width:`${reportData.salesTotal ? Math.min(100,(row.sales/reportData.salesTotal)*100*3):0}%`}} /></div><span className="w-28 text-right font-semibold text-slate-800">{formatNPR(row.sales)}</span></div>)}
            </div>
          </div>

          <div className="rounded-xl border border-slate-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between"><div className="text-xs font-bold text-slate-800 flex items-center gap-2"><PieChart className="h-4 w-4 text-purple-600" /> Top Selling Items</div><span className="text-[10px] text-slate-400">By sales value</span></div>
            <div className="divide-y divide-slate-100">
              {reportData.topItems.length===0 ? <div className="py-8 text-center text-xs text-slate-400">No item sales in selected period.</div> : reportData.topItems.map((item,i)=><div key={item.sku} className="px-4 py-2.5 flex items-center justify-between text-xs"><div className="flex items-center gap-2 min-w-0"><span className="w-5 text-slate-400 font-bold">{i+1}</span><div className="min-w-0"><div className="font-semibold text-slate-800 truncate">{item.name}</div><div className="text-[10px] text-slate-400 font-mono">{item.sku} · {item.qty} pcs</div></div></div><span className="font-bold text-slate-900">{formatNPR(item.value)}</span></div>)}
            </div>
          </div>
        </div>
      </section>

      {/* Statutory IRD Regulatory Footer Alert */}
      <div className="p-4 rounded-xl bg-slate-100 border border-slate-200 text-xs text-slate-600 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-2">
          <ShieldCheck className="h-5 w-5 text-indigo-600 flex-shrink-0" />
          <span>
            <strong>Nepal IRD E-Billing Directive 2077:</strong> All sales and purchase transactions maintain strict sequential numbering, non-erasable audit logs, and automatic dual-entry journal posting.
          </span>
        </div>
        <button
          type="button"
          onClick={() => setActiveTab('ird')}
          className="whitespace-nowrap font-bold text-indigo-700 hover:text-indigo-900 cursor-pointer"
        >
          View IRD Annex 7 & 8 →
        </button>
      </div>
    </div>
  );
};
