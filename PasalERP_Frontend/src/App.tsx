import React, { useEffect, useRef, useState } from 'react';
import {
  Account,
  BusinessPartner,
  CompanySettings,
  FIFOBatch,
  GarmentItem,
  JournalEntry,
  PurchaseBill,
  PurchaseTransactionType,
  SalesInvoice,
  SalesTransactionType,
  StockTransfer,
  Warehouse
} from './types';
import {
  INITIAL_ACCOUNTS,
  INITIAL_FIFO_BATCHES,
  INITIAL_ITEMS,
  INITIAL_JOURNAL_ENTRIES,
  INITIAL_PARTNERS,
  INITIAL_PURCHASE_BILLS,
  INITIAL_SALES_INVOICES,
  INITIAL_SETTINGS,
  INITIAL_WAREHOUSES
} from './data/initialData';
import {
  getInventoryValuation,
  getItemStock,
  postPurchaseFinancialJournal,
  postSalesFinancialJournal
} from './utils/accountingEngine';
import { ActiveTab, Sidebar } from './components/Sidebar';
import { TopHeader } from './components/TopHeader';
import { DashboardModule } from './components/DashboardModule';
import { MasterDataModule } from './components/MasterDataModule';
import { SalesInvoiceModule } from './components/SalesInvoiceModule';
import { PurchaseModule } from './components/PurchaseModule';
import { InventoryModule } from './components/InventoryModule';
import { AccountingModule } from './components/AccountingModule';
import { ChartOfAccountsModule } from './components/ChartOfAccountsModule';
import { IrdComplianceModule } from './components/IrdComplianceModule';
import { SetupModule } from './components/SetupModule';
import { TaxInvoiceModal } from './components/TaxInvoiceModal';
import { PurchaseBillModal } from './components/PurchaseBillModal';
import { usePersistentState } from './hooks/usePersistentState';
import { clearAppStorage } from './utils/storage';
import { validateJournalLines } from './utils/accounting';
import { ApiError, clearAuthSession, getStoredAuthSession } from './api/erpApi';
import LoginPage from './components/LoginPage';
import UserManagementModule from './components/UserManagementModule';
import type { AuthSession } from './types';
import { repository } from './api/repository';
import type { CreateTransferRequest, DashboardReport } from './api/repository';

const STORAGE_KEYS = {
  SETTINGS: 'nepal_ird_settings_v1',
  WAREHOUSES: 'nepal_ird_warehouses_v1',
  PARTNERS: 'nepal_ird_partners_v1',
  ITEMS: 'nepal_ird_items_v1',
  BATCHES: 'nepal_ird_batches_v1',
  SALES: 'nepal_ird_sales_v1',
  PURCHASES: 'nepal_ird_purchases_v1',
  ACCOUNTS: 'nepal_ird_accounts_v1',
  JOURNALS: 'nepal_ird_journals_v1',
  TRANSFERS: 'nepal_ird_stock_transfers_v1',
} as const;

const APP_STORAGE_KEYS = Object.values(STORAGE_KEYS);

const ROUTE_TAB_MAP: Record<string, ActiveTab> = {
  '/': 'dashboard',
  '/home': 'dashboard',
  '/dashboard': 'dashboard',
  '/master-data': 'master_data',
  '/master-data/items': 'master_data',
  '/master-data/business-partners': 'master_data',
  '/sales': 'sales',
  '/sales/tax-invoice': 'sales',
  '/sales/returns': 'sales',
  '/sales/debit-note': 'sales',
  '/sales/credit-note': 'sales',
  '/purchases': 'purchase',
  '/purchases/invoices': 'purchase',
  '/purchases/returns': 'purchase',
  '/purchases/debit-note': 'purchase',
  '/purchases/credit-note': 'purchase',
  '/inventory': 'inventory',
  '/inventory/stock': 'inventory',
  '/inventory/fifo-batches': 'inventory',
  '/inventory/transfers': 'inventory',
  '/accounting': 'accounting',
  '/accounting/journals': 'accounting',
  '/accounting/ledger': 'accounting',
  '/accounting/trial-balance': 'accounting',
  '/accounting/profit-loss': 'accounting',
  '/accounting/balance-sheet': 'accounting',
  '/accounting/chart-of-accounts': 'accounting',
  '/ird': 'ird',
  '/ird/sales-book': 'ird',
  '/ird/purchase-book': 'ird',
  '/ird/vat-return': 'ird',
  '/ird/regulations': 'ird',
  '/setup': 'setup',
  '/settings': 'setup',
  '/users': 'dashboard',
  '/user-management': 'dashboard',
};

const TAB_ROUTE_MAP: Record<ActiveTab, string> = {
  dashboard: '/home',
  master_data: '/master-data',
  sales: '/sales',
  purchase: '/purchases',
  inventory: '/inventory',
  accounting: '/accounting',
  ird: '/ird',
  setup: '/setup',
};

function getPathname(): string {
  return window.location.pathname.replace(/\/$/, '') || '/';
}

function getTabFromPath(pathname: string): ActiveTab {
  return ROUTE_TAB_MAP[pathname] || 'dashboard';
}

function navigateTo(pathname: string, replace = false): void {
  if (getPathname() === pathname) return;
  if (replace) window.history.replaceState({}, '', pathname);
  else window.history.pushState({}, '', pathname);
  window.dispatchEvent(new PopStateEvent('popstate'));
}


export default function App() {
  const [authSession, setAuthSession] = useState<AuthSession | null>(() => getStoredAuthSession());
  const [authChecking, setAuthChecking] = useState(true);
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [apiOnline, setApiOnline] = useState(false);
  const apiKnownIds = useRef({ warehouses: new Set<string>(), partners: new Set<string>(), items: new Set<string>() });
  const [activeTab, setActiveTabState] = useState<ActiveTab>(() => getTabFromPath(getPathname()));
  const [isOpenMobile, setIsOpenMobile] = useState<boolean>(false);
  const [masterDataSubTab, setMasterDataSubTab] = useState<'item_master' | 'bp_master'>('item_master');
  const [salesTransactionType, setSalesTransactionType] = useState<SalesTransactionType>('tax_invoice');
  const [purchaseTransactionType, setPurchaseTransactionType] = useState<PurchaseTransactionType>('purchase_invoice');
  const [accountingSubTab, setAccountingSubTab] = useState<'journals' | 'ledger' | 'trial_balance' | 'pnl' | 'balance_sheet' | 'chart_of_accounts'>('journals');
  const [inventorySubTab, setInventorySubTab] = useState<'stock_overview' | 'fifo_batches' | 'transfer' | 'item_master'>('stock_overview');
  const [irdSubTab, setIrdSubTab] = useState<'sales_book' | 'purchase_book' | 'vat_return' | 'regulations'>('sales_book');

  // URL routing is intentionally lightweight: it uses the browser History API so the
  // existing ERP navigation/components remain unchanged and no router dependency is required.
  useEffect(() => {
    const syncRoute = () => {
      const pathname = getPathname();
      setActiveTabState(getTabFromPath(pathname));

      if (pathname === '/master-data/items' || pathname === '/master-data') setMasterDataSubTab('item_master');
      else if (pathname === '/master-data/business-partners') setMasterDataSubTab('bp_master');

      if (pathname === '/sales/tax-invoice' || pathname === '/sales') setSalesTransactionType('tax_invoice');
      else if (pathname === '/sales/returns') setSalesTransactionType('sales_return');
      else if (pathname === '/sales/debit-note') setSalesTransactionType('debit_note');
      else if (pathname === '/sales/credit-note') setSalesTransactionType('credit_note');

      if (pathname === '/purchases/invoices' || pathname === '/purchases') setPurchaseTransactionType('purchase_invoice');
      else if (pathname === '/purchases/returns') setPurchaseTransactionType('purchase_return');
      else if (pathname === '/purchases/debit-note') setPurchaseTransactionType('debit_note');
      else if (pathname === '/purchases/credit-note') setPurchaseTransactionType('credit_note');

      if (pathname === '/accounting' || pathname === '/accounting/journals') setAccountingSubTab('journals');
      else if (pathname === '/accounting/ledger') setAccountingSubTab('ledger');
      else if (pathname === '/accounting/trial-balance') setAccountingSubTab('trial_balance');
      else if (pathname === '/accounting/profit-loss') setAccountingSubTab('pnl');
      else if (pathname === '/accounting/balance-sheet') setAccountingSubTab('balance_sheet');
      else if (pathname === '/accounting/chart-of-accounts') setAccountingSubTab('chart_of_accounts');

      if (pathname === '/inventory' || pathname === '/inventory/stock') setInventorySubTab('stock_overview');
      else if (pathname === '/inventory/fifo-batches') setInventorySubTab('fifo_batches');
      else if (pathname === '/inventory/transfers') setInventorySubTab('transfer');
      else if (pathname === '/inventory/item-master') setInventorySubTab('item_master');

      if (pathname === '/ird' || pathname === '/ird/sales-book') setIrdSubTab('sales_book');
      else if (pathname === '/ird/purchase-book') setIrdSubTab('purchase_book');
      else if (pathname === '/ird/vat-return') setIrdSubTab('vat_return');
      else if (pathname === '/ird/regulations') setIrdSubTab('regulations');
    };

    window.addEventListener('popstate', syncRoute);
    syncRoute();
    return () => window.removeEventListener('popstate', syncRoute);
  }, []);

  const setActiveTab = (tab: ActiveTab) => {
    setActiveTabState(tab);
    navigateTo(TAB_ROUTE_MAP[tab]);
  };

  const setMasterDataSubTabRoute = (subTab: 'item_master' | 'bp_master') => {
    setMasterDataSubTab(subTab);
    navigateTo(subTab === 'item_master' ? '/master-data/items' : '/master-data/business-partners');
  };

  const setSalesTransactionTypeRoute = (type: SalesTransactionType) => {
    setSalesTransactionType(type);
    const routes: Record<SalesTransactionType, string> = {
      tax_invoice: '/sales/tax-invoice',
      sales_return: '/sales/returns',
      debit_note: '/sales/debit-note',
      credit_note: '/sales/credit-note',
    };
    navigateTo(routes[type]);
  };

  const setPurchaseTransactionTypeRoute = (type: PurchaseTransactionType) => {
    setPurchaseTransactionType(type);
    const routes: Record<PurchaseTransactionType, string> = {
      purchase_invoice: '/purchases/invoices',
      purchase_return: '/purchases/returns',
      debit_note: '/purchases/debit-note',
      credit_note: '/purchases/credit-note',
    };
    navigateTo(routes[type]);
  };

  const setAccountingSubTabRoute = (subTab: 'journals' | 'ledger' | 'trial_balance' | 'pnl' | 'balance_sheet' | 'chart_of_accounts') => {
    setAccountingSubTab(subTab);
    const routes = {
      journals: '/accounting/journals',
      ledger: '/accounting/ledger',
      trial_balance: '/accounting/trial-balance',
      pnl: '/accounting/profit-loss',
      balance_sheet: '/accounting/balance-sheet',
      chart_of_accounts: '/accounting/chart-of-accounts',
    } as const;
    navigateTo(routes[subTab]);
  };

  const setInventorySubTabRoute = (subTab: 'stock_overview' | 'fifo_batches' | 'transfer' | 'item_master') => {
    setInventorySubTab(subTab);
    const routes = {
      stock_overview: '/inventory/stock',
      fifo_batches: '/inventory/fifo-batches',
      transfer: '/inventory/transfers',
      item_master: '/inventory/item-master',
    } as const;
    navigateTo(routes[subTab]);
  };

  const setIrdSubTabRoute = (subTab: 'sales_book' | 'purchase_book' | 'vat_return' | 'regulations') => {
    setIrdSubTab(subTab);
    const routes = {
      sales_book: '/ird/sales-book',
      purchase_book: '/ird/purchase-book',
      vat_return: '/ird/vat-return',
      regulations: '/ird/regulations',
    } as const;
    navigateTo(routes[subTab]);
  };

  // Frontend-only persistence for F1/F2. The persistence layer is isolated so it
  // can later be replaced with API-backed repositories without changing the UI.
  const [settings, setSettings] = usePersistentState(STORAGE_KEYS.SETTINGS, INITIAL_SETTINGS);
  const [warehouses, setWarehouses] = usePersistentState(STORAGE_KEYS.WAREHOUSES, INITIAL_WAREHOUSES);
  const [partners, setPartners] = usePersistentState(STORAGE_KEYS.PARTNERS, INITIAL_PARTNERS);
  const [items, setItems] = usePersistentState(STORAGE_KEYS.ITEMS, INITIAL_ITEMS);
  const [batches, setBatches] = usePersistentState(STORAGE_KEYS.BATCHES, INITIAL_FIFO_BATCHES);
  const [salesInvoices, setSalesInvoices] = usePersistentState(STORAGE_KEYS.SALES, INITIAL_SALES_INVOICES);
  const [purchaseBills, setPurchaseBills] = usePersistentState(STORAGE_KEYS.PURCHASES, INITIAL_PURCHASE_BILLS);
  const [accounts, setAccounts] = usePersistentState(STORAGE_KEYS.ACCOUNTS, INITIAL_ACCOUNTS);
  const [journalEntries, setJournalEntries] = usePersistentState(STORAGE_KEYS.JOURNALS, INITIAL_JOURNAL_ENTRIES);
  const [stockTransfers, setStockTransfers] = usePersistentState<StockTransfer[]>(STORAGE_KEYS.TRANSFERS, []);

  useEffect(() => {
    let cancelled = false;
    const verifySession = async () => {
      const stored = getStoredAuthSession();
      if (!stored) {
        if (!cancelled) setAuthChecking(false);
        return;
      }

      try {
        const user = await repository.auth.me();
        if (!cancelled) {
          setAuthSession({ ...stored, user, database: user.database });
        }
      } catch {
        clearAuthSession();
        if (!cancelled) setAuthSession(null);
      } finally {
        if (!cancelled) setAuthChecking(false);
      }
    };

    void verifySession();
    return () => { cancelled = true; };
  }, []);

  // B10: SQL Server is authoritative for master data when the API is reachable.
  // Empty server tables are meaningful and must replace stale/demo localStorage data.
  // Local cached data is used only when the backend is unavailable.
  useEffect(() => {
    let cancelled = false;
    const hydrateFromApi = async () => {
      try {
        const result = await repository.health();
        if (cancelled) return;
        setApiOnline(result.success);
        const [remoteSettings, remoteWarehouses, remotePartners, remoteItems, remoteBatches, remoteTransfers, remotePurchases, remoteSales, remoteAccounts, remoteJournals] = await Promise.all([
          repository.settings.get(),
          repository.warehouses.list(),
          repository.partners.list(),
          repository.items.list(),
          repository.inventory.batches.list(),
          repository.inventory.transfers.list(),
          repository.purchases.list(),
          repository.sales.list(),
          repository.accounts.list(),
          repository.journals.list(),
        ]);
        if (cancelled) return;
        if (remoteSettings) setSettings(remoteSettings);
        apiKnownIds.current.warehouses = new Set(remoteWarehouses.map((row) => row.id));
        apiKnownIds.current.partners = new Set(remotePartners.map((row) => row.id));
        apiKnownIds.current.items = new Set(remoteItems.map((row) => row.id));
        // SQL Server is authoritative after B10.
        // Empty server tables must also clear stale/demo local data.
        setWarehouses(remoteWarehouses);
        setPartners(remotePartners);
        setItems(remoteItems);
        // B3: inventory is now server-authoritative. An empty remote batch set is
        // meaningful and must not be replaced by stale local FIFO data.
        setBatches(remoteBatches);
        setStockTransfers(remoteTransfers);
        // B4: purchases and accounting snapshots are server-authoritative.
        setPurchaseBills(remotePurchases);
        setSalesInvoices(remoteSales);
        setAccounts(remoteAccounts);
        setJournalEntries(remoteJournals);
      } catch (error) {
        if (!cancelled) {
          setApiOnline(false);
          console.warn('[api] Backend unavailable; continuing with local cached data.', error);
        }
      } finally {
        // Hydration is best-effort; cached frontend data remains usable if the API is down.
      }
    };
    if (!authSession || authChecking) return;
    hydrateFromApi();
    return () => { cancelled = true; };
  }, [authSession, authChecking]);

  const persistSettings = async (next: CompanySettings): Promise<void> => {
    try {
      const saved = await repository.settings.update(next);

      setSettings(saved);
      setApiOnline(true);
    } catch (error) {
      setApiOnline(false);

      throw new Error(
        apiErrorMessage(
          error,
          'Unable to save company settings to the backend.'
        )
      );
    }
  };

  const syncMasterCollection = async <T extends { id: string }>(
    current: T[],
    next: T[],
    resource: { create: (value: T) => Promise<T>; update: (id: string, value: T) => Promise<T>; remove: (id: string) => Promise<void> },
    setter: React.Dispatch<React.SetStateAction<T[]>>,
    knownIds: Set<string>,
  ) => {
    const currentById = new Map(current.map((row) => [row.id, row]));
    const nextById = new Map(next.map((row) => [row.id, row]));
    try {
      // Only delete records that are known to exist on the server. This keeps
      // legacy/local-only records usable until the user edits them and they are migrated.
      for (const row of current) {
        if (!nextById.has(row.id) && knownIds.has(row.id)) await resource.remove(row.id);
      }
      for (const row of next) {
        if (!knownIds.has(row.id)) {
          const created = await resource.create(row);
          knownIds.add(created.id);
        } else if (JSON.stringify(currentById.get(row.id)) !== JSON.stringify(row)) {
          await resource.update(row.id, row);
        }
      }
      setter(next);
      setApiOnline(true);
    } catch (error) {
      setApiOnline(false);
      alert(apiErrorMessage(error, 'Backend save failed. No local state was committed.'));
      return;
    }
  };

  const persistWarehouses = (next: Warehouse[]) => syncMasterCollection(warehouses, next, repository.warehouses, setWarehouses, apiKnownIds.current.warehouses);
  const persistPartners = (next: BusinessPartner[]) => syncMasterCollection(partners, next, repository.partners, setPartners, apiKnownIds.current.partners);
  const persistItems = (next: GarmentItem[]) => syncMasterCollection(items, next, repository.items, setItems, apiKnownIds.current.items);

  // Modal for Viewing / Printing Nepal IRD Tax Invoice
  const [viewingTaxInvoice, setViewingTaxInvoice] = useState<SalesInvoice | null>(null);
  const [viewingPurchaseBill, setViewingPurchaseBill] = useState<PurchaseBill | null>(null);


  function apiErrorMessage(error: unknown, fallback: string): string {
    return error instanceof ApiError ? error.message : fallback;
  }

  // B5: Sales is fully server-authoritative. The backend owns document numbering,
  // FIFO OUT/return restocking, journals and customer balances in one SQL transaction.
  const handleRecordSale = async (input: import('./api/repository').CreateSaleRequest): Promise<SalesInvoice> => {
    const savedInvoice = await repository.sales.create(input);
    const [remoteSales, remoteBatches, remoteAccounts, remoteJournals, remotePartners] = await Promise.all([
      repository.sales.list(),
      repository.inventory.batches.list(),
      repository.accounts.list(),
      repository.journals.list(),
      repository.partners.list(),
    ]);
    setSalesInvoices(remoteSales);
    setBatches(remoteBatches);
    setAccounts(remoteAccounts);
    setJournalEntries(remoteJournals);
    setPartners(remotePartners);
    setApiOnline(true);
    return savedInvoice;
  };

  // B4: Purchase posting is fully server-authoritative. The backend creates the
  // purchase bill, FIFO layers/movements, journal entry, and vendor balance in
  // one SQL transaction; the frontend refreshes the resulting snapshots only
  // after the API call succeeds.
  const handleRecordPurchase = async (input: import('./api/repository').CreatePurchaseRequest): Promise<PurchaseBill> => {
    const savedBill = await repository.purchases.create(input);
    const [remotePurchases, remoteBatches, remoteAccounts, remoteJournals, remotePartners] = await Promise.all([
      repository.purchases.list(),
      repository.inventory.batches.list(),
      repository.accounts.list(),
      repository.journals.list(),
      repository.partners.list(),
    ]);
    setPurchaseBills(remotePurchases);
    setBatches(remoteBatches);
    setAccounts(remoteAccounts);
    setJournalEntries(remoteJournals);
    setPartners(remotePartners);
    setApiOnline(true);
    return savedBill;
  };

  // B6: Manual journals/opening balances are now server-authoritative.
  // The backend owns journal numbering, validation, account balance updates, and transaction atomicity.
  const handleRecordJournal = async (draft: Omit<JournalEntry, 'id' | 'entryNo' | 'totalDebit' | 'totalCredit' | 'isBalanced' | 'referenceType'>): Promise<JournalEntry> => {
    const validation = validateJournalLines(draft.lines, accounts);
    if (!validation.isValid) throw new Error(validation.message);
    const savedJournal = await repository.journals.create({
      fiscalYear: settings.fiscalYear,
      mitiDate: draft.mitiDate,
      adDate: draft.adDate,
      referenceNo: draft.referenceNo || 'MANUAL',
      narration: draft.narration,
      lines: draft.lines,
    });
    const [remoteAccounts, remoteJournals] = await Promise.all([
      repository.accounts.list(),
      repository.journals.list(),
    ]);
    setAccounts(remoteAccounts);
    setJournalEntries(remoteJournals);
    setApiOnline(true);
    return savedJournal;
  };


  const handleCreateAccount = async (
    input: Omit<Account, 'balance' | 'isActive' | 'isSystem'>
  ) => {
    const saved = await repository.accounts.create(input);

    const remoteAccounts =
      await repository.accounts.list();

    setAccounts(remoteAccounts);
    setApiOnline(true);

    return saved;
  };


  const handleUpdateAccount = async (
    code: string,
    input: Partial<Account>
  ) => {
    const saved =
      await repository.accounts.update(code, input);

    const remoteAccounts =
      await repository.accounts.list();

    setAccounts(remoteAccounts);
    setApiOnline(true);

    return saved;
  };


  const handleDeleteAccount = async (code: string) => {
    await repository.accounts.remove(code);

    const remoteAccounts =
      await repository.accounts.list();

    setAccounts(remoteAccounts);
    setApiOnline(true);
  };


  const handleInitializeStandardChart = async () => {
    const result =
      await repository.accounts.initializeStandard();

    const remoteAccounts =
      await repository.accounts.list();

    setAccounts(remoteAccounts);
    setApiOnline(true);

    return result;
  };


  // Handler: Inter-warehouse stock transfer. B3 delegates FIFO mutation and
  // document numbering to the backend SQL transaction, then refreshes the
  // authoritative batch/transfer snapshots.
  const handleRecordTransfer = async (input: CreateTransferRequest): Promise<StockTransfer> => {
    const savedTransfer = await repository.inventory.transfers.create(input);
    const [remoteBatches, remoteTransfers] = await Promise.all([
      repository.inventory.batches.list(),
      repository.inventory.transfers.list(),
    ]);
    setBatches(remoteBatches);
    setStockTransfers(remoteTransfers);
    setApiOnline(true);
    return savedTransfer;
  };

  // Reset to demo data
  const handleResetData = () => {
    clearAppStorage(APP_STORAGE_KEYS);
    setSettings(INITIAL_SETTINGS);
    setWarehouses(INITIAL_WAREHOUSES);
    setPartners(INITIAL_PARTNERS);
    setItems(INITIAL_ITEMS);
    setBatches(INITIAL_FIFO_BATCHES);
    setSalesInvoices(INITIAL_SALES_INVOICES);
    setPurchaseBills(INITIAL_PURCHASE_BILLS);
    setAccounts(INITIAL_ACCOUNTS);
    setJournalEntries(INITIAL_JOURNAL_ENTRIES);
    setStockTransfers([]);
  };

  const handleLogin = (session: AuthSession) => {
    setAuthSession(session);
    setApiOnline(true);
    navigateTo('/home', true);
  };

  const handleLogout = () => {
    clearAuthSession();
    setShowUserManagement(false);
    setAuthSession(null);
    setApiOnline(false);
    setActiveTabState('dashboard');
    navigateTo('/login', true);
  };

  const totalInventoryValuation = getInventoryValuation(batches);

  const lowStockCount = items.filter((item) => {
    const stock = getItemStock(batches, item.id);
    return stock < item.minStockAlert;
  }).length;

  if (authChecking) {
    return (
      <div className="min-h-screen bg-[#faf9f6] flex items-center justify-center text-slate-500 text-sm">
        Checking SmartERP session...
      </div>
    );
  }

  if (!authSession) {
    if (getPathname() !== '/login') {
      window.history.replaceState({}, '', '/login');
    }
    return <LoginPage onLogin={handleLogin} />;
  }

  const currentPath = getPathname();
  if (currentPath === '/' || currentPath === '/login' || currentPath === '/dashboard') {
    window.history.replaceState({}, '', '/home');
  } else if (!ROUTE_TAB_MAP[currentPath]) {
    window.history.replaceState({}, '', '/home');
    setActiveTabState('dashboard');
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* Left Sidebar Menu (Fixed position, stays in place on scroll, auto-hides on pointer leave) */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        settings={settings}
        onResetData={handleResetData}
        isOpenMobile={isOpenMobile}
        setIsOpenMobile={setIsOpenMobile}
        masterDataSubTab={masterDataSubTab}
        setMasterDataSubTab={setMasterDataSubTabRoute}
        salesTransactionType={salesTransactionType}
        setSalesTransactionType={setSalesTransactionTypeRoute}
        purchaseTransactionType={purchaseTransactionType}
        setPurchaseTransactionType={setPurchaseTransactionTypeRoute}
        accountingSubTab={accountingSubTab}
        setAccountingSubTab={setAccountingSubTabRoute}
        inventorySubTab={inventorySubTab}
        setInventorySubTab={setInventorySubTabRoute}
        irdSubTab={irdSubTab}
        setIrdSubTab={setIrdSubTabRoute}
        permissions={authSession.user.permissions}
        onOpenUserManagement={() => { setShowUserManagement(true); navigateTo('/users'); }}
        onLogout={handleLogout}
      />

      {/* Main Layout Container (Full width; left menu slides out and auto-hides) */}
      <div className="flex-1 flex flex-col min-w-0 w-full transition-all duration-300">
        {/* Top Header */}
        <TopHeader
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          settings={settings}
          onResetData={handleResetData}
          onOpenMobileMenu={() => setIsOpenMobile(!isOpenMobile)}
          lowStockCount={lowStockCount}
          currentUser={authSession.user}
          onOpenUserManagement={() => { setShowUserManagement(true); navigateTo('/users'); }}
          onLogout={handleLogout}
        />

        {/* Dynamic Module Content View */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {activeTab === 'dashboard' && (
            <DashboardModule
              salesInvoices={salesInvoices}
              purchaseBills={purchaseBills}
              items={items}
              partners={partners}
              warehouses={warehouses}
              batches={batches}
              settings={settings}
              setActiveTab={setActiveTab}
              onViewTaxInvoice={(inv) => setViewingTaxInvoice(inv)}
              onViewPurchaseBill={(bill) => setViewingPurchaseBill(bill)}
              setMasterDataSubTab={setMasterDataSubTabRoute}
              onLoadDashboardReport={(period, fiscalYear, from, to) => repository.dashboard.report(period, fiscalYear, from, to)}
            />
          )}

          {activeTab === 'master_data' && (
            <MasterDataModule
              items={items}
              partners={partners}
              batches={batches}
              warehouses={warehouses}
              onUpdateItems={persistItems}
              onUpdatePartners={persistPartners}
              initialSubTab={masterDataSubTab}
            />
          )}

          {activeTab === 'sales' && (
            <SalesInvoiceModule
              items={items}
              partners={partners}
              warehouses={warehouses}
              batches={batches}
              salesInvoices={salesInvoices}
              settings={settings}
              onRecordSale={handleRecordSale}
              onViewTaxInvoice={(inv) => setViewingTaxInvoice(inv)}
              initialTxType={salesTransactionType}
            />
          )}

          {activeTab === 'purchase' && (
            <PurchaseModule
              items={items}
              partners={partners}
              warehouses={warehouses}
              batches={batches}
              purchaseBills={purchaseBills}
              settings={settings}
              onRecordPurchase={handleRecordPurchase}
              onViewPurchaseBill={(bill) => setViewingPurchaseBill(bill)}
              initialTxType={purchaseTransactionType}
            />
          )}

          {activeTab === 'inventory' && (
            <InventoryModule
              items={items}
              warehouses={warehouses}
              batches={batches}
              settings={settings}
              onUpdateItems={persistItems}
              onRecordTransfer={handleRecordTransfer}
              transferHistory={stockTransfers}
              initialSubTab={inventorySubTab}
            />
          )}

          {activeTab === 'accounting' && (
            <AccountingModule
              accounts={accounts}
              journalEntries={journalEntries}
              fiscalYear={settings.fiscalYear}
              initialSubTab={accountingSubTab}
              onCreateJournal={handleRecordJournal}
              onCreateAccount={handleCreateAccount}
              onUpdateAccount={handleUpdateAccount}
              onDeleteAccount={handleDeleteAccount}
              onInitializeStandardChart={handleInitializeStandardChart}
            />
          )}

          {activeTab === 'ird' && (
            <IrdComplianceModule
              salesInvoices={salesInvoices}
              purchaseBills={purchaseBills}
              settings={settings}
              onViewTaxInvoice={(inv) => setViewingTaxInvoice(inv)}
              initialSubTab={irdSubTab}
            />
          )}

          {activeTab === 'setup' && (
            <SetupModule
              settings={settings}
              onUpdateSettings={persistSettings}
              warehouses={warehouses}
              onUpdateWarehouses={persistWarehouses}
              partners={partners}
              onUpdatePartners={persistPartners}
              items={items}
              onUpdateItems={persistItems}
              batches={batches}
              onUpdateBatches={setBatches}
              salesInvoices={salesInvoices}
              onUpdateSalesInvoices={setSalesInvoices}
              purchaseBills={purchaseBills}
              onUpdatePurchaseBills={setPurchaseBills}
              accounts={accounts}
              onUpdateAccounts={setAccounts}
              journalEntries={journalEntries}
              onUpdateJournalEntries={setJournalEntries}
              stockTransfers={stockTransfers}
              onUpdateStockTransfers={setStockTransfers}
              onResetAllData={handleResetData}
            />
          )}
        </main>

        {/* Official Nepal IRD Tax Invoice Modal */}
        {viewingTaxInvoice && (
          <TaxInvoiceModal
            invoice={viewingTaxInvoice}
            settings={settings}
            onClose={() => setViewingTaxInvoice(null)}
          />
        )}

        {viewingPurchaseBill && (
          <PurchaseBillModal
            bill={viewingPurchaseBill}
            settings={settings}
            onClose={() => setViewingPurchaseBill(null)}
          />
        )}

        {(showUserManagement || getPathname() === '/users' || getPathname() === '/user-management') && authSession.user.permissions.includes('users') && (
          <UserManagementModule onClose={() => { setShowUserManagement(false); navigateTo('/home'); }} />
        )}

        {/* Clean Footer */}
        <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
            <div>
              <span className="font-semibold text-slate-700">{settings.companyName}</span> | PAN:{' '}
              <span className="font-mono font-bold text-slate-800">{settings.panNumber}</span> | IRD Nepal Reg:{' '}
              <span className="font-mono">{settings.irdApprovalNo}</span>
            </div>
            <div className="text-[11px] text-slate-400">
              Compliant with Nepal Value Added Tax Act 2052 & IRD E-Billing Guidelines (Fiscal Year {settings.fiscalYear})
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
