/**
 * ============================================================================
 * Nepal Double-Entry Accounting & FIFO Inventory Engine
 * Compliant with Nepal IRD Rule 23, Annex 7 (Sales) and Annex 8 (Purchase)
 * ============================================================================
 */

import { createEntityId } from './ids';
import { sortFifoBatches } from './inventory';

import {
  Account,
  FIFOBatch,
  JournalEntry,
  JournalLine,
  PurchaseBill,
  SalesInvoice,
  StockTransfer
} from '../types';

export interface DepleteResult {
  totalCogs: number;
  updatedBatches: FIFOBatch[];
  depletedDetails: {
    batchId: string;
    purchaseBillNo: string;
    purchaseDate: string;
    qtyTaken: number;
    unitCost: number;
    totalCost: number;
  }[];
  isSuccess: boolean;
  availableQty: number;
  shortageQty: number;
}

/**
 * First-In First-Out (FIFO) Stock Depletion Algorithm:
 * Depletes items from the oldest purchase batch by date to calculate Cost of Goods Sold (COGS).
 */
export function depleteFifoStock(
  batches: FIFOBatch[],
  itemId: string,
  warehouseId: string,
  requestedQty: number
): DepleteResult {
  const currentBatches = [...batches];
  // 1. Filter batches for matching item and warehouse with remaining stock
  // 2. Sort by purchase date ascending (FIFO order)
  const itemBatches = sortFifoBatches(
    currentBatches.filter(
      (b) => b.itemId === itemId && b.warehouseId === warehouseId && b.remainingQty > 0,
    ),
  );

  const availableQty = itemBatches.reduce((sum, b) => sum + b.remainingQty, 0);

  // If stock is insufficient, return failure with shortage details
  if (availableQty < requestedQty) {
    return {
      totalCogs: 0,
      updatedBatches: batches,
      depletedDetails: [],
      isSuccess: false,
      availableQty,
      shortageQty: requestedQty - availableQty,
    };
  }

  let qtyRemainingToDeduct = requestedQty;
  let totalCogs = 0;
  const depletedDetails: DepleteResult['depletedDetails'] = [];

  // Deduct stock sequentially starting from the oldest purchase lot (FIFO)
  const takeByBatchId = new Map<string, number>();
  for (const batch of itemBatches) {
    if (qtyRemainingToDeduct <= 0) break;
    const takeFromThisBatch = Math.min(batch.remainingQty, qtyRemainingToDeduct);
    takeByBatchId.set(batch.id, takeFromThisBatch);
    const batchCost = takeFromThisBatch * batch.unitCost;
    totalCogs += batchCost;
    qtyRemainingToDeduct -= takeFromThisBatch;
    depletedDetails.push({
      batchId: batch.id,
      purchaseBillNo: batch.purchaseBillNo,
      purchaseDate: batch.purchaseDate,
      qtyTaken: takeFromThisBatch,
      unitCost: batch.unitCost,
      totalCost: batchCost,
    });
  }

  const updatedBatches = currentBatches.map((b) => {
    const taken = takeByBatchId.get(b.id) ?? 0;
    return taken > 0 ? { ...b, remainingQty: b.remainingQty - taken } : b;
  });

  return {
    totalCogs,
    updatedBatches,
    depletedDetails,
    isSuccess: true,
    availableQty,
    shortageQty: 0,
  };
}

/**
 * Calculate on-hand stock quantity available in warehouse.
 */
export function getItemStock(
  batches: FIFOBatch[],
  itemId: string,
  warehouseId?: string
): number {
  return batches
    .filter((b) => b.itemId === itemId && (!warehouseId || b.warehouseId === warehouseId))
    .reduce((sum, b) => sum + b.remainingQty, 0);
}

/**
 * Computes total inventory valuation in warehouse based on FIFO lots.
 */
export function getInventoryValuation(
  batches: FIFOBatch[],
  itemId?: string,
  warehouseId?: string
): number {
  return batches
    .filter((b) => (!itemId || b.itemId === itemId) && (!warehouseId || b.warehouseId === warehouseId))
    .reduce((sum, b) => sum + b.remainingQty * b.unitCost, 0);
}

/**
 * Automated Sales Journal Posting:
 * 1. Tax Invoice:
 *    - Dr: Customer or Cash/Bank -> Grand Total
 *    - Dr: Cost of Goods Sold (COGS Expense) -> Total FIFO Cost
 *    - Cr: Output VAT Payable (13%) -> VAT Amount
 *    - Cr: Garment Sales Revenue -> Taxable + Non-taxable
 *    - Cr: Merchandise Inventory Asset -> Total FIFO Cost
 * 2. Sales Return:
 *    - Dr: Garment Sales Revenue -> Taxable Amount
 *    - Dr: Output VAT Payable (13% Reversal) -> VAT Amount
 *    - Cr: Customer or Cash/Bank -> Grand Total refund
 *    - Dr: Inventory Asset -> Restocked FIFO Cost
 *    - Cr: Cost of Goods Sold (COGS Reversal) -> Restocked FIFO Cost
 * 3. Sales Debit Note:
 *    - Dr: Customer or Cash account -> Total
 *    - Cr: Output VAT Payable (13%) -> VAT Amount
 *    - Cr: Sales Revenue Adjustment -> Amount
 * 4. Sales Credit Note:
 *    - Dr: Sales Revenue -> Discount Amount
 *    - Dr: Output VAT Payable -> VAT Adjustment
 *    - Cr: Customer account -> Total Credit
 */
export function postSalesFinancialJournal(
  invoice: SalesInvoice,
  currentAccounts: Account[]
): { journalEntry: JournalEntry; updatedAccounts: Account[] } {
  const isCashSale = invoice.paymentMode === 'Cash' || invoice.paymentMode === 'Bank / Fonepay QR';
  const customerAccountCode = isCashSale ? '1010' : '1020';
  const customerAccountName = isCashSale ? 'Cash & Bank (Fonepay/Nabil)' : 'Accounts Receivable (Customers)';
  const txType = invoice.transactionType || 'tax_invoice';

  let lines: JournalLine[] = [];
  let refType: JournalEntry['referenceType'] = 'Sales Invoice';
  let narration = '';

  if (txType === 'sales_return') {
    refType = 'Sales Return';
    narration = `Sales return and credit note: Customer ${invoice.customerName}, Ref Invoice: ${invoice.refInvoiceNo || invoice.invoiceNo}, Reason: ${invoice.reason || 'Sales Return'}.`;
    lines = [
      {
        accountCode: '4010',
        accountName: 'Garment Sales Revenue',
        debit: invoice.taxableAmount + invoice.nonTaxableAmount,
        credit: 0,
        description: `Sales revenue reversal for sales return: ${invoice.invoiceNo}`,
      },
      {
        accountCode: '2020',
        accountName: 'Output VAT Payable (13%)',
        debit: invoice.vatAmount,
        credit: 0,
        description: `13% Output VAT adjustment under Nepal VAT Rule 23`,
      },
      {
        accountCode: customerAccountCode,
        accountName: customerAccountName,
        debit: 0,
        credit: invoice.grandTotal,
        partnerId: invoice.customerId,
        partnerName: invoice.customerName,
        description: `Customer credit adjustment for sales return: ${invoice.invoiceNo}`,
      },
    ];

    if (invoice.totalCogs > 0) {
      lines.push(
        {
          accountCode: '1030',
          accountName: 'Merchandise Inventory Asset',
          debit: invoice.totalCogs,
          credit: 0,
          description: `Restock inventory asset at FIFO cost for sales return`,
        },
        {
          accountCode: '5010',
          accountName: 'Cost of Goods Sold (COGS)',
          debit: 0,
          credit: invoice.totalCogs,
          description: `COGS reversal for returned items`,
        }
      );
    }
  } else if (txType === 'debit_note') {
    refType = 'Sales Debit Note';
    narration = `Sales Debit Note issued: Customer ${invoice.customerName} (Ref Invoice: ${invoice.refInvoiceNo || 'N/A'}), Reason: ${invoice.reason || 'Rate difference'}.`;
    lines = [
      {
        accountCode: customerAccountCode,
        accountName: customerAccountName,
        debit: invoice.grandTotal,
        credit: 0,
        partnerId: invoice.customerId,
        partnerName: invoice.customerName,
        description: `Sales Debit Note ${invoice.invoiceNo} - Customer account Dr`,
      },
      {
        accountCode: '2020',
        accountName: 'Output VAT Payable (13%)',
        debit: 0,
        credit: invoice.vatAmount,
        description: `Sales Debit Note ${invoice.invoiceNo} - 13% Output VAT`,
      },
      {
        accountCode: '4010',
        accountName: 'Garment Sales Revenue',
        debit: 0,
        credit: invoice.taxableAmount + invoice.nonTaxableAmount,
        description: `Sales Debit Note ${invoice.invoiceNo} - Revenue adjustment`,
      },
    ];
  } else if (txType === 'credit_note') {
    refType = 'Sales Credit Note';
    narration = `Sales Credit Note issued: Customer ${invoice.customerName} (Ref Invoice: ${invoice.refInvoiceNo || 'N/A'}), Reason: ${invoice.reason || 'Trade discount/rebate'}.`;
    lines = [
      {
        accountCode: '4010',
        accountName: 'Garment Sales Revenue',
        debit: invoice.taxableAmount + invoice.nonTaxableAmount,
        credit: 0,
        description: `Sales Credit Note ${invoice.invoiceNo} - Trade discount allowance`,
      },
      {
        accountCode: '2020',
        accountName: 'Output VAT Payable (13%)',
        debit: invoice.vatAmount,
        credit: 0,
        description: `Sales Credit Note ${invoice.invoiceNo} - Output VAT reduction`,
      },
      {
        accountCode: customerAccountCode,
        accountName: customerAccountName,
        debit: 0,
        credit: invoice.grandTotal,
        partnerId: invoice.customerId,
        partnerName: invoice.customerName,
        description: `Sales Credit Note ${invoice.invoiceNo} - Customer credit adjustment`,
      },
    ];
  } else {
    // Standard Sales Invoice
    refType = 'Sales Invoice';
    narration = invoice.vatAmount > 0
      ? `Tax Invoice issued: Customer ${invoice.customerName} (PAN: ${invoice.customerPan || 'N/A'}), Invoice No: ${invoice.invoiceNo}. Double-entry ledger posting.`
      : `PAN / Non-VAT Invoice issued: Customer ${invoice.customerName} (PAN: ${invoice.customerPan || 'N/A'}), Invoice No: ${invoice.invoiceNo}.`;
    lines = [
      {
        accountCode: customerAccountCode,
        accountName: customerAccountName,
        debit: invoice.grandTotal,
        credit: 0,
        partnerId: invoice.customerId,
        partnerName: invoice.customerName,
        description: `Sales Invoice ${invoice.invoiceNo} - Customer/Cash Dr`,
      },
      {
        accountCode: '5010',
        accountName: 'Cost of Goods Sold (COGS)',
        debit: invoice.totalCogs,
        credit: 0,
        description: `Sales Invoice ${invoice.invoiceNo} - FIFO Cost of Goods Sold Dr`,
      },
      {
        accountCode: '4010',
        accountName: 'Garment Sales Revenue',
        debit: 0,
        credit: invoice.taxableAmount + invoice.nonTaxableAmount,
        description: `Sales Invoice ${invoice.invoiceNo} - Garment Sales Revenue Cr`,
      },
      {
        accountCode: '1030',
        accountName: 'Merchandise Inventory Asset',
        debit: 0,
        credit: invoice.totalCogs,
        description: `Sales Invoice ${invoice.invoiceNo} - Inventory Asset depletion (FIFO Cost Cr)`,
      },
    ];

    if (invoice.vatAmount > 0) {
      lines.push({
        accountCode: '2020',
        accountName: 'Output VAT Payable (13%)',
        debit: 0,
        credit: invoice.vatAmount,
        description: `Annex 7 13% Output VAT Payable Cr`,
      });
    }
  }

  const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0);
  const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0);

  const journalEntry: JournalEntry = {
    id: createEntityId('jv'),
    entryNo: `JV-${invoice.fiscalYear}-${Date.now().toString().slice(-6)}`,
    mitiDate: invoice.mitiDate,
    adDate: invoice.adDate,
    referenceType: refType,
    referenceNo: invoice.invoiceNo,
    narration,
    lines,
    totalDebit,
    totalCredit,
    isBalanced: Math.abs(totalDebit - totalCredit) < 0.01,
  };

  // Update Account Balances
  const updatedAccounts = currentAccounts.map((acc) => {
    const matchingLines = lines.filter((l) => l.accountCode === acc.code);
    if (matchingLines.length === 0) return acc;

    let balanceChange = 0;
    matchingLines.forEach((line) => {
      if (acc.category === 'asset' || acc.category === 'expense') {
        balanceChange += line.debit - line.credit;
      } else {
        balanceChange += line.credit - line.debit;
      }
    });

    return {
      ...acc,
      balance: acc.balance + balanceChange,
    };
  });

  return { journalEntry, updatedAccounts };
}

/**
 * Automated Purchase Journal Posting:
 * 1. Purchase Invoice:
 *    - Dr: Inventory Asset -> Purchase Cost
 *    - Dr: Input VAT Receivable (13%) -> VAT Amount (or capitalized into inventory if PAN entity)
 *    - Cr: Accounts Payable or Cash/Bank -> Grand Total
 * 2. Purchase Return:
 *    - Dr: Accounts Payable or Cash/Bank -> Return Total
 *    - Cr: Input VAT Receivable Reversal (13%) -> VAT Amount
 *    - Cr: Merchandise Inventory Asset -> Cost of returned items
 * 3. Purchase Debit Note:
 *    - Dr: Accounts Payable or Cash/Bank -> Total
 *    - Cr: Input VAT Receivable -> VAT Amount
 *    - Cr: Inventory Asset -> Cost Adjustment
 * 4. Purchase Credit Note:
 *    - Dr: Accounts Payable -> Total
 *    - Cr: Inventory Asset / Rebates -> Rebate Amount
 */
export function postPurchaseFinancialJournal(
  bill: PurchaseBill,
  currentAccounts: Account[]
): { journalEntry: JournalEntry; updatedAccounts: Account[] } {
  const isCashPurchase = bill.paymentMode === 'Cash' || bill.paymentMode === 'Bank Transfer';
  const vendorAccountCode = isCashPurchase ? '1010' : '2010';
  const vendorAccountName = isCashPurchase ? 'Cash & Bank (Fonepay/Nabil)' : 'Accounts Payable (Vendors)';
  const txType = bill.transactionType || 'purchase_invoice';

  let lines: JournalLine[] = [];
  let refType: JournalEntry['referenceType'] = 'Purchase Bill';
  let narration = '';

  if (txType === 'purchase_return') {
    refType = 'Purchase Return';
    narration = `Purchase return sent to vendor: Supplier ${bill.vendorName}, Ref Bill No: ${bill.refBillNo || bill.supplierBillNo}, Reason: ${bill.reason || 'Purchase Return'}.`;
    lines = [
      {
        accountCode: vendorAccountCode,
        accountName: vendorAccountName,
        debit: bill.grandTotal,
        credit: 0,
        partnerId: bill.vendorId,
        partnerName: bill.vendorName,
        description: `Purchase Return ${bill.billNo} - Accounts Payable Dr`,
      },
      {
        accountCode: '1040',
        accountName: 'Input VAT Receivable (13%)',
        debit: 0,
        credit: bill.vatAmount,
        description: `Purchase Return ${bill.billNo} - 13% Input VAT claim reversal`,
      },
      {
        accountCode: '1030',
        accountName: 'Merchandise Inventory Asset',
        debit: 0,
        credit: bill.totalCogs ?? (bill.taxableAmount + bill.nonTaxableAmount),
        description: `Purchase Return ${bill.billNo} - Inventory Asset deduction`,
      },
    ];
  } else if (txType === 'debit_note') {
    refType = 'Purchase Debit Note';
    narration = `Purchase Debit Note issued to vendor: Supplier ${bill.vendorName} (Ref Bill: ${bill.refBillNo || bill.supplierBillNo}), Reason: ${bill.reason || 'Rate variance or compensation claim'}.`;
    lines = [
      {
        accountCode: vendorAccountCode,
        accountName: vendorAccountName,
        debit: bill.grandTotal,
        credit: 0,
        partnerId: bill.vendorId,
        partnerName: bill.vendorName,
        description: `Purchase Debit Note ${bill.billNo} - Supplier account Dr`,
      },
      {
        accountCode: '1040',
        accountName: 'Input VAT Receivable (13%)',
        debit: 0,
        credit: bill.vatAmount,
        description: `Purchase Debit Note ${bill.billNo} - Input VAT reversal`,
      },
      {
        accountCode: '1030',
        accountName: 'Merchandise Inventory Asset',
        debit: 0,
        credit: bill.totalCogs ?? (bill.taxableAmount + bill.nonTaxableAmount),
        description: `Purchase Debit Note ${bill.billNo} - Inventory cost adjustment`,
      },
    ];
  } else if (txType === 'credit_note') {
    refType = 'Purchase Credit Note';
    narration = `Purchase Credit Note received from vendor: Supplier ${bill.vendorName} (Ref Bill: ${bill.refBillNo || bill.supplierBillNo}), Reason: ${bill.reason || 'Volume discount or trade rebate'}.`;
    lines = [
      {
        accountCode: vendorAccountCode,
        accountName: vendorAccountName,
        debit: bill.grandTotal,
        credit: 0,
        partnerId: bill.vendorId,
        partnerName: bill.vendorName,
        description: `Purchase Credit Note ${bill.billNo} - Supplier payment adjustment`,
      },
      {
        accountCode: '1030',
        accountName: 'Merchandise Inventory Asset',
        debit: 0,
        credit: bill.grandTotal,
        description: `Supplier rebate/discount credit adjustment to stock purchase cost`,
      },
    ];
  } else {
    // Standard Purchase Bill
    refType = 'Purchase Bill';
    const isVatCapitalized = bill.isCapitalizedVat;
    narration = isVatCapitalized
      ? `Garment purchase from supplier (PAN entity - VAT capitalized into stock cost): ${bill.vendorName} (PAN: ${bill.vendorPan}), Supplier Bill No: ${bill.supplierBillNo}.`
      : `Garment purchase from supplier: ${bill.vendorName} (PAN: ${bill.vendorPan}), Supplier Bill No: ${bill.supplierBillNo}. Double-entry ledger posting.`;

    if (isVatCapitalized) {
      // PAN Business Nature: VAT amount is capitalized into Merchandise Inventory Asset (no input tax credit)
      lines = [
        {
          accountCode: '1030',
          accountName: 'Merchandise Inventory Asset',
          debit: bill.grandTotal, // Includes both goods cost + supplier VAT
          credit: 0,
          description: `Stock receipt at ${bill.warehouseName} (VAT Rs. ${bill.vatAmount.toLocaleString('en-IN')} capitalized into inventory cost)`,
        },
        {
          accountCode: vendorAccountCode,
          accountName: vendorAccountName,
          debit: 0,
          credit: bill.grandTotal,
          partnerId: bill.vendorId,
          partnerName: bill.vendorName,
          description: `Purchase Bill ${bill.billNo} - Payable to ${bill.vendorName} (Accounts Payable Cr)`,
        },
      ];
    } else {
      lines = [
        {
          accountCode: '1030',
          accountName: 'Merchandise Inventory Asset',
          debit: bill.taxableAmount + bill.nonTaxableAmount,
          credit: 0,
          description: `Stock receipt at ${bill.warehouseName} at purchase cost`,
        },
      ];

      if (bill.vatAmount > 0) {
        lines.push({
          accountCode: '1040',
          accountName: 'Input VAT Receivable (13%)',
          debit: bill.vatAmount,
          credit: 0,
          description: `Annex 8 13% Input VAT claim receivable Dr`,
        });
      }

      lines.push({
        accountCode: vendorAccountCode,
        accountName: vendorAccountName,
        debit: 0,
        credit: bill.grandTotal,
        partnerId: bill.vendorId,
        partnerName: bill.vendorName,
        description: `Purchase Bill ${bill.billNo} - Payable to ${bill.vendorName} (Accounts Payable Cr)`,
      });
    }
  }

  const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0);
  const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0);

  const journalEntry: JournalEntry = {
    id: createEntityId('jv'),
    entryNo: `JV-${bill.fiscalYear}-${Date.now().toString().slice(-6)}`,
    mitiDate: bill.mitiDate,
    adDate: bill.adDate,
    referenceType: refType,
    referenceNo: bill.billNo,
    narration,
    lines,
    totalDebit,
    totalCredit,
    isBalanced: Math.abs(totalDebit - totalCredit) < 0.01,
  };

  const updatedAccounts = currentAccounts.map((acc) => {
    const matchingLines = lines.filter((l) => l.accountCode === acc.code);
    if (matchingLines.length === 0) return acc;

    let balanceChange = 0;
    matchingLines.forEach((line) => {
      if (acc.category === 'asset' || acc.category === 'expense') {
        balanceChange += line.debit - line.credit;
      } else {
        balanceChange += line.credit - line.debit;
      }
    });

    return {
      ...acc,
      balance: acc.balance + balanceChange,
    };
  });

  return { journalEntry, updatedAccounts };
}

export interface RestockItemSpec {
  itemId: string;
  warehouseId: string;
  quantity: number;
  unitCost?: number;
  refNo: string;
  returnDate: string;
}

/**
 * Re-enters returned items into FIFO inventory lots under Nepal VAT Rule 23.
 * Computes updated batches and restored inventory cost.
 */
export function restockFifoStock(
  batches: FIFOBatch[],
  returnedLines: RestockItemSpec[]
): { updatedBatches: FIFOBatch[]; cogsAdded: number } {
  const updated = [...batches];
  let totalRestockCost = 0;

  returnedLines.forEach((item) => {
    const existing = batches.filter((b) => b.itemId === item.itemId);
    const cost =
      item.unitCost && item.unitCost > 0
        ? item.unitCost
        : existing.length > 0
        ? existing[existing.length - 1].unitCost
        : 800;

    const lineCost = cost * item.quantity;
    totalRestockCost += lineCost;

    const newBatch: FIFOBatch = {
      id: createEntityId('batch-ret'),
      itemId: item.itemId,
      warehouseId: item.warehouseId,
      purchaseId: createEntityId('ret'),
      purchaseBillNo: `RET-${item.refNo}`,
      purchaseDate: item.returnDate,
      unitCost: cost,
      originalQty: item.quantity,
      remainingQty: item.quantity,
    };
    updated.push(newBatch);
  });

  return {
    updatedBatches: updated,
    cogsAdded: totalRestockCost,
  };
}

/**
 * Stock Transfer between warehouses.
 * Depletes FIFO batches from the source warehouse and creates target warehouse batches preserving cost layers.
 */
export function executeStockTransfer(
  batches: FIFOBatch[],
  transfer: StockTransfer
): { success: boolean; updatedBatches: FIFOBatch[]; errorMessage?: string } {
  let workingBatches = [...batches];

  for (const item of transfer.items) {
    // Deplete FIFO batches from source warehouse
    const depleteRes = depleteFifoStock(workingBatches, item.itemId, transfer.sourceWarehouseId, item.quantity);
    if (!depleteRes.isSuccess) {
      return {
        success: false,
        updatedBatches: batches,
        errorMessage: `Insufficient stock for ${item.name} in ${transfer.sourceWarehouseName}. Available: ${depleteRes.availableQty}, Required: ${item.quantity}`,
      };
    }

    workingBatches = depleteRes.updatedBatches;

    // Create target batches preserving each original FIFO cost layer
    for (const detail of depleteRes.depletedDetails) {
      const newTargetBatch: FIFOBatch = {
        id: createEntityId('batch-trf'),
        itemId: item.itemId,
        warehouseId: transfer.targetWarehouseId,
        purchaseId: `transfer-${transfer.id}`,
        purchaseBillNo: `TRF: ${detail.purchaseBillNo}`,
        purchaseDate: detail.purchaseDate,
        unitCost: detail.unitCost,
        originalQty: detail.qtyTaken,
        remainingQty: detail.qtyTaken,
      };
      workingBatches.push(newTargetBatch);
    }
  }

  return {
    success: true,
    updatedBatches: workingBatches,
  };
}
