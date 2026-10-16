import type {
  BusinessPartner,
  CompanySettings,
  GarmentItem,
  Warehouse,
  FIFOBatch,
  StockTransfer,
  PurchaseBill,
  SalesInvoice,
  Account,
  JournalEntry,
  AccountMapping,
  AuthSession,
  AuthUser,
  ErpDatabase,
} from '../types';
import { api } from './erpApi';

export interface MasterRepository<T extends { id: string }> {
  list(): Promise<T[]>;
  create(value: T): Promise<T>;
  update(id: string, value: T): Promise<T>;
  remove(id: string): Promise<void>;
}

export interface MigrationPreview {
  canImport: boolean;
  mode: 'merge' | 'replace';
  sourceCounts: Record<string, number>;
  serverCounts: Record<string, number>;
  conflicts: string[];
  warnings: string[];
}

export interface CreatePurchaseRequest {
  transactionType?: import('../types').PurchaseTransactionType;
  supplierBillNo: string;
  refBillNo?: string;
  reason?: string;
  fiscalYear: string;
  mitiDate: string;
  adDate: string;
  vendorId: string;
  warehouseId: string;
  paymentMode: 'Credit' | 'Cash' | 'Bank Transfer';
  lines: { itemId: string; quantity: number; unitCost: number }[];
  notes?: string;
  supplierVatBill?: boolean;
}


export interface CreateSaleRequest {
  transactionType?: import('../types').SalesTransactionType;
  refInvoiceNo?: string;
  reason?: string;
  fiscalYear: string;
  mitiDate: string;
  adDate: string;
  customerId: string;
  warehouseId: string;
  paymentMode: 'Cash' | 'Credit' | 'Bank / Fonepay QR' | 'Card';
  lines: { itemId: string; quantity: number; unitPrice: number; discountPercent?: number }[];
  notes?: string;
  syncWithIrd?: boolean;
}

export interface CreateJournalRequest {
  fiscalYear: string;
  mitiDate: string;
  adDate: string;
  referenceNo: string;
  narration: string;
  lines: { accountCode: string; accountName?: string; debit: number; credit: number; partnerId?: string; partnerName?: string; description?: string }[];
}

export interface CreateTransferRequest {
  fiscalYear: string;
  mitiDate: string;
  adDate: string;
  sourceWarehouseId: string;
  targetWarehouseId: string;
  items: { itemId: string; quantity: number }[];
  remarks?: string;
}


export interface DashboardReport {
  period: 'fiscal_year' | 'all' | 'custom';
  fiscalYear: string | null;
  from: string | null;
  to: string | null;
  salesTotal: number;
  purchaseTotal: number;
  salesCount: number;
  purchaseCount: number;
  taxableSales: number;
  taxablePurchases: number;
  outputVat: number;
  inputVat: number;
  netVat: number;
  cogs: number;
  grossProfit: number;
  grossProfitMargin: number;
  totalInventoryValuation: number;
  totalStockUnits: number;
  receivables: number;
  payables: number;
  warehouseDistribution: { id: string; code: string; name: string; isDefault: boolean; units: number; value: number }[];
  lowStockItems: { id: string; sku: string; name: string; size: string; color: string; minStockAlert: number; stock: number }[];
  salesByDay: { date: string; sales: number; cogs: number; vat: number }[];
  topItems: { itemId: string; name: string; sku: string; qty: number; value: number }[];
  recentSales: SalesInvoice[];
  recentPurchases: PurchaseBill[];
}

export interface IrdSalesBookRow {
  id: string; fiscalYear: string; mitiDate: string; adDate: string; invoiceNo: string; customerName: string; customerPan: string;
  grandTotal: number; nonTaxableAmount: number; taxableAmount: number; vatAmount: number; transactionType?: string; refInvoiceNo?: string; reason?: string; syncWithIrd?: boolean;
}
export interface IrdPurchaseBookRow {
  id: string; fiscalYear: string; mitiDate: string; adDate: string; billNo: string; supplierBillNo: string; vendorName: string; vendorPan: string;
  grandTotal: number; nonTaxableAmount: number; taxableAmount: number; vatAmount: number; transactionType?: string; refBillNo?: string; reason?: string; isVatBill?: boolean;
}
export interface IrdVatSummary {
  outputVat: number; inputVat: number; netVatPayable: number; taxableSales: number; exemptSales: number; taxablePurchases: number; exemptPurchases: number;
}
export interface IrdComplianceResult {
  errors: { severity: 'error'; document: string; message: string }[];
  warnings: { severity: 'warning'; document: string; message: string }[];
  fiscalYear: string | null;
}

export interface MigrationStatus {
  backend: { online: boolean; service: string; time: string };
  database: { connected: boolean; database: string };
  counts: Record<string, number>;
  settingsPresent: boolean;
}

export interface ErpRepository {
  auth: {
    databases(): Promise<ErpDatabase[]>;
    login(database: string, username: string, password: string): Promise<AuthSession>;
    me(): Promise<AuthUser>;
    users: {
      list(): Promise<AuthUser[]>;
      create(input: { username: string; displayName: string; password: string; role: AuthUser['role'] }): Promise<AuthUser>;
      update(id: string, input: { displayName?: string; role?: AuthUser['role']; isActive?: boolean; password?: string }): Promise<AuthUser>;
      remove(id: string): Promise<void>;
    };
  };
  health(): Promise<{ success: boolean; service: string; time: string }>;
  settings: {
    get(): Promise<CompanySettings | null>;
    update(value: CompanySettings): Promise<CompanySettings>;
  };
  warehouses: MasterRepository<Warehouse>;
  partners: MasterRepository<BusinessPartner>;
  items: MasterRepository<GarmentItem>;
  purchases: { list(): Promise<PurchaseBill[]>; create(input: CreatePurchaseRequest): Promise<PurchaseBill> };
  sales: { list(): Promise<SalesInvoice[]>; create(input: CreateSaleRequest): Promise<SalesInvoice> };
  // accounts: { list(): Promise<Account[]> };

  accounts: {
    list(): Promise<Account[]>;

    create(
      value: Omit<Account, 'balance' | 'isActive' | 'isSystem'>
    ): Promise<Account>;

    update(
      code: string,
      value: Partial<Account>
    ): Promise<Account>;

    remove(code: string): Promise<void>;

    initializeStandard(): Promise<{
      createdAccounts: number;
      mappings: number;
    }>;

    mappings: {
      list(): Promise<AccountMapping[]>;

      update(
        mappingKey: string,
        accountCode: string
      ): Promise<AccountMapping>;
    };
  };

  journals: { list(): Promise<JournalEntry[]>; create(input: CreateJournalRequest): Promise<JournalEntry> };
  dashboard: { report(period: 'fiscal_year' | 'all' | 'custom', fiscalYear?: string, from?: string, to?: string): Promise<DashboardReport> };
  inventory: {
    batches: { list(itemId?: string, warehouseId?: string): Promise<FIFOBatch[]> };
    transfers: { list(): Promise<StockTransfer[]>; create(input: CreateTransferRequest): Promise<StockTransfer> };
    movements: { list(itemId?: string, warehouseId?: string): Promise<any[]> };
  };
  ird: {
    salesBook(fiscalYear?: string): Promise<IrdSalesBookRow[]>;
    purchaseBook(fiscalYear?: string): Promise<IrdPurchaseBookRow[]>;
    vatSummary(fiscalYear?: string): Promise<IrdVatSummary>;
    compliance(fiscalYear?: string): Promise<IrdComplianceResult>;
  };
  migration: {
    status(): Promise<MigrationStatus>;
    preview(bundle: unknown, mode?: 'merge' | 'replace'): Promise<MigrationPreview>;
    validate(bundle: unknown): Promise<{ valid: boolean; errors: string[]; warnings: string[]; sourceCounts: Record<string, number> }>;
    exportServer(): Promise<any>;
    import(bundle: unknown, mode?: 'merge' | 'replace'): Promise<{ imported: Record<string, number>; skipped: Record<string, number> }>;
  };
}

export const repository: ErpRepository = {
  auth: api.auth,
  health: api.health,
  settings: api.settings,
  warehouses: api.warehouses,
  partners: api.partners,
  items: api.items,
  purchases: api.purchases,
  sales: api.sales,
  accounts: api.accounts,
  journals: api.journals,
  dashboard: api.dashboard,
  inventory: api.inventory,
  ird: api.ird,
  migration: {
    status: () => api.migration.status(),
    preview: (bundle, mode = 'merge') => api.migration.preview(bundle, mode),
    validate: (bundle) => api.migration.validate(bundle),
    exportServer: () => api.migration.exportServer(),
    import: (bundle, mode = 'merge') => api.migration.import(bundle, mode),
  },
};
