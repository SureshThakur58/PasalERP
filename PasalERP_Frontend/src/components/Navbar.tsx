import React from 'react';
import { CompanySettings } from '../types';
import { getCurrentBsDate, getCurrentAdDate } from '../utils/nepalIrdUtils';
import {
  ShoppingBag,
  ShoppingCart,
  Package,
  Users,
  BookOpen,
  FileSpreadsheet,
  RotateCcw,
  ShieldCheck,
  Building2,
  Calendar,
  Settings
} from 'lucide-react';

export type ActiveTab = 'sales' | 'purchase' | 'inventory' | 'partners' | 'accounting' | 'ird' | 'setup';

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  settings: CompanySettings;
  onResetData: () => void;
  totalInventoryValuation: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  settings,
  onResetData,
}) => {
  const currentBs = getCurrentBsDate();
  const currentAd = getCurrentAdDate();

  const navItems: { id: ActiveTab; label: string; subLabel: string; icon: React.ReactNode }[] = [
    {
      id: 'sales',
      label: 'Sales & Billing',
      subLabel: 'Tax Invoice (POS)',
      icon: <ShoppingCart className="h-4 w-4" />,
    },
    {
      id: 'purchase',
      label: 'Purchases',
      subLabel: 'Inward Bills',
      icon: <ShoppingBag className="h-4 w-4" />,
    },
    {
      id: 'inventory',
      label: 'Multi-Warehouse',
      subLabel: 'FIFO Stock Valuation',
      icon: <Package className="h-4 w-4" />,
    },
    {
      id: 'partners',
      label: 'Business Partners',
      subLabel: 'Customers & Vendors',
      icon: <Users className="h-4 w-4" />,
    },
    {
      id: 'accounting',
      label: 'Financial Ledger',
      subLabel: 'General Ledger & P&L',
      icon: <BookOpen className="h-4 w-4" />,
    },
    {
      id: 'ird',
      label: 'IRD Compliance',
      subLabel: 'Annex 7 & 8 VAT Book',
      icon: <FileSpreadsheet className="h-4 w-4" />,
    },
    {
      id: 'setup',
      label: 'Setup & Settings',
      subLabel: 'Company & Preferences',
      icon: <Settings className="h-4 w-4" />,
    },
  ];

  return (
    <header className="sticky top-0 z-40 bg-slate-900 border-b border-slate-800 text-white shadow-md">
      {/* Top Banner with Company Info & Nepal IRD Regulatory Metadata */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs border-b border-slate-800/80">
        <div className="flex items-center space-x-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-600 text-white font-bold shadow-xs">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-sm text-slate-100 tracking-tight">{settings.companyName}</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-950/80 text-indigo-300 border border-indigo-800/80">
                <ShieldCheck className="h-3 w-3 mr-1" />
                IRD Approved
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              PAN / VAT No: <span className="font-mono font-bold text-amber-400">{settings.panNumber}</span> | {settings.address}, {settings.city}
            </p>
          </div>
        </div>

        {/* Date, Fiscal Year, and Actions */}
        <div className="flex items-center space-x-3 sm:space-x-4">
          <div className="flex items-center space-x-2 bg-slate-800/90 px-3 py-1.5 rounded-lg border border-slate-700/60 text-slate-300">
            <Calendar className="h-3.5 w-3.5 text-indigo-400" />
            <div className="text-[11px] leading-tight">
              <div>
                <span className="font-semibold text-slate-200">FY {settings.fiscalYear}</span>
                <span className="text-slate-400 ml-1.5">| Date: {currentBs} B.S.</span>
              </div>
              <div className="text-[10px] text-slate-400">{currentAd} A.D.</div>
            </div>
          </div>

          <button
            id="reset-demo-data-btn"
            onClick={() => {
              if (window.confirm('Reset all inventory and financial records back to initial standard Nepal garment store demo data?')) {
                onResetData();
              }
            }}
            title="Reset to initial seed data"
            className="inline-flex items-center px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-400 hover:text-slate-200 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 transition-colors cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            <span className="hidden sm:inline">Reset Demo</span>
          </button>
        </div>
      </div>

      {/* Main Module Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <nav className="flex space-x-1 sm:space-x-2 overflow-x-auto py-1 scrollbar-none" aria-label="Modules">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                id={`nav-tab-${item.id}`}
                onClick={() => setActiveTab(item.id)}
                className={`group flex items-center py-2 px-3 sm:px-4 text-xs sm:text-sm font-medium rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <span className={`mr-2 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`}>
                  {item.icon}
                </span>
                <div className="text-left">
                  <div>{item.label}</div>
                  <div className={`text-[10px] leading-none ${isActive ? 'text-indigo-100' : 'text-slate-400'}`}>
                    {item.subLabel}
                  </div>
                </div>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
