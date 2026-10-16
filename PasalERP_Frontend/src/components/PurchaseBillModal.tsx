import React from 'react';
import { PurchaseBill, CompanySettings } from '../types';
import { amountToWordsNPR, formatNPR } from '../utils/nepalIrdUtils';
import { Printer, X, CheckCircle2, FileText } from 'lucide-react';

interface PurchaseBillModalProps {
  bill: PurchaseBill | null;
  settings: CompanySettings;
  onClose: () => void;
}

export const PurchaseBillModal: React.FC<PurchaseBillModalProps> = ({ bill, settings, onClose }) => {
  if (!bill) return null;

  const handlePrint = () => window.print();
  const words = amountToWordsNPR(bill.grandTotal);
  const txType = bill.transactionType || 'purchase_invoice';
  const title = txType === 'purchase_invoice'
    ? 'PURCHASE BILL'
    : txType === 'purchase_return'
      ? 'PURCHASE RETURN'
      : txType === 'debit_note'
        ? 'PURCHASE DEBIT NOTE'
        : 'PURCHASE CREDIT NOTE';
  const vatLabel = settings.businessNature === 'PAN' && bill.isCapitalizedVat
    ? 'Capitalized VAT'
    : 'Input VAT';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-4xl rounded-xl bg-white shadow-2xl border border-slate-200 my-6">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-3 bg-slate-50 rounded-t-xl print:hidden">
          <div className="flex items-center space-x-2">
            <span className="inline-flex items-center rounded-md bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
              Purchase Posted
            </span>
            <span className="text-xs text-slate-500 font-medium">Fiscal Year: {bill.fiscalYear}</span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              id="print-purchase-bill-btn"
              onClick={handlePrint}
              className="inline-flex items-center rounded-lg bg-indigo-600 px-3.5 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 transition-colors cursor-pointer"
            >
              <Printer className="mr-1.5 h-4 w-4" />
              Print / Save PDF
            </button>
            <button
              id="close-purchase-bill-modal-btn"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors cursor-pointer"
              title="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="p-8 text-slate-800 font-sans" id="printable-purchase-bill">
          <div className="text-center pb-4 border-b border-slate-800">
            <div className="inline-flex items-center gap-1 px-3 py-0.5 border border-slate-800 text-xs font-bold uppercase tracking-wider mb-1">
              <FileText className="h-3.5 w-3.5" />
              {title}
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-950 uppercase">{settings.companyName}</h1>
            <p className="text-xs text-slate-600">{settings.address}, {settings.city}, Nepal</p>
            <p className="text-xs text-slate-600">Tel: {settings.phone} | Email: {settings.email}</p>
            <div className="mt-2 inline-flex items-center justify-center border-2 border-slate-900 px-4 py-1 text-sm font-extrabold bg-slate-50">
              <span className="text-xs font-medium mr-2">PAN / VAT No.:</span>
              <span className="tracking-widest font-mono text-base">{settings.panNumber}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 py-4 text-xs border-b border-slate-300">
            <div className="space-y-1.5">
              <div className="flex"><span className="w-36 font-semibold text-slate-600">Internal Bill No:</span><span className="font-bold text-slate-900">{bill.billNo}</span></div>
              <div className="flex"><span className="w-36 font-semibold text-slate-600">Supplier Bill No:</span><span className="font-bold text-slate-900">{bill.supplierBillNo || 'N/A'}</span></div>
              <div className="flex"><span className="w-36 font-semibold text-slate-600">Miti (B.S.):</span><span className="font-medium">{bill.mitiDate}</span></div>
              <div className="flex"><span className="w-36 font-semibold text-slate-600">Date (A.D.):</span><span>{bill.adDate}</span></div>
            </div>
            <div className="space-y-1.5">
              <div className="flex"><span className="w-28 font-semibold text-slate-600">Vendor:</span><span className="font-bold">{bill.vendorName}</span></div>
              <div className="flex"><span className="w-28 font-semibold text-slate-600">Vendor PAN:</span><span className="font-mono font-bold">{bill.vendorPan || 'N/A'}</span></div>
              <div className="flex"><span className="w-28 font-semibold text-slate-600">Warehouse:</span><span>{bill.warehouseName}</span></div>
              <div className="flex"><span className="w-28 font-semibold text-slate-600">Payment:</span><span className="font-medium">{bill.paymentMode}</span></div>
            </div>
          </div>

          {(bill.refBillNo || bill.reason) && (
            <div className="py-2 text-xs border-b border-slate-300">
              {bill.refBillNo && <span className="mr-6"><strong>Reference Bill:</strong> {bill.refBillNo}</span>}
              {bill.reason && <span><strong>Reason:</strong> {bill.reason}</span>}
            </div>
          )}

          <div className="mt-4">
            <table className="w-full text-left text-xs border-collapse border border-slate-300">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 text-slate-800 font-semibold">
                  <th className="py-2 px-2 border-r border-slate-300 w-8 text-center">S.N.</th>
                  <th className="py-2 px-2 border-r border-slate-300">Particulars / Garment Item</th>
                  <th className="py-2 px-2 border-r border-slate-300 w-20 text-center">HSN Code</th>
                  <th className="py-2 px-2 border-r border-slate-300 w-16 text-center">Size/Color</th>
                  <th className="py-2 px-2 border-r border-slate-300 w-12 text-center">Qty</th>
                  <th className="py-2 px-2 border-r border-slate-300 w-24 text-right">Unit Cost</th>
                  <th className="py-2 px-2 w-24 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {bill.items.map((item, idx) => (
                  <tr key={`${bill.id}-${idx}`} className="border-b border-slate-200">
                    <td className="py-2 px-2 border-r border-slate-300 text-center">{idx + 1}</td>
                    <td className="py-2 px-2 border-r border-slate-300 font-medium">{item.name}<span className="block text-[10px] text-slate-500 font-mono">SKU: {item.sku}</span></td>
                    <td className="py-2 px-2 border-r border-slate-300 text-center font-mono text-[11px]">{item.hsnCode}</td>
                    <td className="py-2 px-2 border-r border-slate-300 text-center"><span className="font-semibold">{item.size}</span><span className="block text-[10px] text-slate-500">{item.color}</span></td>
                    <td className="py-2 px-2 border-r border-slate-300 text-center font-semibold">{item.quantity}</td>
                    <td className="py-2 px-2 border-r border-slate-300 text-right font-mono">{formatNPR(item.unitCost)}</td>
                    <td className="py-2 px-2 text-right font-mono font-medium">{formatNPR(item.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 grid grid-cols-12 gap-4 text-xs">
            <div className="col-span-7 flex flex-col justify-between py-2 pr-4">
              <div>
                <span className="font-semibold text-slate-700">Amount in Words:</span>
                <p className="mt-1 font-medium text-slate-900 bg-slate-50 p-2 border border-slate-200 rounded italic">{words}</p>
              </div>
              {bill.notes && <div className="mt-4"><span className="font-semibold text-slate-700">Notes:</span><p className="mt-1 text-slate-600">{bill.notes}</p></div>}
            </div>
            <div className="col-span-5 border-t border-slate-300 pt-2 space-y-1 text-slate-700">
              <div className="flex justify-between py-0.5"><span>Sub-Total:</span><span className="font-mono">{formatNPR(bill.subtotal)}</span></div>
              <div className="flex justify-between py-0.5"><span className="font-medium">Taxable Amount:</span><span className="font-mono font-medium">{formatNPR(bill.taxableAmount)}</span></div>
              {bill.nonTaxableAmount > 0 && <div className="flex justify-between py-0.5"><span>Non-Taxable / Cost Amount:</span><span className="font-mono">{formatNPR(bill.nonTaxableAmount)}</span></div>}
              <div className="flex justify-between py-0.5 font-medium"><span>{settings.businessNature === 'PAN' && bill.isCapitalizedVat ? '13% Capitalized VAT:' : '13% Input VAT:'}</span><span className="font-mono">{formatNPR(bill.vatAmount)}</span></div>
              <div className="flex justify-between py-1.5 border-t-2 border-slate-900 border-b-2 font-bold text-slate-950 text-sm"><span>Grand Total:</span><span className="font-mono">{formatNPR(bill.grandTotal)}</span></div>
            </div>
          </div>

          <div className="mt-8 pt-4 border-t border-slate-300 grid grid-cols-2 text-xs text-slate-600">
            <div>
              <p className="text-[11px]">Supplier delivery recorded into inventory and General Ledger.</p>
              <p className="text-[10px] text-slate-400 mt-2">Document Type: {title}</p>
              <p className="text-[10px] text-slate-400 mt-1">Tax treatment: {vatLabel}</p>
            </div>
            <div className="text-right space-y-8">
              <div className="h-8" />
              <div><div className="inline-block border-t border-slate-800 pt-1 px-8 font-semibold text-slate-800">Authorized Signatory</div><p className="text-[10px] text-slate-500">For: {settings.companyName}</p></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
