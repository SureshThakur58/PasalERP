import { Account, JournalEntry, JournalLine } from '../types';
import { createEntityId } from './ids';

export interface JournalValidation { isValid: boolean; message?: string; }

export function validateJournalLines(lines: JournalLine[], accounts: Account[]): JournalValidation {
  if (lines.length < 2) return { isValid: false, message: 'A journal voucher must contain at least two lines.' };
  const codes = new Set(accounts.map(a => a.code));
  let debit = 0, credit = 0;
  for (const line of lines) {
    if (!codes.has(line.accountCode)) return { isValid: false, message: `Account ${line.accountCode} does not exist.` };
    if (!Number.isFinite(line.debit) || !Number.isFinite(line.credit) || line.debit < 0 || line.credit < 0) return { isValid: false, message: 'Debit and credit amounts must be valid non-negative numbers.' };
    if (line.debit > 0 && line.credit > 0) return { isValid: false, message: `Line ${line.accountCode} cannot have both debit and credit.` };
    if (line.debit === 0 && line.credit === 0) return { isValid: false, message: `Line ${line.accountCode} must have a debit or credit amount.` };
    debit += line.debit; credit += line.credit;
  }
  if (debit <= 0 || credit <= 0) return { isValid: false, message: 'Journal totals must be greater than zero.' };
  if (Math.abs(debit - credit) >= 0.01) return { isValid: false, message: `Journal is unbalanced. Dr ${debit.toFixed(2)} ≠ Cr ${credit.toFixed(2)}.` };
  return { isValid: true };
}

export function applyJournalToAccounts(lines: JournalLine[], accounts: Account[]): Account[] {
  return accounts.map(acc => {
    const matching = lines.filter(l => l.accountCode === acc.code);
    if (!matching.length) return acc;
    const delta = matching.reduce((sum, l) => {
      return sum + (acc.category === 'asset' || acc.category === 'expense' ? l.debit - l.credit : l.credit - l.debit);
    }, 0);
    return { ...acc, balance: acc.balance + delta };
  });
}

export function buildManualJournal(args: {
  fiscalYear: string; mitiDate: string; adDate: string; narration: string; referenceNo: string; lines: JournalLine[]; accounts: Account[];
}): JournalEntry {
  const validation = validateJournalLines(args.lines, args.accounts);
  if (!validation.isValid) throw new Error(validation.message);
  const totalDebit = args.lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = args.lines.reduce((s, l) => s + l.credit, 0);
  return {
    id: createEntityId('jv'), entryNo: `JV-${args.fiscalYear}-${Date.now().toString().slice(-6)}`,
    mitiDate: args.mitiDate, adDate: args.adDate, referenceType: 'Opening Balance',
    referenceNo: args.referenceNo || 'MANUAL', narration: args.narration, lines: args.lines,
    totalDebit, totalCredit, isBalanced: Math.abs(totalDebit - totalCredit) < 0.01,
  };
}

export function validateAccountMaster(accounts: Account[]): JournalValidation {
  const seen = new Set<string>();
  for (const a of accounts) {
    if (!/^\d{4}$/.test(a.code)) return { isValid: false, message: `Invalid account code: ${a.code}` };
    if (seen.has(a.code)) return { isValid: false, message: `Duplicate account code: ${a.code}` };
    if (!a.name.trim()) return { isValid: false, message: `Account ${a.code} has no name.` };
    if (!Number.isFinite(a.balance)) return { isValid: false, message: `Account ${a.code} has an invalid balance.` };
    seen.add(a.code);
  }
  return { isValid: true };
}
