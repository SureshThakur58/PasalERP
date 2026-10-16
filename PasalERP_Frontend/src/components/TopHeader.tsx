
import { AuthUser, CompanySettings } from '../types';
import { getCurrentBsDate, getCurrentAdDate } from '../utils/nepalIrdUtils';
import { ActiveTab } from './Sidebar';
import {
  Menu,
  ShieldCheck,
  Calendar,
  RotateCcw,
  ShoppingCart,
  ShoppingBag,
  Database,
  Bell,
  Users,
  LogOut,
} from 'lucide-react';

interface TopHeaderProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  settings: CompanySettings;
  onResetData: () => void;
  onOpenMobileMenu: () => void;
  lowStockCount: number;
  currentUser: AuthUser;
  onOpenUserManagement: () => void;
  onLogout: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  activeTab,
  setActiveTab,
  settings,
  onResetData,
  onOpenMobileMenu,
  lowStockCount,
  currentUser,
  onOpenUserManagement,
  onLogout,
}) => {
  const currentBs = getCurrentBsDate();
  const currentAd = getCurrentAdDate();

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
      <div className="px-3 sm:px-5 lg:px-7 py-2.5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">

          {/* =========================================================
              LEFT SIDE
              Menu + Company Information
             ========================================================= */}
          <div className="flex items-start gap-3 min-w-0">

            {/* Mobile / Navigation Menu */}
            <button
              id="main-menu-toggle-btn"
              type="button"
              onClick={onOpenMobileMenu}
              className="
                flex-shrink-0
                inline-flex items-center justify-center
                w-9 h-9
                rounded-lg
                bg-white
                border border-slate-200
                text-slate-600
                hover:text-sky-700
                hover:bg-sky-50
                hover:border-sky-200
                transition-colors
                cursor-pointer
                shadow-sm
              "
              aria-label="Toggle navigation menu"
              title="Open navigation menu"
            >
              <Menu className="h-4.5 w-4.5" />
            </button>

            {/* Company Information */}
            <div className="min-w-0">

              {/* IRD Approved System */}
              <div className="flex items-center gap-2 text-sky-700 text-[10px] sm:text-xs font-semibold uppercase tracking-wider">
                <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0" />

                <span className="truncate font-bold">
                  SmartERP Nepal
                </span>
              </div>

              {/* Company Name */}
              <h1 className="mt-0.5 text-lg sm:text-xl lg:text-2xl font-black tracking-tight text-slate-900 truncate">
                {settings.companyName}
              </h1>

              {/* Company / Fiscal Information */}
              {/* <p className="text-[10px] sm:text-xs text-slate-600 mt-0.5 leading-relaxed">
                Readymade Garment ERP &amp; POS
                <span className="mx-1 text-slate-300">|</span>

                PAN:{' '}
                <span className="font-mono font-bold text-amber-600">
                  {settings.panNumber}
                </span>

                <span className="mx-1 text-slate-300">|</span>

                Fiscal Year:{' '}
                <span className="font-semibold text-slate-800">
                  {settings.fiscalYear}
                </span>

                <span className="mx-1 text-slate-300">|</span>

                Date:{' '}
                <span className="font-semibold text-slate-800">
                  {currentBs} B.S.
                </span>{' '}
                <span className="text-slate-500">
                  ({currentAd} A.D.)
                </span>
              </p> */}
            </div>
          </div>

          {/* =========================================================
              RIGHT SIDE
              Quick Actions + Status
             ========================================================= */}
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">

            {/* New Tax Invoice */}
            <button
              id="top-quick-sale-btn"
              type="button"
              onClick={() => setActiveTab('sales')}
              className="
                inline-flex items-center
                px-3.5 py-2
                rounded-xl
                text-xs font-bold
                bg-indigo-600
                hover:bg-indigo-500
                text-white
                border border-indigo-500
                shadow-sm
                transition-all
                cursor-pointer
              "
              title="Create a new Tax Invoice"
            >
              <ShoppingCart className="h-4 w-4 mr-1.5" />
              + New Tax Invoice
            </button>

            {/* New Inward Bill */}
            <button
              id="top-quick-purchase-btn"
              type="button"
              onClick={() => setActiveTab('purchase')}
              className="
                inline-flex items-center
                px-3.5 py-2
                rounded-xl
                text-xs font-bold
                bg-slate-800
                hover:bg-slate-700
                text-white
                border border-slate-700
                shadow-sm
                transition-all
                cursor-pointer
              "
              title="Create a new Inward Purchase Bill"
            >
              <ShoppingBag className="h-4 w-4 mr-1.5 text-emerald-400" />
              + New Inward Bill
            </button>

            {/* Master Data */}
            <button
              id="top-quick-master-btn"
              type="button"
              onClick={() => setActiveTab('master_data')}
              className="
                inline-flex items-center
                px-3.5 py-2
                rounded-xl
                text-xs font-bold
                bg-slate-800
                hover:bg-slate-700
                text-white
                border border-slate-700
                shadow-sm
                transition-all
                cursor-pointer
              "
              title="Open Master Data"
            >
              <Database className="h-4 w-4 mr-1.5 text-indigo-400" />
              Master Data
            </button>

            {/* =====================================================
                Fiscal Year / Date Badge
               ===================================================== */}
            <div
              className="
                hidden xl:flex
                items-center gap-2
                bg-slate-50
                px-3 py-1.5
                rounded-lg
                border border-slate-200
                text-slate-700
                text-xs
              "
            >
              <Calendar className="h-4 w-4 text-indigo-600 flex-shrink-0" />

              <div>
                <div className="font-semibold text-slate-800 leading-tight">
                  FY {settings.fiscalYear} | {currentBs} B.S.
                </div>

                <div className="text-[10px] text-slate-500 leading-tight">
                  {currentAd} A.D.
                </div>
              </div>
            </div>

            {/* =====================================================
                Business Nature Badge
               ===================================================== */}
            <div className="hidden md:flex items-center">
              {settings.businessNature === 'PAN' ? (
                <span
                  className="
                    inline-flex items-center gap-1.5
                    px-2.5 py-1.5
                    rounded-lg
                    text-xs font-bold
                    text-amber-700
                    bg-amber-50
                    border border-amber-200
                  "
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  PAN Registered
                </span>
              ) : (
                <span
                  className="
                    inline-flex items-center gap-1.5
                    px-2.5 py-1.5
                    rounded-lg
                    text-xs font-bold
                    text-indigo-700
                    bg-indigo-50
                    border border-indigo-200
                  "
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                  VAT Registered (13%)
                </span>
              )}
            </div>

            {/* =====================================================
                Low Stock Alert
               ===================================================== */}
            {lowStockCount > 0 && (
              <button
                id="low-stock-alert-pill"
                type="button"
                onClick={() => setActiveTab('inventory')}
                title={`${lowStockCount} garment items below minimum stock threshold`}
                className="
                  inline-flex items-center
                  px-2.5 py-1.5
                  rounded-lg
                  text-xs font-semibold
                  bg-amber-50
                  text-amber-800
                  border border-amber-300
                  hover:bg-amber-100
                  transition-colors
                  cursor-pointer
                "
              >
                <Bell className="h-3.5 w-3.5 mr-1 text-amber-600" />

                <span className="hidden sm:inline mr-1">
                  Low Stock:
                </span>

                <span className="font-bold">
                  {lowStockCount}
                </span>
              </button>
            )}

            {/* =====================================================
                Logged-in User / Logout
               ===================================================== */}
            <div className="hidden lg:flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200">
              <Users className="h-4 w-4 text-sky-600" />
              <div className="leading-tight">
                <div className="text-[11px] font-semibold text-slate-800">
                  {currentUser.displayName || currentUser.username}
                </div>
                <div className="text-[9px] text-slate-500">
                  {currentUser.role === 'super_admin' ? 'Super Admin' : currentUser.role}
                </div>
              </div>
            </div>

            {currentUser.permissions.includes('users') && (
              <button
                id="top-user-management-btn"
                type="button"
                onClick={onOpenUserManagement}
                title="User Management"
                className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-slate-600 hover:text-sky-700 hover:bg-sky-50 border border-slate-200 transition-colors cursor-pointer"
              >
                <Users className="h-4 w-4" />
              </button>
            )}

            <button
              id="top-logout-btn"
              type="button"
              onClick={onLogout}
              title="Log out"
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-slate-600 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 transition-colors cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
            </button>

            {/* =====================================================
                Reset Button
               ===================================================== */}
            {/* <button
              id="top-reset-data-btn"
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
              className="
                inline-flex items-center justify-center
                w-9 h-9
                rounded-lg
                text-slate-500
                hover:text-rose-600
                hover:bg-slate-100
                border border-slate-200
                transition-colors
                cursor-pointer
              "
            >
              <RotateCcw className="h-4 w-4" />
            </button> */}
          </div>
        </div>
      </div>
    </header>
  );
};