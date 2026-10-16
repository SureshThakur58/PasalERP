import React, { useState } from 'react';
import { CompanySettings, PurchaseBill, SalesInvoice } from '../types';
import type { IrdComplianceResult, IrdPurchaseBookRow, IrdSalesBookRow, IrdVatSummary } from '../api/repository';
import { repository } from '../api/repository';
import { formatNPR } from '../utils/nepalIrdUtils';
import { buildIrdPurchaseCsv, buildIrdSalesCsv, filterByFiscalYear, validateIrdDocuments } from '../utils/irdCompliance';
import {
  FileSpreadsheet,
  Download,
  Printer,
  ShieldCheck,
  CheckCircle2,
  Calendar,
  Building2,
  HelpCircle
} from 'lucide-react';

interface IrdComplianceModuleProps {
  salesInvoices: SalesInvoice[];
  purchaseBills: PurchaseBill[];
  settings: CompanySettings;
  onViewTaxInvoice: (invoice: SalesInvoice) => void;
  initialSubTab?: 'sales_book' | 'purchase_book' | 'vat_return' | 'regulations';
}

export const IrdComplianceModule: React.FC<IrdComplianceModuleProps> = ({
  salesInvoices,
  purchaseBills,
  settings,
  onViewTaxInvoice,
  initialSubTab = 'sales_book',
}) => {
  const [activeTab, setActiveTab] = useState<'sales_book' | 'purchase_book' | 'vat_return' | 'regulations'>(initialSubTab);
  const [showCurrentFiscalYear, setShowCurrentFiscalYear] = useState(true);
  const [remoteSales, setRemoteSales] = useState<IrdSalesBookRow[]>([]);
  const [remotePurchases, setRemotePurchases] = useState<IrdPurchaseBookRow[]>([]);
  const [remoteVat, setRemoteVat] = useState<IrdVatSummary | null>(null);
  const [remoteCompliance, setRemoteCompliance] = useState<IrdComplianceResult | null>(null);
  const [irdLoading, setIrdLoading] = useState(false);
  const [irdError, setIrdError] = useState<string | null>(null);

  React.useEffect(() => {
    if (initialSubTab) {
      setActiveTab(initialSubTab);
    }
  }, [initialSubTab]);

  const fiscalYear = showCurrentFiscalYear ? settings.fiscalYear : undefined;
  React.useEffect(() => {
    let cancelled = false;
    setIrdLoading(true); setIrdError(null);
    Promise.all([repository.ird.salesBook(fiscalYear), repository.ird.purchaseBook(fiscalYear), repository.ird.vatSummary(fiscalYear), repository.ird.compliance(fiscalYear)])
      .then(([sales, purchases, vat, compliance]) => { if (cancelled) return; setRemoteSales(sales); setRemotePurchases(purchases); setRemoteVat(vat); setRemoteCompliance(compliance); })
      .catch((error) => { if (!cancelled) setIrdError(error instanceof Error ? error.message : 'Unable to load IRD data from the backend.'); })
      .finally(() => { if (!cancelled) setIrdLoading(false); });
    return () => { cancelled = true; };
  }, [fiscalYear]);

  const filteredSales = remoteSales;
  const filteredPurchases = remotePurchases;
  const compliance = remoteCompliance ?? validateIrdDocuments(salesInvoices, purchaseBills, settings);
  const totalSalesGross = remoteVat ? remoteSales.reduce((sum, inv) => sum + inv.grandTotal, 0) : 0;
  const totalSalesTaxable = remoteVat?.taxableSales ?? remoteSales.reduce((sum, inv) => sum + inv.taxableAmount, 0);
  const totalSalesExempt = remoteVat?.exemptSales ?? remoteSales.reduce((sum, inv) => sum + inv.nonTaxableAmount, 0);
  const totalSalesVat = remoteVat?.outputVat ?? remoteSales.reduce((sum, inv) => sum + inv.vatAmount, 0);
  const totalPurchaseGross = remotePurchases.reduce((sum, b) => sum + b.grandTotal, 0);
  const totalPurchaseTaxable = remoteVat?.taxablePurchases ?? remotePurchases.reduce((sum, b) => sum + b.taxableAmount, 0);
  const totalPurchaseExempt = remoteVat?.exemptPurchases ?? remotePurchases.reduce((sum, b) => sum + b.nonTaxableAmount, 0);
  const totalPurchaseVat = remoteVat?.inputVat ?? remotePurchases.reduce((sum, b) => sum + b.vatAmount, 0);
  const netVatPayable = remoteVat?.netVatPayable ?? (totalSalesVat - totalPurchaseVat);
  const isPayable = netVatPayable > 0;
  const handleExportCSV = (type: 'sales' | 'purchase') => {
    const csvContent = type === 'sales' ? buildIrdSalesCsv(filteredSales, settings.vatRate) : buildIrdPurchaseCsv(filteredPurchases, settings.vatRate);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = `Nepal_IRD_${type === 'sales' ? 'Annex_7_Sales_Book' : 'Annex_8_Purchase_Book'}_${settings.fiscalYear.replace('/', '-')}.csv`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {irdLoading && <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-[11px] text-indigo-800">Loading IRD statutory data from SQL Server…</div>}
      {irdError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-800">IRD API unavailable: {irdError}. Cached document data is being used where available.</div>}
      {/* Module Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-3">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-bold tracking-tight text-slate-900">
              Inland Revenue Department (IRD) Nepal Compliance
            </h2>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200" title="मूल्य अभिवृद्धि कर नियमावली २०५३">
              <ShieldCheck className="h-3.5 w-3.5 mr-1" />
              VAT Regulations 2053
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Mandatory statutory books under Nepal Value Added Tax (VAT) Rules: Annex 7 Sales Book & Annex 8 Purchase Book.
          </p>
        </div>

        <div className="flex space-x-2">
          <button
            onClick={() => handleExportCSV(activeTab === 'purchase_book' ? 'purchase' : 'sales')}
            className="inline-flex items-center px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition-colors cursor-pointer"
          >
            <Download className="h-3.5 w-3.5 mr-1.5 text-slate-500" />
            Export to IRD CSV
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
          >
            <Printer className="h-3.5 w-3.5 mr-1.5" />
            Print Statutory Register
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className={`rounded-xl border p-3 ${compliance.errors.length ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'}`}><div className="flex items-center justify-between"><span className="text-xs font-bold text-slate-900">IRD Data Readiness</span><CheckCircle2 className="h-4 w-4 text-emerald-600" /></div><p className="text-[11px] mt-1 text-slate-600">{compliance.errors.length ? `${compliance.errors.length} error(s) require correction.` : 'No blocking reconciliation errors found.'}</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="text-xs font-bold text-slate-900">Document Scope</div><p className="text-[11px] mt-1 text-slate-600">{filteredSales.length} sales · {filteredPurchases.length} purchases · {showCurrentFiscalYear ? settings.fiscalYear : 'All fiscal years'}</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 flex items-center justify-between"><div><div className="text-xs font-bold text-slate-900">Fiscal Year Filter</div><div className="text-[11px] text-slate-500">Statutory registers should normally use the active FY.</div></div><button onClick={() => setShowCurrentFiscalYear(v => !v)} className={`px-2.5 py-1 rounded-md text-[11px] font-semibold ${showCurrentFiscalYear ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'}`}>{showCurrentFiscalYear ? 'Active FY' : 'All FY'}</button></div>
      </div>
      {compliance.errors.length + compliance.warnings.length > 0 && <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between mb-2"><h3 className="text-xs font-bold text-slate-900">IRD Validation Results</h3><span className="text-[10px] text-slate-500">{compliance.errors.length} errors · {compliance.warnings.length} warnings</span></div><div className="space-y-1.5 max-h-40 overflow-y-auto">{[...compliance.errors, ...compliance.warnings].slice(0, 12).map((issue, i) => <div key={`${issue.document}-${i}`} className={`text-[11px] px-2.5 py-1.5 rounded border ${issue.severity === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}><span className="font-bold">{issue.document}:</span> {issue.message}</div>)}</div></div>}

      {/* Sub Tabs */}
      <div className="flex space-x-2 border-b border-slate-200 pb-2">
        <button
          id="tab-ird-annex-7"
          onClick={() => setActiveTab('sales_book')}
          title="अनुसूची ७ - बिक्री खाता"
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center ${
            activeTab === 'sales_book'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />
          Annex 7: Sales Book
        </button>
        <button
          id="tab-ird-annex-8"
          onClick={() => setActiveTab('purchase_book')}
          title="अनुसूची ८ - खरिद खाता"
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center ${
            activeTab === 'purchase_book'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />
          Annex 8: Purchase Book
        </button>
        <button
          id="tab-ird-vat-return"
          onClick={() => setActiveTab('vat_return')}
          title="भ्याट विवरण"
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center ${
            activeTab === 'vat_return'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <ShieldCheck className="h-3.5 w-3.5 mr-1" />
          VAT Return Summary
        </button>
        <button
          id="tab-ird-regulations"
          onClick={() => setActiveTab('regulations')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center ${
            activeTab === 'regulations'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <HelpCircle className="h-3.5 w-3.5 mr-1" />
          Nepal IRD Guidelines
        </button>
      </div>

      {/* Tab 1: Annex 7 Sales Book */}
      {activeTab === 'sales_book' && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50 text-center" title="अनुसूची - ७ (नियम २३ को उपनियम (१) सँग सम्बन्धित) - बिक्री खाता">
            <h3 className="text-sm font-bold text-slate-900 uppercase">
              Annex 7: Sales Book (Rule 23(1) of VAT Regulations, 2053)
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Taxpayer Name: <span className="font-semibold text-slate-900">{settings.companyName}</span> | PAN:{' '}
              <span className="font-mono font-bold text-slate-900">{settings.panNumber}</span> | Fiscal Year: {settings.fiscalYear}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-300 bg-slate-100 text-slate-800 font-semibold text-center">
                  <th className="py-2.5 px-2 border-r border-slate-200 w-24" title="मिति">Miti (B.S.)</th>
                  <th className="py-2.5 px-2 border-r border-slate-200 w-32" title="बीजक नं.">Invoice No</th>
                  <th className="py-2.5 px-3 border-r border-slate-200 text-left" title="खरिदकर्ताको नाम">Buyer Name</th>
                  <th className="py-2.5 px-2 border-r border-slate-200 w-28" title="खरिदकर्ताको स्थायी लेखा नम्बर">Buyer PAN</th>
                  <th className="py-2.5 px-2 border-r border-slate-200 text-right" title="कुल बिक्री">Total Sales</th>
                  <th className="py-2.5 px-2 border-r border-slate-200 text-right" title="कर छुट बिक्री">Exempt Sales</th>
                  <th className="py-2.5 px-2 border-r border-slate-200 text-right" title="करयोग्य बिक्री">Taxable Sales</th>
                  <th className="py-2.5 px-2 border-r border-slate-200 text-right" title="कर रकम">13% VAT</th>
                  <th className="py-2.5 px-2 text-center w-16" title="बीजक">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono">
                {filteredSales.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2 px-2 border-r border-slate-200 text-center font-sans text-slate-700">
                      {inv.mitiDate}
                    </td>
                    <td className="py-2 px-2 border-r border-slate-200 text-center font-bold text-slate-900">
                      {inv.invoiceNo}
                    </td>
                    <td className="py-2 px-3 border-r border-slate-200 font-sans font-medium text-slate-900 text-left">
                      {inv.customerName}
                    </td>
                    <td className="py-2 px-2 border-r border-slate-200 text-center text-slate-700">
                      {inv.customerPan || 'N/A'}
                    </td>
                    <td className="py-2 px-2 border-r border-slate-200 text-right font-bold text-slate-900">
                      {formatNPR(inv.grandTotal)}
                    </td>
                    <td className="py-2 px-2 border-r border-slate-200 text-right text-slate-500">
                      {inv.nonTaxableAmount > 0 ? formatNPR(inv.nonTaxableAmount) : '0.00'}
                    </td>
                    <td className="py-2 px-2 border-r border-slate-200 text-right font-medium text-slate-800">
                      {formatNPR(inv.taxableAmount)}
                    </td>
                    <td className="py-2 px-2 border-r border-slate-200 text-right font-bold text-indigo-700">
                      {formatNPR(inv.vatAmount)}
                    </td>
                    <td className="py-2 px-2 text-center font-sans">
                      <button
                        onClick={() => { const full = salesInvoices.find((row) => row.invoiceNo === inv.invoiceNo); if (full) onViewTaxInvoice(full); }}
                        className="text-indigo-600 hover:text-indigo-800 font-medium underline cursor-pointer"
                        title="View Official Tax Invoice"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-900 bg-slate-100 font-bold font-mono text-xs">
                  <td colSpan={4} className="py-3 px-3 border-r border-slate-200 font-sans text-slate-900">
                    Annex 7 Grand Total:
                  </td>
                  <td className="py-3 px-2 border-r border-slate-200 text-right text-slate-950 font-extrabold">
                    {formatNPR(totalSalesGross)}
                  </td>
                  <td className="py-3 px-2 border-r border-slate-200 text-right text-slate-600">
                    {formatNPR(totalSalesExempt)}
                  </td>
                  <td className="py-3 px-2 border-r border-slate-200 text-right text-slate-950 font-extrabold">
                    {formatNPR(totalSalesTaxable)}
                  </td>
                  <td className="py-3 px-2 border-r border-slate-200 text-right text-indigo-900 font-extrabold">
                    {formatNPR(totalSalesVat)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Annex 8 Purchase Book */}
      {activeTab === 'purchase_book' && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50 text-center" title="अनुसूची - ८ (नियम २३ को उपनियम (१) सँग सम्बन्धित) - खरिद खाता">
            <h3 className="text-sm font-bold text-slate-900 uppercase">
              Annex 8: Purchase Book (Rule 23(1) of VAT Regulations, 2053)
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Taxpayer Name: <span className="font-semibold text-slate-900">{settings.companyName}</span> | PAN:{' '}
              <span className="font-mono font-bold text-slate-900">{settings.panNumber}</span> | Fiscal Year: {settings.fiscalYear}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-300 bg-slate-100 text-slate-800 font-semibold text-center">
                  <th className="py-2.5 px-2 border-r border-slate-200 w-24" title="मिति">Miti (B.S.)</th>
                  <th className="py-2.5 px-2 border-r border-slate-200 w-32" title="आपूर्तिकर्ताको बिल नं">Supplier Invoice No</th>
                  <th className="py-2.5 px-3 border-r border-slate-200 text-left" title="आपूर्तिकर्ताको नाम">Supplier Name</th>
                  <th className="py-2.5 px-2 border-r border-slate-200 w-28" title="आपूर्तिकर्ताको स्थायी लेखा नम्बर">Supplier PAN</th>
                  <th className="py-2.5 px-2 border-r border-slate-200 text-right" title="कुल खरिद">Total Purchase</th>
                  <th className="py-2.5 px-2 border-r border-slate-200 text-right" title="कर छुट रकम">Exempt Amount</th>
                  <th className="py-2.5 px-2 border-r border-slate-200 text-right" title="करयोग्य खरिद">Taxable Purchase</th>
                  <th className="py-2.5 px-2 text-right" title="दाबी योग्य कर">{settings.vatRate}% Input VAT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono">
                {filteredPurchases.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2 px-2 border-r border-slate-200 text-center font-sans text-slate-700">
                      {b.mitiDate}
                    </td>
                    <td className="py-2 px-2 border-r border-slate-200 text-center font-bold text-slate-900">
                      {b.supplierBillNo}
                    </td>
                    <td className="py-2 px-3 border-r border-slate-200 font-sans font-medium text-slate-900 text-left">
                      {b.vendorName}
                    </td>
                    <td className="py-2 px-2 border-r border-slate-200 text-center text-slate-700">
                      {b.vendorPan}
                    </td>
                    <td className="py-2 px-2 border-r border-slate-200 text-right font-bold text-slate-900">
                      {formatNPR(b.grandTotal)}
                    </td>
                    <td className="py-2 px-2 border-r border-slate-200 text-right text-slate-500">
                      {b.nonTaxableAmount > 0 ? formatNPR(b.nonTaxableAmount) : '0.00'}
                    </td>
                    <td className="py-2 px-2 border-r border-slate-200 text-right font-medium text-slate-800">
                      {formatNPR(b.taxableAmount)}
                    </td>
                    <td className="py-2 px-2 text-right font-bold text-indigo-700">
                      {formatNPR(b.vatAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-900 bg-slate-100 font-bold font-mono text-xs">
                  <td colSpan={4} className="py-3 px-3 border-r border-slate-200 font-sans text-slate-900">
                    Annex 8 Grand Total:
                  </td>
                  <td className="py-3 px-2 border-r border-slate-200 text-right text-slate-950 font-extrabold">
                    {formatNPR(totalPurchaseGross)}
                  </td>
                  <td className="py-3 px-2 border-r border-slate-200 text-right text-slate-600">
                    {formatNPR(totalPurchaseExempt)}
                  </td>
                  <td className="py-3 px-2 border-r border-slate-200 text-right text-slate-950 font-extrabold">
                    {formatNPR(totalPurchaseTaxable)}
                  </td>
                  <td className="py-3 px-2 text-right text-indigo-900 font-extrabold">
                    {formatNPR(totalPurchaseVat)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: VAT Return Summary */}
      {activeTab === 'vat_return' && (
        <div className="max-w-2xl mx-auto rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-center border-b border-slate-200 pb-4 mb-6" title="मूल्य अभिवृद्धि कर विवरण">
            <h3 className="text-base font-bold text-slate-950 uppercase">
              Nepal VAT Return Calculation
            </h3>
            <p className="text-xs text-slate-500">
              Tax Period: Fiscal Year {settings.fiscalYear} | Section 18 of VAT Act, 2052
            </p>
          </div>

          <div className="space-y-4 text-xs font-sans">
            {/* Output VAT */}
            <div className="border border-slate-200 rounded-lg p-3 space-y-2">
              <div className="font-bold text-slate-900 uppercase tracking-wide">
                1. Output VAT on Sales (Annex 7)
              </div>
              <div className="flex justify-between pl-4 text-slate-700">
                <span>Total Taxable Sales:</span>
                <span className="font-mono font-medium">{formatNPR(totalSalesTaxable)}</span>
              </div>
              <div className="flex justify-between pl-4 text-indigo-700 font-bold border-t border-slate-100 pt-1">
                <span>Output VAT Collected @ {settings.vatRate}%:</span>
                <span className="font-mono">{formatNPR(totalSalesVat)}</span>
              </div>
            </div>

            {/* Input VAT */}
            <div className="border border-slate-200 rounded-lg p-3 space-y-2">
              <div className="font-bold text-slate-900 uppercase tracking-wide">
                2. Input VAT on Purchases (Annex 8)
              </div>
              <div className="flex justify-between pl-4 text-slate-700">
                <span>Total Taxable Purchases:</span>
                <span className="font-mono font-medium">{formatNPR(totalPurchaseTaxable)}</span>
              </div>
              <div className="flex justify-between pl-4 text-indigo-700 font-bold border-t border-slate-100 pt-1">
                <span>Input VAT Claimable @ {settings.vatRate}%:</span>
                <span className="font-mono">{formatNPR(totalPurchaseVat)}</span>
              </div>
            </div>

            {/* Net Calculation */}
            <div className="rounded-lg bg-indigo-50 border-2 border-indigo-600 p-4 space-y-2">
              <div className="flex justify-between items-center text-sm font-extrabold text-slate-900">
                <span>
                  {isPayable ? '3. Net VAT Payable to IRD:' : '3. VAT Credit / Refund Receivable:'}
                </span>
                <span className={`text-base font-mono ${isPayable ? 'text-indigo-900' : 'text-blue-900'}`}>
                  {formatNPR(Math.abs(netVatPayable))}
                </span>
              </div>
              <p className="text-[11px] text-slate-600">
                Calculation: Output VAT ({formatNPR(totalSalesVat)}) - Input VAT ({formatNPR(totalPurchaseVat)}) ={' '}
                {formatNPR(netVatPayable)}
              </p>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 text-[11px] leading-relaxed">
              <strong>E-filing Instruction:</strong> File this return by the 25th of the following month on the
              Inland Revenue Department official portal{' '}
              <a
                href="https://taxpayerportal.ird.gov.np"
                target="_blank"
                rel="noreferrer"
                className="text-indigo-600 underline font-semibold hover:text-indigo-800"
              >
                taxpayerportal.ird.gov.np
              </a>{' '}
              under VAT Return submission.
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Nepal IRD Regulations Reference */}
      {activeTab === 'regulations' && (
        <div className="max-w-3xl mx-auto rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4 text-xs text-slate-700 leading-relaxed">
          <h3 className="text-base font-bold text-slate-900 border-b border-slate-200 pb-2">
            Nepal Inland Revenue Department (IRD) Standards for Garments & Retail SMEs
          </h3>

          <div className="space-y-3">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <h4 className="font-bold text-slate-900 text-sm mb-1">1. Permanent Account Number (PAN) Mandate</h4>
              <p>
                Every registered business partner in Nepal must have a unique 9-digit numeric PAN issued by the Inland
                Revenue Department. Purchases from unregistered suppliers or sales exceeding Rs. 10,000 without customer
                PAN must be monitored as per Nepal Finance Act regulations.
              </p>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <h4 className="font-bold text-slate-900 text-sm mb-1">2. Standard Tax Invoicing</h4>
              <p>
                Invoices must be generated in chronological and sequential order (e.g. INV-2081/82-0001) without gaps or
                duplication. As mandated, invoices must state the Seller PAN, Buyer PAN, Taxable Amount, 13% VAT, and
                amount in words.
              </p>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <h4 className="font-bold text-slate-900 text-sm mb-1">3. Automated Financial Posting Norms</h4>
              <p>
                Nepal Accounting Standards (NAS for SMEs) require double-entry bookkeeping where sales directly recognize
                receivables/cash debit, output VAT payable credit, sales revenue credit, and simultaneously debit Cost of
                Goods Sold (COGS) while crediting the inventory asset under the FIFO cost formula.
              </p>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <h4 className="font-bold text-slate-900 text-sm mb-1">4. First-In, First-Out (FIFO) Valuation</h4>
              <p>
                Garment retailers stock multiple batches of apparel purchased at varying supplier price points over the
                seasons. Under FIFO, the oldest inward batches are deemed to be sold first, ensuring on-hand inventory is
                valued at the most recent acquisition costs on the Balance Sheet.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
