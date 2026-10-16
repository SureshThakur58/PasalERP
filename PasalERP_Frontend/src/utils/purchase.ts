import { BusinessPartner, CompanySettings, FIFOBatch, PurchaseBill, PurchaseItemLine } from '../types';
import { depleteFifoStock } from './accountingEngine';

export interface PurchaseValidationResult {
  isValid: boolean;
  message?: string;
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function getPurchaseVatRate(settings: CompanySettings): number {
  const rate = Number(settings.vatRate);
  return Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : 13;
}

// export function calculatePurchaseLine(
//   item: Pick<PurchaseItemLine, 'itemId' | 'sku' | 'name' | 'size' | 'color' | 'hsnCode'>,
//   quantity: number,
//   unitCost: number,
//   settings: CompanySettings,
//   supplierVatBill: boolean,
//   supplierVatApplicable: boolean,
//   forcedVatApplicable?: boolean,
// ): PurchaseItemLine {
//   const baseAmount = roundMoney(quantity * unitCost);
//   const vatApplicable = forcedVatApplicable ?? (supplierVatBill && supplierVatApplicable);
//   const hasVat = vatApplicable && settings.businessNature === 'VAT';
//   const vatAmount = hasVat ? roundMoney(baseAmount * getPurchaseVatRate(settings) / 100) : 0;
//   const lineTotal = roundMoney(baseAmount + vatAmount);
//   const inventoryUnitCost = settings.businessNature === 'PAN' && vatApplicable
//     ? roundMoney(lineTotal / quantity)
//     : unitCost;

//   return {
//     ...item,
//     quantity,
//     unitCost: inventoryUnitCost,
//     isVatApplicable: hasVat,
//     taxableAmount: hasVat ? baseAmount : 0,
//     vatAmount,
//     lineTotal,
//   };
// }

export function calculatePurchaseLine(
  item: Pick<
    PurchaseItemLine,
    'itemId' |
    'sku' |
    'name' |
    'size' |
    'color' |
    'hsnCode'
  >,
  quantity: number,
  unitCost: number,
  settings: CompanySettings,
  supplierVatBill: boolean,
  supplierVatApplicable: boolean,
  forcedVatApplicable?: boolean,
): PurchaseItemLine {
  const baseAmount = roundMoney(
    quantity * unitCost
  );

  const vatApplicable =
    forcedVatApplicable ??
    supplierVatBill;

  const vatAmount =
    vatApplicable
      ? roundMoney(
          baseAmount *
          getPurchaseVatRate(settings) /
          100
        )
      : 0;

  const lineTotal =
    roundMoney(
      baseAmount + vatAmount
    );

  const isVatBusiness =
    settings.businessNature === 'VAT';

  const isCapitalizedVat =
    settings.businessNature === 'PAN' &&
    vatApplicable &&
    vatAmount > 0;

  const inventoryUnitCost =
    isCapitalizedVat
      ? roundMoney(lineTotal / quantity)
      : unitCost;

  return {
    ...item,
    quantity,
    unitCost: inventoryUnitCost,

    isVatApplicable:
      isVatBusiness && vatApplicable,

    taxableAmount:
      isVatBusiness && vatApplicable
        ? baseAmount
        : 0,

    vatAmount,

    lineTotal,
  };
}

export function validatePurchaseLines(lines: Array<{ itemId: string; quantity: number; unitCost: number }>): PurchaseValidationResult {
  if (!lines.length) return { isValid: false, message: 'At least one item is required.' };
  const seen = new Set<string>();
  for (const line of lines) {
    if (!line.itemId) return { isValid: false, message: 'Every purchase line must have an item.' };
    if (seen.has(line.itemId)) return { isValid: false, message: 'Duplicate item lines are not allowed. Combine the quantity into one line.' };
    seen.add(line.itemId);
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) return { isValid: false, message: 'Purchase quantity must be a positive whole number.' };
    if (!Number.isFinite(line.unitCost) || line.unitCost <= 0) return { isValid: false, message: 'Unit cost must be greater than zero.' };
  }
  return { isValid: true };
}

export function validatePurchaseHeader(params: {
  bill: Pick<PurchaseBill, 'vendorId' | 'warehouseId' | 'supplierBillNo' | 'refBillNo' | 'mitiDate' | 'adDate'>;
  vendor?: BusinessPartner;
  existingBills: PurchaseBill[];
  transactionType: PurchaseBill['transactionType'];
  fiscalYear: string;
}): PurchaseValidationResult {
  const { bill, vendor, existingBills, transactionType, fiscalYear } = params;
  if (!vendor || !['vendor', 'both'].includes(vendor.type)) return { isValid: false, message: 'Selected supplier is not a valid vendor.' };
  if (!bill.warehouseId) return { isValid: false, message: 'Receiving/dispatch warehouse is required.' };
  const supplierNo = bill.supplierBillNo.trim().toLowerCase();
  if (!supplierNo) return { isValid: false, message: 'Supplier physical bill/reference number is required.' };

  if (transactionType === 'purchase_invoice') {
    const duplicate = existingBills.some((b) =>
      (b.transactionType || 'purchase_invoice') === 'purchase_invoice' &&
      b.fiscalYear === fiscalYear &&
      b.vendorId === vendor.id &&
      b.supplierBillNo.trim().toLowerCase() === supplierNo,
    );
    if (duplicate) return { isValid: false, message: `Supplier bill ${bill.supplierBillNo.trim()} is already recorded for this supplier and fiscal year.` };
  } else if (!bill.refBillNo?.trim()) {
    return { isValid: false, message: 'Original purchase bill reference is required for returns and adjustment notes.' };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(bill.mitiDate)) return { isValid: false, message: 'BS date must use YYYY-MM-DD format.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bill.adDate)) return { isValid: false, message: 'AD date must use YYYY-MM-DD format.' };
  return { isValid: true };
}

export interface ReturnAllocation {
  itemId: string;
  quantity: number;
  fifoCost: number;
  averageUnitCost: number;
}

/**
 * Validate and calculate a purchase return against the actual warehouse FIFO layers.
 * The returned batch state is only committed by the caller after every line succeeds.
 */
export function allocatePurchaseReturn(
  batches: FIFOBatch[],
  lines: Array<{ itemId: string; quantity: number }>,
  warehouseId: string,
): { isValid: boolean; message?: string; updatedBatches: FIFOBatch[]; allocations: ReturnAllocation[] } {
  let working = [...batches];
  const allocations: ReturnAllocation[] = [];

  for (const line of lines) {
    const result = depleteFifoStock(working, line.itemId, warehouseId, line.quantity);
    if (!result.isSuccess) {
      return {
        isValid: false,
        message: `Insufficient stock for item ${line.itemId}. Available: ${result.availableQty}, requested: ${line.quantity}.`,
        updatedBatches: batches,
        allocations: [],
      };
    }
    allocations.push({
      itemId: line.itemId,
      quantity: line.quantity,
      fifoCost: roundMoney(result.totalCogs),
      averageUnitCost: roundMoney(result.totalCogs / line.quantity),
    });
    working = result.updatedBatches;
  }

  return { isValid: true, updatedBatches: working, allocations };
}
