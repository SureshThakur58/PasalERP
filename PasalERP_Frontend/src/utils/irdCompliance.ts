import { CompanySettings, PurchaseBill, SalesInvoice } from '../types';
import type { IrdPurchaseBookRow, IrdSalesBookRow } from '../api/repository';
export interface IrdIssue { severity: 'error' | 'warning'; document: string; message: string; }
export interface IrdComplianceResult { errors: IrdIssue[]; warnings: IrdIssue[]; }
const money = (n:number) => Math.round((n + Number.EPSILON) * 100) / 100;
export function validateIrdDocuments(salesInvoices: SalesInvoice[], purchaseBills: PurchaseBill[], settings: CompanySettings): IrdComplianceResult {
 const errors:IrdIssue[]=[]; const warnings:IrdIssue[]=[]; const pan=/^\d{9}$/;
 if(!pan.test(settings.panNumber.trim())) errors.push({severity:'error',document:'Company',message:'Company PAN must be exactly 9 digits.'});
 if(!settings.companyName.trim()) errors.push({severity:'error',document:'Company',message:'Company name is required for statutory documents.'});
 if(!/^\d{4}\/\d{2}$/.test(settings.fiscalYear)) errors.push({severity:'error',document:'Company',message:'Fiscal year must use YYYY/YY format.'});
 if(settings.businessNature==='VAT' && (settings.vatRate<=0 || settings.vatRate>100)) errors.push({severity:'error',document:'Company',message:'VAT business must have a valid VAT rate.'});
 const salesNos=new Set<string>();
 for(const inv of salesInvoices){
  if(salesNos.has(inv.invoiceNo)) errors.push({severity:'error',document:inv.invoiceNo,message:'Duplicate invoice number.'}); salesNos.add(inv.invoiceNo);
  if(!pan.test(inv.customerPan.trim())) warnings.push({severity:'warning',document:inv.invoiceNo,message:'Buyer PAN is missing or not 9 digits.'});
  if(!inv.mitiDate || !inv.adDate) errors.push({severity:'error',document:inv.invoiceNo,message:'Both B.S. and A.D. invoice dates are required.'});
  if(!inv.items.length) errors.push({severity:'error',document:inv.invoiceNo,message:'Invoice has no item lines.'});
  const expectedVat=money(inv.items.reduce((s,l)=>s+l.vatAmount,0));
  if(Math.abs(money(inv.vatAmount)-expectedVat)>0.02) errors.push({severity:'error',document:inv.invoiceNo,message:'VAT total does not reconcile with invoice lines.'});
  if(Math.abs(money(inv.grandTotal)-money(inv.taxableAmount+inv.nonTaxableAmount+inv.vatAmount))>0.02) errors.push({severity:'error',document:inv.invoiceNo,message:'Grand total does not reconcile with taxable, exempt and VAT amounts.'});
 }
 const purchaseNos=new Set<string>();
 for(const bill of purchaseBills){
  if(purchaseNos.has(bill.billNo)) errors.push({severity:'error',document:bill.billNo,message:'Duplicate purchase document number.'}); purchaseNos.add(bill.billNo);
  if(!pan.test(bill.vendorPan.trim())) warnings.push({severity:'warning',document:bill.billNo,message:'Supplier PAN is missing or not 9 digits.'});
  if(!bill.supplierBillNo.trim()) warnings.push({severity:'warning',document:bill.billNo,message:'Supplier invoice number is missing.'});
  if(!bill.items.length) errors.push({severity:'error',document:bill.billNo,message:'Purchase document has no item lines.'});
  const expectedVat=money(bill.items.reduce((s,l)=>s+l.vatAmount,0));
  if(Math.abs(money(bill.vatAmount)-expectedVat)>0.02) errors.push({severity:'error',document:bill.billNo,message:'Input VAT total does not reconcile with purchase lines.'});
  if(Math.abs(money(bill.grandTotal)-money(bill.taxableAmount+bill.nonTaxableAmount+bill.vatAmount))>0.02) errors.push({severity:'error',document:bill.billNo,message:'Grand total does not reconcile with taxable, exempt and VAT amounts.'});
  if(settings.businessNature==='VAT' && bill.isVatBill===false && bill.vatAmount>0) warnings.push({severity:'warning',document:bill.billNo,message:'Non-VAT supplier bill contains input VAT.'});
 }
 return {errors,warnings};
}
export function filterByFiscalYear<T extends {fiscalYear:string}>(docs:T[], fiscalYear:string):T[]{return docs.filter(d=>d.fiscalYear===fiscalYear);}
export function csvEscape(value:unknown):string{return `"${String(value??'').replace(/"/g,'""')}"`;}
export function buildIrdSalesCsv(docs:(SalesInvoice | IrdSalesBookRow)[], vatRate:number):string{const rows=[['Miti','AD Date','Invoice No','Transaction Type','Buyer Name','Buyer PAN','Taxable Amount','Exempt Amount','VAT Rate','Output VAT','Grand Total','Reference Invoice','Reason']]; for(const d of docs) rows.push([d.mitiDate,d.adDate,d.invoiceNo,d.transactionType||'tax_invoice',d.customerName,d.customerPan,d.taxableAmount.toFixed(2),d.nonTaxableAmount.toFixed(2),vatRate.toFixed(2),d.vatAmount.toFixed(2),d.grandTotal.toFixed(2),d.refInvoiceNo||'',d.reason||'']); return rows.map(r=>r.map(csvEscape).join(',')).join('\r\n');}
export function buildIrdPurchaseCsv(docs:(PurchaseBill | IrdPurchaseBookRow)[], vatRate:number):string{const rows=[['Miti','AD Date','System Bill No','Supplier Invoice No','Transaction Type','Supplier Name','Supplier PAN','Taxable Purchase','Exempt Purchase','VAT Rate','Input VAT','Grand Total','Reference Bill','Reason','VAT Bill']]; for(const d of docs) rows.push([d.mitiDate,d.adDate,d.billNo,d.supplierBillNo,d.transactionType||'purchase_invoice',d.vendorName,d.vendorPan,d.taxableAmount.toFixed(2),d.nonTaxableAmount.toFixed(2),vatRate.toFixed(2),d.vatAmount.toFixed(2),d.grandTotal.toFixed(2),d.refBillNo||'',d.reason||'',d.isVatBill===false?'No':'Yes']); return rows.map(r=>r.map(csvEscape).join(',')).join('\r\n');}
