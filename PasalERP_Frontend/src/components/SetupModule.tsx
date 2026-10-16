import React, { useEffect, useRef, useState } from 'react';
import {
  CompanySettings,
  Warehouse,
  BusinessPartner,
  GarmentItem,
  FIFOBatch,
  SalesInvoice,
  PurchaseBill,
  Account,
  JournalEntry,
  StockTransfer
} from '../types';
import { validateCompanySettings, validateWarehouse } from '../utils/validation';
import { BACKUP_VERSION, MAX_BACKUP_BYTES, createBackupData, downloadJsonFile, normalizeLegacyBackup, validateBackupData, calculateBackupHash, validateBackupIntegrity } from '../utils/backup';
import { createEntityId } from '../utils/ids';
import { repository } from '../api/repository';
import type { MigrationPreview, MigrationStatus } from '../api/repository';
import {
  Building2,
  Landmark,
  ShieldCheck,
  Save,
  Download,
  Upload,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  MapPin,
  Phone,
  HelpCircle,
  FileSpreadsheet,
  Settings
} from 'lucide-react';


interface SetupModuleProps {
  settings: CompanySettings;
  warehouses: Warehouse[];
  partners: BusinessPartner[];
  items: GarmentItem[];
  batches: FIFOBatch[];
  salesInvoices: SalesInvoice[];
  purchaseBills: PurchaseBill[];
  accounts: Account[];
  journalEntries: JournalEntry[];
  stockTransfers: StockTransfer[];
  onUpdateSettings: (newSettings: CompanySettings) => Promise<void>;
  onUpdateWarehouses: (newWarehouses: Warehouse[]) => void;
  onUpdatePartners: (newPartners: BusinessPartner[]) => void;
  onUpdateItems: (newItems: GarmentItem[]) => void;
  onUpdateBatches: (newBatches: FIFOBatch[]) => void;
  onUpdateSalesInvoices: (newInvoices: SalesInvoice[]) => void;
  onUpdatePurchaseBills: (newBills: PurchaseBill[]) => void;
  onUpdateAccounts: (newAccounts: Account[]) => void;
  onUpdateJournalEntries: (newEntries: JournalEntry[]) => void;
  onUpdateStockTransfers: (newTransfers: StockTransfer[]) => void;
  onResetAllData: () => void;
}

export const SetupModule: React.FC<SetupModuleProps> = ({
  settings,
  warehouses,
  partners,
  items,
  batches,
  salesInvoices,
  purchaseBills,
  accounts,
  journalEntries,
  onUpdateSettings,
  onUpdateWarehouses,
  onUpdatePartners,
  onUpdateItems,
  onUpdateBatches,
  onUpdateSalesInvoices,
  onUpdatePurchaseBills,
  onUpdateAccounts,
  onUpdateJournalEntries,
  onUpdateStockTransfers,
  onResetAllData,
  stockTransfers,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'company' | 'bank' | 'warehouses' | 'backup'>('company');

  // Form states for company settings
  const [formData, setFormData] = useState<CompanySettings>({
  ...settings,
  businessNature: settings.businessNature ?? 'VAT',
  vatRate: settings.vatRate ?? 13,
});

useEffect(() => {
  setFormData({
    ...settings,
    businessNature: settings.businessNature ?? 'VAT',
    vatRate: settings.vatRate ?? 13,
  });
}, [settings]);

const applicableSalesVatRate =
  formData.businessNature === 'PAN' ? 0 : 13;
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [migrationStatus, setMigrationStatus] = useState<MigrationStatus | null>(null);
  const [migrationPreview, setMigrationPreview] = useState<MigrationPreview | null>(null);
  const [migrationBusy, setMigrationBusy] = useState(false);
  const [migrationMode, setMigrationMode] = useState<'merge' | 'replace'>('merge');

  // New warehouse state
  const [isAddingWarehouse, setIsAddingWarehouse] = useState<boolean>(false);
  const [newWhName, setNewWhName] = useState<string>('');
  const [newWhCode, setNewWhCode] = useState<string>('');
  const [newWhAddress, setNewWhAddress] = useState<string>('');
  const [newWhPhone, setNewWhPhone] = useState<string>('');
  const [savingSettings, setSavingSettings] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleInputChange = (field: keyof CompanySettings, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    setSaveSuccess(null);
    setSaveError(null);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();

    const validation = validateCompanySettings(formData);

    if (!validation.isValid) {
      setSaveSuccess(null);
      setSaveError(
        validation.message || 'Please correct the company configuration.'
      );
      return;
    }

    setSavingSettings(true);
    setSaveSuccess(null);
    setSaveError(null);

    try {
      await onUpdateSettings(formData);

      setSaveSuccess('Company settings saved successfully.');

      window.setTimeout(() => {
        setSaveSuccess(null);
      }, 5000);
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : 'Unable to save company settings.'
      );
    } finally {
      setSavingSettings(false);
    }
  };

  const handleAddWarehouse = (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateWarehouse({
      name: newWhName,
      code: newWhCode,
      address: newWhAddress,
      phone: newWhPhone,
    }, warehouses);
    if (!validation.isValid) {
      setSaveError(validation.message || 'Please correct the warehouse details.');
      return;
    }

    const newWarehouse: Warehouse = {
      id: createEntityId('wh'),
      code: newWhCode.trim().toUpperCase(),
      name: newWhName.trim(),
      address: newWhAddress.trim() || 'Kathmandu, Nepal',
      phone: newWhPhone.trim() || '+977-1-0000000',
      isDefault: false,
    };

    onUpdateWarehouses([...warehouses, newWarehouse]);
    setNewWhName('');
    setNewWhCode('');
    setNewWhAddress('');
    setNewWhPhone('');
    setIsAddingWarehouse(false);
    setSaveSuccess(`New warehouse "${newWarehouse.name}" added successfully!`);
    setTimeout(() => setSaveSuccess(null), 3000);
  };

  const handleDeleteWarehouse = (id: string) => {
    if (warehouses.length <= 1) {
      alert('At least one warehouse / outlet must remain active.');
      return;
    }
    const wh = warehouses.find((w) => w.id === id);
    if (window.confirm(`Are you sure you want to remove warehouse "${wh?.name}"?`)) {
      onUpdateWarehouses(warehouses.filter((w) => w.id !== id));
    }
  };

  const getCurrentBackup = () => createBackupData({
    fiscalYear: formData.fiscalYear,
    company: formData,
    warehouses,
    partners,
    items,
    batches,
    salesInvoices,
    purchaseBills,
    accounts,
    journalEntries,
    stockTransfers,
    stockMovements: [],
    source: 'local',
  });

  const handleCheckServer = async () => {
    setMigrationBusy(true);
    setSaveError(null);
    try {
      const status = await repository.migration.status();
      setMigrationStatus(status);
      setSaveSuccess(`Backend connected to ${status.database.database}.`);
    } catch (error) {
      setMigrationStatus(null);
      setSaveError(error instanceof Error ? error.message : 'Unable to read backend migration status.');
    } finally {
      setMigrationBusy(false);
    }
  };

  const handlePreviewMigration = async () => {
    setMigrationBusy(true);
    setSaveError(null);
    try {
      const preview = await repository.migration.preview(getCurrentBackup(), migrationMode);
      setMigrationPreview(preview);
      const conflictText = preview.conflicts.length ? ` ${preview.conflicts.length} conflict group(s) detected.` : '';
      setSaveSuccess(`Migration preview ready.${conflictText}`);
    } catch (error) {
      setMigrationPreview(null);
      setSaveError(error instanceof Error ? error.message : 'Unable to preview migration.');
    } finally {
      setMigrationBusy(false);
    }
  };

  const handleMigrateToServer = async () => {
    if (migrationMode === 'replace' && !window.confirm('REPLACE mode will permanently delete the current server data before importing this backup. Make a fresh backup first. Continue?')) return;
    setMigrationBusy(true);
    setSaveError(null);
    try {
      const backup = getCurrentBackup();
      const preview = await repository.migration.preview(backup, migrationMode);
      setMigrationPreview(preview);
      if (!preview.canImport) throw new Error('Migration is blocked because the backup contains invalid duplicate identifiers.');
      if (migrationMode === 'merge' && preview.conflicts.length && !window.confirm('Some records already exist on the server. Merge mode will skip those existing IDs and import only new records. Continue?')) return;
      const result = await repository.migration.import(backup, migrationMode);
      setSaveSuccess(`Migration completed. Imported ${Object.values(result.imported).reduce((a,b)=>a+b,0)} record group entries; skipped ${Object.values(result.skipped).reduce((a,b)=>a+b,0)} existing records.`);
      const status = await repository.migration.status();
      setMigrationStatus(status);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Migration failed. No partial transaction should have been committed.');
    } finally {
      setMigrationBusy(false);
    }
  };

  const handleExportServerBackup = async () => {
    setMigrationBusy(true); setSaveError(null);
    try {
      const backup = await repository.migration.exportServer();
      backup.integrity = { algorithm: 'SHA-256', hash: await calculateBackupHash(backup) };
      if (new Blob([JSON.stringify(backup)]).size > MAX_BACKUP_BYTES) throw new Error('Server backup exceeds the 20 MB safety limit.');
      const safeFy = String(backup.fiscalYear || formData.fiscalYear).replace('/', '-');
      downloadJsonFile(`nepal_garment_erp_server_backup_${safeFy}_${new Date().toISOString().replace(/[:.]/g, '-')}.json`, backup);
      setSaveSuccess(`SQL Server backup v${BACKUP_VERSION} exported successfully.`);
    } catch (error) { setSaveError(error instanceof Error ? error.message : 'Unable to export SQL Server backup.'); }
    finally { setMigrationBusy(false); }
  };

  const handleExportBackup = async () => {
    const backupData = getCurrentBackup();
    backupData.integrity = { algorithm: 'SHA-256', hash: await calculateBackupHash(backupData) };
    const safeFy = formData.fiscalYear.replace('/', '-');
    downloadJsonFile(`nepal_garment_erp_backup_${safeFy}_${new Date().toISOString().replace(/[:.]/g, '-')}.json`, backupData);
    setSaveSuccess(`Backup v${BACKUP_VERSION} exported successfully.`);
  };

  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) {
      setSaveError('Backup file is too large. Maximum supported size is 20 MB.');
      event.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const parsed = JSON.parse(String(e.target?.result || '{}')) as Record<string, any>;
        const normalized = parsed.format === 'PasalERP-NEPAL' ? parsed : normalizeLegacyBackup(parsed);
        if (!(await validateBackupIntegrity(normalized))) { setSaveError('Backup integrity check failed. The file may be modified or corrupted.'); return; }
        const validation = validateBackupData(normalized);
        if (!validation.isValid) {
          setSaveError(validation.message || 'Backup validation failed.');
          return;
        }
        const warningText = validation.warnings.length ? `\n\nWarnings:\n- ${validation.warnings.join('\n- ')}` : '';
        if (!window.confirm(`This restore will replace the current frontend data with the backup from ${normalized.exportDate || 'an older export'}.${warningText}\n\nProceed only if you have a current backup of this system.`)) return;
        onUpdateSettings(normalized.company);
        onUpdateWarehouses(normalized.warehouses);
        onUpdatePartners(normalized.partners);
        onUpdateItems(normalized.items);
        onUpdateBatches(normalized.batches);
        onUpdateSalesInvoices(normalized.salesInvoices);
        onUpdatePurchaseBills(normalized.purchaseBills);
        onUpdateAccounts(normalized.accounts);
        onUpdateJournalEntries(normalized.journalEntries);
        onUpdateStockTransfers(normalized.stockTransfers || []);
        setFormData(normalized.company);
        setSaveError(null);
        setSaveSuccess(`Backup restored successfully${validation.warnings.length ? ` with ${validation.warnings.length} warning(s)` : ''}.`);
      } catch {
        setSaveError('Failed to parse the selected file. Please choose a valid JSON backup.');
      } finally {
        event.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-600 text-white shadow-xs">
              <Settings className="h-4 w-4" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">
              Company Setup & System Configuration
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Configure company legal details, Nepal IRD PAN registration, digital payment QR, warehouse branches, and database backups.
          </p>
        </div>

        {/* Sub Navigation Buttons */}
        <div className="flex flex-wrap gap-1.5">
          <button
            id="setup-subtab-company"
            onClick={() => setActiveSubTab('company')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center ${
              activeSubTab === 'company'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <Building2 className="h-3.5 w-3.5 mr-1.5" />
            Company & IRD Details
          </button>
          <button
            id="setup-subtab-bank"
            onClick={() => setActiveSubTab('bank')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center ${
              activeSubTab === 'bank'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <Landmark className="h-3.5 w-3.5 mr-1.5" />
            Bank & Fonepay QR
          </button>
          <button
            id="setup-subtab-warehouses"
            onClick={() => setActiveSubTab('warehouses')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center ${
              activeSubTab === 'warehouses'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <MapPin className="h-3.5 w-3.5 mr-1.5" />
            Warehouses & Outlets ({warehouses.length})
          </button>
          <button
            id="setup-subtab-backup"
            onClick={() => setActiveSubTab('backup')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center ${
              activeSubTab === 'backup'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Data Backup & Restore
          </button>
        </div>
      </div>

      {/* Notifications */}
      {saveSuccess && (
        <div className="rounded-xl bg-indigo-50 border border-indigo-200 p-3.5 text-xs text-indigo-900 flex items-center justify-between shadow-xs">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-indigo-600" />
            <span className="font-semibold">{saveSuccess}</span>
          </div>
          <button onClick={() => setSaveSuccess(null)} className="text-indigo-400 hover:text-indigo-700 font-bold">
            &times;
          </button>
        </div>
      )}

      {saveError && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3.5 text-xs text-red-800 flex items-center justify-between shadow-xs">
          <div className="flex items-center space-x-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            <span className="font-semibold">{saveError}</span>
          </div>
          <button onClick={() => setSaveError(null)} className="text-red-400 hover:text-red-700 font-bold">
            &times;
          </button>
        </div>
      )}

      {/* Tab 1: Company Profile & Nepal IRD Settings */}
      {activeSubTab === 'company' && (
        <form onSubmit={handleSaveSettings} className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center" title="स्थायी लेखा नं तथा कम्पनी विवरण">
                  <ShieldCheck className="h-4 w-4 mr-1.5 text-indigo-600" />
                  Legal Identity & Tax Registration
                </h3>
                <p className="text-xs text-slate-500">
                  These details are printed on all official Nepal IRD Tax Invoices, Annex 7 & 8 statutory books.
                </p>
              </div>
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                FY {formData.fiscalYear}
              </span>
            </div>

            {/* Business Nature Selection Field (VAT vs PAN) */}
            <div className="p-4 rounded-xl border border-indigo-200/80 bg-linear-to-r from-indigo-50/70 via-slate-50 to-white">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div>
                  <label htmlFor="business-nature-select" className="text-xs font-bold text-slate-900 flex items-center gap-1.5" title="व्यवसायको कर प्रकृति">
                    <Building2 className="h-4 w-4 text-indigo-600" />
                    Business Nature *
                  </label>
                  <p className="text-[11px] text-slate-500">
                    Select whether this enterprise is registered under Value Added Tax (VAT) or operates as a PAN-only non-VAT entity.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-1 rounded-md text-xs font-bold ${
                    (formData.businessNature || 'VAT') === 'VAT'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-amber-600 text-white shadow-xs'
                  }`}>
                    Current: {(formData.businessNature || 'VAT')}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label
                  htmlFor="business-nature-vat-radio"
                  className={`relative flex flex-col p-3.5 rounded-xl border cursor-pointer transition-all ${
                    (formData.businessNature || 'VAT') === 'VAT'
                      ? 'border-indigo-600 bg-white ring-2 ring-indigo-500/20 shadow-sm'
                      : 'border-slate-200 bg-slate-50/60 hover:bg-white text-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <input
                        id="business-nature-vat-radio"
                        type="radio"
                        name="businessNature"
                        value="VAT"
                        checked={(formData.businessNature || 'VAT') === 'VAT'}
                        onChange={() => { setFormData((prev) => ({ ...prev, businessNature: 'VAT' })); 
                        setSaveSuccess(null); 
                        setSaveError(null); }}
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-xs font-bold text-slate-900" title="मूल्य अभिवृद्धि कर दर्ता">1. VAT Registered</span>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                      Standard 13% VAT
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-600 leading-relaxed pl-6">
                    All sales invoices compute and charge 13% Output VAT. Purchases claim 13% Input VAT Receivable against government VAT return (Annex 7 &amp; 8 compliant).
                  </p>
                </label>

                <label
                  htmlFor="business-nature-pan-radio"
                  className={`relative flex flex-col p-3.5 rounded-xl border cursor-pointer transition-all ${
                    formData.businessNature === 'PAN'
                      ? 'border-indigo-600 bg-white ring-2 ring-indigo-500/20 shadow-sm'
                      : 'border-slate-200 bg-slate-50/60 hover:bg-white text-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <input
                        id="business-nature-pan-radio"
                        type="radio"
                        name="businessNature"
                        value="PAN"
                        checked={formData.businessNature === 'PAN'}
                        onChange={() => { setFormData((prev) => ({ ...prev, businessNature: 'PAN' })); 
                        setSaveSuccess(null); 
                        setSaveError(null); }}
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-xs font-bold text-slate-900" title="भ्याट रहित - स्थायी लेखा नं">2. PAN Only / Small Taxpayer</span>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                      0% Sales VAT | Capitalized Cost
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-600 leading-relaxed pl-6">
                    <strong className="text-slate-800">Sales:</strong> No VAT is calculated or charged (0% VAT / PAN Invoice). <br />
                    <strong className="text-slate-800">Purchases:</strong> If vendor provides a VAT bill, the 13% VAT amount is automatically added to the item cost (capitalized in inventory). If not a VAT bill, VAT amount is zero.
                  </p>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
              {/* Company Legal Name */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1" title="कम्पनीको पुरा नाम">
                  Company Legal Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.companyName}
                  onChange={(e) => handleInputChange('companyName', e.target.value)}
                  placeholder="e.g. Himalayan Thread & Apparels Pvt. Ltd."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-900 focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600"
                />
              </div>

              {/* Trade / Brand Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1" title="व्यापारिक नाम">
                  Trade / Display Name
                </label>
                <input
                  type="text"
                  value={formData.tradeName}
                  onChange={(e) => handleInputChange('tradeName', e.target.value)}
                  placeholder="e.g. Himalayan Apparels"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600"
                />
              </div>

              {/* PAN Number */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1" title="स्थायी लेखा नम्बर">
                  Nepal IRD PAN Number *
                </label>
                <input
                  type="text"
                  required
                  maxLength={9}
                  value={formData.panNumber}
                  onChange={(e) => handleInputChange('panNumber', e.target.value.replace(/\D/g, ''))}
                  placeholder="9-digit PAN e.g. 601928374"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600"
                />
                <span className="text-[10px] text-slate-500">Must be exactly 9 numeric digits</span>
              </div>

              {/* IRD Billing Approval Number */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1" title="सफ्टवेयर स्वीकृति नं">
                  IRD Software Approval No. *
                </label>
                <input
                  type="text"
                  required
                  value={formData.irdApprovalNo}
                  onChange={(e) => handleInputChange('irdApprovalNo', e.target.value)}
                  placeholder="e.g. IRD-REG-2081/82-58192"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono text-slate-900 focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600"
                />
              </div>

              {/* Current Fiscal Year */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1" title="आर्थिक वर्ष">
                  Current Fiscal Year *
                </label>
                <select
                  value={formData.fiscalYear}
                  onChange={(e) => handleInputChange('fiscalYear', e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-900 focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600 bg-white"
                >
                  <option value="2088/89">2088/89 </option>
                  <option value="2087/88">2087/88 </option>
                  <option value="2086/87">2086/87 </option>
                  <option value="2085/86">2085/86 </option>
                  <option value="2084/85">2084/85 </option>
                  <option value="2083/84">2083/84 </option>
                  <option value="2082/83">2082/83 </option>

                </select>
              </div>

              {/* Registered Address */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1" title="ठेगाना तथा वडा नं">
                  Registered Address *
                </label>
                <input
                  type="text"
                  required
                  value={formData.address}
                  onChange={(e) => handleInputChange('address', e.target.value)}
                  placeholder="e.g. Khichapokhari, New Road (Ward 22)"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600"
                />
              </div>

              {/* City / District */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1" title="जिल्ला">
                  City & District *
                </label>
                <input
                  type="text"
                  required
                  value={formData.city}
                  // onChange={(e) => handleInputChange('city', e.target.value)}
                  onChange={(e) => {const value = e.target.value;
                    setFormData((prev) => ({...prev, city: value, district: value,
                    }));
                    setSaveSuccess(null);
                    setSaveError(null);
                  }}
                  placeholder="Kathmandu"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1" title="सम्पर्क फोन">
                  Official Phone / Mobile *
                </label>
                <input
                  type="text"
                  required
                  value={formData.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  placeholder="+977-1-4245678, 9851098765"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1" title="इमेल">
                  Official Email Address
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  placeholder="info@himalayanapparels.com.np"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600"
                />
              </div>

              {/* Nepal VAT Rate */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1" title="मूल्य अभिवृद्धि कर">
                  Nepal Standard VAT Rate
                </label>
                <div className="relative">
                  <input
                    type="number"
                    disabled
                    // value={applicableSalesVatRate}
                    value={formData.businessNature === 'PAN' ? 0 : 13}
                    className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-mono font-bold text-slate-600 cursor-not-allowed"
                  />
                  <span className="absolute right-3 top-2 text-xs text-slate-500 font-bold">%</span>
                </div>
                <span className="text-[10px] text-slate-400">Fixed statutory rate per Nepal VAT Act 2052</span>
              </div>

              {/* Sales Invoice Prefix */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1" title="बीजक संकेत">
                  Sales Invoice Prefix *
                </label>
                <input
                  type="text"
                  required
                  value={formData.invoicePrefix}
                  onChange={(e) => handleInputChange('invoicePrefix', e.target.value)}
                  placeholder="INV-2081/82-"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono font-semibold text-slate-900 focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600"
                />
                <span className="text-[10px] text-slate-500">e.g. INV-2081/82-0001</span>
              </div>

              {/* Purchase Bill Prefix */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1" title="खरिद संकेत">
                  Purchase Bill Prefix *
                </label>
                <input
                  type="text"
                  required
                  value={formData.purchasePrefix}
                  onChange={(e) => handleInputChange('purchasePrefix', e.target.value)}
                  placeholder="PUR-2081/82-"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono font-semibold text-slate-900 focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600"
                />
                <span className="text-[10px] text-slate-500">e.g. PUR-2081/82-0001</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3">

              {saveSuccess && (
                <div className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  {saveSuccess}
                </div>
              )}

              {/* <button
                type="submit"
                className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
              >
              <Save className="h-4 w-4 mr-1.5" />
                Save Company Settings
              </button> */}
              <button
                type="submit"
                disabled={savingSettings}
                className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Save className="h-4 w-4 mr-1.5" />

                {savingSettings
                  ? 'Saving...'
                  : 'Save Company Settings'}
              </button>

            </div>
          </div>
        </form>
      )}

      {/* Tab 2: Bank & Fonepay QR Details */}
      {activeSubTab === 'bank' && (
        <form onSubmit={handleSaveSettings} className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center">
                <Landmark className="h-4 w-4 mr-1.5 text-indigo-600" />
                Bank Accounts & Digital Payment (Fonepay QR) Configuration
              </h3>
              <p className="text-xs text-slate-500">
                Printed on Tax Invoices to facilitate direct bank transfer or instant QR scanning by customers.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1" title="बैंकको नाम">
                  Primary Bank Name
                </label>
                <input
                  type="text"
                  value={formData.bankName || ''}
                  onChange={(e) => handleInputChange('bankName', e.target.value)}
                  placeholder="e.g. Nabil Bank Ltd. (New Road Branch)"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1" title="खातावालाको नाम">
                  Bank Account Name
                </label>
                <input
                  type="text"
                  value={formData.accountName || ''}
                  onChange={(e) => handleInputChange('accountName', e.target.value)}
                  placeholder="e.g. Himalayan Thread & Apparels Pvt. Ltd."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1" title="खाता नम्बर">
                  Bank Account Number
                </label>
                <input
                  type="text"
                  value={formData.accountNumber || ''}
                  onChange={(e) => handleInputChange('accountNumber', e.target.value)}
                  placeholder="e.g. 01201017500123"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono font-semibold text-slate-900 focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Fonepay / UPI Merchant String (QR Data)
                </label>
                <input
                  type="text"
                  value={formData.qrCodeText || ''}
                  onChange={(e) => handleInputChange('qrCodeText', e.target.value)}
                  placeholder="e.g. fonepay://pay?pan=601928374&name=HimalayanApparels"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono text-slate-900 focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1" title="बीजकको नियम तथा शर्तहरू">
                  Tax Invoice Terms & Conditions
                </label>
                <textarea
                  rows={3}
                  value={formData.termsAndConditions || ''}
                  onChange={(e) => handleInputChange('termsAndConditions', e.target.value)}
                  placeholder="e.g. Goods once sold can only be exchanged within 7 days with this original Tax Invoice. No cash refund."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600"
                />
                <span className="text-[10px] text-slate-500">Appears at the bottom of printed sales invoices</span>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100">
              <button
                type="submit"
                className="inline-flex items-center px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm transition-all cursor-pointer"
              >
                <Save className="h-4 w-4 mr-1.5" />
                Save Payment & Terms
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Tab 3: Warehouses & Outlets Manager */}
      {activeSubTab === 'warehouses' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center" title="गोदाम तथा शाखाहरू">
                  <MapPin className="h-4 w-4 mr-1.5 text-indigo-600" />
                  Branch Outlets & Multi-Warehouse Storage
                </h3>
                <p className="text-xs text-slate-500">
                  Manage multiple physical showrooms, logistics godowns, and regional branches. Each maintains separate FIFO inventory lots.
                </p>
              </div>

              <button
                onClick={() => setIsAddingWarehouse(!isAddingWarehouse)}
                className="inline-flex items-center px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                {isAddingWarehouse ? 'Cancel' : 'Add New Warehouse'}
              </button>
            </div>

            {/* Add Warehouse Form */}
            {isAddingWarehouse && (
              <form
                onSubmit={handleAddWarehouse}
                className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
              >
                <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Create New Branch / Warehouse
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Warehouse Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={newWhName}
                      onChange={(e) => setNewWhName(e.target.value)}
                      placeholder="e.g. Butwal Branch Outlet"
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Location Code *
                    </label>
                    <input
                      type="text"
                      required
                      value={newWhCode}
                      onChange={(e) => setNewWhCode(e.target.value)}
                      placeholder="WH-BUTWAL"
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono uppercase text-slate-900 focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Physical Address
                    </label>
                    <input
                      type="text"
                      value={newWhAddress}
                      onChange={(e) => setNewWhAddress(e.target.value)}
                      placeholder="Traffic Chowk, Butwal"
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Phone Number
                    </label>
                    <input
                      type="text"
                      value={newWhPhone}
                      onChange={(e) => setNewWhPhone(e.target.value)}
                      placeholder="+977-71-540123"
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600 bg-white"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    className="inline-flex items-center px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
                  >
                    <Save className="h-3.5 w-3.5 mr-1" />
                    Save Warehouse
                  </button>
                </div>
              </form>
            )}

            {/* Warehouse Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-700 font-semibold">
                    <th className="py-2.5 px-3">Code</th>
                    <th className="py-2.5 px-3">Warehouse / Outlet Name</th>
                    <th className="py-2.5 px-3">Location Address</th>
                    <th className="py-2.5 px-3">Contact Phone</th>
                    <th className="py-2.5 px-3 text-center">Default Status</th>
                    <th className="py-2.5 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {warehouses.map((wh) => (
                    <tr key={wh.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-indigo-700">{wh.code}</td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900">{wh.name}</td>
                      <td className="py-2.5 px-3 text-slate-600">{wh.address}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">{wh.phone}</td>
                      <td className="py-2.5 px-3 text-center">
                        {wh.isDefault ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            Primary Store
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">Branch Outlet</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {!wh.isDefault && (
                          <button
                            onClick={() => handleDeleteWarehouse(wh.id)}
                            className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors cursor-pointer"
                            title="Remove Warehouse"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: System Backup & Data Management */}
      {activeSubTab === 'backup' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center">
                <Download className="h-4 w-4 mr-1.5 text-indigo-600" />
                Data Backup, System Restore & Statutory Safety
              </h3>
              <p className="text-xs text-slate-500">
                Export a versioned JSON snapshot of your frontend data before major changes, device migration, or backend integration.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Card 1: Export Backup */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-5 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                    <Download className="h-5 w-5" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-900">Download Complete Backup</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Exports all company details, products catalog, customer/vendor PAN records, FIFO stock lots, sales tax invoices, and accounting journals as a JSON file.
                  </p>
                </div>

                <button
                  onClick={handleExportBackup}
                  className="w-full inline-flex items-center justify-center px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
                >
                  <Download className="h-4 w-4 mr-1.5" />
                  Download Backup (JSON)
                </button>
                <button onClick={handleExportServerBackup} disabled={migrationBusy} className="w-full inline-flex items-center justify-center px-4 py-2 rounded-lg bg-white hover:bg-slate-50 border border-indigo-300 text-indigo-700 text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50">
                  <Download className="h-4 w-4 mr-1.5" />
                  Download SQL Server Backup
                </button>
              </div>

              {/* Card 2: Restore from Backup */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-5 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                    <Upload className="h-5 w-5" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-900">Restore from File</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Upload a previously exported JSON backup file to validate and restore system settings, masters, FIFO stock, transactions, journals, and stock transfers.
                  </p>
                </div>

                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleImportFile}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full inline-flex items-center justify-center px-4 py-2 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 text-xs font-bold shadow-xs transition-colors cursor-pointer"
                  >
                    <Upload className="h-4 w-4 mr-1.5 text-indigo-600" />
                    Select & Restore Backup
                  </button>
                </div>
              </div>

              {/* Card 3: Reset Demo Data */}
              <div className="rounded-xl border border-rose-200 bg-rose-50/30 p-5 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="w-10 h-10 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center font-bold">
                    <RotateCcw className="h-5 w-5" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-900">Reset Demo Database</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Reverts all data back to the clean initial Nepal Garment Store demo state (seeded with standard readymade clothes, FIFO inward batches, and balanced journals).
                  </p>
                </div>

                <button
                  onClick={() => {
                    if (
                      window.confirm(
                        'WARNING: This will reset all current transactions back to default demo data. Are you sure?'
                      )
                    ) {
                      onResetAllData();
                      setSaveSuccess('System reset back to default initial seed data!');
                    }
                  }}
                  className="w-full inline-flex items-center justify-center px-4 py-2 rounded-lg bg-white hover:bg-rose-50 border border-rose-300 text-rose-700 text-xs font-bold shadow-xs transition-colors cursor-pointer"
                >
                  <RotateCcw className="h-4 w-4 mr-1.5" />
                  Reset to Demo State
                </button>
              </div>
            </div>

            {/* Backend Migration Controls */}
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-5 space-y-4">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Backend Migration Controls</h4>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">Preview the current frontend snapshot against SQL Server before moving data. Migration runs inside one server transaction.</p>
                </div>
                <div className="flex items-center gap-2">
                  <select value={migrationMode} onChange={(e) => { setMigrationMode(e.target.value as 'merge' | 'replace'); setMigrationPreview(null); }} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold">
                    <option value="merge">Merge new records</option>
                    <option value="replace">Replace server data</option>
                  </select>
                  <button disabled={migrationBusy} onClick={handleCheckServer} className="px-3 py-2 rounded-lg bg-white border border-slate-300 text-xs font-bold disabled:opacity-50">Check Server</button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button disabled={migrationBusy} onClick={handlePreviewMigration} className="px-3 py-2 rounded-lg bg-white border border-indigo-300 text-indigo-700 text-xs font-bold disabled:opacity-50">Preview Migration</button>
                <button disabled={migrationBusy || !migrationPreview?.canImport} onClick={handleMigrateToServer} className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold disabled:opacity-50">Migrate Current Data to Server</button>
              </div>
              {migrationStatus && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[10px]">
                  {Object.entries(migrationStatus.counts).map(([key, value]) => <div key={key} className="rounded-lg bg-white border border-slate-200 px-2 py-2"><div className="font-mono font-bold text-indigo-700">{value}</div><div className="text-slate-500">{key}</div></div>)}
                </div>
              )}
              {migrationPreview && (
                <div className="rounded-lg bg-white border border-slate-200 p-3 text-[11px] space-y-2">
                  <div className="font-bold text-slate-800">Preview: {migrationPreview.mode === 'replace' ? 'Replace' : 'Merge'}</div>
                  <div className="text-slate-600">Conflicts: <strong>{migrationPreview.conflicts.length}</strong> · Warnings: <strong>{migrationPreview.warnings.length}</strong> · Import allowed: <strong>{migrationPreview.canImport ? 'Yes' : 'No'}</strong></div>
                  {migrationPreview.conflicts.length > 0 && <div className="text-amber-700">{migrationPreview.conflicts.join(' ')}</div>}
                  {migrationPreview.warnings.length > 0 && <div className="text-slate-500">{migrationPreview.warnings.slice(0, 3).join(' ')}</div>}
                </div>
              )}
            </div>

            {/* Current System Statistics */}
            <div className="mt-6 pt-4 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-5 gap-4 text-center">
              <div className="p-3 bg-white rounded-lg border border-slate-200">
                <div className="text-lg font-mono font-bold text-indigo-700">{items.length}</div>
                <div className="text-[11px] text-slate-500">Catalog Garments</div>
              </div>
              <div className="p-3 bg-white rounded-lg border border-slate-200">
                <div className="text-lg font-mono font-bold text-indigo-700">{salesInvoices.length}</div>
                <div className="text-[11px] text-slate-500" title="बिक्री">Tax Invoices</div>
              </div>
              <div className="p-3 bg-white rounded-lg border border-slate-200">
                <div className="text-lg font-mono font-bold text-indigo-700">{purchaseBills.length}</div>
                <div className="text-[11px] text-slate-500" title="खरिद">Purchase Bills</div>
              </div>
              <div className="p-3 bg-white rounded-lg border border-slate-200">
                <div className="text-lg font-mono font-bold text-indigo-700">{journalEntries.length}</div>
                <div className="text-[11px] text-slate-500">Financial Journals</div>
              </div>
              <div className="p-3 bg-white rounded-lg border border-slate-200">
                <div className="text-lg font-mono font-bold text-indigo-700">{stockTransfers.length}</div>
                <div className="text-[11px] text-slate-500">Stock Transfers</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
