import { BusinessPartner, CompanySettings, GarmentItem, PartnerType, Warehouse } from '../types';
import { validateNepalPan } from './nepalIrdUtils';

export interface ValidationResult {
  isValid: boolean;
  message?: string;
}

export function validateFiscalYear(value: string): ValidationResult {
  const fiscalYear = value.trim();
  if (!fiscalYear) return { isValid: false, message: 'Fiscal Year is required (e.g. 2081/82).' };
  if (!/^\d{4}\/\d{2}$/.test(fiscalYear)) {
    return { isValid: false, message: 'Fiscal Year must use BS format YYYY/YY (e.g. 2081/82).' };
  }

  const [start, end] = fiscalYear.split('/').map(Number);
  if (end !== (start + 1) % 100) {
    return { isValid: false, message: 'Fiscal Year must contain consecutive BS years (e.g. 2081/82).' };
  }
  return { isValid: true };
}

export function validateCompanySettings(settings: CompanySettings): ValidationResult {
  if (!settings.companyName.trim()) return { isValid: false, message: 'Company legal name is required.' };

  const pan = settings.panNumber.replace(/\D/g, '');
  if (!/^\d{9}$/.test(pan)) {
    return { isValid: false, message: 'Nepal IRD PAN must be exactly 9 digits.' };
  }

  return validateFiscalYear(settings.fiscalYear);
}

export function validateWarehouse(
  warehouse: Pick<Warehouse, 'name' | 'code' | 'address' | 'phone'>,
  existing: Warehouse[] = [],
  editingId?: string,
): ValidationResult {
  if (!warehouse.name.trim()) return { isValid: false, message: 'Warehouse name is required.' };
  if (!warehouse.code.trim()) return { isValid: false, message: 'Warehouse code is required.' };

  const duplicate = existing.some(
    (item) => item.id !== editingId && item.code.trim().toUpperCase() === warehouse.code.trim().toUpperCase(),
  );
  if (duplicate) return { isValid: false, message: `Warehouse code "${warehouse.code.trim().toUpperCase()}" already exists.` };

  return { isValid: true };
}

export function validateItem(
  item: Pick<GarmentItem, 'name' | 'sku' | 'costPrice' | 'sellingPrice' | 'minStockAlert' | 'hsnCode'>,
  existing: GarmentItem[] = [],
  editingId?: string,
): ValidationResult {
  if (!item.name.trim()) return { isValid: false, message: 'Item name is required.' };
  if (!item.sku.trim()) return { isValid: false, message: 'SKU code is required.' };
  if (Number(item.costPrice) <= 0) return { isValid: false, message: 'Cost price must be greater than zero.' };
  if (Number(item.sellingPrice) <= 0) return { isValid: false, message: 'Selling price must be greater than zero.' };
  if (Number(item.minStockAlert) < 0) return { isValid: false, message: 'Minimum stock alert cannot be negative.' };
  if (!/^\d{4}(\.\d{2}){0,2}$/.test(item.hsnCode.trim())) {
    return { isValid: false, message: 'HSN code format is invalid.' };
  }

  const duplicate = existing.some(
    (candidate) => candidate.id !== editingId && candidate.sku.trim().toLowerCase() === item.sku.trim().toLowerCase(),
  );
  if (duplicate) return { isValid: false, message: `SKU "${item.sku.trim()}" already exists.` };

  return { isValid: true };
}

export function validatePartner(
  partner: Pick<BusinessPartner, 'name' | 'code' | 'type' | 'panNumber' | 'creditLimit'>,
  existing: BusinessPartner[] = [],
  editingId?: string,
): ValidationResult {
  if (!partner.name.trim()) return { isValid: false, message: 'Business partner legal name is required.' };
  if (!partner.code.trim()) return { isValid: false, message: 'Business partner code is required.' };
  if (!(['customer', 'vendor', 'both'] as PartnerType[]).includes(partner.type)) {
    return { isValid: false, message: 'Business partner type is invalid.' };
  }
  if (partner.panNumber.trim()) {
    const pan = validateNepalPan(partner.panNumber.trim());
    if (!pan.isValid) return { isValid: false, message: pan.message };
  }
  if (Number(partner.creditLimit ?? 0) < 0) return { isValid: false, message: 'Credit limit cannot be negative.' };

  const duplicate = existing.some(
    (candidate) => candidate.id !== editingId && candidate.code.trim().toLowerCase() === partner.code.trim().toLowerCase(),
  );
  if (duplicate) return { isValid: false, message: `Business partner code "${partner.code.trim()}" already exists.` };

  return { isValid: true };
}
