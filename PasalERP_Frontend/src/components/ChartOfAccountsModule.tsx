import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Edit3,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  Trash2,
  X,
  Database,
  ShieldCheck,
} from 'lucide-react';

import type {
  Account,
  AccountCategory,
  AccountMapping,
} from '../types';

import { repository } from '../api/repository';

type AccountForm = {
  code: string;
  name: string;
  category: AccountCategory;
  description: string;
  isActive: boolean;
};

const EMPTY_ACCOUNT_FORM: AccountForm = {
  code: '',
  name: '',
  category: 'asset',
  description: '',
  isActive: true,
};

const CATEGORY_LABELS: Record<AccountCategory, string> = {
  asset: 'Asset',
  liability: 'Liability',
  equity: 'Equity',
  revenue: 'Revenue',
  expense: 'Expense',
};

const REQUIRED_MAPPINGS = [
  {
    key: 'CASH_BANK',
    label: 'Cash / Bank',
    description: 'Cash, bank and digital payment accounts',
  },
  {
    key: 'ACCOUNTS_RECEIVABLE',
    label: 'Accounts Receivable',
    description: 'Customer receivable / debtor account',
  },
  {
    key: 'INVENTORY',
    label: 'Inventory',
    description: 'Merchandise inventory asset',
  },
  {
    key: 'INPUT_VAT',
    label: 'Input VAT',
    description: 'Recoverable VAT on supplier VAT bills',
  },
  {
    key: 'ACCOUNTS_PAYABLE',
    label: 'Accounts Payable',
    description: 'Supplier payable / creditor account',
  },
  {
    key: 'OUTPUT_VAT',
    label: 'Output VAT',
    description: 'VAT collected on sales',
  },
  {
    key: 'SALES_REVENUE',
    label: 'Sales Revenue',
    description: 'Sales income account',
  },
  {
    key: 'COGS',
    label: 'Cost of Goods Sold',
    description: 'FIFO cost of goods sold account',
  },
] as const;

// function mappingKeyToAccountCode(
//   mappings: AccountMapping[],
//   mappingKey: string
// ): string {
//   return (
//     mappings.find((mapping) => mapping.mappingKey === mappingKey)
//       ?.accountCode ?? ''
//   );
// }

function getCategoryBadgeClass(category: AccountCategory): string {
  switch (category) {
    case 'asset':
      return 'bg-blue-50 text-blue-700 border-blue-200';

    case 'liability':
      return 'bg-red-50 text-red-700 border-red-200';

    case 'equity':
      return 'bg-purple-50 text-purple-700 border-purple-200';

    case 'revenue':
      return 'bg-green-50 text-green-700 border-green-200';

    case 'expense':
      return 'bg-orange-50 text-orange-700 border-orange-200';

    default:
      return 'bg-gray-50 text-gray-700 border-gray-200';
  }
}

const ChartOfAccountsModule: React.FC = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [mappings, setMappings] = useState<AccountMapping[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [initializing, setInitializing] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] =
    useState<AccountCategory | 'all'>('all');

  const [showAccountForm, setShowAccountForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);

  const [accountForm, setAccountForm] =
    useState<AccountForm>(EMPTY_ACCOUNT_FORM);

  const [mappingValues, setMappingValues] =
    useState<Record<string, string>>({});

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [accountData, mappingData] = await Promise.all([
        repository.accounts.list(),
        repository.accounts.mappings.list(),
      ]);

      setAccounts(accountData ?? []);
      setMappings(mappingData ?? []);

      const initialMappings: Record<string, string> = {};

      (mappingData ?? []).forEach((mapping) => {
        initialMappings[mapping.mappingKey] = mapping.accountCode;
      });

      setMappingValues(initialMappings);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'An unexpected error occurred.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const activeAccounts = useMemo(
    () => accounts.filter((account) => account.isActive),
    [accounts]
  );

  const filteredAccounts = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    return accounts.filter((account) => {
      const matchesSearch =
        !search ||
        account.code.toLowerCase().includes(search) ||
        account.name.toLowerCase().includes(search) ||
        account.description?.toLowerCase().includes(search);

      const matchesCategory =
        categoryFilter === 'all' ||
        account.category === categoryFilter;

      return matchesSearch && matchesCategory;
    });
  }, [accounts, searchTerm, categoryFilter]);

  const mappingComplete = REQUIRED_MAPPINGS.every(
    (mapping) => Boolean(mappingValues[mapping.key])
  );

  const openNewAccount = () => {
    setEditingAccount(null);
    setAccountForm(EMPTY_ACCOUNT_FORM);
    setError(null);
    setMessage(null);
    setShowAccountForm(true);
  };

  const openEditAccount = (account: Account) => {
    setEditingAccount(account);

    setAccountForm({
      code: account.code,
      name: account.name,
      category: account.category,
      description: account.description ?? '',
      isActive: account.isActive,
    });

    setError(null);
    setMessage(null);
    setShowAccountForm(true);
  };

  const closeAccountForm = () => {
    if (saving) return;

    setShowAccountForm(false);
    setEditingAccount(null);
    setAccountForm(EMPTY_ACCOUNT_FORM);
  };

  const handleAccountFormChange = (
    field: keyof AccountForm,
    value: string | boolean
  ) => {
    setAccountForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const saveAccount = async (event: React.FormEvent) => {
    event.preventDefault();

    const code = accountForm.code.trim();
    const name = accountForm.name.trim();

    if (!code) {
      setError('Account Code is required.');
      return;
    }

    if (!name) {
      setError('Account Name is required.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setMessage(null);

      if (editingAccount) {
        /*
         * IMPORTANT:
         *
         * Account code is intentionally NOT editable here.
         *
         * JournalLines.accountCode directly references Accounts.code.
         * Changing an account code after transactions exist would break
         * accounting history and foreign-key relationships.
         */
        await repository.accounts.update(
          editingAccount.code,
          {
            name,
            category: accountForm.category,
            description: accountForm.description.trim(),
            isActive: accountForm.isActive,
          }
        );

        setMessage(`Account ${editingAccount.code} updated successfully.`);
      } else {
        await repository.accounts.create({
          code,
          name,
          category: accountForm.category,
          description: accountForm.description.trim(),
        });

        setMessage(`Account ${code} created successfully.`);
      }

      await loadData();
      closeAccountForm();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'An unexpected error occurred.'
      );
    } finally {
      setSaving(false);
    }
  };

  const deleteAccount = async (account: Account) => {
    if (account.isSystem) {
      setError(
        `System account ${account.code} cannot be deleted. You can deactivate it if the backend permits it.`
      );
      return;
    }

    const confirmed = window.confirm(
      `Delete account ${account.code} - ${account.name}?\n\n` +
        `If this account has already been used in journal entries, deletion should be blocked by the backend.`
    );

    if (!confirmed) return;

    try {
      setError(null);
      setMessage(null);

      await repository.accounts.remove(account.code);

      setMessage(`Account ${account.code} deleted successfully.`);

      await loadData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'An unexpected error occurred.'
      );
    }
  };

  const initializeStandardChart = async () => {
    const confirmed = window.confirm(
      'Initialize Standard Chart of Accounts?\n\n' +
        'This will create the standard ERP accounts that do not already exist.\n\n' +
        'Existing accounts should not be overwritten.'
    );

    if (!confirmed) return;

    try {
      setInitializing(true);
      setError(null);
      setMessage(null);

      const result = await repository.accounts.initializeStandard();

      await loadData();

      setMessage(
        `Standard Chart of Accounts initialized successfully. ` +
          `${result.createdAccounts} account(s) created and ` +
          `${result.mappings} mapping(s) configured.`
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'An unexpected error occurred.'
      );
    } finally {
      setInitializing(false);
    }
  };

  const handleMappingChange = (
    mappingKey: string,
    accountCode: string
  ) => {
    setMappingValues((current) => ({
      ...current,
      [mappingKey]: accountCode,
    }));
  };

  const saveAccountDetermination = async () => {
    setError(null);
    setMessage(null);

    const missing = REQUIRED_MAPPINGS.filter(
      (mapping) => !mappingValues[mapping.key]
    );

    if (missing.length > 0) {
      setError(
        `Please configure all required account mappings. Missing: ${missing
          .map((item) => item.label)
          .join(', ')}`
      );
      return;
    }

    try {
      setSaving(true);

      /*
       * Save each mapping through:
       *
       * PUT /api/account-mappings/:mappingKey
       *
       * Backend validates that the selected account exists.
       */
      await Promise.all(
        REQUIRED_MAPPINGS.map((mapping) =>
          repository.accounts.mappings.update(
            mapping.key,
            mappingValues[mapping.key]
          )
        )
      );

      await loadData();

      setMessage(
        'Account Determination saved successfully. Sales, Purchase, Inventory and VAT posting will use these mapped accounts.'
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'An unexpected error occurred.'
      );
    } finally {
      setSaving(false);
    }
  };

  const getMappedAccount = (mappingKey: string): Account | undefined => {
    const code = mappingValues[mappingKey];

    return accounts.find((account) => account.code === code);
  };

  return (
    <div className="space-y-6">
      {/* ============================================================
          HEADER
      ============================================================ */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">
              Chart of Accounts
            </h1>

            <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
              <ShieldCheck size={13} />
              Finance
            </span>
          </div>

          <p className="mt-1 text-sm text-slate-500">
            Manage your company's complete accounting structure and
            automatic account determination.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void initializeStandardChart()}
            disabled={initializing || loading}
            className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {initializing ? (
              <RefreshCw size={16} className="animate-spin" />
            ) : (
              <Database size={16} />
            )}

            {initializing
              ? 'Initializing...'
              : 'Initialize Standard Chart'}
          </button>

          <button
            type="button"
            onClick={openNewAccount}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
          >
            <Plus size={17} />
            New Account
          </button>
        </div>
      </div>

      {/* ============================================================
          SUCCESS / ERROR
      ============================================================ */}
      {message && (
        <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" />

          <div className="flex-1">{message}</div>

          <button
            type="button"
            onClick={() => setMessage(null)}
            className="text-green-700 hover:text-green-900"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />

          <div className="flex-1">{error}</div>

          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-700 hover:text-red-900"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* ============================================================
          ACCOUNT SUMMARY
      ============================================================ */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Total Accounts
          </div>

          <div className="mt-1 text-2xl font-bold text-slate-900">
            {accounts.length}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Active
          </div>

          <div className="mt-1 text-2xl font-bold text-green-600">
            {activeAccounts.length}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Assets
          </div>

          <div className="mt-1 text-2xl font-bold text-blue-600">
            {accounts.filter((a) => a.category === 'asset').length}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Revenue
          </div>

          <div className="mt-1 text-2xl font-bold text-green-600">
            {accounts.filter((a) => a.category === 'revenue').length}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Mappings
          </div>

          <div className="mt-1 text-2xl font-bold text-indigo-600">
            {REQUIRED_MAPPINGS.filter((item) =>
              Boolean(mappingValues[item.key])
            ).length}
            /{REQUIRED_MAPPINGS.length}
          </div>
        </div>
      </div>

      {/* ============================================================
          ACCOUNTS TABLE
      ============================================================ */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-bold text-slate-900">
                Accounts
              </h2>

              <p className="mt-0.5 text-xs text-slate-500">
                Define the company's complete ledger structure.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadData()}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw
                size={15}
                className={loading ? 'animate-spin' : ''}
              />

              Refresh
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-3 md:flex-row">
            <div className="relative flex-1">
              <Search
                size={17}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <input
                type="text"
                value={searchTerm}
                onChange={(event) =>
                  setSearchTerm(event.target.value)
                }
                placeholder="Search accounts by code, name or description..."
                className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(event) =>
                setCategoryFilter(
                  event.target.value as AccountCategory | 'all'
                )
              }
              className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            >
              <option value="all">All Categories</option>

              <option value="asset">Asset</option>
              <option value="liability">Liability</option>
              <option value="equity">Equity</option>
              <option value="revenue">Revenue</option>
              <option value="expense">Expense</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[240px] items-center justify-center">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <RefreshCw size={17} className="animate-spin" />
              Loading Chart of Accounts...
            </div>
          </div>
        ) : filteredAccounts.length === 0 ? (
          <div className="flex min-h-[240px] flex-col items-center justify-center px-5 text-center">
            <Database size={34} className="text-slate-300" />

            <h3 className="mt-3 font-semibold text-slate-700">
              No accounts found
            </h3>

            <p className="mt-1 max-w-md text-sm text-slate-500">
              Create an account manually or initialize the standard
              Chart of Accounts.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left">
                  <th className="px-5 py-3 font-semibold text-slate-600">
                    Code
                  </th>

                  <th className="px-5 py-3 font-semibold text-slate-600">
                    Account Name
                  </th>

                  <th className="px-5 py-3 font-semibold text-slate-600">
                    Category
                  </th>

                  <th className="px-5 py-3 font-semibold text-slate-600">
                    Description
                  </th>

                  <th className="px-5 py-3 text-center font-semibold text-slate-600">
                    Status
                  </th>

                  <th className="px-5 py-3 text-right font-semibold text-slate-600">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredAccounts.map((account) => (
                  <tr
                    key={account.code}
                    className="border-b border-slate-100 transition hover:bg-slate-50"
                  >
                    <td className="px-5 py-3">
                      <span className="font-mono text-sm font-semibold text-slate-800">
                        {account.code}
                      </span>

                      {account.isSystem && (
                        <span className="ml-2 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                          SYSTEM
                        </span>
                      )}
                    </td>

                    <td className="px-5 py-3">
                      <div className="font-semibold text-slate-800">
                        {account.name}
                      </div>
                    </td>

                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getCategoryBadgeClass(
                          account.category
                        )}`}
                      >
                        {CATEGORY_LABELS[account.category]}
                      </span>
                    </td>

                    <td className="max-w-[320px] px-5 py-3 text-slate-500">
                      <div className="truncate">
                        {account.description || '—'}
                      </div>
                    </td>

                    <td className="px-5 py-3 text-center">
                      {account.isActive ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                          Inactive
                        </span>
                      )}
                    </td>

                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEditAccount(account)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white hover:text-indigo-600"
                        >
                          <Edit3 size={14} />
                          Edit
                        </button>

                        {!account.isSystem && (
                          <button
                            type="button"
                            onClick={() =>
                              void deleteAccount(account)
                            }
                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                          >
                            <Trash2 size={14} />
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && (
          <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-500">
            Showing {filteredAccounts.length} of {accounts.length}{' '}
            accounts.
          </div>
        )}
      </section>

      {/* ============================================================
          ACCOUNT DETERMINATION
      ============================================================ */}
      <section className="overflow-hidden rounded-xl border border-indigo-200 bg-white shadow-sm">
        <div className="border-b border-indigo-100 bg-indigo-50/50 px-5 py-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex gap-3">
              <div className="rounded-lg bg-indigo-100 p-2 text-indigo-700">
                <Settings2 size={20} />
              </div>

              <div>
                <h2 className="font-bold text-slate-900">
                  Account Determination
                </h2>

                <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
                  These accounts are used automatically by Sales,
                  Purchase, Inventory, VAT and other financial
                  transactions. Configure them according to your
                  company's accounting structure.
                </p>
              </div>
            </div>

            <div>
              {mappingComplete ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700">
                  <CheckCircle2 size={14} />
                  Configuration Complete
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700">
                  <AlertCircle size={14} />
                  Configuration Incomplete
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="p-5">
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left">
                  <th className="w-[32%] px-4 py-3 font-semibold text-slate-600">
                    Transaction Role
                  </th>

                  <th className="w-[48%] px-4 py-3 font-semibold text-slate-600">
                    Selected Account
                  </th>

                  <th className="w-[20%] px-4 py-3 font-semibold text-slate-600">
                    Status
                  </th>
                </tr>
              </thead>

              <tbody>
                {REQUIRED_MAPPINGS.map((mapping) => {
                  const mappedAccount = getMappedAccount(
                    mapping.key
                  );

                  return (
                    <tr
                      key={mapping.key}
                      className="border-b border-slate-100 last:border-b-0"
                    >
                      <td className="px-4 py-4">
                        <div className="font-semibold text-slate-800">
                          {mapping.label}
                        </div>

                        <div className="mt-0.5 text-xs text-slate-500">
                          {mapping.description}
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        <select
                          value={
                            mappingValues[mapping.key] ?? ''
                          }
                          onChange={(event) =>
                            handleMappingChange(
                              mapping.key,
                              event.target.value
                            )
                          }
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                        >
                          <option value="">
                            -- Select Account --
                          </option>

                          {activeAccounts
                            .slice()
                            .sort((a, b) =>
                              a.code.localeCompare(b.code)
                            )
                            .map((account) => (
                              <option
                                key={account.code}
                                value={account.code}
                              >
                                {account.code} - {account.name}
                              </option>
                            ))}
                        </select>
                      </td>

                      <td className="px-4 py-4">
                        {mappedAccount ? (
                          <div>
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700">
                              <CheckCircle2 size={13} />
                              Active
                            </span>

                            <div className="mt-1 text-[11px] text-slate-400">
                              {mappedAccount.code}
                            </div>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700">
                            <AlertCircle size={13} />
                            Not configured
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-col gap-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-800 md:flex-row md:items-center md:justify-between">
            <div>
              <strong>Important:</strong> Only active accounts are
              available for Account Determination. If an account is
              deactivated later, the backend should prevent
              transactions until a valid replacement mapping is
              configured.
            </div>

            <button
              type="button"
              onClick={() => void saveAccountDetermination()}
              disabled={saving || activeAccounts.length === 0}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? (
                <RefreshCw size={16} className="animate-spin" />
              ) : (
                <Save size={16} />
              )}

              {saving
                ? 'Saving...'
                : 'Save Account Determination'}
            </button>
          </div>
        </div>
      </section>

      {/* ============================================================
          ACCOUNT FORM MODAL
      ============================================================ */}
      {showAccountForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="font-bold text-slate-900">
                  {editingAccount
                    ? 'Edit Account'
                    : 'Create New Account'}
                </h2>

                <p className="mt-0.5 text-xs text-slate-500">
                  {editingAccount
                    ? 'Update account information without changing its code.'
                    : 'Add an account to your Chart of Accounts.'}
                </p>
              </div>

              <button
                type="button"
                onClick={closeAccountForm}
                disabled={saving}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
              >
                <X size={19} />
              </button>
            </div>

            <form onSubmit={saveAccount}>
              <div className="space-y-5 px-5 py-6">
                {/* Account Code */}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                    Account Code <span className="text-red-500">*</span>
                  </label>

                  <input
                    type="text"
                    value={accountForm.code}
                    onChange={(event) =>
                      handleAccountFormChange(
                        'code',
                        event.target.value
                      )
                    }
                    disabled={Boolean(editingAccount)}
                    placeholder="e.g. 1030"
                    className={`w-full rounded-lg border px-3 py-2.5 text-sm font-mono outline-none transition ${
                      editingAccount
                        ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-500'
                        : 'border-slate-200 bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'
                    }`}
                  />

                  {editingAccount ? (
                    <p className="mt-1.5 text-xs text-orange-600">
                      Account Code cannot be changed after the
                      account has been created. Journal Lines reference
                      this code directly.
                    </p>
                  ) : (
                    <p className="mt-1.5 text-xs text-slate-400">
                      Use a unique accounting code such as 1010,
                      2010, 4010 or 5010.
                    </p>
                  )}
                </div>

                {/* Account Name */}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                    Account Name <span className="text-red-500">*</span>
                  </label>

                  <input
                    type="text"
                    value={accountForm.name}
                    onChange={(event) =>
                      handleAccountFormChange(
                        'name',
                        event.target.value
                      )
                    }
                    placeholder="e.g. Merchandise Inventory"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>

                {/* Category */}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                    Category <span className="text-red-500">*</span>
                  </label>

                  <select
                    value={accountForm.category}
                    onChange={(event) =>
                      handleAccountFormChange(
                        'category',
                        event.target.value as AccountCategory
                      )
                    }
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  >
                    <option value="asset">Asset</option>
                    <option value="liability">Liability</option>
                    <option value="equity">Equity</option>
                    <option value="revenue">Revenue</option>
                    <option value="expense">Expense</option>
                  </select>
                </div>

                {/* Description */}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                    Description
                  </label>

                  <textarea
                    value={accountForm.description}
                    onChange={(event) =>
                      handleAccountFormChange(
                        'description',
                        event.target.value
                      )
                    }
                    rows={3}
                    placeholder="Describe the purpose of this account..."
                    className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>

                {/* Active */}
                <label className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-700">
                      Active
                    </div>

                    <div className="mt-0.5 text-xs text-slate-500">
                      Active accounts can be used for new
                      transactions and Account Determination.
                    </div>
                  </div>

                  <input
                    type="checkbox"
                    checked={accountForm.isActive}
                    onChange={(event) =>
                      handleAccountFormChange(
                        'isActive',
                        event.target.checked
                      )
                    }
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                </label>

                {/* System Account Information */}
                {editingAccount?.isSystem && (
                  <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-xs leading-5 text-indigo-800">
                    <div className="flex gap-2">
                      <ShieldCheck
                        size={16}
                        className="mt-0.5 shrink-0"
                      />

                      <div>
                        <strong>System Account</strong>
                        <div className="mt-1">
                          This account is part of the ERP's standard
                          accounting configuration. Its code is
                          permanently locked.
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
                <button
                  type="button"
                  onClick={closeAccountForm}
                  disabled={saving}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? (
                    <RefreshCw
                      size={16}
                      className="animate-spin"
                    />
                  ) : (
                    <Save size={16} />
                  )}

                  {saving
                    ? 'Saving...'
                    : editingAccount
                    ? 'Update Account'
                    : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChartOfAccountsModule;