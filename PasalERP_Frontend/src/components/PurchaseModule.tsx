import React, { useState, useMemo, useEffect } from 'react';
import {
  BusinessPartner,
  CompanySettings,
  FIFOBatch,
  GarmentItem,
  PurchaseBill,
  PurchaseItemLine,
  PurchaseTransactionType,
  Warehouse
} from '../types';
import { formatNPR, getCurrentAdDate, getCurrentBsDate } from '../utils/nepalIrdUtils';
import { getItemStock } from '../utils/accountingEngine';
import { calculatePurchaseLine, validatePurchaseHeader, validatePurchaseLines, allocatePurchaseReturn, getPurchaseVatRate, roundMoney } from '../utils/purchase';
import {
  ShoppingBag,
  Plus,
  Minus,
  Trash2,
  CheckCircle,
  Search,
  Building2,
  Tag,
  AlertCircle,
  Download,
  Filter,
  Barcode,
  Clock,
  Layers,
  CheckCircle2,
  RotateCcw,
  FileText,
  DollarSign,
  Undo2,
  Info,
  ArrowDownRight,
  ArrowUpRight,
  ShieldCheck,
  ChevronDown
} from 'lucide-react';

interface PurchaseModuleProps {
  items: GarmentItem[];
  partners: BusinessPartner[];
  warehouses: Warehouse[];
  batches: FIFOBatch[];
  purchaseBills: PurchaseBill[];
  settings: CompanySettings;
  onRecordPurchase: (input: import('../api/repository').CreatePurchaseRequest) => Promise<PurchaseBill>;
  onViewPurchaseBill: (bill: PurchaseBill) => void;
  initialTxType?: PurchaseTransactionType;
}

export const PurchaseModule: React.FC<PurchaseModuleProps> = ({
  items,
  partners,
  warehouses,
  batches,
  purchaseBills,
  settings,
  onRecordPurchase,
  onViewPurchaseBill,
  initialTxType = 'purchase_invoice',
}) => {
  // Default to View More / All Transactions list view by default as requested
  const [activeSubTab, setActiveSubTab] = useState<'new_purchase' | 'history'>('history');

  // Transaction Type state: Purchase Invoice | Purchase Return | Debit Note | Credit Note
  const [currentTxType, setCurrentTxType] = useState<PurchaseTransactionType>(initialTxType);

  // Sync if initialTxType prop changes (e.g. from sidebar menu navigation)
  useEffect(() => {
    if (initialTxType) {
      setCurrentTxType(initialTxType);
    }
  }, [initialTxType]);

  // Form state
  const [selectedVendorId, setSelectedVendorId] = useState<string>(
    partners.find((p) => p.type === 'vendor' || p.type === 'both')?.id || ''
  );

  const selectedVendor = partners.find((p) => p.id === selectedVendorId);

  // Supplier VAT Bill status (Whether the vendor provided a 13% VAT bill or Non-VAT bill)
  const [isSupplierVatBill, setIsSupplierVatBill] = useState<boolean>(
    selectedVendor ? (selectedVendor.isVatApplicable ?? true) : true
  );

  // Sync isSupplierVatBill when selected vendor changes
  useEffect(() => {
    if (selectedVendor) {
      setIsSupplierVatBill(selectedVendor.isVatApplicable ?? true);
    }
  }, [selectedVendorId]);

  const [supplierBillNo, setSupplierBillNo] = useState<string>('');
  const [refBillNo, setRefBillNo] = useState<string>('');
  const [reason, setReason] = useState<string>('Defective fabric / stitching defect');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(
    warehouses[0]?.id || ''
  );
  const [paymentMode, setPaymentMode] = useState<PurchaseBill['paymentMode']>('Credit');
  const [mitiDate, setMitiDate] = useState<string>(getCurrentBsDate());
  const [adDate, setAdDate] = useState<string>(getCurrentAdDate());
  const [notes, setNotes] = useState<string>('');

  // Cart / Line items
  const [lines, setLines] = useState<
    {
      itemId: string;
      quantity: number;
      unitCost: number;
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
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const selectedWarehouse = warehouses.find((w) => w.id === selectedWarehouseId);

  // Vendor's past purchase bills for reference selection
  const vendorPastBills = useMemo(() => {
    if (!selectedVendorId) return [];
    return purchaseBills.filter(
      (b) => b.vendorId === selectedVendorId && (!b.transactionType || b.transactionType === 'purchase_invoice')
    );
  }, [selectedVendorId, purchaseBills]);

  // Categories list
  const garmentCategories = useMemo(() => {
    const cats = new Set<string>();
    items.forEach((item) => cats.add(item.category));
    return ['All', ...Array.from(cats)];
  }, [items]);

  // Transaction configuration theme & labels
  const txConfig = useMemo(() => {
    switch (currentTxType) {
      case 'purchase_invoice':
        return {
          title: 'Purchase Invoice',
          nepaliTitle: 'Purchase Invoice',
          subtitle: 'Standard Purchase Inwarding',
          desc: 'Inward finished garments/raw fabrics into warehouse, generate FIFO cost batches, and post to General Ledger.',
          badgeBg: 'bg-emerald-50 text-emerald-800 border-emerald-300',
          iconBg: 'bg-emerald-100 text-emerald-700',
          icon: <ShoppingBag className="h-5 w-5" />,
          buttonText: 'Post & Inward FIFO Stock',
          submitColor: 'bg-emerald-600 hover:bg-emerald-700',
          docPrefix: settings.purchasePrefix || 'PUR-',
        };
      case 'purchase_return':
        return {
          title: 'Purchase Return',
          nepaliTitle: 'Purchase Return',
          subtitle: 'Stock Reversal under IRD Rule 23',
          desc: 'Dispatch defective/mismatched garments back to supplier, reduce warehouse FIFO batches, and reverse Input VAT credit.',
          badgeBg: 'bg-amber-50 text-amber-800 border-amber-300',
          iconBg: 'bg-amber-100 text-amber-700',
          icon: <RotateCcw className="h-5 w-5" />,
          buttonText: 'Post & Dispatch Return',
          submitColor: 'bg-amber-600 hover:bg-amber-700',
          docPrefix: 'PR-',
        };
      case 'debit_note':
        return {
          title: 'Purchase Debit Note',
          nepaliTitle: 'Debit Note',
          subtitle: 'Supplier Debit Memo',
          desc: 'Issue debit memo to supplier for price variance, count shortages, or transit claims without physical stock movement.',
          badgeBg: 'bg-blue-50 text-blue-800 border-blue-300',
          iconBg: 'bg-blue-100 text-blue-700',
          icon: <ArrowDownRight className="h-5 w-5" />,
          buttonText: 'Post & Issue Debit Note',
          submitColor: 'bg-blue-600 hover:bg-blue-700',
          docPrefix: 'PDN-',
        };
      case 'credit_note':
        return {
          title: 'Purchase Credit Note',
          nepaliTitle: 'Credit Note',
          subtitle: 'Supplier Credit Adjustment',
          desc: 'Record supplier credit note received for post-purchase volume discount, rebates, or trade allowances.',
          badgeBg: 'bg-purple-50 text-purple-800 border-purple-300',
          iconBg: 'bg-purple-100 text-purple-700',
          icon: <ArrowUpRight className="h-5 w-5" />,
          buttonText: 'Post & Record Credit Note',
          submitColor: 'bg-purple-600 hover:bg-purple-700',
          docPrefix: 'PCN-',
        };
    }
  }, [currentTxType, settings.purchasePrefix]);

  // Reason options for non-invoice transactions
  const reasonOptions = useMemo(() => {
    if (currentTxType === 'purchase_return') {
      return [
        'Defective fabric / stitching defect',
        'Damaged in transit / wet carton damage',
        'Wrong size / color / SKU mismatch',
        'Excess quantity delivered by supplier',
        'Quality below purchase order sample',
        'Late delivery / expired seasonal contract',
        'Other supplier dispute',
      ];
    }
    if (currentTxType === 'debit_note') {
      return [
        'Billed at higher price than purchase agreement',
        'Shortage in carton physical count',
        'Transit damage cost compensation claim',
        'Unapproved rate increase by vendor',
        'Reimbursement of freight/porterage paid on vendor behalf',
        'Other price variance claim',
      ];
    }
    return [
      'Supplier annual volume trade rebate',
      'Post-purchase seasonal price drop concession',
      'Prompt cash payment rebate granted by supplier',
      'Goodwill compensation credit memo',
      'Other vendor discount/rebate',
    ];
  }, [currentTxType]);

  // Handle switching transaction type
  const handleTxTypeChange = (newType: PurchaseTransactionType) => {
    setCurrentTxType(newType);
    setLines([]);
    setErrorMessage(null);
    setSuccessMessage(null);
    if (newType === 'purchase_return') {
      setReason('Defective fabric / stitching defect');
    } else if (newType === 'debit_note') {
      setReason('Billed at higher price than purchase agreement');
    } else if (newType === 'credit_note') {
      setReason('Supplier annual volume trade rebate');
    }
  };

  // Auto-fill lines from previous purchase bill (for Purchase Return or Notes)
  const handleAutofillFromPastBill = (pastBillId: string) => {
    const pastBill = purchaseBills.find((b) => b.id === pastBillId);
    if (!pastBill) return;

    setRefBillNo(pastBill.billNo);
    setSupplierBillNo(pastBill.supplierBillNo);
    if (pastBill.warehouseId) {
      setSelectedWarehouseId(pastBill.warehouseId);
    }

    // Populate lines with default quantities from the past bill
    const newLines = pastBill.items.map((item) => ({
      itemId: item.itemId,
      quantity: Math.min(item.quantity, 10), // default sample return qty
      unitCost: item.unitCost,
    }));
    setLines(newLines);
    setSuccessMessage(`Auto-filled items from past bill ${pastBill.billNo} (${pastBill.supplierBillNo})!`);
    setTimeout(() => setSuccessMessage(null), 4000);
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

  const handleAddItem = (itemIdToAdd: string) => {
    const item = items.find((i) => i.id === itemIdToAdd);
    if (!item) return;

    // For Purchase Return, check if warehouse has stock on hand
    if (currentTxType === 'purchase_return') {
      const onHand = getItemStock(batches, item.id, selectedWarehouseId);
      if (onHand <= 0) {
        setErrorMessage(`Cannot return "${item.name}". No stock currently available in ${selectedWarehouse?.name}.`);
        return;
      }
    }

    const existingIndex = lines.findIndex((l) => l.itemId === item.id);
    if (existingIndex >= 0) {
      const updated = [...lines];
      const newQty = updated[existingIndex].quantity + (currentTxType === 'purchase_return' ? 2 : 10);

      // Validate on-hand stock for purchase return
      if (currentTxType === 'purchase_return') {
        const onHand = getItemStock(batches, item.id, selectedWarehouseId);
        if (newQty > onHand) {
          setErrorMessage(`Cannot return ${newQty} units. Only ${onHand} units in stock in ${selectedWarehouse?.name}.`);
          return;
        }
      }

      updated[existingIndex].quantity = newQty;
      setLines(updated);
    } else {
      const defaultQty = currentTxType === 'purchase_return' ? 2 : 20;

      // Validate on-hand stock for purchase return
      if (currentTxType === 'purchase_return') {
        const onHand = getItemStock(batches, item.id, selectedWarehouseId);
        if (defaultQty > onHand) {
          setLines([
            ...lines,
            {
              itemId: item.id,
              quantity: Math.max(1, onHand),
              unitCost: item.costPrice,
            },
          ]);
          setErrorMessage(null);
          return;
        }
      }

      setLines([
        ...lines,
        {
          itemId: item.id,
          quantity: defaultQty,
          unitCost: item.costPrice,
        },
      ]);
    }
    setErrorMessage(null);
  };

  const handleUpdateLine = (index: number, field: 'quantity' | 'unitCost', val: number) => {
    const line = lines[index];
    if (field === 'quantity' && currentTxType === 'purchase_return') {
      const onHand = getItemStock(batches, line.itemId, selectedWarehouseId);
      if (val > onHand) {
        setErrorMessage(`Cannot return ${val} units. Maximum stock available in ${selectedWarehouse?.name} is ${onHand}.`);
        return;
      }
    }
    const updated = [...lines];
    updated[index] = { ...updated[index], [field]: Math.max(0, val) };
    setLines(updated);
    setErrorMessage(null);
  };

  const handleQuantityStep = (index: number, step: number) => {
    const line = lines[index];
    const newQty = line.quantity + step;
    if (newQty <= 0) {
      handleRemoveLine(index);
      return;
    }
    handleUpdateLine(index, 'quantity', newQty);
  };

  const handleRemoveLine = (index: number) => {
    setLines(lines.filter((_, i) => i !== index));
  };

  // Purchase calculation rules are centralized so the frontend uses the same VAT/cost rules everywhere.
  const isBusinessPan = (settings.businessNature ?? 'VAT') === 'PAN';
  const isVendorVatApplicable = selectedVendor?.isVatApplicable ?? true;
  const effectiveVatRate = getPurchaseVatRate(settings);
  const isEffectiveVatBill = isSupplierVatBill;


  const calculatedLines: PurchaseItemLine[] = useMemo(() => lines.map((l) => {
    const item = items.find((i) => i.id === l.itemId);
    if (!item) return null;
    return calculatePurchaseLine(
      {
        itemId: item.id,
        sku: item.sku,
        name: item.name,
        size: item.size,
        color: item.color,
        hsnCode: item.hsnCode,
      },
      l.quantity,
      l.unitCost,
      settings,
      isSupplierVatBill,
      isVendorVatApplicable,
    );
  }).filter((line): line is PurchaseItemLine => Boolean(line)), [lines, items, settings, isSupplierVatBill, isVendorVatApplicable]);

  // const subtotal = roundMoney(lines.reduce((acc, l) => acc + l.quantity * l.unitCost, 0));
  const subtotal = roundMoney(
    calculatedLines.reduce(
      (acc, l) => {
        const base =
          l.quantity *
          (l.unitCost);

        return acc + base;
      },
      0
    )
  );
  const taxableAmount = roundMoney(calculatedLines.reduce((acc, l) => acc + l.taxableAmount, 0));
  const nonTaxableAmount = roundMoney(calculatedLines.reduce((acc, l) => acc + (!l.isVatApplicable ? l.lineTotal : 0), 0));
  const vatAmount = roundMoney(calculatedLines.reduce((acc, l) => acc + l.vatAmount, 0));
  const grandTotal = roundMoney(calculatedLines.reduce((acc, l) => acc + l.lineTotal, 0));

  // Submit Transaction. B4 delegates document numbering, FIFO mutation,
  // journal posting, vendor balance updates, and SQL transaction atomicity to
  // the backend. The frontend still performs immediate UX validation first.
  const handleSubmitPurchase = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const headerValidation = validatePurchaseHeader({
      bill: { vendorId: selectedVendorId, warehouseId: selectedWarehouseId, supplierBillNo: supplierBillNo.trim() || refBillNo.trim(), refBillNo: currentTxType !== 'purchase_invoice' ? refBillNo.trim() : undefined, mitiDate, adDate },
      vendor: selectedVendor, existingBills: purchaseBills, transactionType: currentTxType, fiscalYear: settings.fiscalYear,
    });
    if (!headerValidation.isValid) { setErrorMessage(headerValidation.message || 'Invalid purchase header.'); return; }

    const lineValidation = validatePurchaseLines(lines);
    if (!lineValidation.isValid) { setErrorMessage(lineValidation.message || 'Invalid purchase lines.'); return; }
    if (!selectedWarehouse) { setErrorMessage('Please select a valid warehouse.'); return; }

    if (currentTxType === 'purchase_return') {
      const originalBill = purchaseBills.find((b) => b.billNo.trim().toLowerCase() === refBillNo.trim().toLowerCase() && b.vendorId === selectedVendor?.id);
      if (!originalBill) { setErrorMessage(`Original purchase bill ${refBillNo.trim()} was not found for this supplier.`); return; }
      if (originalBill.warehouseId !== selectedWarehouse.id) { setErrorMessage(`Purchase return must use the original bill's warehouse (${originalBill.warehouseName}).`); return; }

      // Keep the local FIFO check for fast feedback, but the backend repeats it
      // under SQL row locks and remains authoritative.
      const allocation = allocatePurchaseReturn(batches, lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity })), selectedWarehouse.id);
      if (!allocation.isValid) { setErrorMessage(allocation.message || 'Unable to allocate purchase return from FIFO stock.'); return; }
    }

    try {
      const savedBill = await onRecordPurchase({
        transactionType: currentTxType,
        supplierBillNo: supplierBillNo.trim() || refBillNo.trim(),
        refBillNo: currentTxType !== 'purchase_invoice' ? refBillNo.trim() : undefined,
        reason: currentTxType !== 'purchase_invoice' ? reason : undefined,
        fiscalYear: settings.fiscalYear,
        mitiDate,
        adDate,
        vendorId: selectedVendor!.id,
        warehouseId: selectedWarehouse.id,
        paymentMode,
        lines: lines.map((line) => ({ itemId: line.itemId, quantity: line.quantity, unitCost: line.unitCost })),
        notes: notes.trim() || undefined,
        supplierVatBill: isSupplierVatBill,
      });

      setLines([]);
      setSupplierBillNo('');
      setRefBillNo('');
      setNotes('');
      setErrorMessage(null);
      setSuccessMessage(`${txConfig.title} ${savedBill.billNo} successfully recorded and posted to General Ledger!`);
      // Open the posted purchase bill immediately, matching the Sales invoice flow.
      onViewPurchaseBill(savedBill);
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Purchase transaction could not be posted. No changes were committed.');
    }
  };

  // KPIs for Purchase Module
  const totalPurchaseValue = purchaseBills
    .filter((b) => !b.transactionType || b.transactionType === 'purchase_invoice')
    .reduce((acc, b) => acc + b.grandTotal, 0);

  const totalReturnsValue = purchaseBills
    .filter((b) => b.transactionType === 'purchase_return')
    .reduce((acc, b) => acc + b.grandTotal, 0);

  const totalInputVat = purchaseBills
    .filter((b) => !b.transactionType || b.transactionType === 'purchase_invoice')
    .reduce((acc, b) => acc + b.vatAmount, 0);

  const totalPayables = partners
    .filter((p) => p.type === 'vendor' || p.type === 'both')
    .reduce((acc, p) => acc + (p.currentBalance < 0 ? Math.abs(p.currentBalance) : 0), 0);

  // Filtered History
  const filteredHistory = purchaseBills.filter((b) => {
    const tx = b.transactionType || 'purchase_invoice';
    const matchesTx = historyTxFilter === 'All' || tx === historyTxFilter;
    const matchesSearch =
      b.billNo.toLowerCase().includes(historySearchQuery.toLowerCase()) ||
      b.supplierBillNo.toLowerCase().includes(historySearchQuery.toLowerCase()) ||
      (b.refBillNo && b.refBillNo.toLowerCase().includes(historySearchQuery.toLowerCase())) ||
      b.vendorName.toLowerCase().includes(historySearchQuery.toLowerCase()) ||
      b.vendorPan.includes(historySearchQuery);
    const matchesPayment =
      historyPaymentFilter === 'All' || b.paymentMode === historyPaymentFilter;
    return matchesTx && matchesSearch && matchesPayment;
  });

  // Export Purchase History as CSV
  const handleExportCsv = () => {
    const headers = [
      'Transaction Type',
      'Internal Doc No',
      'Supplier Invoice No',
      'Ref Bill No',
      'Reason',
      'Miti Date (BS)',
      'AD Date',
      'Vendor Name',
      'Vendor PAN',
      'Receiving Warehouse',
      'Payment Mode',
      'Taxable (NPR)',
      `${effectiveVatRate}% Input VAT (NPR)`,
      'Grand Total (NPR)',
    ];

    const rows = filteredHistory.map((b) => [
      `"${b.transactionType || 'purchase_invoice'}"`,
      b.billNo,
      `"${b.supplierBillNo.replace(/"/g, '""')}"`,
      b.refBillNo ? `"${b.refBillNo.replace(/"/g, '""')}"` : '""',
      b.reason ? `"${b.reason.replace(/"/g, '""')}"` : '""',
      b.mitiDate,
      b.adDate,
      `"${b.vendorName.replace(/"/g, '""')}"`,
      b.vendorPan,
      `"${b.warehouseName}"`,
      b.paymentMode,
      b.taxableAmount.toFixed(2),
      b.vatAmount.toFixed(2),
      b.grandTotal.toFixed(2),
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Purchase_Register_${getCurrentBsDate()}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className="space-y-6">
      {/* Top Executive KPI Metrics Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider" title="Total purchases inwarded into warehouse">Total Purchases</span>
            <div className="text-xl font-mono font-bold text-slate-900 mt-1">{formatNPR(totalPurchaseValue)}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {purchaseBills.filter((b) => !b.transactionType || b.transactionType === 'purchase_invoice').length} bills inwarded
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
            <ShoppingBag className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider" title="Total returned garments to suppliers">Purchase Returns</span>
            <div className="text-xl font-mono font-bold text-amber-700 mt-1">{formatNPR(totalReturnsValue)}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {purchaseBills.filter((b) => b.transactionType === 'purchase_return').length} returns processed
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
            <RotateCcw className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider" title="13% Input VAT eligible for tax credit in IRD Annex 8">13% Input VAT</span>
            <div className="text-xl font-mono font-bold text-indigo-700 mt-1">{formatNPR(totalInputVat)}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">IRD Annex 8 statutory tax credit</div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold">
            <CheckCircle2 className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider" title="Total accounts payable owed to suppliers">Accounts Payable</span>
            <div className="text-xl font-mono font-bold text-rose-700 mt-1">{formatNPR(totalPayables)}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Owed to garment vendors</div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-rose-50 text-rose-700 flex items-center justify-center font-bold">
            <Clock className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Module Title & Tab Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 flex items-center">
            <ShoppingBag className="h-5 w-5 mr-2 text-indigo-600" />
            Purchase & Vendor Operations
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Record Purchase Invoices, Goods Returns, Debit Notes, and Credit Notes with automated FIFO costing.
          </p>
        </div>

        {/* Sub Navigation */}
        <div className="flex space-x-2">
          <button
            id="subtab-new-purchase-btn"
            onClick={() => setActiveSubTab('new_purchase')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center ${
              activeSubTab === 'new_purchase'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            New Transaction
          </button>
          <button
            id="subtab-purchase-history-btn"
            onClick={() => setActiveSubTab('history')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center ${
              activeSubTab === 'history'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <Layers className="h-3.5 w-3.5 mr-1.5" />
            Purchase Register ({purchaseBills.length})
          </button>
        </div>
      </div>

      {/* Notifications */}
      {errorMessage && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3.5 text-xs text-red-800 flex items-center justify-between shadow-xs">
          <div className="flex items-center space-x-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            <span className="font-semibold">{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-red-400 hover:text-red-700 font-bold cursor-pointer">
            &times;
          </button>
        </div>
      )}

      {successMessage && (
        <div className="rounded-xl bg-indigo-50 border border-indigo-200 p-3.5 text-xs text-indigo-900 flex items-center justify-between shadow-xs">
          <div className="flex items-center space-x-2">
            <CheckCircle className="h-4 w-4 shrink-0 text-indigo-600" />
            <span className="font-semibold">{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-indigo-400 hover:text-indigo-700 font-bold cursor-pointer">
            &times;
          </button>
        </div>
      )}

      {activeSubTab === 'new_purchase' ? (
        <div className="space-y-6">
          {/* ========================================================= */}
          {/* TOP TRANSACTION SELECTION DROPDOWN MENU BAR               */}
          {/* ========================================================= */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center space-x-3.5">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold shrink-0 ${txConfig.iconBg}`}>
                  {txConfig.icon}
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <label htmlFor="purchase-tx-dropdown-select" className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Purchase Transaction Mode
                    </label>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${txConfig.badgeBg}`}>
                      {txConfig.nepaliTitle}
                    </span>
                  </div>
                  <div className="relative mt-1">
                    <select
                      id="purchase-tx-dropdown-select"
                      value={currentTxType}
                      onChange={(e) => handleTxTypeChange(e.target.value as PurchaseTransactionType)}
                      className="w-full sm:w-80 font-bold text-sm rounded-lg border-2 border-slate-300 bg-white px-3.5 py-1.5 text-slate-900 shadow-xs focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600 cursor-pointer appearance-none pr-9"
                    >
                      <option value="purchase_invoice">Purchase Invoice (Inward Stock)</option>
                      <option value="purchase_return">Purchase Return (Supplier Goods Return)</option>
                      <option value="debit_note">Debit Note (Supplier Claim / Memo)</option>
                      <option value="credit_note">Credit Note (Supplier Rebate / Memo)</option>
                    </select>
                    <ChevronDown className="h-4 w-4 text-slate-500 absolute right-3 top-2.5 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Transaction Workflow Description Pill */}
              <div className="flex-1 md:max-w-md bg-slate-50 rounded-lg p-2.5 border border-slate-200 text-xs flex items-start space-x-2">
                <Info className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-slate-800">{txConfig.subtitle}</div>
                  <p className="text-[11px] text-slate-500 leading-snug mt-0.5">{txConfig.desc}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 space-y-6">
              {/* Vendor & Supplier Document Details */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    1. Vendor & Logistics Setup ({txConfig.title})
                  </span>
                  <span className="text-[11px] font-mono text-slate-500">
                    Fiscal Year: <span className="font-bold text-slate-700">{settings.fiscalYear}</span>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {/* Vendor */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1" title="Select vendor or supplier">
                      Vendor / Supplier *
                    </label>
                    <select
                      id="purchase-vendor-select"
                      value={selectedVendorId}
                      onChange={(e) => {
                        setSelectedVendorId(e.target.value);
                        setRefBillNo('');
                      }}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-900 focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600 bg-white"
                    >
                      {partners
                        .filter((p) => p.type === 'vendor' || p.type === 'both')
                        .map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name} (PAN: {v.panNumber})
                          </option>
                        ))}
                    </select>
                    {selectedVendor && (
                      <div className="mt-1 text-[10px] text-slate-500 flex justify-between">
                        <span>Balance:</span>
                        <span className={`font-bold font-mono ${selectedVendor.currentBalance < 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                          {formatNPR(Math.abs(selectedVendor.currentBalance))} {selectedVendor.currentBalance < 0 ? 'Cr (Payable)' : 'Dr'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Supplier Physical Invoice No */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {currentTxType === 'purchase_invoice'
                        ? 'Supplier Physical Bill No. *'
                        : 'Supplier Reference Memo No.'}
                    </label>
                    <input
                      type="text"
                      value={supplierBillNo}
                      onChange={(e) => setSupplierBillNo(e.target.value)}
                      placeholder={currentTxType === 'purchase_invoice' ? 'e.g. INV-9042' : 'e.g. RET-SUPP-101'}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono text-slate-900 focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600"
                    />
                    <span className="text-[10px] text-slate-400 block mt-0.5">Physical invoice printed by vendor</span>
                  </div>

                  {/* Destination / Source Warehouse */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {currentTxType === 'purchase_return'
                        ? 'Dispatch Warehouse *'
                        : 'Receiving Warehouse *'}
                    </label>
                    <select
                      value={selectedWarehouseId}
                      onChange={(e) => setSelectedWarehouseId(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-900 focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600 bg-white"
                    >
                      {warehouses.map((wh) => (
                        <option key={wh.id} value={wh.id}>
                          {wh.name} ({wh.code})
                        </option>
                      ))}
                    </select>
                    <div className="mt-1 text-[10px] text-indigo-700 flex items-center">
                      <Building2 className="h-3 w-3 mr-1 shrink-0" />
                      <span>
                        {currentTxType === 'purchase_return'
                          ? 'Stock depleted from this location'
                          : 'Inward FIFO batch lot created here'}
                      </span>
                    </div>
                  </div>

                  {/* Payment Mode */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1" title="Select payment term">
                      Payment Mode
                    </label>
                    <select
                      value={paymentMode}
                      onChange={(e) => setPaymentMode(e.target.value as PurchaseBill['paymentMode'])}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-900 focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600 bg-white"
                    >
                      <option value="Credit">Credit (Accounts Payable Cr/Dr)</option>
                      <option value="Cash">Cash (Cash Cr/Dr)</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                    </select>
                  </div>

                  {/* Dates */}
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1" title="Transaction date in Bikram Sambat and Gregorian formats">
                      Transaction Date
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={mitiDate}
                        onChange={(e) => setMitiDate(e.target.value)}
                        placeholder="YYYY-MM-DD (B.S.)"
                        className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono text-slate-900 focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600"
                      />
                      <input
                        type="date"
                        value={adDate}
                        onChange={(e) => setAdDate(e.target.value)}
                        className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-900 focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600"
                      />
                    </div>
                  </div>

                  {/* Supplier Bill Nature / VAT Selection (Requirement 1 & 2) */}
                  <div className="sm:col-span-3 bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center space-x-2">
                        <ShieldCheck className="h-4 w-4 text-indigo-600" />
                        <span className="text-xs font-bold text-slate-800" title="Choose whether supplier issued standard 13% VAT tax invoice or Non-VAT/PAN bill">
                          Supplier Bill Nature & VAT Status
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-[11px] text-slate-500">Vendor Master VAT:</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          isVendorVatApplicable ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {isVendorVatApplicable ? 'VAT Applicable in Master' : 'VAT Disabled in Master'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <label className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                        isSupplierVatBill
                          ? 'border-indigo-400 bg-indigo-50/70 text-indigo-950'
                          : 'border-slate-200 bg-white hover:bg-slate-100 text-slate-700'
                      }`}>
                        <input
                          type="radio"
                          name="supplierVatType"
                          checked={isSupplierVatBill}
                          onChange={() => setIsSupplierVatBill(true)}
                          className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                        />
                        <div className="text-xs">
                          <div className="font-bold flex items-center gap-1.5">
                            <span>13% Tax Invoice (VAT Bill)</span>
                            <span className="text-[10px] bg-indigo-600 text-white px-1.5 py-0.2 rounded font-bold">13% VAT</span>
                          </div>
                          <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                            {isBusinessPan
                              ? 'Because your business is PAN registered, the 13% VAT amount is capitalized into the item inventory cost and FIFO valuation accordingly.'
                              : 'Standard VAT invoice: 13% input VAT is recorded in Annex 8 and claimed from IRD.'}
                          </p>
                        </div>
                      </label>

                      <label className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                        !isSupplierVatBill
                          ? 'border-indigo-400 bg-indigo-50/70 text-indigo-950'
                          : 'border-slate-200 bg-white hover:bg-slate-100 text-slate-700'
                      }`}>
                        <input
                          type="radio"
                          name="supplierVatType"
                          checked={!isSupplierVatBill}
                          onChange={() => setIsSupplierVatBill(false)}
                          className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                        />
                        <div className="text-xs">
                          <div className="font-bold flex items-center gap-1.5">
                            <span>Non-VAT / PAN Bill</span>
                            <span className="text-[10px] bg-slate-600 text-white px-1.5 py-0.2 rounded font-bold">0% VAT</span>
                          </div>
                          <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                            Supplier issued non-VAT / PAN bill or exempt goods. VAT amount is 0 and regular item cost is booked.
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Reference Bill & Reason (For Non-Invoice Transactions) */}
                  {currentTxType !== 'purchase_invoice' && (
                    <div className="sm:col-span-3 bg-amber-50/60 border border-amber-200 rounded-xl p-3.5 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-200/60 pb-2">
                        <div className="flex items-center space-x-2">
                          <FileText className="h-4 w-4 text-amber-700" />
                          <span className="text-xs font-bold text-amber-950">
                            Original Purchase Bill Reference
                          </span>
                        </div>
                        {vendorPastBills.length > 0 && (
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-amber-900 font-medium">Quick Pick Bill:</span>
                            <select
                              onChange={(e) => {
                                if (e.target.value) handleAutofillFromPastBill(e.target.value);
                              }}
                              className="text-xs rounded-md border border-amber-300 bg-white px-2 py-1 text-slate-800"
                              defaultValue=""
                            >
                              <option value="" disabled>-- Select Vendor Past Bill --</option>
                              {vendorPastBills.map((pb) => (
                                <option key={pb.id} value={pb.id}>
                                  {pb.billNo} ({pb.supplierBillNo}) - {pb.mitiDate} - {formatNPR(pb.grandTotal)}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-amber-950 mb-1">
                            Original Supplier Bill / Internal Bill No. *
                          </label>
                          <input
                            type="text"
                            value={refBillNo}
                            onChange={(e) => setRefBillNo(e.target.value)}
                            placeholder="e.g. PUR-2081/82-0001 or INV-892"
                            className="w-full rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-mono font-medium text-slate-900 focus:border-amber-600 focus:outline-hidden"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-amber-950 mb-1">
                            Statutory Reason for Return / Adjustment *
                          </label>
                          <select
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            className="w-full rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-amber-600 focus:outline-hidden"
                          >
                            {reasonOptions.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Quick Garment Add Bar + Catalog Selector */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <span className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center">
                    <Tag className="h-4 w-4 mr-1.5 text-indigo-600" />
                    2. Garment Selection & Barcode Scan
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {currentTxType === 'purchase_return' ? 'Select goods to return from warehouse' : 'Click item to add wholesale batch'}
                  </span>
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
                      const warehouseStock = getItemStock(batches, item.id, selectedWarehouseId);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleAddItem(item.id)}
                          className="text-left p-2.5 rounded-lg border border-slate-200 bg-white hover:border-indigo-500 hover:shadow-xs transition-all cursor-pointer"
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
                            <span className="font-mono text-slate-500">Cost:</span>
                            <span className="font-bold text-indigo-700 font-mono">{formatNPR(item.costPrice)}</span>
                          </div>
                          {/* Warehouse On Hand badge */}
                          <div className="mt-1 pt-1 border-t border-slate-100 flex justify-between items-center text-[10px]">
                            <span className="text-slate-400">On Hand:</span>
                            <span className={`font-mono font-bold ${warehouseStock > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
                              {warehouseStock} pcs
                            </span>
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>

              {/* Line Items Table */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    3. Transaction Line Items ({lines.length})
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {lines.reduce((acc, l) => acc + l.quantity, 0)} total units
                  </span>
                </div>

                {lines.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
                    No items added yet. Click on any garment above to add to this {txConfig.title}.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-slate-700 font-semibold">
                          <th className="py-2.5 px-2 text-center w-8">#</th>
                          <th className="py-2.5 px-3">Item Description</th>
                          <th className="py-2.5 px-2 text-center">Size/Color</th>
                          <th className="py-2.5 px-2 text-center w-32">
                            {currentTxType === 'purchase_return' ? 'Return Qty' : 'Qty'}
                          </th>
                          <th className="py-2.5 px-2 text-right w-28">Unit Rate (NPR)</th>
                          <th className="py-2.5 px-2 text-center w-20">13% VAT</th>
                          <th className="py-2.5 px-3 text-right w-28">Line Total</th>
                          <th className="py-2.5 px-2 text-center w-8"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {calculatedLines.map((line, idx) => (
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
                            <td className="py-2 px-2 text-center">
                              <div className="inline-flex items-center rounded-lg border border-slate-300 bg-white">
                                <button
                                  type="button"
                                  onClick={() => handleQuantityStep(idx, currentTxType === 'purchase_return' ? -1 : -5)}
                                  className="px-2 py-1 text-slate-600 hover:bg-slate-100 rounded-l-md transition-colors cursor-pointer"
                                >
                                  <Minus className="h-3 w-3" />
                                </button>
                                <input
                                  type="number"
                                  min="1"
                                  value={lines[idx].quantity}
                                  onChange={(e) => handleUpdateLine(idx, 'quantity', parseInt(e.target.value) || 1)}
                                  className="w-12 text-center text-xs font-bold text-slate-900 focus:outline-hidden py-1 border-x border-slate-200"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleQuantityStep(idx, currentTxType === 'purchase_return' ? 1 : 5)}
                                  className="px-2 py-1 text-slate-600 hover:bg-slate-100 rounded-r-md transition-colors cursor-pointer"
                                >
                                  <Plus className="h-3 w-3" />
                                </button>
                              </div>
                            </td>
                            <td className="py-2 px-2 text-right">
                              <input
                                type="number"
                                min="0"
                                value={lines[idx].unitCost}
                                onChange={(e) => handleUpdateLine(idx, 'unitCost', parseFloat(e.target.value) || 0)}
                                className="w-24 rounded border border-slate-300 px-2 py-1 text-right text-xs font-mono font-semibold focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600"
                              />
                            </td>
                            <td className="py-2 px-2 text-center font-mono text-slate-600">
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
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Transaction Remarks / Notes */}
                <div className="pt-2">
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Transaction remarks, gate pass ref, transport consignment note, or vendor notes..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800 focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600"
                  />
                </div>
              </div>
            </div>

            {/* Right Summary & Automated General Ledger Posting Panel */}
            <div className="lg:col-span-4 space-y-6">
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4 sticky top-20">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center border-b border-slate-100 pb-2">
                  {txConfig.icon}
                  <span className="ml-1.5">{txConfig.title} Calculation</span>
                </h3>

                <div className="space-y-2.5 text-xs text-slate-600">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span className="font-mono text-slate-900 font-medium">{formatNPR(subtotal)}</span>
                  </div>

                  <div className="flex justify-between pt-2 border-t border-slate-100">
                    <span className="font-medium text-slate-800">Taxable Amount:</span>
                    <span className="font-mono text-slate-900 font-medium">{formatNPR(taxableAmount)}</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="font-medium text-slate-800">{isBusinessPan ? 'Capitalized VAT:' : `${effectiveVatRate}% Input VAT:`}</span>
                    <span className="font-mono text-slate-900 font-medium">{formatNPR(vatAmount)}</span>
                  </div>

                  {nonTaxableAmount > 0 && (
                    <div className="flex justify-between">
                      <span className="font-medium text-slate-800">Exempt Amount:</span>
                      <span className="font-mono text-slate-900 font-medium">{formatNPR(nonTaxableAmount)}</span>
                    </div>
                  )}

                  <div className="flex justify-between pt-3 border-t-2 border-slate-900 text-base font-bold text-slate-950">
                    <span>Grand Total:</span>
                    <span className="font-mono text-indigo-700 font-bold">{formatNPR(grandTotal)}</span>
                  </div>
                </div>

                {/* Automated General Ledger Impact Preview */}
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 uppercase">
                    <span>Automated General Ledger Impact</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${txConfig.badgeBg}`}>
                      Balanced JV
                    </span>
                  </div>

                  {currentTxType === 'purchase_invoice' && (
                    <div className="pt-2 border-t border-slate-200 space-y-1 text-[10px] font-mono">
                      <div className="flex justify-between text-indigo-800">
                        <span>Dr Inventory Asset (1030)</span>
                        <span>{formatNPR(isBusinessPan ? taxableAmount + nonTaxableAmount + vatAmount : taxableAmount + nonTaxableAmount)}</span>
                      </div>
                      {!isBusinessPan && vatAmount > 0 && (
                        <div className="flex justify-between text-indigo-800">
                          <span>Dr 13% Input VAT Receivable (1040)</span>
                          <span>{formatNPR(vatAmount)}</span>
                        </div>
                      )}

                      {isBusinessPan && vatAmount > 0 && (
                        <div className="flex justify-between text-amber-800">
                          <span>
                            VAT Capitalized into Inventory
                          </span>

                          <span>
                            {formatNPR(vatAmount)}
                          </span>
                        </div>
                      )}

                      <div className="flex justify-between text-slate-700">
                        <span>Cr Vendor Accounts Payable (2010)</span>
                        <span>{formatNPR(grandTotal)}</span>
                      </div>
                    </div>
                  )}

                  {currentTxType === 'purchase_return' && (
                    <div className="pt-2 border-t border-slate-200 space-y-1 text-[10px] font-mono">
                      <div className="flex justify-between text-emerald-800">
                        <span>Dr Vendor Accounts Payable (2010)</span>
                        <span>{formatNPR(grandTotal)}</span>
                      </div>
                      <div className="flex justify-between text-rose-800">
                        <span>Cr 13% Input VAT Reversal (1040)</span>
                        <span>{formatNPR(vatAmount)}</span>
                      </div>
                      <div className="flex justify-between text-rose-800">
                        <span>Cr Inventory Asset (1030)</span>
                        <span>{formatNPR(taxableAmount + nonTaxableAmount)}</span>
                      </div>
                    </div>
                  )}

                  {currentTxType === 'debit_note' && (
                    <div className="pt-2 border-t border-slate-200 space-y-1 text-[10px] font-mono">
                      <div className="flex justify-between text-blue-800">
                        <span>Dr Vendor Accounts Payable (2010)</span>
                        <span>{formatNPR(grandTotal)}</span>
                      </div>
                      {!isBusinessPan && vatAmount > 0 && (
                        <div className="flex justify-between text-rose-800">
                          <span>Cr 13% Input VAT Reversal (1040)</span>
                          <span>{formatNPR(vatAmount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-rose-800">
                        <span>{isBusinessPan ? 'Cr Inventory Value (1030)' : 'Cr Inventory / Cost Adjustment (1030)'}</span>
                        <span>{formatNPR(isBusinessPan ? taxableAmount + nonTaxableAmount + vatAmount : taxableAmount + nonTaxableAmount)}</span>
                      </div>
                      <div className="text-[9px] text-slate-500 pt-1">
                        No physical stock quantity movement; remaining FIFO value is reduced.
                      </div>
                    </div>
                  )}

                  {currentTxType === 'credit_note' && (
                    <div className="pt-2 border-t border-slate-200 space-y-1 text-[10px] font-mono">
                      <div className="flex justify-between text-purple-800">
                        <span>{isBusinessPan ? 'Dr Inventory Value (1030)' : 'Dr Inventory Asset (1030)'}</span>
                        <span>{formatNPR(isBusinessPan ? taxableAmount + nonTaxableAmount + vatAmount : taxableAmount + nonTaxableAmount)}</span>
                      </div>
                      {!isBusinessPan && vatAmount > 0 && (
                        <div className="flex justify-between text-indigo-800">
                          <span>Dr 13% Input VAT Receivable (1040)</span>
                          <span>{formatNPR(vatAmount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-slate-700">
                        <span>Cr Vendor Accounts Payable (2010)</span>
                        <span>{formatNPR(grandTotal)}</span>
                      </div>
                      <div className="text-[9px] text-slate-500 pt-1">
                        No physical stock quantity movement; remaining FIFO value is increased.
                      </div>
                    </div>
                  )}
                </div>

                <button
                  id="submit-purchase-btn"
                  type="button"
                  onClick={() => handleSubmitPurchase()}
                  disabled={lines.length === 0}
                  className={`w-full py-3 rounded-lg text-sm font-bold text-white shadow-xs flex items-center justify-center space-x-2 transition-all cursor-pointer ${
                    lines.length === 0
                      ? 'bg-slate-300 cursor-not-allowed'
                      : txConfig.submitColor
                  }`}
                >
                  <CheckCircle className="h-4 w-4" />
                  <span>{txConfig.buttonText}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Purchase History & Registers View */
        <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/60">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              <div className="relative w-72">
                <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={historySearchQuery}
                  onChange={(e) => setHistorySearchQuery(e.target.value)}
                  placeholder="Search by Bill No, Ref Bill, Vendor, PAN..."
                  className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-1.5 text-xs text-slate-800 focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600"
                />
              </div>

              {/* Transaction Type Filter */}
              <div className="flex items-center space-x-1.5 text-xs">
                <Filter className="h-3.5 w-3.5 text-slate-500" />
                <select
                  value={historyTxFilter}
                  onChange={(e) => setHistoryTxFilter(e.target.value)}
                  className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-800 focus:border-indigo-600 focus:outline-hidden bg-white"
                >
                  <option value="All">All Transaction Types</option>
                  <option value="purchase_invoice">Purchase Invoices</option>
                  <option value="purchase_return">Purchase Returns</option>
                  <option value="debit_note">Debit Notes</option>
                  <option value="credit_note">Credit Notes</option>
                </select>
              </div>

              {/* Payment Filter */}
              <div className="flex items-center space-x-1.5 text-xs">
                <select
                  value={historyPaymentFilter}
                  onChange={(e) => setHistoryPaymentFilter(e.target.value)}
                  className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-800 focus:border-indigo-600 focus:outline-hidden bg-white"
                >
                  <option value="All">All Payment Modes</option>
                  <option value="Credit">Credit</option>
                  <option value="Cash">Cash</option>
                  <option value="Bank Transfer">Bank Transfer</option>
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

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100/70 text-slate-700 font-semibold">
                  <th className="py-3 px-3">Type</th>
                  <th className="py-3 px-3">Doc No</th>
                  <th className="py-3 px-3">Supplier / Ref Bill</th>
                  <th className="py-3 px-3">Miti / Date</th>
                  <th className="py-3 px-3">Vendor</th>
                  <th className="py-3 px-3">Warehouse</th>
                  <th className="py-3 px-3">Payment</th>
                  <th className="py-3 px-3 text-right">Taxable</th>
                  <th className="py-3 px-3 text-right">{effectiveVatRate}% Input VAT</th>
                  <th className="py-3 px-3 text-right">Grand Total</th>
                  <th className="py-3 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-8 text-center text-xs text-slate-400">
                      No purchase transactions found matching current filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredHistory.map((b) => {
                    const txType = b.transactionType || 'purchase_invoice';
                    let txBadge = (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Invoice
                      </span>
                    );
                    if (txType === 'purchase_return') {
                      txBadge = (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                          Return
                        </span>
                      );
                    } else if (txType === 'debit_note') {
                      txBadge = (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          Debit Note
                        </span>
                      );
                    } else if (txType === 'credit_note') {
                      txBadge = (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                          Credit Note
                        </span>
                      );
                    }

                    return (
                      <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-3">{txBadge}</td>
                        <td className="py-3 px-3 font-mono font-bold text-indigo-700">{b.billNo}</td>
                        <td className="py-3 px-3 font-mono text-slate-800">
                          <div className="font-semibold">{b.supplierBillNo}</div>
                          {b.refBillNo && (
                            <div className="text-[10px] text-amber-700">Ref: {b.refBillNo}</div>
                          )}
                          {b.reason && (
                            <div className="text-[10px] text-slate-400 truncate max-w-xs">{b.reason}</div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-slate-600">
                          <div className="font-medium">{b.mitiDate} B.S.</div>
                          <div className="text-[10px] text-slate-400">{b.adDate}</div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-900">{b.vendorName}</div>
                          <div className="font-mono text-[10px] text-slate-500">PAN: {b.vendorPan}</div>
                        </td>
                        <td className="py-3 px-3 text-slate-600">{b.warehouseName}</td>
                        <td className="py-3 px-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                              b.paymentMode === 'Cash'
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : b.paymentMode === 'Credit'
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : 'bg-indigo-50 text-indigo-800 border border-indigo-200'
                            }`}
                          >
                            {b.paymentMode}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono">{formatNPR(b.taxableAmount)}</td>
                        <td className="py-3 px-3 text-right font-mono text-indigo-700 font-semibold">{formatNPR(b.vatAmount)}</td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                          {formatNPR(b.grandTotal)}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => onViewPurchaseBill(b)}
                            className="inline-flex items-center px-2.5 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold transition-colors cursor-pointer border border-emerald-200"
                            title="View & Print Purchase Bill"
                          >
                            <FileText className="h-3 w-3 mr-1" />
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
