import React from 'react';
import { CompanySettings, SalesTransactionType, PurchaseTransactionType } from '../types';
import {
  LayoutDashboard,
  Database,
  ShoppingCart,
  ShoppingBag,
  Package,
  BookOpen,
  FileSpreadsheet,
  Settings,
  ShieldCheck,
  Building2,
  RotateCcw,
  Pin,
  PinOff,
  Menu,
  X,
  ChevronDown,
  ChevronRight,
  Receipt,
  FileText,
  CreditCard,
  CornerDownRight,
  Users,
  LogOut
} from 'lucide-react';

export type ActiveTab =
  | 'dashboard'
  | 'master_data'
  | 'sales'
  | 'purchase'
  | 'inventory'
  | 'accounting'
  | 'ird'
  | 'setup';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  settings: CompanySettings;
  onResetData: () => void;
  isOpenMobile: boolean;
  setIsOpenMobile: (open: boolean) => void;
  masterDataSubTab?: 'item_master' | 'bp_master';
  setMasterDataSubTab?: (subTab: 'item_master' | 'bp_master') => void;
  salesTransactionType?: SalesTransactionType;
  setSalesTransactionType?: (type: SalesTransactionType) => void;
  purchaseTransactionType?: PurchaseTransactionType;
  setPurchaseTransactionType?: (type: PurchaseTransactionType) => void;
  accountingSubTab?: 'journals' | 'ledger' | 'trial_balance' | 'pnl' | 'balance_sheet' | 'chart_of_accounts';
  setAccountingSubTab?: (subTab: 'journals' | 'ledger' | 'trial_balance' | 'pnl' | 'balance_sheet' | 'chart_of_accounts') => void;
  inventorySubTab?: 'stock_overview' | 'fifo_batches' | 'transfer' | 'item_master';
  setInventorySubTab?: (subTab: 'stock_overview' | 'fifo_batches' | 'transfer' | 'item_master') => void;
  irdSubTab?: 'sales_book' | 'purchase_book' | 'vat_return' | 'regulations';
  setIrdSubTab?: (subTab: 'sales_book' | 'purchase_book' | 'vat_return' | 'regulations') => void;
  permissions?: string[];
  onOpenUserManagement?: () => void;
  onLogout?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  settings,
  onResetData,
  isOpenMobile,
  setIsOpenMobile,
  masterDataSubTab = 'item_master',
  setMasterDataSubTab,
  salesTransactionType = 'tax_invoice',
  setSalesTransactionType,
  purchaseTransactionType = 'purchase_invoice',
  setPurchaseTransactionType,
  accountingSubTab = 'journals',
  setAccountingSubTab,
  inventorySubTab = 'stock_overview',
  setInventorySubTab,
  irdSubTab = 'sales_book',
  setIrdSubTab,
  permissions = ['dashboard', 'master_data', 'sales', 'purchase', 'inventory', 'accounting', 'ird', 'setup', 'users'],
  onOpenUserManagement,
  onLogout,
}) => {
  // Auto-hide state: hides completely when mouse cursor moves to another area of the screen
  const [isHovered, setIsHovered] = React.useState<boolean>(false);
  const [isPinned, setIsPinned] = React.useState<boolean>(false);

  // Dropdown accordions for menus
  const [salesDropdownOpen, setSalesDropdownOpen] = React.useState<boolean>(true);
  const [purchaseDropdownOpen, setPurchaseDropdownOpen] = React.useState<boolean>(true);
  const [financeDropdownOpen, setFinanceDropdownOpen] = React.useState<boolean>(true);
  const [masterDataDropdownOpen, setMasterDataDropdownOpen] = React.useState<boolean>(true);
  const [inventoryDropdownOpen, setInventoryDropdownOpen] = React.useState<boolean>(true);
  const [irdDropdownOpen, setIrdDropdownOpen] = React.useState<boolean>(true);

  // The sidebar is visible if user hovers on it/left trigger, or mobile toggle is open, or explicitly pinned
  const isVisible = isPinned || isHovered || isOpenMobile;

  const salesSubItems: {
    type: SalesTransactionType;
    label: string;
    subLabel: string;
    badge: string;
    badgeColor: string;
  }[] = [
    {
      type: 'tax_invoice',
      label: 'Sales Tax Invoice',
      subLabel: 'Standard POS Invoicing',
      badge: 'Tax Inv',
      badgeColor: 'bg-emerald-500/20 text-emerald-600 border-emerald-500/30',
    },
    {
      type: 'sales_return',
      label: 'Sales Return',
      subLabel: 'Customer Goods Return',
      badge: 'Return',
      badgeColor: 'bg-amber-500/20 text-amber-600 border-amber-500/30',
    },
    {
      type: 'debit_note',
      label: 'Debit Note',
      subLabel: 'Debit Memo Adjustment',
      badge: 'Dr Note',
      badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    },
    {
      type: 'credit_note',
      label: 'Credit Note',
      subLabel: 'Credit Rebate / Discount',
      badge: 'Cr Note',
      badgeColor: 'bg-purple-500/20 text-purple-600 border-purple-500/30',
    },
  ];

  const purchaseSubItems: {
    type: PurchaseTransactionType;
    label: string;
    subLabel: string;
    badge: string;
    badgeColor: string;
  }[] = [
    {
      type: 'purchase_invoice',
      label: 'Purchase Invoice',
      subLabel: 'Inward FIFO Stock Bill',
      badge: 'Bill',
      badgeColor: 'bg-emerald-500/20 text-emerald-600 border-emerald-500/30',
    },
    {
      type: 'purchase_return',
      label: 'Purchase Return',
      subLabel: 'Return Goods to Vendor',
      badge: 'Return',
      badgeColor: 'bg-amber-500/20 text-amber-600 border-amber-500/30',
    },
    {
      type: 'debit_note',
      label: 'Debit Note',
      subLabel: 'Supplier Claim Memo',
      badge: 'Dr Note',
      badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    },
    {
      type: 'credit_note',
      label: 'Credit Note',
      subLabel: 'Supplier Rebate Memo',
      badge: 'Cr Note',
      badgeColor: 'bg-purple-500/20 text-purple-600 border-purple-500/30',
    },
  ];

  const accountingSubItems = [
    {
      subTab: 'journals' as const,
      label: 'Journal Entries',
      subLabel: 'Double Entry Vouchers',
      badge: 'JV',
      badgeColor: 'bg-indigo-500/20 text-indigo-500 border-indigo-500/30',
    },
    {
      subTab: 'ledger' as const,
      label: 'General Ledger',
      subLabel: 'Account Balances & Entries',
      badge: 'GL',
      badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    },
    {
      subTab: 'trial_balance' as const,
      label: 'Trial Balance',
      subLabel: 'Debit & Credit Check',
      badge: 'TB',
      badgeColor: 'bg-emerald-500/20 text-emerald-600 border-emerald-500/30',
    },
    {
      subTab: 'pnl' as const,
      label: 'Financial Reports',
      subLabel: 'Income & Balance Sheet',
      badge: 'P&L',
      badgeColor: 'bg-purple-500/20 text-purple-600 border-purple-500/30',
    },
    {
      subTab: 'chart_of_accounts' as const,
      label: 'Chart of Accounts',
      subLabel: 'Account Structure & Mapping',
      badge: 'COA',
      badgeColor: 'bg-amber-500/20 text-amber-600 border-amber-500/30',
    },
  ];

  const masterDataSubItems = [
    {
      subTab: 'item_master' as const,
      label: 'Item Master Data',
      subLabel: 'Garment Catalog & Pricing',
      badge: 'Items',
      badgeColor: 'bg-indigo-500/20 text-indigo-500 border-indigo-500/30',
    },
    {
      subTab: 'bp_master' as const,
      label: 'BP Master Data',
      subLabel: 'Customers & Suppliers (VAT)',
      badge: 'BP',
      badgeColor: 'bg-emerald-500/20 text-emerald-600 border-emerald-500/30',
    },
  ];

  const inventorySubItems = [
    {
      subTab: 'stock_overview' as const,
      label: 'Warehouse Stock',
      subLabel: 'Location Inventory & Lots',
      badge: 'Stock',
      badgeColor: 'bg-indigo-500/20 text-indigo-500 border-indigo-500/30',
    },
    {
      subTab: 'transfer' as const,
      label: 'Stock Transfer',
      subLabel: 'Inter-Warehouse Movement',
      badge: 'Transfer',
      badgeColor: 'bg-amber-500/20 text-amber-600 border-amber-500/30',
    },
    {
      subTab: 'fifo_batches' as const,
      label: 'FIFO Lot Batches',
      subLabel: 'Inward Cost Batches',
      badge: 'FIFO',
      badgeColor: 'bg-emerald-500/20 text-emerald-600 border-emerald-500/30',
    },
  ];

  const irdSubItems = [
    {
      subTab: 'sales_book' as const,
      label: 'Annex 7: Sales Book',
      subLabel: 'Statutory Sales Register',
      badge: 'Sales',
      badgeColor: 'bg-indigo-500/20 text-indigo-500 border-indigo-500/30',
    },
    {
      subTab: 'purchase_book' as const,
      label: 'Annex 8: Purchase Book',
      subLabel: 'Statutory Purchase Register',
      badge: 'Purchase',
      badgeColor: 'bg-emerald-500/20 text-emerald-600 border-emerald-500/30',
    },
    {
      subTab: 'vat_return' as const,
      label: 'VAT Return & Audit',
      subLabel: 'Monthly Tax Return Filing',
      badge: 'Audit',
      badgeColor: 'bg-purple-500/20 text-purple-600 border-purple-500/30',
    },
  ];

  const navItems: {
    id: ActiveTab | 'users';
    label: string;
    subLabel: string;
    icon: React.ReactNode;
    badge?: string;
    hasSubMenu?: 'sales' | 'purchase' | 'accounting' | 'master_data' | 'inventory' | 'ird';
  }[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      subLabel: 'Operations Overview',
      icon: <LayoutDashboard className="h-5 w-5" />,
      badge: 'Main',
    },
    {
      id: 'master_data',
      label: 'Master Data',
      subLabel: 'Items & Business Partners',
      icon: <Database className="h-5 w-5" />,
      hasSubMenu: 'master_data',
    },
    {
      id: 'sales',
      label: 'Sales & Billing',
      subLabel: 'Invoices, Returns & Notes',
      icon: <ShoppingCart className="h-5 w-5" />,
      hasSubMenu: 'sales',
    },
    {
      id: 'purchase',
      label: 'Purchases',
      subLabel: 'Inward Bills, Returns & Notes',
      icon: <ShoppingBag className="h-5 w-5" />,
      hasSubMenu: 'purchase',
    },
    {
      id: 'inventory',
      label: 'Multi-Warehouse',
      subLabel: 'FIFO Stock & Transfers',
      icon: <Package className="h-5 w-5" />,
      hasSubMenu: 'inventory',
    },
    {
      id: 'accounting',
      label: 'Finance',
      subLabel: 'Ledger & Statements',
      icon: <BookOpen className="h-5 w-5" />,
      hasSubMenu: 'accounting',
    },
    {
      id: 'ird',
      label: 'IRD Compliance',
      subLabel: 'Annex 7 & 8 Registers',
      icon: <FileSpreadsheet className="h-5 w-5" />,
      hasSubMenu: 'ird',
    },
    {
      id: 'users',
      label: 'User Management',
      subLabel: 'Manage ERP Users & Roles',
      icon: <Users className="h-5 w-5" />,
    },
    {
      id: 'setup',
      label: 'Setup & Settings',
      subLabel: 'Company & Tax Config',
      icon: <Settings className="h-5 w-5" />,
    },
  ];

  const visibleNavItems = navItems.filter((item) => {
    if (item.id === 'users') {
      return permissions.includes('users') && Boolean(onOpenUserManagement);
    }
    return permissions.includes(item.id);
  });

  return (
    <>
      {/* Left Edge Hover Sensor Strip: effortlessly triggers sidebar when mouse cursor glides to the left edge */}
      <div
        id="sidebar-edge-sensor"
        onMouseEnter={() => setIsHovered(true)}
        className={`fixed top-16 bottom-0 left-0 w-3 z-40 transition-all ${
          isVisible ? 'pointer-events-none opacity-0' : 'opacity-100 cursor-pointer hover:w-6'
        }`}
        title="Move mouse here to show menu"
        aria-hidden="true"
      />

      {/* Floating Edge Trigger Tab when sidebar is completely hidden */}
      {!isVisible && (
        <button
          id="sidebar-floating-trigger"
          type="button"
          onMouseEnter={() => setIsHovered(true)}
          onClick={() => {
            setIsHovered(true);
            setIsOpenMobile(true);
          }}
          className="fixed left-0 top-1/2 -translate-y-1/2 z-40 flex flex-col items-center gap-1.5 py-3 px-1.5 bg-sky-100 hover:bg-sky-500 text-sky-700 hover:text-white rounded-r-xl shadow-lg border-y border-r border-slate-200 backdrop-blur-xs transition-all duration-200 cursor-pointer group"
          title="Move mouse here to open menu (Auto-hides on leave)"
          aria-label="Open left menu"
        >
          <Menu className="h-4 w-4 transition-transform group-hover:scale-110 text-indigo-400 group-hover:text-white" />
          <span className="text-[10px] font-bold tracking-widest uppercase [writing-mode:vertical-lr] rotate-180 select-none text-slate-400 group-hover:text-white">
            Menu
          </span>
        </button>
      )}

      {/* Backdrop for mobile or temporary overlay focus */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs lg:hidden transition-opacity"
          onClick={() => setIsOpenMobile(false)}
        />
      )}

      {/* Left Sidebar: Fixed position, automatically slides in on hover and slides completely off-screen on mouse leave */}
      <aside
        id="app-sidebar"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          if (!isPinned) {
            setIsHovered(false);
            setIsOpenMobile(false);
          }
        }}
        className={`fixed top-16 bottom-0 left-0 z-50 flex flex-col w-72 bg-white text-black border-r border-slate-200 shadow-2xl transition-transform duration-250 ease-out ${
          isVisible ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Top Branding Section */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-slate-200 bg-white">
          <div className="flex items-center space-x-3 overflow-hidden">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center font-bold shadow-md shadow-sky-100">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="font-bold text-sm text-slate-900 tracking-tight truncate flex items-center gap-1.5">
                <span className="truncate">{settings.tradeName || settings.companyName}</span>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-sky-700 font-medium truncate">
                <ShieldCheck className="h-3 w-3 flex-shrink-0" />
                <span>IRD Approval: {settings.irdApprovalNo}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Desktop Pin Toggle (Locks menu open if desired; unpinning resumes auto-hide on leave) */}
            <button
              id="sidebar-pin-toggle"
              type="button"
              onClick={() => setIsPinned(!isPinned)}
              title={
                isPinned
                  ? 'Pinned open. Click to resume auto-hiding when mouse leaves.'
                  : 'Auto-hide active. Click to pin menu open.'
              }
              className={`flex items-center justify-center p-1.5 rounded-lg text-slate-600 hover:text-black hover:bg-slate-100 transition-colors ${
                isPinned ? 'text-sky-700 bg-sky-100 border border-sky-300' : ''
              }`}
            >
              {isPinned ? <Pin className="h-4 w-4 rotate-45 text-indigo-400" /> : <PinOff className="h-4 w-4" />}
            </button>

            {/* Close Button on Mobile */}
            <button
              type="button"
              onClick={() => {
                setIsHovered(false);
                setIsOpenMobile(false);
              }}
              className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-100"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* User / Session Actions */}
        <div className="px-3 py-2 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2">
            {permissions.includes('users') && onOpenUserManagement && (
              <button
                id="sidebar-user-management-btn"
                type="button"
                onClick={onOpenUserManagement}
                className="flex-1 inline-flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold text-slate-700 hover:text-sky-700 hover:bg-white border border-transparent hover:border-slate-200 transition-colors"
                title="Manage ERP users"
              >
                <Users className="h-4 w-4 text-sky-600" />
                User Management
              </button>
            )}
            {onLogout && (
              <button
                id="sidebar-logout-btn"
                type="button"
                onClick={onLogout}
                className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:text-rose-700 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors"
                title="Log out"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden xl:inline">Logout</span>
              </button>
            )}
          </div>
        </div>

        {/* Navigation Items (Scrollable when screen height is small) */}
        <div className="flex-1 px-3 py-4 space-y-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300">
          <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600 flex items-center justify-between">
            <span>Navigation Modules</span>
            {!isPinned && (
              <span className="text-[9px] text-sky-600 font-normal normal-case">
                Auto-hides on leave
              </span>
            )}
          </div>

          {visibleNavItems.map((item) => {
            const isUsersItem = item.id === 'users';
            const isActive = !isUsersItem && activeTab === item.id;
            const isSales = item.hasSubMenu === 'sales';
            const isPurchase = item.hasSubMenu === 'purchase';
            const isFinance = item.hasSubMenu === 'accounting';
            const isMasterData = item.hasSubMenu === 'master_data';
            const isInventory = item.hasSubMenu === 'inventory';
            const isIrd = item.hasSubMenu === 'ird';
            const hasSub = Boolean(item.hasSubMenu);

            return (
              <div key={item.id} className="space-y-1">
                {/* Main Item Row */}
                <div className="flex items-center gap-1">
                  <button
                    id={`sidebar-item-${item.id}`}
                    type="button"
                    onClick={() => {
                      if (isUsersItem) {
                        onOpenUserManagement?.();
                        if (!isPinned) {
                          setIsHovered(false);
                          setIsOpenMobile(false);
                        }
                        return;
                      }
                      setActiveTab(item.id as ActiveTab);
                      if (isSales) setSalesDropdownOpen(true);
                      if (isPurchase) setPurchaseDropdownOpen(true);
                      if (isFinance) setFinanceDropdownOpen(true);
                      if (isMasterData) setMasterDataDropdownOpen(true);
                      if (isInventory) setInventoryDropdownOpen(true);
                      if (isIrd) setIrdDropdownOpen(true);
                      if (!isPinned && !hasSub) {
                        setIsHovered(false);
                        setIsOpenMobile(false);
                      }
                    }}
                    className={`flex-1 group relative flex items-center rounded-xl px-3 py-2.5 text-xs font-medium transition-all duration-200 cursor-pointer ${
                      isActive
                        ? 'bg-sky-100 text-black font-semibold shadow-sm shadow-sky-200'
                        : 'text-slate-700 hover:text-slate-900 hover:bg-white'
                    }`}
                  >
                    {/* Active Indicator Bar */}
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-white rounded-r-full shadow-xs" />
                    )}

                    {/* Icon */}
                    <span
                      className={`flex-shrink-0 mr-3 transition-colors ${
                        isActive ? 'text-sky-700' : 'text-slate-700 group-hover:text-sky-600'
                      }`}
                    >
                      {item.icon}
                    </span>

                    {/* Text Label (module name only, no sub-description) */}
                    <div className="flex-1 text-left min-w-0 flex items-center justify-between">
                      <div className="truncate text-xs font-medium tracking-wide">{item.label}</div>
                      {item.badge && (
                        <span className="ml-1.5 px-1.5 py-0.5 text-[9px] font-bold rounded bg-sky-50 text-sky-700 border border-sky-200">
                          {item.badge}
                        </span>
                      )}
                    </div>
                  </button>

                  {/* Dropdown Chevron toggle */}
                  {isSales && (
                    <button
                      type="button"
                      onClick={() => setSalesDropdownOpen(!salesDropdownOpen)}
                      className={`p-2 rounded-lg text-slate-600 hover:text-black hover:bg-slate-100 transition-colors cursor-pointer ${
                        salesDropdownOpen ? 'text-sky-700 bg-sky-100' : ''
                      }`}
                      title={salesDropdownOpen ? 'Collapse transactions' : 'Expand transactions'}
                      aria-label="Toggle Sales transaction dropdown"
                    >
                      {salesDropdownOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                  )}

                  {isPurchase && (
                    <button
                      type="button"
                      onClick={() => setPurchaseDropdownOpen(!purchaseDropdownOpen)}
                      className={`p-2 rounded-lg text-slate-600 hover:text-black hover:bg-slate-100 transition-colors cursor-pointer ${
                        purchaseDropdownOpen ? 'text-sky-700 bg-sky-100' : ''
                      }`}
                      title={purchaseDropdownOpen ? 'Collapse transactions' : 'Expand transactions'}
                      aria-label="Toggle Purchase transaction dropdown"
                    >
                      {purchaseDropdownOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                  )}

                  {isFinance && (
                    <button
                      type="button"
                      onClick={() => setFinanceDropdownOpen(!financeDropdownOpen)}
                      className={`p-2 rounded-lg text-slate-600 hover:text-black hover:bg-slate-100 transition-colors cursor-pointer ${
                        financeDropdownOpen ? 'text-sky-700 bg-sky-100' : ''
                      }`}
                      title={financeDropdownOpen ? 'Collapse Finance items' : 'Expand Finance items'}
                      aria-label="Toggle Finance dropdown"
                    >
                      {financeDropdownOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                  )}

                  {isMasterData && (
                    <button
                      type="button"
                      onClick={() => setMasterDataDropdownOpen(!masterDataDropdownOpen)}
                      className={`p-2 rounded-lg text-slate-600 hover:text-black hover:bg-slate-100 transition-colors cursor-pointer ${
                        masterDataDropdownOpen ? 'text-sky-700 bg-sky-100' : ''
                      }`}
                      title={masterDataDropdownOpen ? 'Collapse Master Data' : 'Expand Master Data'}
                      aria-label="Toggle Master Data dropdown"
                    >
                      {masterDataDropdownOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                  )}

                  {isInventory && (
                    <button
                      type="button"
                      onClick={() => setInventoryDropdownOpen(!inventoryDropdownOpen)}
                      className={`p-2 rounded-lg text-slate-600 hover:text-black hover:bg-slate-100 transition-colors cursor-pointer ${
                        inventoryDropdownOpen ? 'text-sky-700 bg-sky-100' : ''
                      }`}
                      title={inventoryDropdownOpen ? 'Collapse Inventory' : 'Expand Inventory'}
                      aria-label="Toggle Inventory dropdown"
                    >
                      {inventoryDropdownOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                  )}

                  {isIrd && (
                    <button
                      type="button"
                      onClick={() => setIrdDropdownOpen(!irdDropdownOpen)}
                      className={`p-2 rounded-lg text-slate-600 hover:text-black hover:bg-slate-100 transition-colors cursor-pointer ${
                        irdDropdownOpen ? 'text-sky-700 bg-sky-100' : ''
                      }`}
                      title={irdDropdownOpen ? 'Collapse IRD compliance' : 'Expand IRD compliance'}
                      aria-label="Toggle IRD dropdown"
                    >
                      {irdDropdownOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                  )}
                </div>

                {/* Sales Transaction Dropdown Submenu */}
                {isSales && salesDropdownOpen && (
                  <div className="pl-4 pr-1 py-1.5 space-y-1 ml-3 border-l-2 border-sky-300 animate-fadeIn">
                    <div className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-indigo-500">
                      Sales Transactions
                    </div>
                    {salesSubItems.map((sub) => {
                      const isSubActive = activeTab === 'sales' && salesTransactionType === sub.type;
                      return (
                        <button
                          key={sub.type}
                          id={`sidebar-sales-${sub.type}`}
                          type="button"
                          onClick={() => {
                            setActiveTab('sales');
                            if (setSalesTransactionType) {
                              setSalesTransactionType(sub.type);
                            }
                            if (!isPinned) {
                              setIsHovered(false);
                              setIsOpenMobile(false);
                            }
                          }}
                          className={`w-full group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer ${
                            isSubActive
                              ? 'bg-sky-50 text-black border border-sky-200 font-semibold'
                              : 'text-slate-600 hover:text-black hover:bg-slate-100/70'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <CornerDownRight className={`h-3 w-3 ${isSubActive ? 'text-indigo-400' : 'text-slate-500'}`} />
                            <span className="truncate">{sub.label}</span>
                          </div>
                          <span className={`px-1.5 py-0.5 text-[8px] font-bold rounded border ${sub.badgeColor}`}>
                            {sub.badge}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Purchase Transaction Dropdown Submenu */}
                {isPurchase && purchaseDropdownOpen && (
                  <div className="pl-4 pr-1 py-1.5 space-y-1 ml-3 border-l-2 border-emerald-800/50 animate-fadeIn">
                    <div className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-600">
                      Purchase Transactions
                    </div>
                    {purchaseSubItems.map((sub) => {
                      const isSubActive = activeTab === 'purchase' && purchaseTransactionType === sub.type;
                      return (
                        <button
                          key={sub.type}
                          id={`sidebar-purchase-${sub.type}`}
                          type="button"
                          onClick={() => {
                            setActiveTab('purchase');
                            if (setPurchaseTransactionType) {
                              setPurchaseTransactionType(sub.type);
                            }
                            if (!isPinned) {
                              setIsHovered(false);
                              setIsOpenMobile(false);
                            }
                          }}
                          className={`w-full group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer ${
                            isSubActive
                              ? 'bg-emerald-950 text-emerald-200 border border-emerald-700/60 font-semibold'
                              : 'text-slate-600 hover:text-black hover:bg-slate-100/70'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <CornerDownRight className={`h-3 w-3 ${isSubActive ? 'text-emerald-400' : 'text-slate-500'}`} />
                            <span className="truncate">{sub.label}</span>
                          </div>
                          <span className={`px-1.5 py-0.5 text-[8px] font-bold rounded border ${sub.badgeColor}`}>
                            {sub.badge}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Finance (Accounting) Dropdown Submenu */}
                {isFinance && financeDropdownOpen && (
                  <div className="pl-4 pr-1 py-1.5 space-y-1 ml-3 border-l-2 border-sky-800/50 animate-fadeIn">
                    <div className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-sky-600">
                      Finance & Ledger
                    </div>
                    {accountingSubItems.map((sub) => {
                      const isSubActive = activeTab === 'accounting' && accountingSubTab === sub.subTab;
                      return (
                        <button
                          key={sub.subTab}
                          id={`sidebar-finance-${sub.subTab}`}
                          type="button"
                          onClick={() => {
                            setActiveTab('accounting');
                            if (setAccountingSubTab) {
                              setAccountingSubTab(sub.subTab);
                            }
                            if (!isPinned) {
                              setIsHovered(false);
                              setIsOpenMobile(false);
                            }
                          }}
                          className={`w-full group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer ${
                            isSubActive
                              ? 'bg-slate-100 text-black border border-slate-300 font-semibold'
                              : 'text-slate-600 hover:text-black hover:bg-slate-100/70'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <CornerDownRight className={`h-3 w-3 ${isSubActive ? 'text-sky-400' : 'text-slate-500'}`} />
                            <span className="truncate">{sub.label}</span>
                          </div>
                          <span className={`px-1.5 py-0.5 text-[8px] font-bold rounded border ${sub.badgeColor}`}>
                            {sub.badge}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Master Data Dropdown Submenu */}
                {isMasterData && masterDataDropdownOpen && (
                  <div className="pl-4 pr-1 py-1.5 space-y-1 ml-3 border-l-2 border-sky-300 animate-fadeIn">
                    <div className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-indigo-500">
                      Master Records
                    </div>
                    {masterDataSubItems.map((sub) => {
                      const isSubActive = activeTab === 'master_data' && masterDataSubTab === sub.subTab;
                      return (
                        <button
                          key={sub.subTab}
                          id={`sidebar-master-${sub.subTab}`}
                          type="button"
                          onClick={() => {
                            setActiveTab('master_data');
                            if (setMasterDataSubTab) {
                              setMasterDataSubTab(sub.subTab);
                            }
                            if (!isPinned) {
                              setIsHovered(false);
                              setIsOpenMobile(false);
                            }
                          }}
                          className={`w-full group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer ${
                            isSubActive
                              ? 'bg-sky-50 text-black border border-sky-200 font-semibold'
                              : 'text-slate-600 hover:text-black hover:bg-slate-100/70'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <CornerDownRight className={`h-3 w-3 ${isSubActive ? 'text-indigo-400' : 'text-slate-500'}`} />
                            <span className="truncate">{sub.label}</span>
                          </div>
                          <span className={`px-1.5 py-0.5 text-[8px] font-bold rounded border ${sub.badgeColor}`}>
                            {sub.badge}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Inventory Dropdown Submenu */}
                {isInventory && inventoryDropdownOpen && (
                  <div className="pl-4 pr-1 py-1.5 space-y-1 ml-3 border-l-2 border-amber-800/50 animate-fadeIn">
                    <div className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-600">
                      Inventory Sections
                    </div>
                    {inventorySubItems.map((sub) => {
                      const isSubActive = activeTab === 'inventory' && inventorySubTab === sub.subTab;
                      return (
                        <button
                          key={sub.subTab}
                          id={`sidebar-inv-${sub.subTab}`}
                          type="button"
                          onClick={() => {
                            setActiveTab('inventory');
                            if (setInventorySubTab) {
                              setInventorySubTab(sub.subTab);
                            }
                            if (!isPinned) {
                              setIsHovered(false);
                              setIsOpenMobile(false);
                            }
                          }}
                          className={`w-full group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer ${
                            isSubActive
                              ? 'bg-amber-950 text-amber-200 border border-amber-700/60 font-semibold'
                              : 'text-slate-600 hover:text-black hover:bg-slate-100/70'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <CornerDownRight className={`h-3 w-3 ${isSubActive ? 'text-amber-600' : 'text-slate-500'}`} />
                            <span className="truncate">{sub.label}</span>
                          </div>
                          <span className={`px-1.5 py-0.5 text-[8px] font-bold rounded border ${sub.badgeColor}`}>
                            {sub.badge}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* IRD Compliance Dropdown Submenu */}
                {isIrd && irdDropdownOpen && (
                  <div className="pl-4 pr-1 py-1.5 space-y-1 ml-3 border-l-2 border-purple-800/50 animate-fadeIn">
                    <div className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-purple-600">
                      Statutory Reports
                    </div>
                    {irdSubItems.map((sub) => {
                      const isSubActive = activeTab === 'ird' && irdSubTab === sub.subTab;
                      return (
                        <button
                          key={sub.subTab}
                          id={`sidebar-ird-${sub.subTab}`}
                          type="button"
                          onClick={() => {
                            setActiveTab('ird');
                            if (setIrdSubTab) {
                              setIrdSubTab(sub.subTab);
                            }
                            if (!isPinned) {
                              setIsHovered(false);
                              setIsOpenMobile(false);
                            }
                          }}
                          className={`w-full group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer ${
                            isSubActive
                              ? 'bg-purple-950 text-purple-200 border border-purple-700/60 font-semibold'
                              : 'text-slate-600 hover:text-black hover:bg-slate-100/70'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <CornerDownRight className={`h-3 w-3 ${isSubActive ? 'text-purple-400' : 'text-slate-500'}`} />
                            <span className="truncate">{sub.label}</span>
                          </div>
                          <span className={`px-1.5 py-0.5 text-[8px] font-bold rounded border ${sub.badgeColor}`}>
                            {sub.badge}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Auto-Hide Status Indicator on bottom footer */}
        <div className="px-4 py-2 mx-3 mb-2 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${isPinned ? 'bg-emerald-400' : 'bg-indigo-400 animate-pulse'}`}
            />
            {isPinned ? 'Menu Pinned' : 'Auto-hide on leave'}
          </span>
          <button
            type="button"
            onClick={() => setIsPinned(!isPinned)}
            className="text-[10px] text-indigo-400 hover:text-indigo-500 underline cursor-pointer"
          >
            {isPinned ? 'Unpin' : 'Pin Open'}
          </button>
        </div>

        {/* Bottom System Actions & PAN Info */}
        <div className="p-3 border-t border-slate-200 bg-sky-200/70">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <div className="text-[10px] uppercase text-slate-400 font-semibold tracking-wider">
                Nepal PAN No.
              </div>
              <div className="font-mono text-xs font-bold text-amber-600 truncate">
                {settings.panNumber}
              </div>
            </div>

            <button
              id="sidebar-reset-btn"
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    'Reset all inventory and financial records back to initial standard Nepal garment store demo data?'
                  )
                ) {
                  onResetData();
                }
              }}
              title="Reset to initial seed data"
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-slate-100/80 transition-colors"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};