import React, { useState, useEffect } from 'react';
import { BusinessPartner, FIFOBatch, GarmentItem, PartnerType, Warehouse } from '../types';
import { formatNPR, validateNepalPan } from '../utils/nepalIrdUtils';
import { getItemStock } from '../utils/accountingEngine';
import { createBarcode, createEntityId, createSequentialCode } from '../utils/ids';
import { validateItem, validatePartner } from '../utils/validation';
import {
  Database,
  Package,
  Users,
  Plus,
  Search,
  Filter,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Download,
  Building2,
  Phone,
  Mail,
  MapPin,
  Tag,
  ShieldCheck,
  DollarSign,
  Layers,
  ArrowUpDown
} from 'lucide-react';

interface MasterDataModuleProps {
  items: GarmentItem[];
  partners: BusinessPartner[];
  batches: FIFOBatch[];
  warehouses: Warehouse[];
  onUpdateItems: (items: GarmentItem[]) => void;
  onUpdatePartners: (partners: BusinessPartner[]) => void;
  initialSubTab?: 'item_master' | 'bp_master';
}

const CATEGORIES: GarmentItem['category'][] = [
  'Formal Shirts',
  'Casual Shirts',
  'Trousers & Chinos',
  'Kurtha & Ethnic',
  'T-Shirts & Polos',
  'Jackets & Outerwear',
  'Jeans & Denim',
  'Kidswear',
];

const SIZES: GarmentItem['size'][] = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Free Size'];

export const MasterDataModule: React.FC<MasterDataModuleProps> = ({
  items,
  partners,
  batches,
  warehouses,
  onUpdateItems,
  onUpdatePartners,
  initialSubTab = 'item_master',
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'item_master' | 'bp_master'>(initialSubTab);

  useEffect(() => {
    if (initialSubTab) {
      setActiveSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  // ==========================================
  // ITEM MASTER DATA STATE
  // ==========================================
  const [itemSearchQuery, setItemSearchQuery] = useState<string>('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [selectedSizeFilter, setSelectedSizeFilter] = useState<string>('all');
  const [showAddItemModal, setShowAddItemModal] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<GarmentItem | null>(null);

  const defaultNewItem: Partial<GarmentItem> = {
    sku: '',
    barcode: '',
    name: '',
    category: 'Formal Shirts',
    size: 'L',
    color: 'Navy Blue',
    fabric: '100% Cotton',
    hsnCode: '6205.20.00',
    costPrice: 1200,
    sellingPrice: 1950,
    minStockAlert: 10,
    isVatApplicable: true,
    description: '',
  };

  const [itemFormData, setItemFormData] = useState<Partial<GarmentItem>>(defaultNewItem);
  const [itemFormError, setItemFormError] = useState<string | null>(null);

  // ==========================================
  // BP MASTER DATA STATE
  // ==========================================
  const [bpSearchQuery, setBpSearchQuery] = useState<string>('');
  const [bpTypeFilter, setBpTypeFilter] = useState<'all' | 'customer' | 'vendor'>('all');
  const [showAddBpModal, setShowAddBpModal] = useState<boolean>(false);
  const [editingPartner, setEditingPartner] = useState<BusinessPartner | null>(null);

  const defaultNewBp: Partial<BusinessPartner> = {
    code: '',
    name: '',
    type: 'customer',
    panNumber: '',
    phone: '',
    email: '',
    address: 'Kathmandu, Nepal',
    creditLimit: 100000,
    isVatApplicable: true,
  };

  const [bpFormData, setBpFormData] = useState<Partial<BusinessPartner>>(defaultNewBp);
  const [panValidationError, setPanValidationError] = useState<string | null>(null);

  // ==========================================
  // ITEM MASTER HANDLERS
  // ==========================================
  const handleOpenAddItem = () => {
    setEditingItem(null);
    setItemFormData({
      ...defaultNewItem,
      sku: createSequentialCode('SKU', items.length + 1),
      barcode: createBarcode(),
    });
    setItemFormError(null);
    setShowAddItemModal(true);
  };

  const handleOpenEditItem = (item: GarmentItem) => {
    setEditingItem(item);
    setItemFormData({ ...item });
    setItemFormError(null);
    setShowAddItemModal(true);
  };

  const handleSaveItem = (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateItem(
      {
        name: itemFormData.name?.trim() || '',
        sku: itemFormData.sku?.trim() || '',
        costPrice: Number(itemFormData.costPrice || 0),
        sellingPrice: Number(itemFormData.sellingPrice || 0),
        minStockAlert: Number(itemFormData.minStockAlert || 0),
        hsnCode: itemFormData.hsnCode?.trim() || '',
      },
      items,
      editingItem?.id,
    );
    if (!validation.isValid) {
      setItemFormError(validation.message || 'Please correct the item details.');
      return;
    }

    if (editingItem) {
      // Update existing item
      const updated = items.map((i) =>
        i.id === editingItem.id ? ({ ...i, ...itemFormData } as GarmentItem) : i
      );
      onUpdateItems(updated);
    } else {
      // Create new item
      const newItem: GarmentItem = {
        id: createEntityId('item'),
        sku: itemFormData.sku.trim(),
        barcode: itemFormData.barcode?.trim() || createBarcode(),
        name: itemFormData.name.trim(),
        category: (itemFormData.category as any) || 'Formal Shirts',
        size: (itemFormData.size as any) || 'L',
        color: itemFormData.color?.trim() || 'Standard',
        fabric: itemFormData.fabric?.trim() || 'Cotton Blend',
        hsnCode: itemFormData.hsnCode?.trim() || '6205.20.00',
        costPrice: Number(itemFormData.costPrice),
        sellingPrice: Number(itemFormData.sellingPrice),
        minStockAlert: Number(itemFormData.minStockAlert) || 5,
        isVatApplicable: itemFormData.isVatApplicable ?? true,
        description: itemFormData.description?.trim() || '',
      };
      onUpdateItems([...items, newItem]);
    }

    setShowAddItemModal(false);
    setEditingItem(null);
  };

  const handleDeleteItem = (itemId: string, itemName: string) => {
    const currentStock = getItemStock(batches, itemId);
    if (currentStock > 0) {
      alert(
        `Cannot delete "${itemName}" because it has ${currentStock} units in current stock lots.`
      );
      return;
    }
    if (window.confirm(`Are you sure you want to delete item "${itemName}" from Item Master Data?`)) {
      onUpdateItems(items.filter((i) => i.id !== itemId));
    }
  };

  const handleExportItemsCsv = () => {
    const headers = [
      'SKU',
      'Barcode',
      'Item Name',
      'Category',
      'Size',
      'Color',
      'Fabric',
      'Nepal HSN',
      'Cost (NPR)',
      'Retail Price (NPR)',
      '13% VAT',
      'Min Stock Alert',
      'Current Stock',
    ];
    const rows = items.map((item) => [
      `"${item.sku}"`,
      `"${item.barcode}"`,
      `"${item.name.replace(/"/g, '""')}"`,
      `"${item.category}"`,
      `"${item.size}"`,
      `"${item.color}"`,
      `"${item.fabric}"`,
      `"${item.hsnCode}"`,
      item.costPrice,
      item.sellingPrice,
      item.isVatApplicable ? 'Yes (13%)' : 'Exempt',
      item.minStockAlert,
      getItemStock(batches, item.id),
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Item_Master_Catalog_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered Items
  const filteredItems = items.filter((item) => {
    const matchesCategory =
      selectedCategoryFilter === 'all' || item.category === selectedCategoryFilter;
    const matchesSize = selectedSizeFilter === 'all' || item.size === selectedSizeFilter;
    const query = itemSearchQuery.toLowerCase();
    const matchesSearch =
      item.name.toLowerCase().includes(query) ||
      item.sku.toLowerCase().includes(query) ||
      item.barcode.toLowerCase().includes(query) ||
      item.hsnCode.toLowerCase().includes(query) ||
      item.color.toLowerCase().includes(query);
    return matchesCategory && matchesSize && matchesSearch;
  });

  // ==========================================
  // BP MASTER DATA HANDLERS
  // ==========================================
  const handleOpenAddBp = () => {
    setEditingPartner(null);
    const codePrefix = 'CUS';
    setBpFormData({
      ...defaultNewBp,
      code: `${codePrefix}-${String(partners.length + 1).padStart(3, '0')}`,
    });
    setPanValidationError(null);
    setShowAddBpModal(true);
  };

  const handleOpenEditBp = (partner: BusinessPartner) => {
    setEditingPartner(partner);
    setBpFormData({ ...partner });
    setPanValidationError(null);
    setShowAddBpModal(true);
  };

  const handleBpPanChange = (pan: string) => {
    setBpFormData((prev) => ({ ...prev, panNumber: pan }));
    if (pan.trim().length > 0) {
      const val = validateNepalPan(pan);
      if (!val.isValid) {
        setPanValidationError(val.message);
      } else {
        setPanValidationError(null);
      }
    } else {
      setPanValidationError(null);
    }
  };

  const handleSaveBp = (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validatePartner(
      {
        name: bpFormData.name?.trim() || '',
        code: bpFormData.code?.trim() || '',
        type: (bpFormData.type as PartnerType) || 'customer',
        panNumber: bpFormData.panNumber?.trim() || '',
        creditLimit: Number(bpFormData.creditLimit || 0),
      },
      partners,
      editingPartner?.id,
    );
    if (!validation.isValid) {
      setPanValidationError(validation.message || 'Please correct the business partner details.');
      return;
    }

    if (editingPartner) {
      const updated = partners.map((p) =>
        p.id === editingPartner.id
          ? ({ ...p, ...bpFormData, isVatApplicable: bpFormData.isVatApplicable ?? true } as BusinessPartner)
          : p
      );
      onUpdatePartners(updated);
    } else {
      const codePrefix = bpFormData.type === 'vendor' ? 'VEN' : 'CUS';
      const created: BusinessPartner = {
        id: createEntityId('bp'),
        code: bpFormData.code?.trim() || `${codePrefix}-${String(partners.length + 1).padStart(3, '0')}`,
        name: bpFormData.name.trim(),
        type: (bpFormData.type as PartnerType) || 'customer',
        panNumber: bpFormData.panNumber?.trim() || '999999999',
        phone: bpFormData.phone?.trim() || 'N/A',
        email: bpFormData.email?.trim() || '',
        address: bpFormData.address?.trim() || 'Kathmandu, Nepal',
        currentBalance: 0,
        creditLimit: Number(bpFormData.creditLimit) || 100000,
        isVatApplicable: bpFormData.isVatApplicable ?? true,
      };
      onUpdatePartners([...partners, created]);
    }

    setShowAddBpModal(false);
    setEditingPartner(null);
  };

  const handleDeleteBp = (partnerId: string, partnerName: string) => {
    const p = partners.find((x) => x.id === partnerId);
    if (p && p.currentBalance !== 0) {
      alert(
        `Cannot delete "${partnerName}" because it has an active outstanding ledger balance of ${formatNPR(
          p.currentBalance
        )}.`
      );
      return;
    }
    if (window.confirm(`Are you sure you want to remove Business Partner "${partnerName}"?`)) {
      onUpdatePartners(partners.filter((x) => x.id !== partnerId));
    }
  };

  const handleExportPartnersCsv = () => {
    const headers = ['Partner Code', 'Name', 'Type', 'Nepal PAN', 'VAT Applicable', 'Phone', 'Email', 'Address', 'Credit Limit (NPR)', 'Balance (NPR)'];
    const rows = partners.map((p) => [
      `"${p.code}"`,
      `"${p.name.replace(/"/g, '""')}"`,
      `"${p.type.toUpperCase()}"`,
      `"${p.panNumber}"`,
      p.isVatApplicable !== false ? 'Yes (13% Standard)' : 'No (0% / Exempt / PAN)',
      `"${p.phone}"`,
      `"${p.email}"`,
      `"${p.address.replace(/"/g, '""')}"`,
      p.creditLimit || 0,
      p.currentBalance,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Business_Partners_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered Partners
  const filteredPartners = partners.filter((p) => {
    const matchesType =
      bpTypeFilter === 'all' || p.type === bpTypeFilter || p.type === 'both';
    const query = bpSearchQuery.toLowerCase();
    const matchesSearch =
      p.name.toLowerCase().includes(query) ||
      p.code.toLowerCase().includes(query) ||
      p.panNumber.includes(query) ||
      p.phone.includes(query) ||
      p.address.toLowerCase().includes(query);
    return matchesType && matchesSearch;
  });

  const totalReceivables = partners
    .filter((p) => p.currentBalance > 0)
    .reduce((acc, p) => acc + p.currentBalance, 0);

  const totalPayables = partners
    .filter((p) => p.currentBalance < 0)
    .reduce((acc, p) => acc + Math.abs(p.currentBalance), 0);

  return (
    <div className="space-y-6">
      {/* Module Header & Sub-Tab Navigation */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-indigo-600 text-xs font-bold uppercase tracking-wider" title="केन्द्रीय अभिलेख">
              <Database className="h-4 w-4" />
              <span>Master Data Management</span>
            </div>
            <h2 className="text-xl font-black text-slate-900 mt-1">
              {activeSubTab === 'item_master' ? 'Item Master Data' : 'Business Partner (BP) Master Data'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Maintain product catalogs, Nepal Harmonized System (HSN) codes, and verified customer/supplier tax profiles.
            </p>
          </div>

          {/* Sub-Tabs: Item Master Data vs BP Master Data */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
            <button
              id="subtab-item-master"
              type="button"
              onClick={() => setActiveSubTab('item_master')}
              className={`flex items-center px-4 py-2 rounded-lg transition-all cursor-pointer ${
                activeSubTab === 'item_master'
                  ? 'bg-white text-indigo-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Package className="h-4 w-4 mr-1.5" />
              <span>Item Master Data</span>
              <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-indigo-50 text-indigo-700 font-bold">
                {items.length}
              </span>
            </button>

            <button
              id="subtab-bp-master"
              type="button"
              onClick={() => setActiveSubTab('bp_master')}
              className={`flex items-center px-4 py-2 rounded-lg transition-all cursor-pointer ${
                activeSubTab === 'bp_master'
                  ? 'bg-white text-indigo-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="h-4 w-4 mr-1.5" />
              <span>BP Master Data</span>
              <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-indigo-50 text-indigo-700 font-bold">
                {partners.length}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. ITEM MASTER DATA TAB VIEW */}
      {/* ========================================================================= */}
      {activeSubTab === 'item_master' && (
        <div className="space-y-6">
          {/* Controls Bar: Search, Category Filter, Actions */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                id="item-search-input"
                type="text"
                value={itemSearchQuery}
                onChange={(e) => setItemSearchQuery(e.target.value)}
                placeholder="Search by Item name, SKU, Barcode, HSN..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-slate-50/50"
              />
            </div>

            {/* Category Filter */}
            <div className="flex items-center space-x-2">
              <label htmlFor="category-select" className="text-xs font-semibold text-slate-500 whitespace-nowrap">Category:</label>
              <select
                id="category-select"
                value={selectedCategoryFilter}
                onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white text-slate-700 focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">All Categories ({items.length})</option>
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Size Filter */}
            <div className="flex items-center space-x-2">
              <label htmlFor="size-select" className="text-xs font-semibold text-slate-500 whitespace-nowrap">Size:</label>
              <select
                id="size-select"
                value={selectedSizeFilter}
                onChange={(e) => setSelectedSizeFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white text-slate-700 focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">All Sizes</option>
                {SIZES.map((sz) => (
                  <option key={sz} value={sz}>
                    {sz}
                  </option>
                ))}
              </select>
            </div>

            {/* Action Buttons: Export & Add */}
            <div className="flex items-center space-x-2 ml-auto">
              <button
                id="export-items-btn"
                type="button"
                onClick={handleExportItemsCsv}
                className="inline-flex items-center px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors cursor-pointer"
              >
                <Download className="h-3.5 w-3.5 mr-1.5 text-slate-500" />
                Export CSV
              </button>

              <button
                id="add-new-item-btn"
                type="button"
                onClick={handleOpenAddItem}
                className="inline-flex items-center px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-all cursor-pointer"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                + New Garment Item
              </button>
            </div>
          </div>

          {/* Items Table */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">SKU / Barcode</th>
                    <th className="py-3 px-4">Garment Item Details</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Size & Color</th>
                    <th className="py-3 px-4">Nepal HSN</th>
                    <th className="py-3 px-4 text-right">Cost Price (NPR)</th>
                    <th className="py-3 px-4 text-right">Selling Price</th>
                    <th className="py-3 px-4 text-center">VAT</th>
                    <th className="py-3 px-4 text-center">Current Stock</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-slate-400">
                        No garment items found matching search criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item) => {
                      const currentStock = getItemStock(batches, item.id);
                      const isLowStock = currentStock < item.minStockAlert;
                      const margin =
                        item.sellingPrice > 0
                          ? Math.round(((item.sellingPrice - item.costPrice) / item.sellingPrice) * 100)
                          : 0;

                      return (
                        <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-mono font-bold text-indigo-700">{item.sku}</div>
                            <div className="font-mono text-[10px] text-slate-400">{item.barcode}</div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900">{item.name}</div>
                            <div className="text-[10px] text-slate-500">{item.fabric}</div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700">
                              {item.category}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-800">Size: {item.size}</div>
                            <div className="text-[10px] text-slate-500">{item.color}</div>
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                            {item.hsnCode}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-slate-600">
                            {formatNPR(item.costPrice)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="font-mono font-bold text-slate-900">
                              {formatNPR(item.sellingPrice)}
                            </div>
                            <div className="text-[10px] text-emerald-600 font-semibold">
                              {margin}% Margin
                            </div>
                          </td>
                          <td className="py-3 px-4 text-center">
                            {item.isVatApplicable ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                                13% Taxable
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600">
                                Exempt
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono font-bold ${
                                isLowStock
                                  ? 'bg-amber-100 text-amber-800 animate-pulse'
                                  : 'bg-emerald-50 text-emerald-700'
                              }`}
                            >
                              {currentStock} pcs
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end space-x-1">
                              <button
                                type="button"
                                onClick={() => handleOpenEditItem(item)}
                                title="Edit Item Details"
                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                              >
                                <Edit2 className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteItem(item.id, item.name)}
                                title="Delete Item"
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. BP MASTER DATA TAB VIEW */}
      {/* ========================================================================= */}
      {activeSubTab === 'bp_master' && (
        <div className="space-y-6">
          {/* Top Metric Cards: Total Receivables & Payables */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="text-xs font-semibold text-slate-500 uppercase">Total Business Partners</div>
              <div className="text-2xl font-black text-slate-900 mt-1">{partners.length}</div>
              <div className="text-xs text-slate-500 mt-0.5">
                {partners.filter((p) => p.type === 'customer').length} Customers |{' '}
                {partners.filter((p) => p.type === 'vendor').length} Vendors
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="text-xs font-semibold text-slate-500 uppercase" title="उधारो बिक्री">Total Receivables</div>
              <div className="text-2xl font-black text-indigo-600 mt-1">{formatNPR(totalReceivables)}</div>
              <div className="text-xs text-slate-500 mt-0.5">Debit balance from customer accounts</div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="text-xs font-semibold text-slate-500 uppercase" title="तिर्नुपर्ने दायित्व">Total Payables</div>
              <div className="text-2xl font-black text-rose-600 mt-1">{formatNPR(totalPayables)}</div>
              <div className="text-xs text-slate-500 mt-0.5">Credit balance to suppliers & garment mills</div>
            </div>
          </div>

          {/* Controls Bar: Search, Type Filter, Actions */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                id="bp-search-input"
                type="text"
                value={bpSearchQuery}
                onChange={(e) => setBpSearchQuery(e.target.value)}
                placeholder="Search by Partner name, Code, Nepal PAN, Phone..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-slate-50/50"
              />
            </div>

            {/* Type Filter */}
            <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => setBpTypeFilter('all')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                  bpTypeFilter === 'all' ? 'bg-white text-indigo-700 shadow-xs font-bold' : 'text-slate-600'
                }`}
              >
                All Partners
              </button>
              <button
                type="button"
                onClick={() => setBpTypeFilter('customer')}
                title="ग्राहक"
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                  bpTypeFilter === 'customer' ? 'bg-white text-indigo-700 shadow-xs font-bold' : 'text-slate-600'
                }`}
              >
                Customers
              </button>
              <button
                type="button"
                onClick={() => setBpTypeFilter('vendor')}
                title="आपूर्तिकर्ता"
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                  bpTypeFilter === 'vendor' ? 'bg-white text-indigo-700 shadow-xs font-bold' : 'text-slate-600'
                }`}
              >
                Vendors
              </button>
            </div>

            {/* Actions: Export CSV & Add BP */}
            <div className="flex items-center space-x-2 ml-auto">
              <button
                id="export-bp-btn"
                type="button"
                onClick={handleExportPartnersCsv}
                className="inline-flex items-center px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors cursor-pointer"
              >
                <Download className="h-3.5 w-3.5 mr-1.5 text-slate-500" />
                Export CSV
              </button>

              <button
                id="add-new-bp-btn"
                type="button"
                onClick={handleOpenAddBp}
                className="inline-flex items-center px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-all cursor-pointer"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                + New Business Partner
              </button>
            </div>
          </div>

          {/* Business Partners Table */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">Code</th>
                    <th className="py-3 px-4">Business Partner Name</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Nepal PAN / VAT No.</th>
                    <th className="py-3 px-4 text-center">VAT Applicable</th>
                    <th className="py-3 px-4">Contact Details</th>
                    <th className="py-3 px-4">Address</th>
                    <th className="py-3 px-4 text-right">Credit Limit</th>
                    <th className="py-3 px-4 text-right">Current Ledger Balance</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {filteredPartners.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-slate-400">
                        No business partners found matching search criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredPartners.map((partner) => (
                      <tr key={partner.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-indigo-700">
                          {partner.code}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{partner.name}</div>
                          <div className="text-[10px] text-slate-400">ID: {partner.id}</div>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              partner.type === 'customer'
                                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                : partner.type === 'vendor'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-purple-50 text-purple-700 border border-purple-200'
                            }`}
                          >
                            {partner.type}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                            {partner.panNumber}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {partner.isVatApplicable !== false ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="h-3 w-3" />
                              13% VAT
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              No VAT (0%)
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center text-slate-700">
                            <Phone className="h-3 w-3 mr-1 text-slate-400" />
                            <span>{partner.phone}</span>
                          </div>
                          {partner.email && (
                            <div className="flex items-center text-slate-500 text-[10px] mt-0.5">
                              <Mail className="h-3 w-3 mr-1 text-slate-400" />
                              <span className="truncate max-w-[150px]">{partner.email}</span>
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-600 truncate max-w-[180px]">
                          {partner.address}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-600">
                          {formatNPR(partner.creditLimit || 0)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div
                            className={`font-mono font-bold ${
                              partner.currentBalance > 0
                                ? 'text-indigo-600'
                                : partner.currentBalance < 0
                                ? 'text-rose-600'
                                : 'text-slate-500'
                            }`}
                          >
                            {formatNPR(Math.abs(partner.currentBalance))}
                          </div>
                          <div className="text-[10px] text-slate-400 font-medium">
                            {partner.currentBalance > 0
                              ? 'Receivable (Dr)'
                              : partner.currentBalance < 0
                              ? 'Payable (Cr)'
                              : 'Settled (Nil)'}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end space-x-1">
                            <button
                              type="button"
                              onClick={() => handleOpenEditBp(partner)}
                              title="Edit Business Partner"
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteBp(partner.id, partner.name)}
                              title="Delete Partner"
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
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

      {/* ========================================================================= */}
      {/* MODAL: ADD / EDIT GARMENT ITEM */}
      {/* ========================================================================= */}
      {showAddItemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Package className="h-5 w-5 text-indigo-600" />
                <h3 className="font-bold text-sm text-slate-900">
                  {editingItem ? 'Edit Item Master Data' : 'Add New Readymade Garment to Item Master'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddItemModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="p-6 space-y-4 text-xs">
              {itemFormError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  <span>{itemFormError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Item SKU Code <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={itemFormData.sku || ''}
                    onChange={(e) => setItemFormData({ ...itemFormData, sku: e.target.value })}
                    placeholder="e.g. SKU-SHIRT-001"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Barcode / EAN-13</label>
                  <input
                    type="text"
                    value={itemFormData.barcode || ''}
                    onChange={(e) => setItemFormData({ ...itemFormData, barcode: e.target.value })}
                    placeholder="e.g. 8901234567890"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">
                    Garment Name & Title <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={itemFormData.name || ''}
                    onChange={(e) => setItemFormData({ ...itemFormData, name: e.target.value })}
                    placeholder="e.g. Premium Cotton Slim Fit Shirt - Navy Blue"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Garment Category</label>
                  <select
                    value={itemFormData.category}
                    onChange={(e) => setItemFormData({ ...itemFormData, category: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Garment Size</label>
                  <select
                    value={itemFormData.size}
                    onChange={(e) => setItemFormData({ ...itemFormData, size: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500"
                  >
                    {SIZES.map((sz) => (
                      <option key={sz} value={sz}>
                        {sz}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Color / Pattern</label>
                  <input
                    type="text"
                    value={itemFormData.color || ''}
                    onChange={(e) => setItemFormData({ ...itemFormData, color: e.target.value })}
                    placeholder="e.g. Navy Blue, Maroon Check"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Fabric & Material</label>
                  <input
                    type="text"
                    value={itemFormData.fabric || ''}
                    onChange={(e) => setItemFormData({ ...itemFormData, fabric: e.target.value })}
                    placeholder="e.g. 100% Giza Cotton, Linen"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nepal HSN Code <span className="text-slate-400 font-normal">(Tariff Classification)</span>
                  </label>
                  <input
                    type="text"
                    value={itemFormData.hsnCode || ''}
                    onChange={(e) => setItemFormData({ ...itemFormData, hsnCode: e.target.value })}
                    placeholder="e.g. 6205.20.00"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Min Stock Alert (Pcs)</label>
                  <input
                    type="number"
                    min="0"
                    value={itemFormData.minStockAlert ?? 10}
                    onChange={(e) => setItemFormData({ ...itemFormData, minStockAlert: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Cost Price (NPR) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    required
                    value={itemFormData.costPrice ?? 0}
                    onChange={(e) => setItemFormData({ ...itemFormData, costPrice: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Retail Selling Price (NPR) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    required
                    value={itemFormData.sellingPrice ?? 0}
                    onChange={(e) => setItemFormData({ ...itemFormData, sellingPrice: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="sm:col-span-2 pt-2">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={itemFormData.isVatApplicable ?? true}
                      onChange={(e) => setItemFormData({ ...itemFormData, isVatApplicable: e.target.checked })}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                    />
                    <span className="font-semibold text-slate-800" title="नेपाल मूल्य अभिवृद्धि कर ऐन २०५२ बमोजिम">
                      Standard 13% VAT Applicable
                    </span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddItemModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 shadow-sm cursor-pointer"
                >
                  {editingItem ? 'Save Changes' : 'Add Item to Master'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD / EDIT BUSINESS PARTNER */}
      {/* ========================================================================= */}
      {showAddBpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Users className="h-5 w-5 text-indigo-600" />
                <h3 className="font-bold text-sm text-slate-900">
                  {editingPartner ? 'Edit Business Partner Profile' : 'Register New Business Partner (Customer / Vendor)'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddBpModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveBp} className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Partner Code</label>
                  <input
                    type="text"
                    value={bpFormData.code || ''}
                    onChange={(e) => setBpFormData({ ...bpFormData, code: e.target.value })}
                    placeholder="e.g. CUS-009"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Relationship Type</label>
                  <select
                    value={bpFormData.type}
                    onChange={(e) => setBpFormData({ ...bpFormData, type: e.target.value as PartnerType })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="customer">Customer</option>
                    <option value="vendor">Vendor / Supplier</option>
                    <option value="both">Both (Customer & Vendor)</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">
                    Legal Business / Person Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={bpFormData.name || ''}
                    onChange={(e) => setBpFormData({ ...bpFormData, name: e.target.value })}
                    placeholder="e.g. Everest Garment Emporium Pvt. Ltd."
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nepal 9-Digit PAN Number
                  </label>
                  <input
                    type="text"
                    maxLength={9}
                    value={bpFormData.panNumber || ''}
                    onChange={(e) => handleBpPanChange(e.target.value)}
                    placeholder="e.g. 601928374"
                    className={`w-full px-3 py-2 rounded-lg border font-mono text-sm tracking-wider focus:ring-2 ${
                      panValidationError
                        ? 'border-rose-300 focus:ring-rose-500 bg-rose-50/50'
                        : 'border-slate-200 focus:ring-indigo-500'
                    }`}
                  />
                  {panValidationError && (
                    <div className="text-[11px] text-rose-600 mt-1 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      <span>{panValidationError}</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Phone / Mobile</label>
                  <input
                    type="text"
                    value={bpFormData.phone || ''}
                    onChange={(e) => setBpFormData({ ...bpFormData, phone: e.target.value })}
                    placeholder="e.g. 9851098765"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={bpFormData.email || ''}
                    onChange={(e) => setBpFormData({ ...bpFormData, email: e.target.value })}
                    placeholder="info@partner.com.np"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Billing / Delivery Address</label>
                  <input
                    type="text"
                    value={bpFormData.address || ''}
                    onChange={(e) => setBpFormData({ ...bpFormData, address: e.target.value })}
                    placeholder="e.g. New Road Ward 22, Kathmandu"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Credit Limit (NPR)</label>
                  <input
                    type="number"
                    min="0"
                    step="5000"
                    value={bpFormData.creditLimit ?? 100000}
                    onChange={(e) => setBpFormData({ ...bpFormData, creditLimit: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Applicable of VAT in BP master data */}
                <div className="sm:col-span-2 p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bpFormData.isVatApplicable ?? true}
                      onChange={(e) => setBpFormData({ ...bpFormData, isVatApplicable: e.target.checked })}
                      className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-xs" title="मूल्य अभिवृद्धि कर लागु हुने">
                          Applicable of VAT
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          (bpFormData.isVatApplicable ?? true)
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {(bpFormData.isVatApplicable ?? true) ? 'Enabled (13% Standard Rate)' : 'Disabled (0% / No VAT)'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                        {(bpFormData.isVatApplicable ?? true)
                          ? 'When enabled, VAT will be calculated as per Nepal standard rate (13%) on all sales invoices and purchase bills involving this partner.'
                          : 'When disabled, VAT will NOT be calculated (0% VAT / VAT-exempt) in transactions involving this partner.'}
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddBpModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 shadow-sm cursor-pointer"
                >
                  {editingPartner ? 'Update Partner' : 'Register Partner'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
