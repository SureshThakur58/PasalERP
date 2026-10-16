import type { AuthSession, ErpDatabase, AuthUser, BusinessPartner, CompanySettings, GarmentItem, Warehouse, FIFOBatch, StockTransfer, PurchaseBill, SalesInvoice, Account, AccountMapping, JournalEntry } from '../types';
import type { CreateTransferRequest, CreatePurchaseRequest, CreateSaleRequest, CreateJournalRequest } from './repository';
import type { MigrationPreview, MigrationStatus, IrdSalesBookRow, IrdPurchaseBookRow, IrdVatSummary, IrdComplianceResult, DashboardReport } from './repository';

// const BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api').replace(/\/$/, '');
const BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  `${window.location.protocol}//${window.location.hostname}:4000/api`
).replace(/\/$/, '');

console.log('[ERP API] BASE_URL:', BASE_URL);

export const AUTH_STORAGE_KEY = 'smarterp_auth_session_v1';

export function getStoredAuthSession(): AuthSession | null {
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY) || window.sessionStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? JSON.parse(raw) as AuthSession : null;
  } catch {
    return null;
  }
}

export function saveAuthSession(session: AuthSession, rememberMe: boolean): void {
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
  window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
  const storage = rememberMe ? window.localStorage : window.sessionStorage;
  storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

export function clearAuthSession(): void {
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
  window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit, timeoutMs = 15000): Promise<T> {
  let response: Response;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(getStoredAuthSession()?.token
          ? { Authorization: `Bearer ${getStoredAuthSession()!.token}` }
          : {}),
        ...(init?.headers || {}),
      },
    });
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw new ApiError(`ERP backend request timed out after ${timeoutMs / 1000}s.`, 408);
    throw new ApiError(`Cannot connect to ERP backend at ${BASE_URL}.`, 0);
  } finally {
    window.clearTimeout(timeout);
  }

  const text = await response.text();
  let payload: any = null;
  try { payload = text ? JSON.parse(text) : null; } catch { /* non-JSON response */ }
  if (!response.ok || payload?.success === false) {
    throw new ApiError(payload?.message || `Backend request failed (${response.status}).`, response.status);
  }
  return (payload?.data ?? payload) as T;
}


const queryString = (params: Record<string, string | undefined>) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value) query.set(key, value); });
  const text = query.toString();
  return text ? `?${text}` : '';
};

const normalizeSalesInvoice = (invoice: SalesInvoice): SalesInvoice => ({
  ...invoice,
  adDate: typeof invoice.adDate === 'string' ? invoice.adDate.slice(0, 10) : String(invoice.adDate).slice(0, 10),
  subtotal: Number(invoice.subtotal),
  discountAmount: Number(invoice.discountAmount),
  taxableAmount: Number(invoice.taxableAmount),
  nonTaxableAmount: Number(invoice.nonTaxableAmount),
  vatAmount: Number(invoice.vatAmount),
  grandTotal: Number(invoice.grandTotal),
  totalCogs: Number(invoice.totalCogs),
  items: (invoice.items || []).map((line) => ({
    ...line,
    quantity: Number(line.quantity),
    unitPrice: Number(line.unitPrice),
    discountPercent: Number(line.discountPercent),
    taxableAmount: Number(line.taxableAmount),
    vatAmount: Number(line.vatAmount),
    lineTotal: Number(line.lineTotal),
    cogsAmount: line.cogsAmount == null ? line.cogsAmount : Number(line.cogsAmount),
  })),
});

const collection = <T extends { id: string }>(path: string) => ({
  list: () => request<T[]>(path),
  create: (value: T) => request<T>(path, { method: 'POST', body: JSON.stringify(value) }),
  update: (id: string, value: T) => request<T>(`${path}/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(value) }),
  remove: async (id: string) => { await request<void>(`${path}/${encodeURIComponent(id)}`, { method: 'DELETE' }); },
});

export const api = {
  baseUrl: BASE_URL,
  auth: {
    databases: () => request<ErpDatabase[]>('/auth/databases'),
    login: (database: string, username: string, password: string) =>
      request<AuthSession>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ database, username, password }),
      }),
    me: () => request<AuthUser>('/auth/me'),
    users: {
      list: () => request<AuthUser[]>('/auth/users'),
      create: (input: { username: string; displayName: string; password: string; role: AuthUser['role'] }) =>
        request<AuthUser>('/auth/users', { method: 'POST', body: JSON.stringify(input) }),
      update: (id: string, input: { displayName?: string; role?: AuthUser['role']; isActive?: boolean; password?: string }) =>
        request<AuthUser>(`/auth/users/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) }),
      remove: async (id: string) => { await request<void>(`/auth/users/${encodeURIComponent(id)}`, { method: 'DELETE' }); },
    },
  },
  health: () => request<{ success: boolean; service: string; time: string }>('/health'),
  settings: {
    get: () => request<CompanySettings | null>('/settings'),
    update: (value: CompanySettings) => request<CompanySettings>('/settings', { method: 'PUT', body: JSON.stringify(value) }),
  },
  warehouses: collection<Warehouse>('/warehouses'),
  partners: collection<BusinessPartner>('/partners'),
  items: collection<GarmentItem>('/items'),
  purchases: {
    list: () => request<PurchaseBill[]>('/purchases'),
    create: (input: CreatePurchaseRequest) => request<PurchaseBill>('/purchases', { method: 'POST', body: JSON.stringify(input) }, 30000),
  },
  sales: {
    list: async () => (await request<SalesInvoice[]>('/sales')).map(normalizeSalesInvoice),
    create: async (input: CreateSaleRequest) => normalizeSalesInvoice(await request<SalesInvoice>('/sales', { method: 'POST', body: JSON.stringify(input) }, 30000)),
  },
  //accounts: { list: () => request<Account[]>('/accounts') },

  accounts: {
    list: () =>
      request<Account[]>('/accounts'),

    create: (value: Omit<Account, 'balance' | 'isActive' | 'isSystem'>) =>
      request<Account>(
        '/accounts',
        {
          method: 'POST',
          body: JSON.stringify(value)
        }
      ),

    update: (
      code: string,
      value: Partial<Account>
    ) =>
      request<Account>(
        `/accounts/${encodeURIComponent(code)}`,
        {
          method: 'PUT',
          body: JSON.stringify(value)
        }
      ),

    remove: (code: string) =>
      request<void>(
        `/accounts/${encodeURIComponent(code)}`,
        {
          method: 'DELETE'
        }
      ),

    initializeStandard: () =>
      request<{
        createdAccounts: number;
        mappings: number;
      }>(
        '/accounts/initialize-standard',
        {
          method: 'POST'
        }
      ),

    mappings: {
      list: () =>
        request<AccountMapping[]>('/account-mappings'),

      update: (
        mappingKey: string,
        accountCode: string
      ) =>
        request<AccountMapping>(
          `/account-mappings/${encodeURIComponent(mappingKey)}`,
          {
            method: 'PUT',
            body: JSON.stringify({ accountCode })
          }
        )
    }
  },

  journals: {
    list: () => request<JournalEntry[]>('/journals'),
    create: (input: CreateJournalRequest) => request<JournalEntry>('/journals', { method: 'POST', body: JSON.stringify(input) }, 30000),
  },
  inventory: {
    batches: {
      list: (itemId?: string, warehouseId?: string) => request<FIFOBatch[]>(`/batches${queryString({ itemId, warehouseId })}`),
    },
    transfers: {
      list: () => request<StockTransfer[]>('/stock-transfers'),
      create: (input: CreateTransferRequest) => request<StockTransfer>('/stock-transfers', { method: 'POST', body: JSON.stringify(input) }),
    },
    movements: {
      list: (itemId?: string, warehouseId?: string) => request<any[]>(`/stock-movements${queryString({ itemId, warehouseId })}`),
    },
  },
  dashboard: {
    report: async (period: 'fiscal_year' | 'all' | 'custom', fiscalYear?: string, from?: string, to?: string) => {
      const query = queryString({ period, fiscalYear, from, to });
      const data = await request<DashboardReport>(`/dashboard${query}`);
      return {
        ...data,
        salesTotal: Number(data.salesTotal), purchaseTotal: Number(data.purchaseTotal),
        salesCount: Number(data.salesCount), purchaseCount: Number(data.purchaseCount),
        taxableSales: Number(data.taxableSales), taxablePurchases: Number(data.taxablePurchases),
        outputVat: Number(data.outputVat), inputVat: Number(data.inputVat), netVat: Number(data.netVat),
        cogs: Number(data.cogs), grossProfit: Number(data.grossProfit), grossProfitMargin: Number(data.grossProfitMargin),
        totalInventoryValuation: Number(data.totalInventoryValuation), totalStockUnits: Number(data.totalStockUnits),
        receivables: Number(data.receivables), payables: Number(data.payables),
        warehouseDistribution: (data.warehouseDistribution || []).map(x => ({ ...x, units: Number(x.units), value: Number(x.value) })),
        lowStockItems: (data.lowStockItems || []).map(x => ({ ...x, stock: Number(x.stock), minStockAlert: Number(x.minStockAlert) })),
        salesByDay: (data.salesByDay || []).map(x => ({ ...x, sales: Number(x.sales), cogs: Number(x.cogs), vat: Number(x.vat) })),
        topItems: (data.topItems || []).map(x => ({ ...x, qty: Number(x.qty), value: Number(x.value) })),
      };
    },
  },
  ird: {
    salesBook: async (fiscalYear?: string) => (await request<IrdSalesBookRow[]>(`/ird/sales-book${queryString({ fiscalYear })}`)).map((row) => ({ ...row, grandTotal: Number(row.grandTotal), nonTaxableAmount: Number(row.nonTaxableAmount), taxableAmount: Number(row.taxableAmount), vatAmount: Number(row.vatAmount) })),
    purchaseBook: async (fiscalYear?: string) => (await request<IrdPurchaseBookRow[]>(`/ird/purchase-book${queryString({ fiscalYear })}`)).map((row) => ({ ...row, grandTotal: Number(row.grandTotal), nonTaxableAmount: Number(row.nonTaxableAmount), taxableAmount: Number(row.taxableAmount), vatAmount: Number(row.vatAmount) })),
    vatSummary: async (fiscalYear?: string) => {
      const row = await request<IrdVatSummary>(`/ird/vat-summary${queryString({ fiscalYear })}`);
      return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Number(v)])) as IrdVatSummary;
    },
    compliance: (fiscalYear?: string) => request<IrdComplianceResult>(`/ird/compliance${queryString({ fiscalYear })}`),
  },
  migration: {
    status: () => request<MigrationStatus>('/migration/status'),
    preview: (bundle: unknown, mode: 'merge' | 'replace' = 'merge') => request<MigrationPreview>('/migration/preview', { method: 'POST', body: JSON.stringify({ mode, bundle }) }),
    validate: (bundle: unknown) => request<{ valid: boolean; errors: string[]; warnings: string[]; sourceCounts: Record<string, number> }>('/migration/validate', { method: 'POST', body: JSON.stringify({ bundle }) }),
    exportServer: () => request<any>('/migration/export', undefined, 30000),
    import: async (bundle: unknown, mode: 'merge' | 'replace' = 'merge') => {
      return request<{ imported: Record<string, number>; skipped: Record<string, number> }>(
        '/migration/import-localstorage',
        { method: 'POST', body: JSON.stringify({ mode, bundle, reset: mode === 'replace', confirmReset: mode === 'replace' }) },
        30000,
      );
    },
  },
};
