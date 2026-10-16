

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  address: string;
  phone: string;
  isDefault?: boolean;
}

export interface BusinessPartner {
  id: string;
  code: string;
  name: string;
  type: PartnerType;
  panNumber: string; // 9-digit Nepal PAN
  email: string;
  phone: string;
  address: string;
  currentBalance: number; // positive = debit/receivable, negative = credit/payable
  creditLimit?: number;
  isVatApplicable?: boolean; // When true: standard VAT applies; When false: 0% VAT / exempt for this partner
}

export interface GarmentItem {
  id: string;
  sku: string;
  barcode: string;
  name: string;
  category: 'Formal Shirts' | 'Casual Shirts' | 'Trousers & Chinos' | 'Kurtha & Ethnic' | 'T-Shirts & Polos' | 'Jackets & Outerwear' | 'Jeans & Denim' | 'Kidswear';
  size: 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL' | 'Free Size';
  color: string;
  fabric: string;
  hsnCode: string; // Nepal Harmonized System Code e.g. 6205.20.00
  costPrice: number; // Standard/Last Purchase Cost (NPR)
  sellingPrice: number; // Retail Selling Price (NPR)
  minStockAlert: number;
  isVatApplicable: boolean; // true = 13% VAT, false = Exempt
  description?: string;
}

export interface FIFOBatch {
  id: string;
  itemId: string;
  warehouseId: string;
  purchaseId: string;
  purchaseBillNo: string;
  purchaseDate: string; // YYYY-MM-DD
  unitCost: number; // Exact cost price per unit in this lot
  originalQty: number;
  remainingQty: number;
}

export type SalesTransactionType = 'tax_invoice' | 'sales_return' | 'debit_note' | 'credit_note';

export interface SalesItemLine {
  itemId: string;
  sku: string;
  name: string;
  size: string;
  color: string;
  hsnCode: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  isVatApplicable: boolean;
  taxableAmount: number;
  vatAmount: number;
  lineTotal: number;
  cogsAmount?: number; // Computed from FIFO batches depleted
}

export interface SalesInvoice {
  id: string;
  transactionType?: SalesTransactionType; // 'tax_invoice' | 'sales_return' | 'debit_note' | 'credit_note'
  invoiceNo: string; // IRD sequential e.g. INV-2081/82-0012, SR-2081/82-0001, DN-2081/82-0001, CN-2081/82-0001
  refInvoiceNo?: string; // Reference to original Tax Invoice for returns/notes
  reason?: string; // Reason for return/debit/credit note (mandated by Nepal IRD)
  fiscalYear: string; // e.g. 2081/82
  mitiDate: string; // Nepali BS Date e.g. 2081-11-20
  adDate: string; // AD Date e.g. 2025-03-05
  customerId: string;
  customerName: string;
  customerPan: string;
  customerAddress: string;
  warehouseId: string;
  warehouseName: string;
  paymentMode: 'Cash' | 'Credit' | 'Bank / Fonepay QR' | 'Card';
  items: SalesItemLine[];
  subtotal: number;
  discountAmount: number;
  taxableAmount: number;
  nonTaxableAmount: number;
  vatAmount: number; // 13%
  grandTotal: number;
  totalCogs: number; // FIFO COGS
  journalEntryId: string;
  notes?: string;
  syncWithIrd?: boolean;
}

export type PurchaseTransactionType = 'purchase_invoice' | 'purchase_return' | 'debit_note' | 'credit_note';

export interface PurchaseItemLine {
  itemId: string;
  sku: string;
  name: string;
  size: string;
  color: string;
  hsnCode: string;
  quantity: number;
  unitCost: number;
  isVatApplicable: boolean;
  taxableAmount: number;
  vatAmount: number;
  lineTotal: number;
}

export interface PurchaseBill {
  id: string;
  transactionType?: PurchaseTransactionType; // 'purchase_invoice' | 'purchase_return' | 'debit_note' | 'credit_note'
  billNo: string; // System internal bill no e.g. PUR-2081/82-0008, PR-2081/82-0001, DN-PUR-0001, CN-PUR-0001
  supplierBillNo: string; // Supplier's physical tax invoice number / ref document
  refBillNo?: string; // Reference to original Purchase Bill for returns/notes
  reason?: string; // Reason for return/debit/credit note
  fiscalYear: string;
  mitiDate: string;
  adDate: string;
  vendorId: string;
  vendorName: string;
  vendorPan: string;
  warehouseId: string;
  warehouseName: string;
  paymentMode: 'Credit' | 'Cash' | 'Bank Transfer';
  items: PurchaseItemLine[];
  subtotal: number;
  taxableAmount: number;
  nonTaxableAmount: number;
  vatAmount: number; // 13% Input VAT
  grandTotal: number;
  totalCogs?: number; // Actual FIFO inventory cost affected by purchase return/adjustment
  journalEntryId: string;
  notes?: string;
  isVatBill?: boolean; // Whether vendor issued a VAT bill or Non-VAT/PAN bill
  isCapitalizedVat?: boolean; // When entity is PAN, VAT is capitalized into item cost
}

export interface StockTransfer {
  id: string;
  transferNo: string;
  mitiDate: string;
  adDate: string;
  sourceWarehouseId: string;
  sourceWarehouseName: string;
  targetWarehouseId: string;
  targetWarehouseName: string;
  items: {
    itemId: string;
    sku: string;
    name: string;
    quantity: number;
    unitCost: number;
  }[];
  totalValue: number;
  remarks: string;
}

export type AccountCategory = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export interface Account {
  code: string;
  name: string;
  category: AccountCategory;
  description: string;
  balance: number;
  isActive?: boolean;
  isSystem?: boolean;
}

export interface AccountMapping {
  mappingKey: string;
  accountCode: string;
  accountName?: string;
  category?: AccountCategory;
  label: string;
  description: string;
  isRequired: boolean;
}

export interface JournalLine {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  partnerId?: string;
  partnerName?: string;
  description?: string;
}

export interface JournalEntry {
  id: string;
  entryNo: string; // e.g. JV-2081/82-0042
  mitiDate: string;
  adDate: string;
  referenceType:
    | 'Sales Invoice'
    | 'Sales Return'
    | 'Sales Debit Note'
    | 'Sales Credit Note'
    | 'Purchase Bill'
    | 'Purchase Return'
    | 'Purchase Debit Note'
    | 'Purchase Credit Note'
    | 'Stock Transfer'
    | 'Payment'
    | 'Receipt'
    | 'Opening Balance';
  referenceNo: string;
  narration: string;
  lines: JournalLine[];
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
}

export interface CompanySettings {
  companyName: string;
  tradeName: string;
  panNumber: string; // 9-digit Nepal IRD PAN
  businessNature: 'VAT' | 'PAN'; // 'VAT': standard VAT rules; 'PAN': sales has no VAT, purchase VAT is added to item cost
  address: string;
  city: string;
  district: string;
  phone: string;
  email: string;
  vatRate: number; // 13%
  fiscalYear: string; // 2081/82
  irdApprovalNo: string;
  invoicePrefix: string;
  purchasePrefix: string;
  bankName?: string;
  accountNumber?: string;
  accountName?: string;
  qrCodeText?: string;
  termsAndConditions?: string;
}


export type ErpRole =
  | 'super_admin'
  | 'admin'
  | 'accountant'
  | 'sales'
  | 'purchase'
  | 'inventory'
  | 'viewer';

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: ErpRole;
  isActive: boolean;
  permissions: string[];
  database: string;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
  database: string;
}

export interface ErpDatabase {
  name: string;
  companyName: string | null;
}
