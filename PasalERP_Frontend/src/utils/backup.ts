import {
  Account,
  BusinessPartner,
  CompanySettings,
  FIFOBatch,
  GarmentItem,
  JournalEntry,
  PurchaseBill,
  SalesInvoice,
  StockTransfer,
  Warehouse,
} from '../types';

export const BACKUP_FORMAT = 'AGS-NEPAL-IRD-ERP';
export const BACKUP_VERSION = 3;
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

export interface BackupData {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportDate: string;
  fiscalYear: string;
  company: CompanySettings;
  warehouses: Warehouse[];
  partners: BusinessPartner[];
  items: GarmentItem[];
  batches: FIFOBatch[];
  salesInvoices: SalesInvoice[];
  purchaseBills: PurchaseBill[];
  accounts: Account[];
  journalEntries: JournalEntry[];
  stockTransfers: StockTransfer[];
  stockMovements?: any[];
  source?: 'local' | 'sql-server';
  integrity?: { algorithm: 'SHA-256'; hash: string };
}

export interface BackupValidationResult {
  isValid: boolean;
  message?: string;
  warnings: string[];
}

export function createBackupData(data: Omit<BackupData, 'format' | 'version' | 'exportDate'>): BackupData {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportDate: new Date().toISOString(),
    ...data,
  };
}

export function validateBackupData(input: unknown): BackupValidationResult {
  const warnings: string[] = [];
  if (!input || typeof input !== 'object') return { isValid: false, message: 'Backup must contain a JSON object.', warnings };
  const raw = input as Record<string, unknown>;

  if (raw.format && raw.format !== BACKUP_FORMAT) {
    return { isValid: false, message: 'This file was not created by the AGS Nepal IRD ERP backup system.', warnings };
  }
  if (raw.version !== undefined && (!Number.isInteger(raw.version) || Number(raw.version) < 1 || Number(raw.version) > BACKUP_VERSION)) {
    return { isValid: false, message: `Unsupported backup version: ${String(raw.version)}.`, warnings };
  }
  if (!raw.company || typeof raw.company !== 'object') return { isValid: false, message: 'Backup is missing company settings.', warnings };
  if (!/^\d{4}\/\d{2}$/.test(String((raw.company as Record<string, unknown>).fiscalYear || raw.fiscalYear || ''))) {
    return { isValid: false, message: 'Backup contains an invalid fiscal year.', warnings };
  }

  const arrays = ['warehouses', 'partners', 'items', 'batches', 'salesInvoices', 'purchaseBills', 'accounts', 'journalEntries'];
  for (const key of arrays) {
    if (raw[key] !== undefined && !Array.isArray(raw[key])) return { isValid: false, message: `Backup field "${key}" must be an array.`, warnings };
  }
  if (raw.stockTransfers !== undefined && !Array.isArray(raw.stockTransfers)) return { isValid: false, message: 'Backup field "stockTransfers" must be an array.', warnings };
  if (raw.stockMovements !== undefined && !Array.isArray(raw.stockMovements)) return { isValid: false, message: 'Backup field "stockMovements" must be an array.', warnings };

  const warehouses = (raw.warehouses ?? []) as Warehouse[];
  const partners = (raw.partners ?? []) as BusinessPartner[];
  const items = (raw.items ?? []) as GarmentItem[];
  const batches = (raw.batches ?? []) as FIFOBatch[];
  const sales = (raw.salesInvoices ?? []) as SalesInvoice[];
  const purchases = (raw.purchaseBills ?? []) as PurchaseBill[];
  const accounts = (raw.accounts ?? []) as Account[];
  const journals = (raw.journalEntries ?? []) as JournalEntry[];
  const transfers = (raw.stockTransfers ?? []) as StockTransfer[];
  const movements = (raw.stockMovements ?? []) as any[];

  const unique = (values: string[], label: string) => {
    const seen = new Set<string>();
    for (const value of values) {
      if (!value || seen.has(value)) return `${label} contains a duplicate or missing identifier.`;
      seen.add(value);
    }
    return undefined;
  };
  for (const result of [
    unique(warehouses.map(x => x.id), 'Warehouses'),
    unique(partners.map(x => x.id), 'Partners'),
    unique(items.map(x => x.id), 'Items'),
    unique(batches.map(x => x.id), 'FIFO batches'),
    unique(sales.map(x => x.id), 'Sales invoices'),
    unique(purchases.map(x => x.id), 'Purchase bills'),
    unique(accounts.map(x => x.code), 'Accounts'),
    unique(journals.map(x => x.id), 'Journal entries'),
    unique(transfers.map(x => x.id), 'Stock transfers'),
  ]) if (result) return { isValid: false, message: result, warnings };

  const warehouseIds = new Set(warehouses.map(x => x.id));
  const itemIds = new Set(items.map(x => x.id));
  const partnerIds = new Set(partners.map(x => x.id));
  const accountCodes = new Set(accounts.map(x => x.code));

  if (!warehouses.length) warnings.push('No warehouse records are present.');
  for (const batch of batches) {
    if (!itemIds.has(batch.itemId) || !warehouseIds.has(batch.warehouseId)) return { isValid: false, message: `FIFO batch ${batch.id} references missing master data.`, warnings };
    if (batch.originalQty < 0 || batch.remainingQty < 0 || batch.remainingQty > batch.originalQty || batch.unitCost < 0) return { isValid: false, message: `FIFO batch ${batch.id} has invalid quantities or cost.`, warnings };
  }
  for (const invoice of sales) {
    if (!partnerIds.has(invoice.customerId) || !warehouseIds.has(invoice.warehouseId)) warnings.push(`Sales invoice ${invoice.invoiceNo} references a missing customer or warehouse.`);
  }
  for (const bill of purchases) {
    if (!partnerIds.has(bill.vendorId) || !warehouseIds.has(bill.warehouseId)) warnings.push(`Purchase bill ${bill.billNo} references a missing vendor or warehouse.`);
  }
  for (const journal of journals) {
    if (!journal.lines?.length) return { isValid: false, message: `Journal ${journal.entryNo} has no lines.`, warnings };
    for (const line of journal.lines) if (!accountCodes.has(line.accountCode)) warnings.push(`Journal ${journal.entryNo} references account ${line.accountCode} which is not in the account master.`);
  }
  for (const movement of movements) {
    if (!itemIds.has(String(movement.itemId)) || !warehouseIds.has(String(movement.warehouseId))) return { isValid: false, message: `Stock movement ${movement.referenceNo || movement.referenceId} references missing master data.`, warnings };
    if (!Number.isFinite(Number(movement.quantity)) || !Number.isFinite(Number(movement.unitCost))) return { isValid: false, message: `Stock movement ${movement.referenceNo || movement.referenceId} has invalid quantity or cost.`, warnings };
  }
  for (const transfer of transfers) {
    if (!warehouseIds.has(transfer.sourceWarehouseId) || !warehouseIds.has(transfer.targetWarehouseId)) return { isValid: false, message: `Stock transfer ${transfer.transferNo} references a missing warehouse.`, warnings };
    for (const line of transfer.items) if (!itemIds.has(line.itemId)) return { isValid: false, message: `Stock transfer ${transfer.transferNo} references a missing item.`, warnings };
  }

  return { isValid: true, warnings };
}

export function normalizeLegacyBackup(raw: Record<string, any>): BackupData {
  return createBackupData({
    company: raw.company || raw.settings,
    fiscalYear: raw.fiscalYear || raw.company?.fiscalYear || raw.settings?.fiscalYear,
    warehouses: raw.warehouses || [],
    partners: raw.partners || [],
    items: raw.items || [],
    batches: raw.batches || [],
    salesInvoices: raw.salesInvoices || [],
    purchaseBills: raw.purchaseBills || [],
    accounts: raw.accounts || [],
    journalEntries: raw.journalEntries || [],
    stockTransfers: raw.stockTransfers || [],
    stockMovements: raw.stockMovements || [],
    source: raw.source === 'sql-server' ? 'sql-server' : 'local',
    integrity: raw.integrity,
  });
}

export async function calculateBackupHash(data: unknown): Promise<string> {
  const clone = JSON.parse(JSON.stringify(data));
  if (clone && typeof clone === 'object') delete clone.integrity;
  const bytes = new TextEncoder().encode(JSON.stringify(clone));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function validateBackupIntegrity(input: any): Promise<boolean> {
  if (!input?.integrity?.hash) return true;
  return input.integrity.hash === await calculateBackupHash(input);
}

export function downloadJsonFile(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
