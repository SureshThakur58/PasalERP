import { SalesInvoice, SalesItemLine } from '../types';

export interface SalesValidationResult {
  isValid: boolean;
  message?: string;
}

export function validateSalesLines(lines: Pick<SalesItemLine, 'itemId' | 'quantity' | 'unitPrice' | 'discountPercent'>[]): SalesValidationResult {
  if (!lines.length) return { isValid: false, message: 'At least one item is required.' };
  const seen = new Set<string>();
  for (const line of lines) {
    if (!line.itemId || seen.has(line.itemId)) return { isValid: false, message: 'Duplicate or missing item line detected.' };
    seen.add(line.itemId);
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) return { isValid: false, message: 'Sales quantities must be positive whole numbers.' };
    if (!Number.isFinite(line.unitPrice) || line.unitPrice < 0) return { isValid: false, message: 'Unit price cannot be negative.' };
    if (!Number.isFinite(line.discountPercent) || line.discountPercent < 0 || line.discountPercent > 100) return { isValid: false, message: 'Discount must be between 0% and 100%.' };
  }
  return { isValid: true };
}

export function getOriginalInvoice(salesInvoices: SalesInvoice[], invoiceNo: string): SalesInvoice | undefined {
  return salesInvoices.find((invoice) => invoice.invoiceNo === invoiceNo && (invoice.transactionType || 'tax_invoice') === 'tax_invoice');
}

export function getAlreadyAdjustedQuantity(
  salesInvoices: SalesInvoice[],
  refInvoiceNo: string,
  itemId: string,
  adjustmentTypes: Array<'sales_return' | 'debit_note' | 'credit_note'> = ['sales_return'],
): number {
  return salesInvoices
    .filter((invoice) => invoice.refInvoiceNo === refInvoiceNo && adjustmentTypes.includes(invoice.transactionType as any))
    .reduce((sum, invoice) => sum + invoice.items.filter((line) => line.itemId === itemId).reduce((q, line) => q + line.quantity, 0), 0);
}

export function getOriginalUnitCogs(invoice: SalesInvoice, itemId: string, fallback: number): number {
  const line = invoice.items.find((item) => item.itemId === itemId);
  if (!line || line.quantity <= 0 || line.cogsAmount === undefined) return fallback;
  return line.cogsAmount / line.quantity;
}
