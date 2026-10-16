import { round2 } from './money.js';

export interface BatchRow {
  id: string;
  itemId: string;
  warehouseId: string;
  purchaseId: string;
  purchaseBillNo: string;
  purchaseDate: string;
  unitCost: number;
  originalQty: number;
  remainingQty: number;
}

export interface DepletionDetail {
  batchId: string;
  purchaseBillNo: string;
  purchaseDate: string;
  qtyTaken: number;
  unitCost: number;
  totalCost: number;
}

export interface DepleteResult {
  success: boolean;
  availableQty: number;
  shortageQty: number;
  totalCogs: number;
  details: DepletionDetail[];
}

/** FIFO by purchaseDate, then creation order. This intentionally fixes the frontend's array-order dependency. */
export function depleteFifoRows(rows: BatchRow[], itemId: string, warehouseId: string, requestedQty: number): DepleteResult {
  const candidates = rows
    .filter(r => r.itemId === itemId && r.warehouseId === warehouseId && Number(r.remainingQty) > 0)
    .sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate) || a.id.localeCompare(b.id));

  const availableQty = candidates.reduce((s, r) => s + Number(r.remainingQty), 0);
  if (availableQty + 1e-9 < requestedQty) {
    return { success: false, availableQty, shortageQty: requestedQty - availableQty, totalCogs: 0, details: [] };
  }

  let remaining = requestedQty;
  let totalCogs = 0;
  const details: DepletionDetail[] = [];
  for (const row of candidates) {
    if (remaining <= 0) break;
    const take = Math.min(Number(row.remainingQty), remaining);
    const cost = round2(take * Number(row.unitCost));
    remaining -= take;
    totalCogs += cost;
    details.push({ batchId: row.id, purchaseBillNo: row.purchaseBillNo, purchaseDate: row.purchaseDate, qtyTaken: take, unitCost: Number(row.unitCost), totalCost: cost });
  }
  return { success: true, availableQty, shortageQty: 0, totalCogs: round2(totalCogs), details };
}
