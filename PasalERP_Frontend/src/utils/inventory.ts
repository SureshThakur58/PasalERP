import { FIFOBatch, GarmentItem, StockTransfer } from '../types';

export interface InventoryValidationResult {
  isValid: boolean;
  message?: string;
}

export function sortFifoBatches(batches: FIFOBatch[]): FIFOBatch[] {
  return [...batches].sort((a, b) => {
    const dateDiff = new Date(a.purchaseDate).getTime() - new Date(b.purchaseDate).getTime();
    return dateDiff !== 0 ? dateDiff : a.id.localeCompare(b.id);
  });
}

export function getStockByWarehouse(
  batches: FIFOBatch[],
  itemId: string,
): Map<string, number> {
  const result = new Map<string, number>();
  for (const batch of batches) {
    if (batch.itemId !== itemId || batch.remainingQty <= 0) continue;
    result.set(batch.warehouseId, (result.get(batch.warehouseId) ?? 0) + batch.remainingQty);
  }
  return result;
}

export function validateBatchIntegrity(batches: FIFOBatch[]): InventoryValidationResult {
  const seen = new Set<string>();
  for (const batch of batches) {
    if (!batch.id || seen.has(batch.id)) return { isValid: false, message: `Duplicate or missing batch ID: ${batch.id || 'unknown'}.` };
    seen.add(batch.id);
    if (!batch.itemId || !batch.warehouseId) return { isValid: false, message: `Batch ${batch.id} is missing item or warehouse.` };
    if (batch.originalQty < 0 || batch.remainingQty < 0 || batch.remainingQty > batch.originalQty) {
      return { isValid: false, message: `Batch ${batch.id} has invalid quantity values.` };
    }
    if (batch.unitCost < 0) return { isValid: false, message: `Batch ${batch.id} has an invalid unit cost.` };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(batch.purchaseDate)) {
      return { isValid: false, message: `Batch ${batch.id} has an invalid purchase date.` };
    }
  }
  return { isValid: true };
}

export function validateStockTransfer(
  transfer: Pick<StockTransfer, 'sourceWarehouseId' | 'targetWarehouseId' | 'items'>,
  batches: FIFOBatch[],
): InventoryValidationResult {
  if (!transfer.sourceWarehouseId || !transfer.targetWarehouseId) {
    return { isValid: false, message: 'Source and destination warehouses are required.' };
  }
  if (transfer.sourceWarehouseId === transfer.targetWarehouseId) {
    return { isValid: false, message: 'Source and destination warehouses cannot be the same.' };
  }
  if (!transfer.items.length) return { isValid: false, message: 'At least one item is required for a stock transfer.' };

  for (const item of transfer.items) {
    if (!item.itemId || !Number.isInteger(item.quantity) || item.quantity <= 0) {
      return { isValid: false, message: `Invalid transfer quantity for ${item.name || item.itemId || 'item'}.` };
    }
    const available = batches
      .filter(b => b.itemId === item.itemId && b.warehouseId === transfer.sourceWarehouseId)
      .reduce((sum, b) => sum + Math.max(0, b.remainingQty), 0);
    if (item.quantity > available) {
      return { isValid: false, message: `Insufficient stock for ${item.name}. Available: ${available}, requested: ${item.quantity}.` };
    }
  }
  return { isValid: true };
}

export function getLowStockItems(
  items: GarmentItem[],
  batches: FIFOBatch[],
  warehouseId?: string,
): GarmentItem[] {
  return items.filter(item => {
    const stock = batches
      .filter(b => b.itemId === item.id && (!warehouseId || b.warehouseId === warehouseId))
      .reduce((sum, b) => sum + Math.max(0, b.remainingQty), 0);
    return stock < item.minStockAlert;
  });
}
