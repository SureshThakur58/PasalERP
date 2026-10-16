import React, { useState, useMemo, useEffect } from 'react';
import {
  BusinessPartner,
  CompanySettings,
  FIFOBatch,
  GarmentItem,
  SalesInvoice,
  SalesItemLine,
  SalesTransactionType,
  Warehouse
} from '../types';
import { depleteFifoStock, getItemStock } from '../utils/accountingEngine';
import { getAlreadyAdjustedQuantity, getOriginalInvoice, validateSalesLines } from '../utils/sales';
import { formatNPR, getCurrentAdDate, getCurrentBsDate } from '../utils/nepalIrdUtils';
import {
  Plus,
  Minus,
  Trash2,
  Receipt,
  FileCheck,
  Search,
  Eye,
  AlertCircle,
  Building2,
  Tag,
  Barcode,
  CreditCard,
  QrCode,
  Banknote,
  Clock,
  Download,
  Filter,
  CheckCircle2,
  Layers,
  ArrowUpRight,
  TrendingUp,
  ShieldCheck,
  ChevronDown,
  RotateCcw,
  FileText,
  Undo2,
  Sparkles
} from 'lucide-react';

interface SalesInvoiceModuleProps {
  items: GarmentItem[];
  partners: BusinessPartner[];
  warehouses: Warehouse[];
  batches: FIFOBatch[];
  salesInvoices: SalesInvoice[];
  settings: CompanySettings;
  onRecordSale: (input: import('../api/repository').CreateSaleRequest) => Promise<SalesInvoice>;
  onViewTaxInvoice: (invoice: SalesInvoice) => void;
  transactionType?: SalesTransactionType;
  initialTxType?: SalesTransactionType;
  onTransactionTypeChange?: (type: SalesTransactionType) => void;
}

export const SalesInvoiceModule: React.FC<SalesInvoiceModuleProps> = ({
  items,
  partners,
  warehouses,
  batches,
  salesInvoices,
  settings,
  onRecordSale,
  onViewTaxInvoice,
  transactionType,
  initialTxType = 'tax_invoice',
  onTransactionTypeChange,
}) => {
  // Default to View More / All Transactions list view by default as requested
  const [activeSubTab, setActiveSubTab] = useState<'new_sale' | 'history'>('history');
  const [currentTxType, setCurrentTxType] = useState<SalesTransactionType>(transactionType || initialTxType || 'tax_invoice');

  // Keep currentTxType in sync with prop if changed from sidebar
  useEffect(() => {
    const effectiveType = transactionType || initialTxType;
    if (effectiveType) {
      setCurrentTxType(effectiveType);
    }
  }, [transactionType, initialTxType]);

  // Form state
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    partners.find((p) => p.type === 'customer' || p.type === 'both')?.id || ''
  );
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(
    warehouses[0]?.id || ''
  );
  const [paymentMode, setPaymentMode] = useState<SalesInvoice['paymentMode']>('Cash');
  const [mitiDate, setMitiDate] = useState<string>(getCurrentBsDate());
  const [adDate, setAdDate] = useState<string>(getCurrentAdDate());
  const [notes, setNotes] = useState<string>('');

  // Additional fields for Returns, Debit Notes, Credit Notes (mandated by Nepal IRD Rule 23)
  const [refInvoiceNo, setRefInvoiceNo] = useState<string>('');
  const [reason, setReason] = useState<string>('Size mismatch / exchange');
  const [customReason, setCustomReason] = useState<string>('');

  // Cart / Line items
  const [lines, setLines] = useState<
    {
      itemId: string;
      quantity: number;
      unitPrice: number;
      discountPercent: number;
    }[]
  >([]);

  // Search & Filter states
  const [quickScanSku, setQuickScanSku] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [itemSearchQuery, setItemSearchQuery] = useState<string>('');
  const [historySearchQuery, setHistorySearchQuery] = useState<string>('');
  const [historyPaymentFilter, setHistoryPaymentFilter] = useState<string>('All');
  const [historyTxFilter, setHistoryTxFilter] = useState<string>('All');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedCustomer = partners.find((p) => p.id === selectedCustomerId);
  const selectedWarehouse = warehouses.find((w) => w.id === selectedWarehouseId);

  // Past tax invoices for the selected customer (for referencing returns / debit / credit notes)
  const customerPastInvoices = useMemo(() => {
    return salesInvoices.filter(
      (inv) =>
        inv.customerId === selectedCustomerId &&
        (!inv.transactionType || inv.transactionType === 'tax_invoice')
    );
  }, [salesInvoices, selectedCustomerId]);

  // Categories list
  const garmentCategories = useMemo(() => {
    const cats = new Set<string>();
    items.forEach((item) => cats.add(item.category));
    return ['All', ...Array.from(cats)];
  }, [items]);

  // Handle switching transaction type
  const handleSwitchTxType = (newType: SalesTransactionType) => {
    setCurrentTxType(newType);
    if (onTransactionTypeChange) {
      onTransactionTypeChange(newType);
    }
    // Set intuitive default reasons based on type
    if (newType === 'sales_return') {
      setReason('Size mismatch / exchange');
    } else if (newType === 'debit_note') {
      setReason('Underbilled price correction');
    } else if (newType === 'credit_note') {
      setReason('Post-sale trade discount / rebate');
    }
  };

  // Helper to load items from selected reference invoice (for Returns)
  const handleLoadItemsFromRefInvoice = () => {
    if (!refInvoiceNo) {
      setErrorMessage('Please select or enter an original invoice number first.');
      return;
    }
    const originalInv = salesInvoices.find((i) => i.invoiceNo === refInvoiceNo);
    if (!originalInv) {
      setErrorMessage(`Invoice #${refInvoiceNo} not found in system.`);
      return;
    }

    // Populate lines with original items
    const loadedLines = originalInv.items.map((it) => ({
      itemId: it.itemId,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      discountPercent: it.discountPercent || 0,
    }));
    setLines(loadedLines);
    if (originalInv.warehouseId) {
      setSelectedWarehouseId(originalInv.warehouseId);
    }
    setErrorMessage(null);
  };

  // Quick scan / barcode add handler
  const handleQuickScanAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickScanSku.trim()) return;

    const query = quickScanSku.trim().toLowerCase();
    const item = items.find(
      (i) =>
        i.sku.toLowerCase() === query ||
        i.barcode.toLowerCase() === query ||
        i.name.toLowerCase().includes(query)
    );

    if (!item) {
      setErrorMessage(`No garment found matching SKU / Barcode "${quickScanSku}".`);
      return;
    }

    handleAddItem(item.id);
    setQuickScanSku('');
  };

  // Add item line to sales document
  const handleAddItem = (itemIdToAdd: string) => {
    const item = items.find((i) => i.id === itemIdToAdd);
    if (!item) return;

    // Stock check only strictly required for initial tax invoices (returns and notes adjust or add)
    const availableStock = getItemStock(batches, item.id, selectedWarehouseId);
    if (currentTxType === 'tax_invoice' && availableStock <= 0) {
      setErrorMessage(`Item "${item.name} (${item.size})" has 0 on-hand stock in ${selectedWarehouse?.name}.`);
      return;
    }

    const existingIndex = lines.findIndex((l) => l.itemId === item.id);
    if (existingIndex >= 0) {
      const currentQty = lines[existingIndex].quantity;
      if (currentTxType === 'tax_invoice' && currentQty + 1 > availableStock) {
        setErrorMessage(`Cannot add more. Only ${availableStock} units available in ${selectedWarehouse?.name}.`);
        return;
      }
      const updated = [...lines];
      updated[existingIndex].quantity += 1;
      setLines(updated);
    } else {
      setLines([
        ...lines,
        {
          itemId: item.id,
          quantity: 1,
          unitPrice: item.sellingPrice,
          discountPercent: 0,
        },
      ]);
    }
    setErrorMessage(null);
  };

  const handleUpdateLine = (index: number, field: 'quantity' | 'unitPrice' | 'discountPercent', val: number) => {
    const line = lines[index];
    const item = items.find((i) => i.id === line.itemId);
    if (field === 'quantity' && item && currentTxType === 'tax_invoice') {
      const availableStock = getItemStock(batches, item.id, selectedWarehouseId);
      if (val > availableStock) {
        setErrorMessage(`Cannot exceed available stock (${availableStock} units) in ${selectedWarehouse?.name}.`);
        return;
      }
    }
    const normalized = field === 'quantity' ? Math.floor(val) : val;
    const updated = [...lines];
    updated[index] = { ...line, [field]: Math.max(0, normalized) };
    setLines(updated);
    setErrorMessage(null);
  };

  const handleQuantityStep = (index: number, step: number) => {
    const line = lines[index];
    const item = items.find((i) => i.id === line.itemId);
    if (!item) return;

    const availableStock = getItemStock(batches, item.id, selectedWarehouseId);
    const newQty = line.quantity + step;

    if (newQty <= 0) {
      handleRemoveLine(index);
      return;
    }

    if (currentTxType === 'tax_invoice' && newQty > availableStock) {
      setErrorMessage(`Cannot exceed available stock (${availableStock} units) in this warehouse.`);
      return;
    }

    handleUpdateLine(index, 'quantity', newQty);
  };

  const handleRemoveLine = (index: number) => {
    setLines(lines.filter((_, i) => i !== index));
    setErrorMessage(null);
  };

  // Calculations for lines
  const isBusinessVat = (settings.businessNature ?? 'VAT') === 'VAT';
  const isCustomerVat = selectedCustomer?.isVatApplicable ?? true;

  const calculatedLines: SalesItemLine[] = lines.map((l) => {
    const item = items.find((i) => i.id === l.itemId)!;
    const gross = l.quantity * l.unitPrice;
    const discountVal = (gross * l.discountPercent) / 100;
    const net = gross - discountVal;

    // Requirement 1 & 2:
    // When Business Nature is PAN, sales has NO VAT calculation.
    // When Customer has "Applicable of VAT" disabled, VAT will not be calculated.
    // Otherwise, standard 13% rate applies if item is VAT applicable.
    const isVat = isBusinessVat;
    const vat = isVat ? net * ((settings.vatRate ?? 13) / 100) : 0;

    return {
      itemId: item.id,
      sku: item.sku,
      name: item.name,
      size: item.size,
      color: item.color,
      hsnCode: item.hsnCode,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discountPercent: l.discountPercent,
      isVatApplicable: isVat,
      taxableAmount: isVat ? net : 0,
      vatAmount: vat,
      lineTotal: net + vat,
    };
  });

  const subtotal = lines.reduce((acc, l) => acc + l.quantity * l.unitPrice, 0);
  const discountTotal = lines.reduce(
    (acc, l) => acc + (l.quantity * l.unitPrice * l.discountPercent) / 100,
    0
  );
  const taxableAmount = calculatedLines.reduce((acc, l) => acc + (l.isVatApplicable ? l.taxableAmount : 0), 0);
  const nonTaxableAmount = calculatedLines.reduce((acc, l) => acc + (!l.isVatApplicable ? (l.lineTotal - l.vatAmount) : 0), 0);
  const vatAmount = calculatedLines.reduce((acc, l) => acc + l.vatAmount, 0);
  const grandTotal = taxableAmount + nonTaxableAmount + vatAmount;

  // Compute FIFO COGS preview
  let estimatedCogs = 0;
  let canFulfillAll = true;

  if (currentTxType === 'tax_invoice') {
    for (const line of lines) {
      const stockAvailable = getItemStock(batches, line.itemId, selectedWarehouseId);
      if (stockAvailable < line.quantity) {
        canFulfillAll = false;
      }
    }

    if (canFulfillAll) {
      let tempBatches = [...batches];
      for (const line of lines) {
        const res = depleteFifoStock(tempBatches, line.itemId, selectedWarehouseId, line.quantity);
        if (res.isSuccess) {
          estimatedCogs += res.totalCogs;
          tempBatches = res.updatedBatches;
        }
      }
    }
  } else if (currentTxType === 'sales_return') {
    // For returns, COGS will be credited back into inventory
    for (const line of lines) {
      const itemObj = items.find((i) => i.id === line.itemId);
      const costPrice = itemObj?.costPrice || line.unitPrice * 0.65;
      estimatedCogs += costPrice * line.quantity;
    }
  }

  // B5: submit the document to the backend. The SQL transaction owns numbering,
  // FIFO OUT/return restocking, journals and customer balance; the UI only sends
  // the validated intent and renders the returned authoritative document.
  const handleSubmitSale = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedCustomer) {
      setErrorMessage('Please select a customer.');
      return;
    }
    if (!selectedWarehouse) {
      setErrorMessage('Please select a warehouse.');
      return;
    }
    if (lines.length === 0) {
      setErrorMessage('Please add at least one garment item to the document.');
      return;
    }

    const lineValidation = validateSalesLines(lines);
    if (!lineValidation.isValid) {
      setErrorMessage(lineValidation.message || 'Invalid sales lines.');
      return;
    }

    if (currentTxType !== 'tax_invoice' && !refInvoiceNo.trim()) {
      setErrorMessage('Reference Invoice Number is required for Sales Return / Debit Note / Credit Note per IRD Rule.');
      return;
    }

    const originalInvoice = currentTxType !== 'tax_invoice' ? getOriginalInvoice(salesInvoices, refInvoiceNo) : undefined;
    if (currentTxType !== 'tax_invoice' && !originalInvoice) {
      setErrorMessage(`Original tax invoice #${refInvoiceNo} was not found.`);
      return;
    }
    if (currentTxType === 'sales_return' && originalInvoice) {
      for (const line of lines) {
        const originalLine = originalInvoice.items.find((item) => item.itemId === line.itemId);
        if (!originalLine) {
          setErrorMessage(`Item ${line.itemId} is not present on original invoice ${refInvoiceNo}.`);
          return;
        }
        const alreadyReturned = getAlreadyAdjustedQuantity(salesInvoices, refInvoiceNo, line.itemId, ['sales_return']);
        if (alreadyReturned + line.quantity > originalLine.quantity) {
          setErrorMessage(`Return quantity for ${originalLine.name} exceeds the original sold quantity. Remaining returnable: ${Math.max(0, originalLine.quantity - alreadyReturned)}.`);
          return;
        }
      }
    }

    const finalReason = reason === 'Other' ? (customReason || 'Other adjustment') : reason;
    const input: import('../api/repository').CreateSaleRequest = {
      transactionType: currentTxType,
      refInvoiceNo: refInvoiceNo.trim() || undefined,
      reason: currentTxType !== 'tax_invoice' ? finalReason : undefined,
      fiscalYear: settings.fiscalYear,
      mitiDate,
      adDate,
      customerId: selectedCustomer.id,
      warehouseId: selectedWarehouse.id,
      paymentMode,
      lines: lines.map((line) => ({
        itemId: line.itemId,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountPercent: line.discountPercent,
      })),
      notes,
      syncWithIrd: true,
    };

    try {
      const savedInvoice = await onRecordSale(input);
      setLines([]);
      setNotes('');
      setRefInvoiceNo('');
      setErrorMessage(null);
      onViewTaxInvoice(savedInvoice);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save sales transaction to the backend.';
      setErrorMessage(message);
    }
  };

  // KPIs for sales overview
  const totalSalesRevenue = salesInvoices.reduce((acc, inv) => acc + inv.grandTotal, 0);
  const totalOutputVat = salesInvoices.reduce((acc, inv) => acc + inv.vatAmount, 0);
  const totalReceivables = partners
    .filter((p) => p.type === 'customer' || p.type === 'both')
    .reduce((acc, p) => acc + (p.currentBalance > 0 ? p.currentBalance : 0), 0);

  // Filtered history list
  const filteredHistory = salesInvoices.filter((inv) => {
    const matchesSearch =
      inv.invoiceNo.toLowerCase().includes(historySearchQuery.toLowerCase()) ||
      inv.customerName.toLowerCase().includes(historySearchQuery.toLowerCase()) ||
      inv.customerPan.includes(historySearchQuery) ||
      (inv.refInvoiceNo && inv.refInvoiceNo.toLowerCase().includes(historySearchQuery.toLowerCase())) ||
      (inv.reason && inv.reason.toLowerCase().includes(historySearchQuery.toLowerCase()));
    const matchesPayment =
      historyPaymentFilter === 'All' || inv.paymentMode === historyPaymentFilter;
    const matchesTxType =
      historyTxFilter === 'All' || (inv.transactionType || 'tax_invoice') === historyTxFilter;
    return matchesSearch && matchesPayment && matchesTxType;
  });

  // Export Sales History as CSV
  const handleExportCsv = () => {
    const headers = [
      'Transaction Type',
      'Document No',
      'Ref Invoice No',
      'Reason',
      'Miti Date (BS)',
      'AD Date',
      'Customer Name',
      'Customer PAN',
      'Warehouse',
      'Payment Mode',
      'Taxable (NPR)',
      'VAT (NPR)',
      'Grand Total (NPR)',
      'FIFO COGS (NPR)'
    ];

    const rows = filteredHistory.map((inv) => [
      inv.transactionType || 'tax_invoice',
      inv.invoiceNo,
      inv.refInvoiceNo || 'N/A',
      `"${(inv.reason || '').replace(/"/g, '""')}"`,
      inv.mitiDate,
      inv.adDate,
      `"${inv.customerName.replace(/"/g, '""')}"`,
      inv.customerPan || 'N/A',
      `"${inv.warehouseName}"`,
      inv.paymentMode,
      inv.taxableAmount.toFixed(2),
      inv.vatAmount.toFixed(2),
      inv.grandTotal.toFixed(2),
      inv.totalCogs.toFixed(2),
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Sales_Transactions_Register_${getCurrentBsDate()}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className="space-y-6">
      {/* Top Executive KPI Metrics Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between" title="Total gross sales revenue from issued invoices">
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Sales</span>
            <div className="text-xl font-mono font-bold text-slate-900 mt-1">{formatNPR(totalSalesRevenue)}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">{salesInvoices.length} invoices issued</div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold">
            <TrendingUp className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between" title="Total 13% output VAT collected on sales according to IRD Annex 7">
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">13% Output VAT</span>
            <div className="text-xl font-mono font-bold text-indigo-700 mt-1">{formatNPR(totalOutputVat)}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">IRD Annex 7 statutory total</div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold">
            <ShieldCheck className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between" title="Outstanding receivable balance from credit customers">
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Trade Receivables</span>
            <div className="text-xl font-mono font-bold text-amber-700 mt-1">{formatNPR(totalReceivables)}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Credit customers balance</div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
            <Clock className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between" title="Current default dispatch outlet for FIFO stock batch deduction">
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Active Warehouse</span>
            <div className="text-sm font-bold text-slate-900 truncate mt-1">{selectedWarehouse?.name || 'All Stores'}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">FIFO stock lot allocation</div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center font-bold">
            <Building2 className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Module Title & Tab Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 flex items-center">
            <Receipt className="h-5 w-5 mr-2 text-indigo-600" />
            Sales & IRD Tax Invoicing
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Issue IRD-compliant tax invoices for readymade garments with barcode scanning, automated FIFO cost deduction, and dual-entry ledger posting.
          </p>
        </div>

        {/* Sub Navigation */}
        <div className="flex space-x-2">
          <button
            id="subtab-new-sale-btn"
            onClick={() => setActiveSubTab('new_sale')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center ${
              activeSubTab === 'new_sale'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            + New Sales Invoice
          </button>
          <button
            id="subtab-sales-history-btn"
            onClick={() => setActiveSubTab('history')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center ${
              activeSubTab === 'history'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <Layers className="h-3.5 w-3.5 mr-1.5" />
            Invoice Registry ({salesInvoices.length})
          </button>
        </div>
      </div>

      {/* Transaction Type Dropdown Selection UI */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-indigo-600" />
              Transaction Type:
            </span>

            {/* Dropdown Selection */}
            <div className="relative" title="Select transaction type: Tax Invoice, Sales Return, Debit Note, or Credit Note">
              <select
                id="sales-transaction-type-dropdown"
                value={currentTxType}
                onChange={(e) => handleSwitchTxType(e.target.value as SalesTransactionType)}
                className="appearance-none bg-slate-50 border-2 border-indigo-200 hover:border-indigo-500 rounded-lg pl-3 pr-9 py-2 text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-xs transition-colors"
              >
                <option value="tax_invoice">Sales Tax Invoice (Standard POS)</option>
                <option value="sales_return">Sales Return (IRD Annex 7 Return)</option>
                <option value="debit_note">Debit Note (Customer Debit Memo)</option>
                <option value="credit_note">Credit Note (Customer Credit Note)</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-indigo-600 pointer-events-none" />
            </div>
          </div>

          {/* Transaction Type Badges / Quick Status */}
          <div className="flex items-center gap-2 text-xs flex-wrap">
            {currentTxType === 'tax_invoice' && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200" title="Standard POS Tax Invoicing per IRD Rule 17">
                <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                Standard POS Tax Invoicing (IRD Rule 17)
              </span>
            )}
            {currentTxType === 'sales_return' && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200" title="Annex 7 Return & Restock into FIFO Stock">
                <RotateCcw className="h-3.5 w-3.5 mr-1 text-amber-600" />
                Annex 7 Return & Restock into FIFO Stock
              </span>
            )}
            {currentTxType === 'debit_note' && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200" title="Upward Rate Adjustment / Additional Debit">
                <FileText className="h-3.5 w-3.5 mr-1 text-blue-600" />
                Upward Rate Adjustment / Additional Debit
              </span>
            )}
            {currentTxType === 'credit_note' && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-800 border border-purple-200" title="Post-sale Rebate / Price Reduction Allowance">
                <CreditCard className="h-3.5 w-3.5 mr-1 text-purple-600" />
                Post-sale Rebate / Price Reduction Allowance
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3.5 text-xs text-red-800 flex items-center justify-between shadow-xs">
          <div className="flex items-center space-x-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            <span className="font-semibold">{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-red-400 hover:text-red-700 font-bold">
            &times;
          </button>
        </div>
      )}

      {activeSubTab === 'new_sale' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main Entry Workspace */}
          <div className="lg:col-span-8 space-y-6">
            {/* Header Form: Customer, Warehouse & Payment Mode */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  1. Customer & Transaction Setup
                </span>
                <span className="text-[11px] font-mono text-slate-500">
                  Fiscal Year: <span className="font-bold text-slate-700">{settings.fiscalYear}</span>
                </span>
              </div>

              {/* Conditional Reference Invoice & Reason Section for Returns, Debit Notes, Credit Notes */}
              {currentTxType !== 'tax_invoice' && (
                <div className="p-4 rounded-xl bg-indigo-50/60 border border-indigo-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-indigo-950 uppercase tracking-wider flex items-center gap-1.5">
                      <FileText className="h-4 w-4 text-indigo-700" />
                      IRD Rule 23 Mandated Reference & Reason
                    </span>
                    <span className="text-[10px] font-semibold text-indigo-700 bg-white px-2 py-0.5 rounded border border-indigo-200" title="Required by Tax Law under IRD Directive">
                      Required by Tax Law
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Reference Invoice Picker */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1" title="Select the original tax invoice issued previously to this customer">
                        Original Tax Invoice No. *
                      </label>
                      <div className="flex gap-2">
                        {customerPastInvoices.length > 0 ? (
                          <select
                            id="sales-ref-invoice-select"
                            value={refInvoiceNo}
                            onChange={(e) => setRefInvoiceNo(e.target.value)}
                            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono font-medium text-slate-900 focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600 bg-white"
                          >
                            <option value="">-- Select Customer's Past Invoice --</option>
                            {customerPastInvoices.map((inv) => (
                              <option key={inv.id} value={inv.invoiceNo}>
                                {inv.invoiceNo} | {inv.mitiDate} | {formatNPR(inv.grandTotal)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={refInvoiceNo}
                            onChange={(e) => setRefInvoiceNo(e.target.value)}
                            placeholder="e.g. INV-2081/82-0001"
                            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono font-medium text-slate-900 focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600 bg-white"
                          />
                        )}

                        {currentTxType === 'sales_return' && refInvoiceNo && (
                          <button
                            type="button"
                            onClick={handleLoadItemsFromRefInvoice}
                            className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1 shrink-0"
                            title="Auto-fill items and prices from this original invoice"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            <span>Auto-fill</span>
                          </button>
                        )}
                      </div>
                      {customerPastInvoices.length > 0 && (
                        <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
                          <span>Or type manual invoice no:</span>
                          <input
                            type="text"
                            value={refInvoiceNo}
                            onChange={(e) => setRefInvoiceNo(e.target.value)}
                            placeholder="Manual Inv No"
                            className="w-32 rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-mono"
                          />
                        </div>
                      )}
                    </div>

                    {/* Reason Selection */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1" title="Select statutory reason for this transaction">
                        Reason for {currentTxType === 'sales_return' ? 'Return' : currentTxType === 'debit_note' ? 'Debit Note' : 'Credit Note'} *
                      </label>
                      <select
                        id="sales-reason-select"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-900 focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600 bg-white"
                      >
                        {currentTxType === 'sales_return' && (
                          <>
                            <option value="Size mismatch / exchange">Size mismatch / exchange</option>
                            <option value="Defective stitching / garment defect">Defective stitching / garment defect</option>
                            <option value="Customer order cancellation">Customer order cancellation</option>
                            <option value="Fabric quality dispute">Fabric quality dispute</option>
                            <option value="Damage in transit">Damage in transit</option>
                            <option value="Other">Other reason</option>
                          </>
                        )}
                        {currentTxType === 'debit_note' && (
                          <>
                            <option value="Underbilled price correction">Underbilled price correction</option>
                            <option value="Additional delivery / logistics charge">Additional delivery / logistics charge</option>
                            <option value="Post-sale upward rate adjustment">Post-sale upward rate adjustment</option>
                            <option value="Other">Other reason</option>
                          </>
                        )}
                        {currentTxType === 'credit_note' && (
                          <>
                            <option value="Post-sale trade discount / rebate">Post-sale trade discount / rebate</option>
                            <option value="Rate difference / price reduction">Rate difference / price reduction</option>
                            <option value="Customer defect goodwill allowance">Customer defect goodwill allowance</option>
                            <option value="Other">Other reason</option>
                          </>
                        )}
                      </select>
                      {reason === 'Other' && (
                        <input
                          type="text"
                          value={customReason}
                          onChange={(e) => setCustomReason(e.target.value)}
                          placeholder="Type specific reason..."
                          className="mt-1.5 w-full rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-900 focus:border-indigo-600 focus:outline-hidden"
                        />
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {/* Customer */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Customer *
                  </label>
                  <select
                    id="sales-customer-select"
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-900 focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600 bg-white"
                  >
                    {partners
                      .filter((p) => p.type === 'customer' || p.type === 'both')
                      .map((partner) => (
                        <option key={partner.id} value={partner.id}>
                          {partner.name} {partner.panNumber ? `(PAN: ${partner.panNumber})` : '(Consumer)'}
                        </option>
                      ))}
                  </select>
                  {selectedCustomer && (
                    <div className="mt-1 flex items-center justify-between text-[11px]">
                      <span className="text-slate-500">
                        PAN: <span className="font-mono font-bold text-slate-800">{selectedCustomer.panNumber || 'N/A'}</span>
                      </span>
                      <span className={`font-mono text-[10px] font-semibold ${selectedCustomer.currentBalance > 0 ? 'text-amber-700' : 'text-slate-500'}`}>
                        Bal: {formatNPR(selectedCustomer.currentBalance)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Warehouse */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1" title="FIFO stock lot will be deducted from this warehouse">
                    Dispatch Warehouse *
                  </label>
                  <select
                    id="sales-warehouse-select"
                    value={selectedWarehouseId}
                    onChange={(e) => setSelectedWarehouseId(e.target.value)}
                    title="FIFO stock lot will be deducted from this warehouse"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-900 focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600 bg-white"
                  >
                    {warehouses.map((wh) => (
                      <option key={wh.id} value={wh.id}>
                        {wh.name} ({wh.code})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Nepali Miti & AD Date */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1" title="Invoice Date in Nepali Bikram Sambat (B.S.) and English (A.D.)">
                    Invoice Date (B.S. / A.D.)
                  </label>
                  <div className="grid grid-cols-2 gap-2" title="Invoice Date in Nepali Bikram Sambat (B.S.) and English (A.D.)">
                    <input
                      type="text"
                      value={mitiDate}
                      onChange={(e) => setMitiDate(e.target.value)}
                      placeholder="YYYY-MM-DD"
                      title="Bikram Sambat Date (YYYY-MM-DD)"
                      className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono text-slate-900 focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600"
                    />
                    <input
                      type="date"
                      value={adDate}
                      onChange={(e) => setAdDate(e.target.value)}
                      title="Gregorian A.D. Date"
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-900 focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600"
                    />
                  </div>
                </div>
              </div>

              {/* Payment Mode Pills */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Payment Mode
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'Cash', label: 'Cash', icon: <Banknote className="h-3.5 w-3.5 mr-1" /> },
                    { id: 'Bank / Fonepay QR', label: 'Fonepay / QR', icon: <QrCode className="h-3.5 w-3.5 mr-1" /> },
                    { id: 'Credit', label: 'Credit', icon: <Clock className="h-3.5 w-3.5 mr-1" /> },
                    { id: 'Card', label: 'POS Card', icon: <CreditCard className="h-3.5 w-3.5 mr-1" /> },
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setPaymentMode(mode.id as SalesInvoice['paymentMode'])}
                      className={`flex items-center justify-center px-3 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                        paymentMode === mode.id
                          ? 'bg-indigo-50 border-indigo-600 text-indigo-800 shadow-xs'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {mode.icon}
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Quick Garment Add Bar + Catalog Selector */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <span className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center">
                  <Tag className="h-4 w-4 mr-1.5 text-indigo-600" />
                  2. Garment Selection & Quick Barcode Scan
                </span>
                <span className="text-[11px] text-slate-400">Click garment or type SKU below</span>
              </div>

              {/* Fast Barcode / SKU Input */}
              <form onSubmit={handleQuickScanAdd} className="flex gap-2">
                <div className="relative flex-1">
                  <Barcode className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={quickScanSku}
                    onChange={(e) => setQuickScanSku(e.target.value)}
                    placeholder="Scan Barcode or Type SKU (e.g. SHT-M-BLU, TRS-32-KHA) and press Enter..."
                    className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-xs font-mono text-slate-900 focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer"
                >
                  Quick Add
                </button>
              </form>

              {/* Category Filter Pills & Search */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap gap-1.5">
                  {garmentCategories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                        selectedCategory === cat
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <div className="relative w-48">
                  <Search className="h-3 w-3 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={itemSearchQuery}
                    onChange={(e) => setItemSearchQuery(e.target.value)}
                    placeholder="Filter by name..."
                    className="w-full rounded-md border border-slate-300 pl-7 pr-2 py-1 text-[11px] text-slate-800 focus:border-indigo-600 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Garment Cards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 max-h-56 overflow-y-auto p-1.5 border border-slate-100 rounded-lg bg-slate-50/40">
                {items
                  .filter((item) => {
                    const matchesCat = selectedCategory === 'All' || item.category === selectedCategory;
                    const matchesQuery =
                      item.name.toLowerCase().includes(itemSearchQuery.toLowerCase()) ||
                      item.sku.toLowerCase().includes(itemSearchQuery.toLowerCase()) ||
                      item.color.toLowerCase().includes(itemSearchQuery.toLowerCase());
                    return matchesCat && matchesQuery;
                  })
                  .map((item) => {
                    const stock = getItemStock(batches, item.id, selectedWarehouseId);
                    const isOutOfStock = stock <= 0;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleAddItem(item.id)}
                        disabled={isOutOfStock}
                        className={`text-left p-2.5 rounded-lg border transition-all cursor-pointer ${
                          isOutOfStock
                            ? 'bg-slate-100 border-slate-200 opacity-50 cursor-not-allowed'
                            : 'bg-white border-slate-200 hover:border-indigo-500 hover:shadow-xs'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <span className="text-[10px] font-mono font-semibold text-slate-500">{item.sku}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-slate-100 text-slate-700">
                            {item.size}
                          </span>
                        </div>
                        <div className="font-bold text-xs text-slate-900 truncate mt-1">{item.name}</div>
                        <div className="text-[10px] text-slate-500 truncate">{item.color}</div>
                        <div className="mt-1.5 flex justify-between items-center text-xs">
                          <span className="font-bold text-slate-900">{formatNPR(item.sellingPrice)}</span>
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              stock > 5
                                ? 'text-indigo-700 bg-indigo-50'
                                : stock > 0
                                ? 'text-amber-700 bg-amber-50'
                                : 'text-red-700 bg-red-50'
                            }`}
                          >
                            Stock: {stock}
                          </span>
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>

            {/* Line Items Table */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  3. Invoice Line Items ({lines.length})
                </span>
                <span className="text-[11px] text-slate-500">
                  {lines.reduce((acc, l) => acc + l.quantity, 0)} total garment units
                </span>
              </div>

              {lines.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
                  No garments added yet. Click on any item above or scan a barcode/SKU to add.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-700 font-semibold">
                        <th className="py-2.5 px-2 text-center w-8">#</th>
                        <th className="py-2.5 px-3">Item Description</th>
                        <th className="py-2.5 px-2 text-center">Size/Color</th>
                        <th className="py-2.5 px-2 text-center">Stock</th>
                        <th className="py-2.5 px-2 text-center w-32">Quantity</th>
                        <th className="py-2.5 px-2 text-right w-24">Rate (NPR)</th>
                        <th className="py-2.5 px-2 text-center w-16">Disc %</th>
                        <th className="py-2.5 px-2 text-right w-20">13% VAT</th>
                        <th className="py-2.5 px-3 text-right w-24">Net Total</th>
                        <th className="py-2.5 px-2 text-center w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {calculatedLines.map((line, idx) => {
                        const stock = getItemStock(batches, line.itemId, selectedWarehouseId);
                        return (
                          <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-2 px-2 text-center text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                            <td className="py-2 px-3">
                              <div className="font-bold text-slate-900">{line.name}</div>
                              <div className="font-mono text-[10px] text-slate-500">
                                {line.sku} | HSN: {line.hsnCode}
                              </div>
                            </td>
                            <td className="py-2 px-2 text-center">
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-bold text-slate-700">
                                {line.size}
                              </span>
                              <span className="block text-[10px] text-slate-500">{line.color}</span>
                            </td>
                            <td className="py-2 px-2 text-center font-mono text-[11px] text-slate-600">
                              {stock}
                            </td>
                            <td className="py-2 px-2 text-center">
                              <div className="inline-flex items-center rounded-lg border border-slate-300 bg-white">
                                <button
                                  type="button"
                                  onClick={() => handleQuantityStep(idx, -1)}
                                  className="px-2 py-1 text-slate-600 hover:bg-slate-100 rounded-l-md transition-colors"
                                >
                                  <Minus className="h-3 w-3" />
                                </button>
                                <input
                                  type="number"
                                  min="1"
                                  max={stock}
                                  value={lines[idx].quantity}
                                  onChange={(e) => handleUpdateLine(idx, 'quantity', parseInt(e.target.value) || 1)}
                                  className="w-12 text-center text-xs font-bold text-slate-900 focus:outline-hidden py-1 border-x border-slate-200"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleQuantityStep(idx, 1)}
                                  className="px-2 py-1 text-slate-600 hover:bg-slate-100 rounded-r-md transition-colors"
                                >
                                  <Plus className="h-3 w-3" />
                                </button>
                              </div>
                            </td>
                            <td className="py-2 px-2 text-right">
                              <input
                                type="number"
                                min="0"
                                value={lines[idx].unitPrice}
                                onChange={(e) => handleUpdateLine(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                                className="w-20 rounded border border-slate-300 px-2 py-1 text-right text-xs font-mono font-semibold focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600"
                              />
                            </td>
                            <td className="py-2 px-2 text-center">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={lines[idx].discountPercent}
                                onChange={(e) =>
                                  handleUpdateLine(idx, 'discountPercent', parseFloat(e.target.value) || 0)
                                }
                                className="w-12 rounded border border-slate-300 px-1.5 py-1 text-center text-xs font-mono focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600"
                              />
                            </td>
                            <td className="py-2 px-2 text-right font-mono text-slate-600">
                              {formatNPR(line.vatAmount)}
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-slate-900 font-mono">
                              {formatNPR(line.lineTotal)}
                            </td>
                            <td className="py-2 px-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveLine(idx)}
                                className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors cursor-pointer"
                                title="Remove item"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Order Notes */}
              <div className="pt-2">
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Order notes, customer PO reference, or counter remarks..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800 focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600"
                />
              </div>
            </div>
          </div>

          {/* Right Summary Panel & Tax Calculation */}
          <div className="lg:col-span-4 space-y-6">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4 sticky top-20">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center border-b border-slate-100 pb-2">
                <Receipt className="h-4 w-4 mr-1.5 text-indigo-600" />
                {currentTxType === 'tax_invoice' && 'Tax Invoice Calculation'}
                {currentTxType === 'sales_return' && 'Sales Return Calculation'}
                {currentTxType === 'debit_note' && 'Debit Note Calculation'}
                {currentTxType === 'credit_note' && 'Credit Note Calculation'}
              </h3>

              <div className="space-y-2.5 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span className="font-mono text-slate-900 font-medium">{formatNPR(subtotal)}</span>
                </div>

                {discountTotal > 0 && (
                  <div className="flex justify-between text-indigo-700">
                    <span>Discount:</span>
                    <span className="font-mono">-{formatNPR(discountTotal)}</span>
                  </div>
                )}

                <div className="flex justify-between pt-2 border-t border-slate-100">
                  <span className="font-medium text-slate-800">Taxable Amount:</span>
                  <span className="font-mono text-slate-900 font-medium">{formatNPR(taxableAmount)}</span>
                </div>

                <div className="flex justify-between">
                  <span className="font-medium text-slate-800">13% VAT:</span>
                  <span className="font-mono text-slate-900 font-medium">{formatNPR(vatAmount)}</span>
                </div>

                {nonTaxableAmount > 0 && (
                  <div className="flex justify-between">
                    <span className="font-medium text-slate-800">Exempt Amount:</span>
                    <span className="font-mono text-slate-900 font-medium">{formatNPR(nonTaxableAmount)}</span>
                  </div>
                )}

                <div className="flex justify-between pt-3 border-t-2 border-slate-900 text-base font-bold text-slate-950">
                  <span>
                    {currentTxType === 'tax_invoice' && 'Grand Total:'}
                    {currentTxType === 'sales_return' && 'Total Refundable:'}
                    {currentTxType === 'debit_note' && 'Total Debit Note:'}
                    {currentTxType === 'credit_note' && 'Total Credit Note:'}
                  </span>
                  <span className="font-mono text-indigo-700 font-bold">{formatNPR(grandTotal)}</span>
                </div>
              </div>

              {/* FIFO Cost of Sales / Inventory Preview */}
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 uppercase">
                  <span>
                    {currentTxType === 'sales_return' ? 'Inventory Restock Valuation' : 'FIFO COGS Valuation'}
                  </span>
                  <span className="text-indigo-700 font-mono font-bold">{formatNPR(estimatedCogs)}</span>
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  {currentTxType === 'sales_return'
                    ? `Returned garments will be restocked into ${selectedWarehouse?.name} as new FIFO inventory lots.`
                    : currentTxType === 'debit_note' || currentTxType === 'credit_note'
                    ? 'Pure financial adjustment note; no stock movement occurs.'
                    : `Oldest batch lots in ${selectedWarehouse?.name} will be depleted per IRD FIFO accounting standards.`}
                </p>

                {/* Automated General Ledger Impact Preview */}
                <div className="pt-2 border-t border-slate-200 space-y-1 text-[10px] font-mono">
                  <div className="font-semibold text-slate-700 font-sans text-[11px] mb-1">
                    Automated General Ledger Impact:
                  </div>
                  {currentTxType === 'tax_invoice' && (
                    <>
                      <div className="flex justify-between text-indigo-800">
                        <span>Dr Customer / Cash</span>
                        <span>{formatNPR(grandTotal)}</span>
                      </div>
                      <div className="flex justify-between text-indigo-800">
                        <span>Dr COGS Expense (FIFO)</span>
                        <span>{formatNPR(estimatedCogs)}</span>
                      </div>
                      <div className="flex justify-between text-slate-700">
                        <span>Cr 13% Output VAT</span>
                        <span>{formatNPR(vatAmount)}</span>
                      </div>
                      <div className="flex justify-between text-slate-700">
                        <span>Cr Garment Sales Revenue</span>
                        <span>{formatNPR(taxableAmount + nonTaxableAmount)}</span>
                      </div>
                      <div className="flex justify-between text-slate-700">
                        <span>Cr Finished Garment Asset</span>
                        <span>{formatNPR(estimatedCogs)}</span>
                      </div>
                    </>
                  )}
                  {currentTxType === 'sales_return' && (
                    <>
                      <div className="flex justify-between text-amber-800">
                        <span>Dr Sales Return & Allowances</span>
                        <span>{formatNPR(taxableAmount + nonTaxableAmount)}</span>
                      </div>
                      <div className="flex justify-between text-amber-800">
                        <span>Dr 13% Output VAT (Reversal)</span>
                        <span>{formatNPR(vatAmount)}</span>
                      </div>
                      <div className="flex justify-between text-emerald-800">
                        <span>Dr Finished Garment Inventory</span>
                        <span>{formatNPR(estimatedCogs)}</span>
                      </div>
                      <div className="flex justify-between text-slate-700">
                        <span>Cr Customer / Cash</span>
                        <span>{formatNPR(grandTotal)}</span>
                      </div>
                      <div className="flex justify-between text-slate-700">
                        <span>Cr Cost of Goods Sold</span>
                        <span>{formatNPR(estimatedCogs)}</span>
                      </div>
                    </>
                  )}
                  {currentTxType === 'debit_note' && (
                    <>
                      <div className="flex justify-between text-blue-800">
                        <span>Dr Customer / Cash Receivable</span>
                        <span>{formatNPR(grandTotal)}</span>
                      </div>
                      <div className="flex justify-between text-slate-700">
                        <span>Cr 13% Output VAT</span>
                        <span>{formatNPR(vatAmount)}</span>
                      </div>
                      <div className="flex justify-between text-slate-700">
                        <span>Cr Sales Revenue Adjustment</span>
                        <span>{formatNPR(taxableAmount + nonTaxableAmount)}</span>
                      </div>
                    </>
                  )}
                  {currentTxType === 'credit_note' && (
                    <>
                      <div className="flex justify-between text-purple-800">
                        <span>Dr Sales Rebate / Allowance</span>
                        <span>{formatNPR(taxableAmount + nonTaxableAmount)}</span>
                      </div>
                      <div className="flex justify-between text-purple-800">
                        <span>Dr 13% Output VAT (Adjustment)</span>
                        <span>{formatNPR(vatAmount)}</span>
                      </div>
                      <div className="flex justify-between text-slate-700">
                        <span>Cr Customer Account / Payable</span>
                        <span>{formatNPR(grandTotal)}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Submit Button */}
              <button
                id="submit-sale-btn"
                type="button"
                onClick={() => handleSubmitSale()}
                disabled={lines.length === 0}
                className={`w-full py-3 rounded-lg text-sm font-bold text-white shadow-sm flex items-center justify-center space-x-2 transition-all cursor-pointer ${
                  lines.length === 0
                    ? 'bg-slate-300 cursor-not-allowed'
                    : currentTxType === 'sales_return'
                    ? 'bg-amber-600 hover:bg-amber-700 hover:shadow-md'
                    : currentTxType === 'debit_note'
                    ? 'bg-blue-600 hover:bg-blue-700 hover:shadow-md'
                    : currentTxType === 'credit_note'
                    ? 'bg-purple-600 hover:bg-purple-700 hover:shadow-md'
                    : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-md'
                }`}
              >
                <FileCheck className="h-4 w-4" />
                <span>
                  {currentTxType === 'tax_invoice' && 'Post & Issue Tax Invoice'}
                  {currentTxType === 'sales_return' && 'Post & Record Sales Return'}
                  {currentTxType === 'debit_note' && 'Post & Issue Sales Debit Note'}
                  {currentTxType === 'credit_note' && 'Post & Issue Sales Credit Note'}
                </span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* History & Invoice Register View */
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          {/* Controls Bar */}
          <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/60">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              <div className="relative w-72">
                <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={historySearchQuery}
                  onChange={(e) => setHistorySearchQuery(e.target.value)}
                  placeholder="Search by invoice no, customer, PAN, ref..."
                  className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-1.5 text-xs text-slate-800 focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600"
                />
              </div>

              {/* Transaction Type Filter */}
              <div className="flex items-center space-x-1.5 text-xs">
                <Sparkles className="h-3.5 w-3.5 text-slate-500" />
                <select
                  value={historyTxFilter}
                  onChange={(e) => setHistoryTxFilter(e.target.value as any)}
                  className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:border-indigo-600 focus:outline-hidden bg-white"
                >
                  <option value="All">All Transaction Types</option>
                  <option value="tax_invoice">Tax Invoices</option>
                  <option value="sales_return">Sales Returns</option>
                  <option value="debit_note">Debit Notes</option>
                  <option value="credit_note">Credit Notes</option>
                </select>
              </div>

              {/* Payment Mode Filter */}
              <div className="flex items-center space-x-1.5 text-xs">
                <Filter className="h-3.5 w-3.5 text-slate-500" />
                <select
                  value={historyPaymentFilter}
                  onChange={(e) => setHistoryPaymentFilter(e.target.value)}
                  className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-800 focus:border-indigo-600 focus:outline-hidden bg-white"
                >
                  <option value="All">All Payment Modes</option>
                  <option value="Cash">Cash</option>
                  <option value="Bank / Fonepay QR">Bank / Fonepay QR</option>
                  <option value="Credit">Credit</option>
                  <option value="Card">POS Card</option>
                </select>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={handleExportCsv}
                className="inline-flex items-center px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 text-xs font-semibold text-slate-700 shadow-2xs transition-colors cursor-pointer"
              >
                <Download className="h-3.5 w-3.5 mr-1 text-slate-500" />
                Export CSV
              </button>
              <div className="text-xs text-slate-500">
                Entries: <span className="font-bold text-slate-900">{filteredHistory.length}</span>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100/70 text-slate-700 font-semibold">
                  <th className="py-3 px-3">Type & Doc No</th>
                  <th className="py-3 px-3">Miti / Date</th>
                  <th className="py-3 px-3">Customer Name</th>
                  <th className="py-3 px-3">Buyer PAN</th>
                  <th className="py-3 px-3">Ref / Reason</th>
                  <th className="py-3 px-3">Warehouse</th>
                  <th className="py-3 px-3">Payment</th>
                  <th className="py-3 px-3 text-right">Taxable</th>
                  <th className="py-3 px-3 text-right">13% VAT</th>
                  <th className="py-3 px-3 text-right">Grand Total</th>
                  <th className="py-3 px-3 text-right">COGS</th>
                  <th className="py-3 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="py-8 text-center text-xs text-slate-400">
                      No transactions found matching current search criteria.
                    </td>
                  </tr>
                ) : (
                  filteredHistory.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-3">
                        <div className="font-mono font-bold text-indigo-700">{inv.invoiceNo}</div>
                        <div className="mt-0.5">
                          {inv.transactionType === 'sales_return' ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                              Sales Return
                            </span>
                          ) : inv.transactionType === 'debit_note' ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                              Debit Note
                            </span>
                          ) : inv.transactionType === 'credit_note' ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-50 text-purple-800 border border-purple-200">
                              Credit Note
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              Tax Invoice
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-600">
                        <div className="font-medium">{inv.mitiDate} B.S.</div>
                        <div className="text-[10px] text-slate-400">{inv.adDate}</div>
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-900">{inv.customerName}</td>
                      <td className="py-3 px-3 font-mono text-slate-600">
                        {inv.customerPan ? (
                          <span className="font-bold text-slate-800">{inv.customerPan}</span>
                        ) : (
                          <span className="text-slate-400 text-[10px]">Consumer</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-slate-600 text-[11px]">
                        {inv.refInvoiceNo ? (
                          <div>
                            <span className="font-mono font-semibold text-indigo-700">Ref: {inv.refInvoiceNo}</span>
                            {inv.reason && <div className="text-[10px] text-slate-500 truncate max-w-[140px]">{inv.reason}</div>}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[10px]">-</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-slate-600">{inv.warehouseName}</td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                            inv.paymentMode === 'Cash'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : inv.paymentMode === 'Credit'
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : 'bg-indigo-50 text-indigo-800 border border-indigo-200'
                          }`}
                        >
                          {inv.paymentMode}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono">{formatNPR(inv.taxableAmount)}</td>
                      <td className="py-3 px-3 text-right font-mono text-slate-600">{formatNPR(inv.vatAmount)}</td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                        {formatNPR(inv.grandTotal)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-600">{formatNPR(inv.totalCogs)}</td>
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => onViewTaxInvoice(inv)}
                          className="inline-flex items-center px-2.5 py-1 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold transition-colors cursor-pointer border border-indigo-200"
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
