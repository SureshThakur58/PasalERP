import React, { useState } from 'react';
import {
  CompanySettings,
  FIFOBatch,
  GarmentItem,
  StockTransfer,
  Warehouse
} from '../types';
import { getItemStock, getInventoryValuation } from '../utils/accountingEngine';
import { getLowStockItems, sortFifoBatches, validateBatchIntegrity, validateStockTransfer } from '../utils/inventory';
import { validateItem } from '../utils/validation';
import { formatNPR, getCurrentAdDate, getCurrentBsDate } from '../utils/nepalIrdUtils';
import { createBarcode, createEntityId } from '../utils/ids';
import type { CreateTransferRequest } from '../api/repository';
import {
  Package,
  Layers,
  ArrowRightLeft,
  Plus,
  Search,
  Building2,
  AlertTriangle,
  CheckCircle2,
  Tag,
  ShieldCheck
} from 'lucide-react';

interface InventoryModuleProps {
  items: GarmentItem[];
  warehouses: Warehouse[];
  batches: FIFOBatch[];
  settings: CompanySettings;
  onUpdateItems: (items: GarmentItem[]) => void;
  onRecordTransfer: (input: CreateTransferRequest) => Promise<StockTransfer>;
  transferHistory?: StockTransfer[];
  initialSubTab?: 'stock_overview' | 'fifo_batches' | 'transfer' | 'item_master';
}

export const InventoryModule: React.FC<InventoryModuleProps> = ({
  items,
  warehouses,
  batches,
  settings,
  onUpdateItems,
  onRecordTransfer,
  transferHistory = [],
  initialSubTab = 'stock_overview',
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'stock_overview' | 'fifo_batches' | 'transfer' | 'item_master'>(initialSubTab);

  React.useEffect(() => {
    if (initialSubTab) {
      setActiveSubTab(initialSubTab);
    }
  }, [initialSubTab]);
  const [selectedWarehouseFilter, setSelectedWarehouseFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Stock Transfer Modal/Form State
  const [sourceWhId, setSourceWhId] = useState<string>(warehouses[1]?.id || warehouses[0]?.id || '');
  const [targetWhId, setTargetWhId] = useState<string>(warehouses[0]?.id || '');
  const [transferItemId, setTransferItemId] = useState<string>(items[0]?.id || '');
  const [transferQty, setTransferQty] = useState<number>(10);
  const [transferRemarks, setTransferRemarks] = useState<string>('');
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferSuccess, setTransferSuccess] = useState<string | null>(null);

  // New Item Master State
  const [showAddItemModal, setShowAddItemModal] = useState<boolean>(false);
  const [newItem, setNewItem] = useState<Partial<GarmentItem>>({
    sku: '',
    barcode: '',
    name: '',
    category: 'Formal Shirts',
    size: 'L',
    color: 'Navy Blue',
    fabric: '100% Cotton',
    hsnCode: '6205.20.00',
    costPrice: 1000,
    sellingPrice: 1800,
    minStockAlert: 10,
    isVatApplicable: true,
  });

  // Calculate Overall Metrics
  const totalUnits = batches
    .filter((b) => selectedWarehouseFilter === 'all' || b.warehouseId === selectedWarehouseFilter)
    .reduce((sum, b) => sum + b.remainingQty, 0);

  const totalFifoValuation = getInventoryValuation(
    batches,
    undefined,
    selectedWarehouseFilter === 'all' ? undefined : selectedWarehouseFilter
  );

  const filteredWarehouseId = selectedWarehouseFilter === 'all' ? undefined : selectedWarehouseFilter;
  const lowStockItems = getLowStockItems(items, batches, filteredWarehouseId);
  const lowStockCount = lowStockItems.length;

  const batchIntegrity = validateBatchIntegrity(batches);

  // Handle Stock Transfer Submit. B3 delegates the authoritative FIFO mutation
  // to the backend SQL transaction; the frontend only validates the draft and
  // refreshes the server snapshot after the API succeeds.
  const handleExecuteTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setTransferError(null);
    if (!Number.isInteger(transferQty) || transferQty <= 0) {
      setTransferError('Transfer quantity must be a whole number greater than zero.');
      return;
    }

    const item = items.find((i) => i.id === transferItemId);
    const srcWh = warehouses.find((w) => w.id === sourceWhId);
    const tgtWh = warehouses.find((w) => w.id === targetWhId);
    if (!item || !srcWh || !tgtWh) {
      setTransferError('Please select a valid source warehouse, destination warehouse, and item.');
      return;
    }

    const validation = validateStockTransfer(
      {
        sourceWarehouseId: sourceWhId,
        targetWarehouseId: targetWhId,
        items: [{ itemId: item.id, sku: item.sku, name: item.name, quantity: transferQty, unitCost: item.costPrice }],
      },
      batches,
    );
    if (!validation.isValid) {
      setTransferError(validation.message || 'Transfer validation failed.');
      return;
    }

    try {
      const savedTransfer = await onRecordTransfer({
        fiscalYear: settings.fiscalYear,
        mitiDate: getCurrentBsDate(),
        adDate: getCurrentAdDate(),
        sourceWarehouseId: srcWh.id,
        targetWarehouseId: tgtWh.id,
        items: [{ itemId: item.id, quantity: transferQty }],
        remarks: transferRemarks || 'Internal inventory reallocation',
      });

      setTransferSuccess(
        `Successfully transferred ${transferQty} units of ${item.name} to ${tgtWh.name}. FIFO cost layers preserved at ${formatNPR(savedTransfer.totalValue)} (${savedTransfer.transferNo}).`,
      );
      setTransferError(null);
      setTimeout(() => setTransferSuccess(null), 5000);
    } catch (error) {
      setTransferError(error instanceof Error ? error.message : 'Backend stock transfer failed.');
      setTransferSuccess(null);
    }
  };

  // Handle Create New Item
  const handleCreateItem = (e: React.FormEvent) => {
    e.preventDefault();
    const itemValidation = validateItem(
      {
        name: newItem.name || '',
        sku: newItem.sku || '',
        costPrice: Number(newItem.costPrice) || 0,
        sellingPrice: Number(newItem.sellingPrice) || 0,
        minStockAlert: Number(newItem.minStockAlert) || 0,
        hsnCode: newItem.hsnCode || '',
      },
      items,
    );
    if (!itemValidation.isValid) {
      alert(itemValidation.message);
      return;
    }

    const created: GarmentItem = {
      id: createEntityId('item'),
      sku: newItem.sku.toUpperCase(),
      barcode: newItem.barcode || createBarcode(),
      name: newItem.name,
      category: newItem.category as GarmentItem['category'],
      size: newItem.size as GarmentItem['size'],
      color: newItem.color || 'Standard',
      fabric: newItem.fabric || 'Cotton',
      hsnCode: newItem.hsnCode || '6205.20.00',
      costPrice: Number(newItem.costPrice) || 500,
      sellingPrice: Number(newItem.sellingPrice) || 1000,
      minStockAlert: Number(newItem.minStockAlert) || 10,
      isVatApplicable: !!newItem.isVatApplicable,
    };

    onUpdateItems([...items, created]);
    setShowAddItemModal(false);
  };

  return (
    <div className="space-y-6">
      {/* Module Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            Multi-Warehouse Inventory & FIFO Valuation
          </h2>
          <p className="text-xs text-slate-500">
            Real-time multi-location warehouse balances, transparent FIFO batch cost layers, and stock transfer movements.
          </p>
        </div>

        {/* Warehouse Filter */}
        <div className="flex items-center space-x-2">
          <span className="text-xs font-medium text-slate-600">Location:</span>
          <select
            id="inventory-warehouse-filter"
            value={selectedWarehouseFilter}
            onChange={(e) => setSelectedWarehouseFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-800 focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600 bg-white"
          >
            <option value="all">All Warehouses</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Total Stock on Hand</span>
            <Package className="h-4 w-4 text-indigo-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{totalUnits.toLocaleString()}</div>
          <span className="text-[11px] text-slate-400">Readymade Garment Units</span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">FIFO Inventory Asset Value</span>
            <ShieldCheck className="h-4 w-4 text-indigo-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-indigo-700 font-mono">
            {formatNPR(totalFifoValuation)}
          </div>
          <span className="text-[11px] text-slate-400">Debited to General Ledger 1030</span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Active FIFO Batches</span>
            <Layers className="h-4 w-4 text-indigo-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">
            {batches.filter((b) => b.remainingQty > 0).length}
          </div>
          <span className="text-[11px] text-slate-400">Distinct Cost Lots</span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Low Stock Reorders</span>
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          </div>
          <div className={`mt-2 text-2xl font-bold ${lowStockCount > 0 ? 'text-amber-700' : 'text-slate-900'}`}>
            {lowStockCount}
          </div>
          <span className="text-[11px] text-slate-400">Below Reorder Threshold</span>
        </div>
      </div>

      {!batchIntegrity.isValid && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <strong>Inventory data integrity warning:</strong> {batchIntegrity.message}
        </div>
      )}

      {/* Sub Tabs */}
      <div className="flex space-x-2 border-b border-slate-200 pb-2">
        <button
          id="tab-stock-overview"
          onClick={() => setActiveSubTab('stock_overview')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            activeSubTab === 'stock_overview'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          Stock by Garment Item
        </button>
        <button
          id="tab-fifo-batches"
          onClick={() => setActiveSubTab('fifo_batches')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center ${
            activeSubTab === 'fifo_batches'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <Layers className="h-3.5 w-3.5 mr-1" />
          FIFO Cost Batches Inspector
        </button>
        <button
          id="tab-stock-transfer"
          onClick={() => setActiveSubTab('transfer')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center ${
            activeSubTab === 'transfer'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <ArrowRightLeft className="h-3.5 w-3.5 mr-1" />
          Stock Transfer
        </button>
        <button
          id="tab-item-master"
          onClick={() => setActiveSubTab('item_master')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center ${
            activeSubTab === 'item_master'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <Tag className="h-3.5 w-3.5 mr-1" />
          Garment Master Data ({items.length})
        </button>
      </div>

      {/* Subtab 1: Stock by Item */}
      {activeSubTab === 'stock_overview' && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50">
            <div className="relative w-72">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search garment SKU, name, or size..."
                className="w-full rounded-lg border border-slate-300 pl-8 pr-2.5 py-1.5 text-xs text-slate-800 focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600"
              />
            </div>
            <div className="text-xs text-slate-500">
              Showing <span className="font-bold text-slate-800">{items.length}</span> Garment Types
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100 text-slate-700 font-semibold">
                  <th className="py-2.5 px-3">Garment Item</th>
                  <th className="py-2.5 px-3">SKU & HSN Code</th>
                  <th className="py-2.5 px-3 text-center">Size & Color</th>
                  {warehouses.map((w) => (
                    <th key={w.id} className="py-2.5 px-3 text-center">
                      {w.code}
                    </th>
                  ))}
                  <th className="py-2.5 px-3 text-center font-bold">Total Stock</th>
                  <th className="py-2.5 px-3 text-right">Selling Price</th>
                  <th className="py-2.5 px-3 text-right">FIFO Asset Value</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {items
                  .filter(
                    (i) =>
                      i.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      i.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      i.size.toLowerCase().includes(searchQuery.toLowerCase())
                  )
                  .map((item) => {
                    const totalQty = getItemStock(batches, item.id, filteredWarehouseId);
                    const itemValuation = getInventoryValuation(
                      batches,
                      item.id,
                      selectedWarehouseFilter === 'all' ? undefined : selectedWarehouseFilter
                    );
                    const isLow = totalQty < item.minStockAlert;

                    return (
                      <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-900">{item.name}</div>
                          <div className="text-[10px] text-slate-500">{item.category}</div>
                        </td>
                        <td className="py-2.5 px-3 font-mono">
                          <span className="font-bold text-slate-800">{item.sku}</span>
                          <span className="block text-[10px] text-slate-500">HSN: {item.hsnCode}</span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-[11px] font-bold text-slate-800">
                            {item.size}
                          </span>
                          <span className="block text-[10px] text-slate-500">{item.color}</span>
                        </td>
                        {warehouses.map((w) => {
                          const wStock = getItemStock(batches, item.id, w.id);
                          return (
                            <td key={w.id} className="py-2.5 px-3 text-center font-mono font-medium">
                              <span
                                className={`px-1.5 py-0.5 rounded ${
                                  wStock === 0 ? 'text-slate-300' : 'text-slate-800 bg-slate-50'
                                }`}
                              >
                                {wStock}
                              </span>
                            </td>
                          );
                        })}
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-900 text-sm">
                          {totalQty}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-medium text-slate-800">
                          {formatNPR(item.sellingPrice)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-indigo-700">
                          {formatNPR(itemValuation)}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {isLow ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                              Low Stock ({item.minStockAlert})
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700">
                              In Stock
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subtab 2: FIFO Batches Inspector */}
      {activeSubTab === 'fifo_batches' && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Active FIFO Valuation Lots
              </h3>
              <p className="text-[11px] text-slate-500">
                Every purchase and transfer creates distinct cost lots. Sales automatically drain the oldest lots first.
              </p>
            </div>
            <span className="text-xs font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded border border-indigo-200">
              Total FIFO Asset Value: {formatNPR(totalFifoValuation)}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100 text-slate-700 font-semibold">
                  <th className="py-2.5 px-3">Batch ID</th>
                  <th className="py-2.5 px-3">Garment Item</th>
                  <th className="py-2.5 px-3">Warehouse Location</th>
                  <th className="py-2.5 px-3">Inward Date (Miti)</th>
                  <th className="py-2.5 px-3">Purchase Reference</th>
                  <th className="py-2.5 px-3 text-center">Original Qty</th>
                  <th className="py-2.5 px-3 text-center font-bold">Remaining Qty</th>
                  <th className="py-2.5 px-3 text-right">Unit Cost (FIFO)</th>
                  <th className="py-2.5 px-3 text-right">Lot Value (NPR)</th>
                  <th className="py-2.5 px-3 text-center">Priority</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sortFifoBatches(
                  batches.filter((b) => selectedWarehouseFilter === 'all' || b.warehouseId === selectedWarehouseFilter),
                ).map((batch, idx) => {
                    const item = items.find((i) => i.id === batch.itemId);
                    const warehouse = warehouses.find((w) => w.id === batch.warehouseId);
                    const lotValue = batch.remainingQty * batch.unitCost;
                    const isExhausted = batch.remainingQty === 0;

                    return (
                      <tr
                        key={batch.id}
                        className={`hover:bg-slate-50 transition-colors ${
                          isExhausted ? 'opacity-40 bg-slate-50/60' : ''
                        }`}
                      >
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">{batch.id}</td>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-900">{item?.name || 'Garment'}</div>
                          <div className="font-mono text-[10px] text-slate-500">
                            {item?.sku} ({item?.size})
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 font-medium">{warehouse?.name}</td>
                        <td className="py-2.5 px-3 text-slate-600 font-mono">{batch.purchaseDate}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-700">{batch.purchaseBillNo}</td>
                        <td className="py-2.5 px-3 text-center font-mono">{batch.originalQty}</td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-950">
                          {batch.remainingQty}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-medium text-slate-800">
                          {formatNPR(batch.unitCost)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-indigo-700">
                          {formatNPR(lotValue)}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {isExhausted ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-200 text-slate-600">
                              Depleted
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                              FIFO Tier #{idx + 1}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subtab 3: Stock Transfer */}
      {activeSubTab === 'transfer' && (
        <div className="max-w-2xl mx-auto rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center border-b border-slate-100 pb-3 mb-4">
            <ArrowRightLeft className="h-4 w-4 mr-2 text-indigo-600" />
            Inter-Warehouse Stock Transfer
          </h3>

          {transferError && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700 flex items-center space-x-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
              <span>{transferError}</span>
            </div>
          )}

          {transferSuccess && (
            <div className="mb-4 rounded-lg bg-indigo-50 border border-indigo-200 p-3 text-xs text-indigo-900 flex items-center space-x-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-indigo-600" />
              <span>{transferSuccess}</span>
            </div>
          )}

          <form onSubmit={handleExecuteTransfer} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-medium text-slate-700 mb-1" title="Source warehouse to dispatch items from">
                  Source Warehouse *
                </label>
                <select
                  value={sourceWhId}
                  onChange={(e) => setSourceWhId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600 bg-white"
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1" title="Destination warehouse to receive items">
                  Destination Warehouse *
                </label>
                <select
                  value={targetWhId}
                  onChange={(e) => setTargetWhId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600 bg-white"
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Garment Item *</label>
                <select
                  value={transferItemId}
                  onChange={(e) => setTransferItemId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600 bg-white"
                >
                  {items.map((i) => {
                    const avail = getItemStock(batches, i.id, sourceWhId);
                    return (
                      <option key={i.id} value={i.id}>
                        {i.name} ({i.sku} - {i.size}) [Avail: {avail}]
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1" title="Units to transfer between warehouses">
                  Transfer Quantity *
                </label>
                <input
                  type="number"
                  min="1"
                  value={transferQty}
                  onChange={(e) => setTransferQty(parseInt(e.target.value) || 1)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600"
                />
              </div>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">Remarks / Note</label>
              <input
                type="text"
                value={transferRemarks}
                onChange={(e) => setTransferRemarks(e.target.value)}
                placeholder="e.g. Replenish showroom stock from central godown"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600"
              />
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 text-[11px] leading-relaxed">
              <strong>FIFO Cost Guarantee:</strong> When stock is transferred between warehouses, the FIFO
              valuation algorithm depletes the earliest inward batches in the source warehouse and establishes
              corresponding batch layers with original acquisition cost in the target warehouse.
            </div>

            <button
              id="execute-stock-transfer-btn"
              type="submit"
              className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm transition-colors cursor-pointer"
            >
              Confirm & Transfer Inventory
            </button>
          </form>

          {transferHistory.length > 0 && (
            <div className="mt-6 border-t border-slate-200 pt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">Recent Transfer History</h4>
                <span className="text-[10px] text-slate-500">{transferHistory.length} transfer(s)</span>
              </div>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-100 text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Transfer No.</th>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Route</th>
                      <th className="px-3 py-2 text-center">Qty</th>
                      <th className="px-3 py-2 text-right">FIFO Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {[...transferHistory].reverse().slice(0, 10).map((transfer) => (
                      <tr key={transfer.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-mono font-semibold text-slate-800">{transfer.transferNo}</td>
                        <td className="px-3 py-2 font-mono text-slate-600">{transfer.adDate}</td>
                        <td className="px-3 py-2 text-slate-700">{transfer.sourceWarehouseName} → {transfer.targetWarehouseName}</td>
                        <td className="px-3 py-2 text-center font-mono">{transfer.items.reduce((sum, line) => sum + line.quantity, 0)}</td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-indigo-700">{formatNPR(transfer.totalValue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Subtab 4: Garment Master Data */}
      {activeSubTab === 'item_master' && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Garment Item Master Data
              </h3>
              <p className="text-[11px] text-slate-500">
                Manage readymade apparel catalogue, Nepal HSN tariff codes, retail prices, and standard 13% VAT setup.
              </p>
            </div>
            <button
              id="open-add-item-modal-btn"
              onClick={() => setShowAddItemModal(true)}
              className="inline-flex items-center px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-sm transition-colors cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Garment SKU
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100 text-slate-700 font-semibold">
                  <th className="py-2.5 px-3">SKU & Barcode</th>
                  <th className="py-2.5 px-3">Garment Name</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3 text-center">Size</th>
                  <th className="py-2.5 px-3">Color & Fabric</th>
                  <th className="py-2.5 px-3 font-mono">Nepal HSN Code</th>
                  <th className="py-2.5 px-3 text-right">Standard Cost</th>
                  <th className="py-2.5 px-3 text-right">Selling Price</th>
                  <th className="py-2.5 px-3 text-center">VAT Status</th>
                  <th className="py-2.5 px-3 text-center">Reorder Alert</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 px-3 font-mono">
                      <span className="font-bold text-slate-900">{item.sku}</span>
                      <span className="block text-[10px] text-slate-400">{item.barcode}</span>
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-900">{item.name}</td>
                    <td className="py-2.5 px-3 text-slate-600">{item.category}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="px-2 py-0.5 rounded bg-slate-100 font-bold text-slate-800">
                        {item.size}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="text-slate-900">{item.color}</span>
                      <span className="block text-[10px] text-slate-500">{item.fabric}</span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-700">{item.hsnCode}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                      {formatNPR(item.costPrice)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                      {formatNPR(item.sellingPrice)}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {item.isVatApplicable ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                          13% Taxable
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                          Exempt
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono">{item.minStockAlert} units</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add New Item Modal */}
      {showAddItemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-200 pb-2 mb-4">
              Add Readymade Clothes Master Item
            </h3>
            <form onSubmit={handleCreateItem} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">SKU Code *</label>
                  <input
                    type="text"
                    required
                    value={newItem.sku}
                    onChange={(e) => setNewItem({ ...newItem, sku: e.target.value })}
                    placeholder="e.g. SHT-BLK-40"
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs uppercase focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Garment Name *</label>
                  <input
                    type="text"
                    required
                    value={newItem.name}
                    onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                    placeholder="e.g. Cotton Formal Shirt"
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Category</label>
                  <select
                    value={newItem.category}
                    onChange={(e) => setNewItem({ ...newItem, category: e.target.value as any })}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs bg-white focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600"
                  >
                    <option value="Formal Shirts">Formal Shirts</option>
                    <option value="Casual Shirts">Casual Shirts</option>
                    <option value="Trousers & Chinos">Trousers & Chinos</option>
                    <option value="Kurtha & Ethnic">Kurtha & Ethnic</option>
                    <option value="T-Shirts & Polos">T-Shirts & Polos</option>
                    <option value="Jackets & Outerwear">Jackets & Outerwear</option>
                    <option value="Jeans & Denim">Jeans & Denim</option>
                    <option value="Kidswear">Kidswear</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Size</label>
                  <select
                    value={newItem.size}
                    onChange={(e) => setNewItem({ ...newItem, size: e.target.value as any })}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs bg-white focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600"
                  >
                    <option value="XS">XS</option>
                    <option value="S">S</option>
                    <option value="M">M</option>
                    <option value="L">L</option>
                    <option value="XL">XL</option>
                    <option value="XXL">XXL</option>
                    <option value="Free Size">Free Size</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Color</label>
                  <input
                    type="text"
                    value={newItem.color}
                    onChange={(e) => setNewItem({ ...newItem, color: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Nepal HSN Code</label>
                  <input
                    type="text"
                    value={newItem.hsnCode}
                    onChange={(e) => setNewItem({ ...newItem, hsnCode: e.target.value })}
                    placeholder="e.g. 6205.20.00"
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs font-mono focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Fabric / Material</label>
                  <input
                    type="text"
                    value={newItem.fabric}
                    onChange={(e) => setNewItem({ ...newItem, fabric: e.target.value })}
                    placeholder="e.g. 100% Giza Cotton"
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Cost Price (NPR)</label>
                  <input
                    type="number"
                    min="0"
                    value={newItem.costPrice}
                    onChange={(e) => setNewItem({ ...newItem, costPrice: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs font-mono focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Selling Price (NPR)</label>
                  <input
                    type="number"
                    min="0"
                    value={newItem.sellingPrice}
                    onChange={(e) => setNewItem({ ...newItem, sellingPrice: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs font-mono focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Min Reorder Alert</label>
                  <input
                    type="number"
                    min="1"
                    value={newItem.minStockAlert}
                    onChange={(e) => setNewItem({ ...newItem, minStockAlert: parseInt(e.target.value) || 5 })}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs font-mono focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="vat-check"
                  checked={newItem.isVatApplicable}
                  onChange={(e) => setNewItem({ ...newItem, isVatApplicable: e.target.checked })}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="vat-check" className="font-semibold text-slate-800" title="Check if item is subject to Nepal standard 13% Value Added Tax">
                  Subject to standard Nepal 13% VAT
                </label>
              </div>

              <div className="pt-4 flex justify-end space-x-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddItemModal(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-sm"
                >
                  Save Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
