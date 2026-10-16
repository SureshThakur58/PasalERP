import type {
  BusinessPartner,
  CompanySettings,
  GarmentItem,
  PurchaseTransactionType,
  SalesTransactionType,
  StockTransfer,
  Warehouse
} from '../types.js';

export interface SaleLineInput {
  itemId: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
}

export interface CreateSaleInput {
  transactionType?: SalesTransactionType;
  refInvoiceNo?: string;
  reason?: string;
  fiscalYear: string;
  mitiDate: string;
  adDate: string;
  customerId: string;
  warehouseId: string;
  paymentMode: 'Cash' | 'Credit' | 'Bank / Fonepay QR' | 'Card';
  lines: SaleLineInput[];
  notes?: string;
  syncWithIrd?: boolean;
}

export interface PurchaseLineInput {
  itemId: string;
  quantity: number;
  unitCost: number;
}

export interface CreatePurchaseInput {
  transactionType?: PurchaseTransactionType;
  supplierBillNo: string;
  refBillNo?: string;
  reason?: string;
  fiscalYear: string;
  mitiDate: string;
  adDate: string;
  vendorId: string;
  warehouseId: string;
  paymentMode: 'Credit' | 'Cash' | 'Bank Transfer';
  lines: PurchaseLineInput[];
  notes?: string;
  supplierVatBill?: boolean;
}


export interface JournalLineInput {
  accountCode: string;
  accountName?: string;
  debit: number;
  credit: number;
  partnerId?: string;
  partnerName?: string;
  description?: string;
}

export interface CreateJournalInput {
  fiscalYear: string;
  mitiDate: string;
  adDate: string;
  referenceNo: string;
  narration: string;
  lines: JournalLineInput[];
}

export interface CreateTransferInput {
  fiscalYear: string;
  mitiDate: string;
  adDate: string;
  sourceWarehouseId: string;
  targetWarehouseId: string;
  items: { itemId: string; quantity: number }[];
  remarks?: string;
}

export interface ImportBundle {
  settings: CompanySettings;
  warehouses: Warehouse[];
  partners: BusinessPartner[];
  items: GarmentItem[];
  batches: any[];
  salesInvoices: any[];
  purchaseBills: any[];
  accounts: any[];
  journalEntries: any[];
}
