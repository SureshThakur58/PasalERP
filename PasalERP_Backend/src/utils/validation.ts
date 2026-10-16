import { z } from 'zod';

export const panSchema = z.string().regex(/^\d{9}$/, 'Nepal PAN must contain exactly 9 digits');
export const dateBsSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'BS date must be YYYY-MM-DD');
export const dateAdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'AD date must be YYYY-MM-DD');
export const positiveNumber = z.number().finite().nonnegative();
export const positiveQty = z.number().finite().positive();
