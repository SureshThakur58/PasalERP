import React from 'react';
import { CompanySettings, SalesInvoice } from '../types';
import { amountToWordsNPR, formatNPR } from '../utils/nepalIrdUtils';
import { Printer, X, CheckCircle2, QrCode } from 'lucide-react';

interface TaxInvoiceModalProps {
  invoice: SalesInvoice | null;
  settings: CompanySettings;
  onClose: () => void;
}

export const TaxInvoiceModal: React.FC<TaxInvoiceModalProps> = ({
  invoice,
  settings,
  onClose,
}) => {
  if (!invoice) return null;

  const handlePrint = () => {
    window.print();
  };

  const words = amountToWordsNPR(invoice.grandTotal);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-3xl rounded-xl bg-white shadow-2xl border border-slate-200 my-6">
        {/* Header Action Bar */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-3 bg-slate-50 rounded-t-xl print:hidden">
          <div className="flex items-center space-x-2">
            <span className="inline-flex items-center rounded-md bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
              IRD Nepal Compliant
            </span>
            <span className="text-xs text-slate-500 font-medium">Fiscal Year: {invoice.fiscalYear}</span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              id="print-invoice-btn"
              onClick={handlePrint}
              className="inline-flex items-center rounded-lg bg-indigo-600 px-3.5 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 transition-colors cursor-pointer"
            >
              <Printer className="mr-1.5 h-4 w-4" />
              Print / Save PDF
            </button>
            <button
              id="close-invoice-modal-btn"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Printable Nepal IRD Tax Invoice Document */}
        <div className="p-8 text-slate-800 font-sans" id="printable-tax-invoice">
          {/* Header */}
          <div className="text-center pb-4 border-b border-slate-800">
            <div className="inline-block px-3 py-0.5 border border-slate-800 text-xs font-bold uppercase tracking-wider mb-1" title="कर बीजक">
              TAX INVOICE
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-950 uppercase">{settings.companyName}</h1>
            <p className="text-xs text-slate-600">{settings.address}, {settings.city}, Nepal</p>
            <p className="text-xs text-slate-600">Tel: {settings.phone} | Email: {settings.email}</p>
            <div className="mt-2 inline-flex items-center justify-center border-2 border-slate-900 px-4 py-1 text-sm font-extrabold bg-slate-50" title="स्थायी लेखा नम्बर">
              <span className="text-xs font-medium mr-2">PAN / VAT No.:</span>
              <span className="tracking-widest font-mono text-base">{settings.panNumber}</span>
            </div>
          </div>

          {/* Invoice Meta Grid */}
          <div className="grid grid-cols-2 gap-4 py-3 text-xs border-b border-slate-300">
            <div className="space-y-1">
              <div className="flex">
                <span className="w-28 font-semibold text-slate-600" title="बीजक नं">Invoice No:</span>
                <span className="font-bold text-slate-900">{invoice.invoiceNo}</span>
              </div>
              <div className="flex">
                <span className="w-28 font-semibold text-slate-600" title="नेपाली मिति">Miti (B.S.):</span>
                <span className="font-medium text-slate-900">{invoice.mitiDate}</span>
              </div>
              <div className="flex">
                <span className="w-28 font-semibold text-slate-600" title="अंग्रेजी मिति">Date (A.D.):</span>
                <span className="text-slate-700">{invoice.adDate}</span>
              </div>
              <div className="flex">
                <span className="w-28 font-semibold text-slate-600">Warehouse:</span>
                <span className="text-slate-700">{invoice.warehouseName}</span>
              </div>
            </div>

            <div className="space-y-1 border-l border-slate-200 pl-4">
              <div className="flex">
                <span className="w-32 font-semibold text-slate-600" title="खरिदकर्ताको नाम">Buyer's Name:</span>
                <span className="font-bold text-slate-900">{invoice.customerName}</span>
              </div>
              <div className="flex">
                <span className="w-32 font-semibold text-slate-600" title="खरिदकर्ताको स्थायी लेखा नम्बर">Buyer's PAN:</span>
                <span className="font-mono font-bold text-slate-900">{invoice.customerPan || 'N/A (Consumer)'}</span>
              </div>
              <div className="flex">
                <span className="w-32 font-semibold text-slate-600" title="ठेगाना">Address:</span>
                <span className="text-slate-700">{invoice.customerAddress || 'Kathmandu, Nepal'}</span>
              </div>
              <div className="flex">
                <span className="w-32 font-semibold text-slate-600" title="भुक्तानी तरिका">Payment Mode:</span>
                <span className="font-medium text-slate-900">{invoice.paymentMode}</span>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="mt-3">
            <table className="w-full text-left text-xs border-collapse border border-slate-300">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 text-slate-800 font-semibold">
                  <th className="py-2 px-2 border-r border-slate-300 w-8 text-center" title="क्रम संख्या">S.N.</th>
                  <th className="py-2 px-2 border-r border-slate-300" title="विवरण">Particulars / Garment Item</th>
                  <th className="py-2 px-2 border-r border-slate-300 w-20 text-center">HSN Code</th>
                  <th className="py-2 px-2 border-r border-slate-300 w-16 text-center">Size/Color</th>
                  <th className="py-2 px-2 border-r border-slate-300 w-12 text-center" title="परिमाण">Qty</th>
                  <th className="py-2 px-2 border-r border-slate-300 w-20 text-right" title="दर">Rate (NPR)</th>
                  <th className="py-2 px-2 w-24 text-right" title="रकम">Amount (NPR)</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item, idx) => (
                  <tr key={idx} className="border-b border-slate-200">
                    <td className="py-2 px-2 border-r border-slate-300 text-center">{idx + 1}</td>
                    <td className="py-2 px-2 border-r border-slate-300 font-medium">
                      {item.name}
                      <span className="block text-[10px] text-slate-500 font-mono">SKU: {item.sku}</span>
                    </td>
                    <td className="py-2 px-2 border-r border-slate-300 text-center font-mono text-[11px]">
                      {item.hsnCode}
                    </td>
                    <td className="py-2 px-2 border-r border-slate-300 text-center">
                      <span className="px-1 py-0.5 bg-slate-100 rounded text-[10px] font-semibold">{item.size}</span>
                      <span className="block text-[10px] text-slate-500">{item.color}</span>
                    </td>
                    <td className="py-2 px-2 border-r border-slate-300 text-center font-semibold">
                      {item.quantity}
                    </td>
                    <td className="py-2 px-2 border-r border-slate-300 text-right font-mono">
                      {item.unitPrice.toFixed(2)}
                    </td>
                    <td className="py-2 px-2 text-right font-mono font-medium">
                      {(item.quantity * item.unitPrice).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals Section */}
          <div className="mt-2 grid grid-cols-12 gap-4 text-xs">
            <div className="col-span-7 flex flex-col justify-between py-2 pr-4">
              <div>
                <span className="font-semibold text-slate-700" title="अक्षरूपी">Amount in Words:</span>
                <p className="mt-1 font-medium text-slate-900 bg-slate-50 p-2 border border-slate-200 rounded italic">
                  {words}
                </p>
              </div>

              <div className="mt-4 flex items-center space-x-3 bg-indigo-50/60 p-2 rounded border border-indigo-200/60">
                <div className="p-1 bg-white border border-slate-300 rounded shadow-xs">
                  <QrCode className="h-12 w-12 text-slate-800" />
                </div>
                <div className="text-[10px] text-slate-600 leading-tight">
                  <p className="font-bold text-slate-800">IRD Verification QR Code</p>
                  <p>Seller PAN: {settings.panNumber}</p>
                  <p>Invoice: {invoice.invoiceNo}</p>
                  <p>Total: {formatNPR(invoice.grandTotal)}</p>
                </div>
              </div>
            </div>

            <div className="col-span-5 border-t border-slate-300 pt-2 space-y-1 text-slate-700">
              <div className="flex justify-between py-0.5">
                <span title="कुल रकम">Sub-Total:</span>
                <span className="font-mono">{formatNPR(invoice.subtotal)}</span>
              </div>
              {invoice.discountAmount > 0 && (
                <div className="flex justify-between py-0.5 text-indigo-700">
                  <span title="छुट">Discount:</span>
                  <span className="font-mono">-{formatNPR(invoice.discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between py-0.5 border-t border-slate-200">
                <span className="font-medium" title="करयोग्य रकम">Taxable Amount:</span>
                <span className="font-mono font-medium">{formatNPR(invoice.taxableAmount)}</span>
              </div>
              {invoice.nonTaxableAmount > 0 && (
                <div className="flex justify-between py-0.5">
                  <span title="कर छुट रकम">Non-Taxable Amount:</span>
                  <span className="font-mono">{formatNPR(invoice.nonTaxableAmount)}</span>
                </div>
              )}
              <div className="flex justify-between py-0.5 font-medium">
                <span title="मूल्य अभिवृद्धि कर">13% VAT:</span>
                <span className="font-mono">{formatNPR(invoice.vatAmount)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-t-2 border-slate-900 border-b-2 font-bold text-slate-950 text-sm">
                <span title="कुल जम्मा रकम">Grand Total:</span>
                <span className="font-mono">{formatNPR(invoice.grandTotal)}</span>
              </div>
            </div>
          </div>

          {/* Footer & Signatures */}
          <div className="mt-8 pt-4 border-t border-slate-300 grid grid-cols-2 text-xs text-slate-600">
            <div>
              <p className="text-[11px]" title="वस्तु फिर्ता गर्नुपरेमा ७ दिनभित्र सक्कल बीजक पेश गर्नुपर्नेछ">
                Goods once sold will only be exchanged with original tax invoice within 7 days.
              </p>
              <p className="text-[10px] text-slate-400 mt-2">IRD Approval No: {settings.irdApprovalNo}</p>
            </div>
            <div className="text-right space-y-8">
              <div className="h-8"></div>
              <div>
                <div className="inline-block border-t border-slate-800 pt-1 px-8 font-semibold text-slate-800" title="हस्ताक्षर">
                  Authorized Signatory
                </div>
                <p className="text-[10px] text-slate-500">For: {settings.companyName}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
