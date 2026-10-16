import type sql from 'mssql';
import { HttpError } from '../middleware/errorHandler.js';

export function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, `${field} is required`);
  return value.trim();
}

export function num(value: unknown, field: string, allowZero = true): number {
  const n = Number(value);
  if (!Number.isFinite(n) || (!allowZero && n <= 0) || (allowZero && n < 0)) throw new HttpError(400, `${field} must be a valid ${allowZero ? 'non-negative' : 'positive'} number`);
  return n;
}

export function dateString(value: unknown, field: string): string {
  const s = requiredString(value, field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new HttpError(400, `${field} must be YYYY-MM-DD`);
  return s;
}

export function toDate(value: string): Date {
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new HttpError(400, `Invalid date: ${value}`);
  return d;
}

export async function scalar<T = any>(request: sql.Request, query: string): Promise<T | undefined> {
  const result = await request.query(query);
  return result.recordset[0] as T | undefined;
}
