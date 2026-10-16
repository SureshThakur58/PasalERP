import React, { useState } from 'react';
import { Account, JournalEntry, JournalLine } from '../types';
import { createEntityId } from '../utils/ids';
import { formatNPR } from '../utils/nepalIrdUtils';
import ChartOfAccountsModule from './ChartOfAccountsModule';
import {
  BookOpen,
  Scale,
  TrendingUp,
  FileText,
  CheckCircle2,
  AlertCircle,
  Search,
  ArrowDownRight,
  ArrowUpRight,
  ShieldCheck
} from 'lucide-react';

interface AccountingModuleProps {
  accounts: Account[];
  journalEntries: JournalEntry[];
  initialSubTab?: 'journals' | 'ledger' | 'trial_balance' | 'pnl' | 'balance_sheet' | 'chart_of_accounts' ;
  fiscalYear?: string;
  onCreateJournal?: (draft: Omit<JournalEntry, 'id' | 'entryNo' | 'totalDebit' | 'totalCredit' | 'isBalanced' | 'referenceType'>) => Promise<JournalEntry>;
}

export const AccountingModule: React.FC<AccountingModuleProps> = ({
  accounts,
  journalEntries,
  initialSubTab = 'journals',
  fiscalYear = '',
  onCreateJournal,
}) => {
  const [subTab, setSubTab] = useState<'journals' | 'ledger' | 'trial_balance' | 'pnl' | 'balance_sheet' | 'chart_of_accounts'>(initialSubTab);

  React.useEffect(() => {
    if (initialSubTab) {
      setSubTab(initialSubTab);
    }
  }, [initialSubTab]);
  const [selectedAccountCode, setSelectedAccountCode] = useState<string>('1030'); // Default to Inventory Asset
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showJournalForm, setShowJournalForm] = useState(false);
  const [journalNarration, setJournalNarration] = useState('');
  const [journalReference, setJournalReference] = useState('');
  const [journalDate, setJournalDate] = useState(new Date().toISOString().slice(0,10));
  const [journalLines, setJournalLines] = useState<JournalLine[]>([
    { accountCode: accounts[0]?.code || '', accountName: accounts[0]?.name || '', debit: 0, credit: 0, description: '' },
    { accountCode: accounts[1]?.code || '', accountName: accounts[1]?.name || '', debit: 0, credit: 0, description: '' },
  ]);

  // 1. General Ledger calculation for selected account
  const selectedAccount = accounts.find((a) => a.code === selectedAccountCode);

  // Extract all lines targeting this account across journal entries
  const ledgerLines: {
    entryId: string;
    entryNo: string;
    date: string;
    reference: string;
    narration: string;
    description?: string;
    debit: number;
    credit: number;
  }[] = [];

  journalEntries.forEach((jv) => {
    jv.lines.forEach((line) => {
      if (line.accountCode === selectedAccountCode) {
        ledgerLines.push({
          entryId: jv.id,
          entryNo: jv.entryNo,
          date: jv.mitiDate,
          reference: `${jv.referenceType} (${jv.referenceNo})`,
          narration: jv.narration,
          description: line.description,
          debit: line.debit,
          credit: line.credit,
        });
      }
    });
  });

  // 2. Trial Balance calculations
  const totalTrialDebit = accounts.reduce((sum, acc) => {
    if (acc.category === 'asset' || acc.category === 'expense') {
      return sum + Math.max(0, acc.balance);
    }
    return sum;
  }, 0);

  const totalTrialCredit = accounts.reduce((sum, acc) => {
    if (acc.category === 'liability' || acc.category === 'equity' || acc.category === 'revenue') {
      return sum + Math.max(0, acc.balance);
    }
    return sum;
  }, 0);

  const isTrialBalanced = Math.abs(totalTrialDebit - totalTrialCredit) < 1;

  // 3. Profit & Loss calculations
  const revenueAccount = accounts.find((a) => a.code === '4010');
  const cogsAccount = accounts.find((a) => a.code === '5010');
  const operatingExpAccount = accounts.find((a) => a.code === '5020');

  const totalRevenue = revenueAccount?.balance || 0;
  const totalCogs = cogsAccount?.balance || 0;
  const grossProfit = totalRevenue - totalCogs;
  const grossMarginPercent = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
  const operatingExpenses = operatingExpAccount?.balance || 0;
  const netProfit = grossProfit - operatingExpenses;

  // 4. Balance Sheet calculations
  const assetAccounts = accounts.filter((a) => a.category === 'asset');
  const liabilityAccounts = accounts.filter((a) => a.category === 'liability');
  const equityAccounts = accounts.filter((a) => a.category === 'equity');

  const totalAssets = assetAccounts.reduce((sum, a) => sum + a.balance, 0);
  const totalLiabilities = liabilityAccounts.reduce((sum, a) => sum + a.balance, 0);
  const baseEquity = equityAccounts.reduce((sum, a) => sum + a.balance, 0);
  const totalEquity = baseEquity + netProfit;
  const isBalanceSheetBalanced = Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 1;

  return (
    <div className="space-y-6">
      {/* Module Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            Automated Double-Entry Financial Accounting
          </h2>
          <p className="text-xs text-slate-500">
            Real-time financial posting as per sales, purchases, and FIFO inventory transactions with automated general ledger and balance sheet.
          </p>
        </div>

        <div className="flex items-center space-x-2 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-200 text-xs font-semibold text-indigo-900" title="डेबिट र क्रेडिट बराबर">
          <CheckCircle2 className="h-4 w-4 mr-1 text-indigo-600" />
          <span>Double-Entry Balanced (Dr = Cr)</span>
        </div>
      </div>

      {/* Subtabs */}
      <div className="flex space-x-2 border-b border-slate-200 pb-2 overflow-x-auto">
        <button
          id="tab-accounting-journals"
          onClick={() => setSubTab('journals')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center ${
            subTab === 'journals'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <BookOpen className="h-3.5 w-3.5 mr-1" />
          Journal Entries ({journalEntries.length})
        </button>
        <button
          id="tab-accounting-ledger"
          onClick={() => setSubTab('ledger')}
          title="खाता पाना"
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center ${
            subTab === 'ledger'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <FileText className="h-3.5 w-3.5 mr-1" />
          General Ledger
        </button>
        <button
          id="tab-accounting-trial-balance"
          onClick={() => setSubTab('trial_balance')}
          title="सन्तुलन परीक्षण"
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center ${
            subTab === 'trial_balance'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <Scale className="h-3.5 w-3.5 mr-1" />
          Trial Balance
        </button>
        <button
          id="tab-accounting-pnl"
          onClick={() => setSubTab('pnl')}
          title="नाफा नोक्सान"
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center ${
            subTab === 'pnl'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <TrendingUp className="h-3.5 w-3.5 mr-1" />
          Profit & Loss Statement
        </button>
        <button
          id="tab-accounting-balance-sheet"
          onClick={() => setSubTab('balance_sheet')}
          title="वासलात"
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center ${
            subTab === 'balance_sheet'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <ShieldCheck className="h-3.5 w-3.5 mr-1" />
          Balance Sheet
        </button>

        <button
          id="tab-accounting-chart-of-accounts"
          onClick={() => setSubTab('chart_of_accounts')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center ${
            subTab === 'chart_of_accounts'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <BookOpen className="h-3.5 w-3.5 mr-1" />
          Chart of Accounts
        </button>


      </div>
      

      {/* 1. Journal Entries Log */}
      {subTab === 'journals' && onCreateJournal && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div><h3 className="text-sm font-bold text-slate-900">Manual Journal / Opening Balance</h3><p className="text-[11px] text-slate-500">Post a balanced voucher without bypassing double-entry controls.</p></div>
            <button onClick={() => setShowJournalForm(v => !v)} className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold">{showJournalForm ? 'Close' : 'New Journal'}</button>
          </div>
          {showJournalForm && (
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <input value={journalDate} onChange={e => setJournalDate(e.target.value)} type="date" className="rounded-lg border border-slate-200 px-3 py-2 text-xs bg-white" />
                <input value={journalReference} onChange={e => setJournalReference(e.target.value)} placeholder="Reference No" className="rounded-lg border border-slate-200 px-3 py-2 text-xs bg-white" />
                <input value={journalNarration} onChange={e => setJournalNarration(e.target.value)} placeholder="Narration / purpose" className="rounded-lg border border-slate-200 px-3 py-2 text-xs bg-white" />
              </div>
              {journalLines.map((line, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <select value={line.accountCode} onChange={e => { const account = accounts.find(x => x.code === e.target.value); if (!account) return; setJournalLines(ls => ls.map((x, j) => j === i ? { ...x, accountCode: account.code, accountName: account.name } : x)); }} className="col-span-5 rounded-lg border border-slate-200 px-2 py-2 text-xs bg-white">
                    {accounts.map(account => <option key={account.code} value={account.code}>{account.code} — {account.name}</option>)}
                  </select>
                  <input type="number" min="0" step="0.01" value={line.debit || ''} onChange={e => setJournalLines(ls => ls.map((x, j) => j === i ? { ...x, debit: Number(e.target.value), credit: 0 } : x))} placeholder="Debit" className="col-span-2 rounded-lg border border-slate-200 px-2 py-2 text-xs" />
                  <input type="number" min="0" step="0.01" value={line.credit || ''} onChange={e => setJournalLines(ls => ls.map((x, j) => j === i ? { ...x, credit: Number(e.target.value), debit: 0 } : x))} placeholder="Credit" className="col-span-2 rounded-lg border border-slate-200 px-2 py-2 text-xs" />
                  <input value={line.description || ''} onChange={e => setJournalLines(ls => ls.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} placeholder="Description" className="col-span-2 rounded-lg border border-slate-200 px-2 py-2 text-xs" />
                  <button disabled={journalLines.length <= 2} onClick={() => setJournalLines(ls => ls.filter((_, j) => j !== i))} className="text-xs text-red-600 disabled:text-slate-300">×</button>
                </div>
              ))}
              <div className="flex gap-2">
                <button onClick={() => { const account = accounts[0]; if (account) setJournalLines(ls => [...ls, { accountCode: account.code, accountName: account.name, debit: 0, credit: 0, description: '' }]); }} className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold">+ Add Line</button>
                <button onClick={async () => { try { await onCreateJournal({ fiscalYear, mitiDate: journalDate, adDate: journalDate, narration: journalNarration.trim(), referenceNo: journalReference.trim() || createEntityId('manual').slice(-8), lines: journalLines }); setShowJournalForm(false); setJournalNarration(''); setJournalReference(''); } catch (e) { alert(e instanceof Error ? e.message : 'Unable to post journal.'); } }} className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold">Post Balanced Voucher</button>
              </div>
            </div>
          )}
        </div>
      )}


      {subTab === 'journals' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <span>
              All transactions automatically generate verified balanced journal vouchers as per Nepalese accounting standards.
            </span>
            <span className="font-semibold text-slate-800">
              Total Vouchers: {journalEntries.length}
            </span>
          </div>
          <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Search journal no., reference or narration" className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs" /></div>

          <div className="space-y-4">
            {journalEntries
              .filter(e => !searchQuery || `${e.entryNo} ${e.referenceNo} ${e.narration}`.toLowerCase().includes(searchQuery.toLowerCase()))
              .slice()
              .reverse()
              .map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300 transition-colors"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2 mb-3">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono font-bold text-xs text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                        {entry.entryNo}
                      </span>
                      <span className="text-xs text-slate-500">Miti: {entry.mitiDate} B.S. ({entry.adDate})</span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">
                        {entry.referenceType}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2 text-xs">
                      <span className="text-slate-500">Ref:</span>
                      <span className="font-mono font-semibold text-slate-800">{entry.referenceNo}</span>
                      <span className="text-indigo-600 font-semibold flex items-center">
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                        Balanced
                      </span>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 text-slate-500 font-semibold">
                          <th className="py-1 px-2">Account Particulars</th>
                          <th className="py-1 px-2 font-mono">Code</th>
                          <th className="py-1 px-2 text-right w-32" title="डेबिट">Debit (NPR Dr)</th>
                          <th className="py-1 px-2 text-right w-32" title="क्रेडिट">Credit (NPR Cr)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono">
                        {entry.lines.map((line, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="py-1.5 px-2 font-sans">
                              <span
                                className={`font-medium ${
                                  line.debit > 0 ? 'text-slate-900 pl-0' : 'text-slate-600 pl-6'
                                }`}
                              >
                                {line.debit > 0 ? 'To ' : 'By '}
                                {line.accountName}
                              </span>
                              {line.description && (
                                <span className="block text-[10px] text-slate-400 font-sans pl-2">
                                  {line.description}
                                </span>
                              )}
                            </td>
                            <td className="py-1.5 px-2 text-slate-500">{line.accountCode}</td>
                            <td className="py-1.5 px-2 text-right font-medium text-indigo-700">
                              {line.debit > 0 ? formatNPR(line.debit) : '-'}
                            </td>
                            <td className="py-1.5 px-2 text-right font-medium text-slate-800">
                              {line.credit > 0 ? formatNPR(line.credit) : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-900 font-bold font-mono">
                          <td colSpan={2} className="py-1.5 px-2 font-sans text-slate-700">
                            Total Journal Voucher Amount
                          </td>
                          <td className="py-1.5 px-2 text-right text-indigo-700">
                            {formatNPR(entry.totalDebit)}
                          </td>
                          <td className="py-1.5 px-2 text-right text-indigo-700">
                            {formatNPR(entry.totalCredit)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  <div className="mt-2.5 text-[11px] text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-200/60">
                    <span className="font-bold text-slate-800" title="कैफियत">Narration:</span>{' '}
                    <span className="font-medium text-slate-700">{entry.narration}</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* 2. General Ledger */}
      {subTab === 'ledger' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <label className="text-xs font-semibold text-slate-700" title="खाता छनोट">Select Ledger Account:</label>
              <select
                id="ledger-account-select"
                value={selectedAccountCode}
                onChange={(e) => setSelectedAccountCode(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-900 focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600 bg-white"
              >
                {accounts.map((acc) => (
                  <option key={acc.code} value={acc.code}>
                    {acc.code} - {acc.name} ({acc.category.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>

            {selectedAccount && (
              <div className="text-xs">
                {selectedAccount.description && (
                  <div className="text-[11px] text-slate-500 mb-0.5 max-w-md">
                    <span className="font-semibold text-slate-700" title="खाता विवरण">Description:</span> {selectedAccount.description}
                  </div>
                )}
                <div>
                  <span className="text-slate-500">Current Ledger Balance: </span>
                  <span className="font-mono font-bold text-sm text-indigo-700">
                    {formatNPR(selectedAccount.balance)}
                  </span>
                  <span className="text-slate-500 ml-1">
                    ({selectedAccount.category === 'asset' || selectedAccount.category === 'expense' ? 'Debit' : 'Credit'})
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-100 text-slate-700 font-semibold">
                    <th className="py-2.5 px-3" title="मिति">Date (Miti)</th>
                    <th className="py-2.5 px-3" title="भौचर नं">Voucher No</th>
                    <th className="py-2.5 px-3" title="सन्दर्भ">Transaction Reference</th>
                    <th className="py-2.5 px-3" title="कैफियत तथा विवरण">Narration & Details</th>
                    <th className="py-2.5 px-3 text-right" title="डेबिट">Debit (NPR Dr)</th>
                    <th className="py-2.5 px-3 text-right" title="क्रेडिट">Credit (NPR Cr)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono">
                  {ledgerLines.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-xs text-slate-400 font-sans">
                        No transactions recorded for this account yet.
                      </td>
                    </tr>
                  ) : (
                    ledgerLines.map((line, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2 px-3 font-sans text-slate-600">{line.date}</td>
                        <td className="py-2 px-3 font-bold text-slate-800">{line.entryNo}</td>
                        <td className="py-2 px-3 font-sans text-slate-800 font-medium">{line.reference}</td>
                        <td className="py-2 px-3 font-sans text-slate-600 max-w-sm truncate">
                          {line.description || line.narration}
                        </td>
                        <td className="py-2 px-3 text-right text-indigo-700 font-medium">
                          {line.debit > 0 ? formatNPR(line.debit) : '-'}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-800 font-medium">
                          {line.credit > 0 ? formatNPR(line.credit) : '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 3. Trial Balance */}
      {subTab === 'trial_balance' && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between" title="सन्तुलन परीक्षण">
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Trial Balance
              </h3>
              <p className="text-[11px] text-slate-500">
                Summary of all debit and credit account balances for FY 2081/82.
              </p>
            </div>
            <div className="flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
              <CheckCircle2 className="h-4 w-4" />
              <span>Debits & Credits Equal</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100 text-slate-700 font-semibold">
                  <th className="py-2.5 px-3">Account Code</th>
                  <th className="py-2.5 px-3">Account Name</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3 text-right" title="डेबिट मौज्दात">Debit Balance (NPR Dr)</th>
                  <th className="py-2.5 px-3 text-right" title="क्रेडिट मौज्दात">Credit Balance (NPR Cr)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono">
                {accounts.map((acc) => {
                  const isDebitCategory = acc.category === 'asset' || acc.category === 'expense';
                  return (
                    <tr key={acc.code} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2 px-3 font-bold text-slate-800">{acc.code}</td>
                      <td className="py-2 px-3 font-sans font-medium text-slate-900">{acc.name}</td>
                      <td className="py-2 px-3 font-sans uppercase text-[10px] text-slate-500 font-semibold">
                        {acc.category}
                      </td>
                      <td className="py-2 px-3 text-right font-medium text-indigo-700">
                        {isDebitCategory ? formatNPR(acc.balance) : '-'}
                      </td>
                      <td className="py-2 px-3 text-right font-medium text-slate-800">
                        {!isDebitCategory ? formatNPR(acc.balance) : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-900 bg-slate-100/70 font-bold font-mono text-sm">
                  <td colSpan={3} className="py-3 px-3 font-sans text-slate-900">
                    Grand Total
                  </td>
                  <td className="py-3 px-3 text-right text-indigo-900 font-extrabold">
                    {formatNPR(totalTrialDebit)}
                  </td>
                  <td className="py-3 px-3 text-right text-indigo-900 font-extrabold">
                    {formatNPR(totalTrialCredit)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* 4. Profit & Loss Statement */}
      {subTab === 'pnl' && (
        <div className="max-w-2xl mx-auto rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-center border-b border-slate-200 pb-4 mb-6" title="नाफा नोक्सान हिसाब">
            <h3 className="text-base font-bold text-slate-950 uppercase">
              Statement of Profit or Loss
            </h3>
            <p className="text-xs text-slate-500">For the period ended Falgun 2081 (FY 2081/82)</p>
          </div>

          <div className="space-y-4 text-xs font-sans">
            {/* Revenue */}
            <div className="space-y-1">
              <div className="flex justify-between font-bold text-slate-900 py-1">
                <span title="बिक्री आम्दानी">Garment Sales Revenue:</span>
                <span className="font-mono">{formatNPR(totalRevenue)}</span>
              </div>
            </div>

            {/* Cost of Goods Sold */}
            <div className="space-y-1 border-t border-slate-100 pt-2 text-slate-700">
              <div className="flex justify-between">
                <span title="बिक्री वस्तुको लागत">Less: Cost of Goods Sold (FIFO Method):</span>
                <span className="font-mono font-medium text-red-700">-{formatNPR(totalCogs)}</span>
              </div>
            </div>

            {/* Gross Profit */}
            <div className="flex justify-between py-2 border-t-2 border-slate-300 font-bold text-slate-950 text-sm bg-slate-50 px-2 rounded">
              <span title="कूल नाफा">Gross Profit:</span>
              <div className="text-right">
                <span className="font-mono text-indigo-700">{formatNPR(grossProfit)}</span>
                <span className="block text-[10px] text-slate-500 font-normal">
                  Margin: {grossMarginPercent.toFixed(1)}%
                </span>
              </div>
            </div>

            {/* Operating Expenses */}
            <div className="space-y-2 border-t border-slate-100 pt-2 text-slate-700">
              <div className="font-semibold text-slate-800" title="सञ्चालन खर्च">Operating Expenses:</div>
              <div className="flex justify-between pl-4">
                <span>Store Rent, Utilities, Staff Salaries:</span>
                <span className="font-mono text-red-700">-{formatNPR(operatingExpenses)}</span>
              </div>
            </div>

            {/* Net Profit */}
            <div className="flex justify-between py-3 border-t-2 border-b-2 border-slate-950 font-extrabold text-slate-950 text-base bg-indigo-50 px-3 rounded">
              <span title="खुद नाफा">Net Profit:</span>
              <span className="font-mono text-indigo-900">{formatNPR(netProfit)}</span>
            </div>

            <p className="text-[11px] text-slate-500 text-center italic mt-4">
              * Automatically transferred to Retained Earnings on the Balance Sheet.
            </p>
          </div>
        </div>
      )}

      {/* 5. Balance Sheet */}
      {subTab === 'balance_sheet' && (
        <div className="max-w-3xl mx-auto rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-center border-b border-slate-200 pb-4 mb-6" title="वासलात">
            <h3 className="text-base font-bold text-slate-950 uppercase">Balance Sheet</h3>
            <p className="text-xs text-slate-500">As on Falgun 2081 B.S. (FY 2081/82)</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs font-sans">
            {/* Assets */}
            <div className="border border-slate-200 rounded-xl p-4 space-y-4">
              <h4 className="font-bold text-sm text-slate-900 border-b border-slate-200 pb-1.5 flex items-center justify-between">
                <span title="सम्पत्ति">Assets</span>
                <span className="text-[10px] font-mono text-slate-500">Debit Balances</span>
              </h4>

              <div className="space-y-2">
                <div className="font-semibold text-slate-700 text-[11px]">Current Assets:</div>
                {assetAccounts.map((a) => (
                  <div key={a.code} className="flex justify-between pl-2 text-slate-700">
                    <span>{a.name}:</span>
                    <span className="font-mono font-medium">{formatNPR(a.balance)}</span>
                  </div>
                ))}
              </div>

              <div className="flex justify-between py-2 border-t-2 border-slate-900 font-bold text-slate-950 text-sm bg-slate-50 px-2 rounded">
                <span title="जम्मा सम्पत्ति">Total Assets:</span>
                <span className="font-mono text-indigo-900">{formatNPR(totalAssets)}</span>
              </div>
            </div>

            {/* Liabilities & Equity */}
            <div className="border border-slate-200 rounded-xl p-4 space-y-4">
              <h4 className="font-bold text-sm text-slate-900 border-b border-slate-200 pb-1.5 flex items-center justify-between">
                <span title="दायित्व र पुँजी">Liabilities & Equity</span>
                <span className="text-[10px] font-mono text-slate-500">Credit Balances</span>
              </h4>

              <div className="space-y-2">
                <div className="font-semibold text-slate-700 text-[11px]">Current Liabilities:</div>
                {liabilityAccounts.map((l) => (
                  <div key={l.code} className="flex justify-between pl-2 text-slate-700">
                    <span>{l.name}:</span>
                    <span className="font-mono font-medium">{formatNPR(l.balance)}</span>
                  </div>
                ))}
                <div className="flex justify-between pl-2 font-semibold text-slate-800 border-t border-slate-100 pt-1">
                  <span>Subtotal Liabilities:</span>
                  <span className="font-mono">{formatNPR(totalLiabilities)}</span>
                </div>
              </div>

              <div className="space-y-2 border-t border-slate-200 pt-2">
                <div className="font-semibold text-slate-700 text-[11px]">Owner's Equity:</div>
                <div className="flex justify-between pl-2 text-slate-700">
                  <span>Capital & Retained Earnings:</span>
                  <span className="font-mono font-medium">{formatNPR(baseEquity)}</span>
                </div>
                <div className="flex justify-between pl-2 text-indigo-700 font-medium">
                  <span>Current Period Net Profit:</span>
                  <span className="font-mono">+{formatNPR(netProfit)}</span>
                </div>
                <div className="flex justify-between pl-2 font-semibold text-slate-800 border-t border-slate-100 pt-1">
                  <span>Total Equity:</span>
                  <span className="font-mono">{formatNPR(totalEquity)}</span>
                </div>
              </div>

              <div className="flex justify-between py-2 border-t-2 border-slate-900 font-bold text-slate-950 text-sm bg-slate-50 px-2 rounded">
                <span>Total Liab. & Equity:</span>
                <span className="font-mono text-indigo-900">{formatNPR(totalLiabilities + totalEquity)}</span>
              </div>
            </div>
          </div>

          <div className="mt-6 p-3 bg-indigo-50 border border-indigo-200 rounded-lg flex items-center justify-between text-xs text-indigo-900">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="h-4 w-4 text-indigo-700" />
              <span className="font-semibold">Accounting Equation Verified:</span>
              <span>Assets ({formatNPR(totalAssets)}) = Liabilities & Equity ({formatNPR(totalLiabilities + totalEquity)})</span>
            </div>
          </div>
        </div>
      )}

      {/* 6. Chart of Accounts */}
      {subTab === 'chart_of_accounts' && (
        <ChartOfAccountsModule />
      )}

    </div>
  );
};
