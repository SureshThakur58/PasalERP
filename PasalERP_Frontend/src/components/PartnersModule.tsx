import React, { useState } from 'react';
import { BusinessPartner, PartnerType } from '../types';
import { formatNPR, validateNepalPan } from '../utils/nepalIrdUtils';
import { createEntityId } from '../utils/ids';
import {
  Users,
  UserCheck,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  Building2,
  Phone,
  Mail,
  MapPin
} from 'lucide-react';

interface PartnersModuleProps {
  partners: BusinessPartner[];
  onAddPartner: (partner: BusinessPartner) => void;
}

export const PartnersModule: React.FC<PartnersModuleProps> = ({
  partners,
  onAddPartner,
}) => {
  const [partnerFilter, setPartnerFilter] = useState<'all' | 'customer' | 'vendor'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showAddModal, setShowAddModal] = useState<boolean>(false);

  // New partner state
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<PartnerType>('customer');
  const [newPan, setNewPan] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newCreditLimit, setNewCreditLimit] = useState<number>(100000);
  const [panValidationError, setPanValidationError] = useState<string | null>(null);

  const handlePanChange = (panVal: string) => {
    setNewPan(panVal);
    if (panVal.trim().length > 0) {
      const validation = validateNepalPan(panVal);
      if (!validation.isValid) {
        setPanValidationError(validation.message);
      } else {
        setPanValidationError(null);
      }
    } else {
      setPanValidationError(null);
    }
  };

  const handleCreatePartner = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      alert('Business partner name is required');
      return;
    }

    if (newPan.trim()) {
      const validation = validateNepalPan(newPan);
      if (!validation.isValid) {
        setPanValidationError(validation.message);
        return;
      }
    }

    const codePrefix = newType === 'vendor' ? 'VEN' : 'CUS';
    const partnerCode = `${codePrefix}-${String(partners.length + 1).padStart(3, '0')}`;

    const created: BusinessPartner = {
      id: createEntityId('bp'),
      code: partnerCode,
      name: newName.trim(),
      type: newType,
      panNumber: newPan.trim() || '999999999',
      phone: newPhone.trim() || 'N/A',
      email: newEmail.trim() || '',
      address: newAddress.trim() || 'Kathmandu, Nepal',
      currentBalance: 0,
      creditLimit: newCreditLimit,
    };

    onAddPartner(created);
    setShowAddModal(false);

    // Reset
    setNewName('');
    setNewPan('');
    setNewPhone('');
    setNewEmail('');
    setNewAddress('');
    setPanValidationError(null);
  };

  const filteredPartners = partners.filter((p) => {
    const matchesType =
      partnerFilter === 'all' || p.type === partnerFilter || p.type === 'both';
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.panNumber.includes(searchQuery) ||
      p.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.address.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  const totalReceivable = partners
    .filter((p) => p.currentBalance > 0)
    .reduce((sum, p) => sum + p.currentBalance, 0);

  const totalPayable = partners
    .filter((p) => p.currentBalance < 0)
    .reduce((sum, p) => sum + Math.abs(p.currentBalance), 0);

  return (
    <div className="space-y-6">
      {/* Module Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900" title="ग्राहक तथा आपूर्तिकर्ता">
            Business Partner Master Data
          </h2>
          <p className="text-xs text-slate-500">
            Manage Customers and Garment Vendors with Inland Revenue Department (IRD) 9-digit PAN validation and account ledgers.
          </p>
        </div>

        <button
          id="open-add-partner-btn"
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-sm transition-colors cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add Business Partner
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Total Business Partners</span>
            <Users className="h-4 w-4 text-indigo-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{partners.length}</div>
          <span className="text-[11px] text-slate-400">
            {partners.filter((p) => p.type === 'customer' || p.type === 'both').length} Customers |{' '}
            {partners.filter((p) => p.type === 'vendor' || p.type === 'both').length} Vendors
          </span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500" title="उठ्न बाँकी">Total Receivables</span>
            <UserCheck className="h-4 w-4 text-indigo-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-indigo-700 font-mono">
            {formatNPR(totalReceivable)}
          </div>
          <span className="text-[11px] text-slate-400">Customer Account Debits</span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500" title="तिर्न बाँकी">Total Payables</span>
            <Building2 className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-800 font-mono">
            {formatNPR(totalPayable)}
          </div>
          <span className="text-[11px] text-slate-400">Vendor Account Credits</span>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex space-x-1">
            <button
              onClick={() => setPartnerFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                partnerFilter === 'all'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              All Partners ({partners.length})
            </button>
            <button
              onClick={() => setPartnerFilter('customer')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                partnerFilter === 'customer'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              Customers Only
            </button>
            <button
              onClick={() => setPartnerFilter('vendor')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                partnerFilter === 'vendor'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              Vendors Only
            </button>
          </div>

          <div className="relative w-72">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Name, PAN, Code or City..."
              className="w-full rounded-lg border border-slate-300 pl-8 pr-2.5 py-1.5 text-xs text-slate-800 focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600"
            />
          </div>
        </div>

        {/* Partners Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100 text-slate-700 font-semibold">
                <th className="py-2.5 px-3">Partner Code</th>
                <th className="py-2.5 px-3">Business Name</th>
                <th className="py-2.5 px-3 text-center">Type</th>
                <th className="py-2.5 px-3 font-mono">Nepal IRD PAN</th>
                <th className="py-2.5 px-3">Contact & Phone</th>
                <th className="py-2.5 px-3">Location Address</th>
                <th className="py-2.5 px-3 text-right">Current Balance</th>
                <th className="py-2.5 px-3 text-center">PAN Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredPartners.map((p) => {
                const isPanValid = validateNepalPan(p.panNumber).isValid;
                const isReceivable = p.currentBalance > 0;
                const isPayable = p.currentBalance < 0;

                return (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-800">{p.code}</td>
                    <td className="py-2.5 px-3 font-semibold text-slate-900">{p.name}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          p.type === 'customer'
                            ? 'bg-blue-100 text-blue-800'
                            : p.type === 'vendor'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-indigo-100 text-indigo-800'
                        }`}
                      >
                        {p.type}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-800">{p.panNumber}</td>
                    <td className="py-2.5 px-3 text-slate-600">
                      <div className="flex items-center">
                        <Phone className="h-3 w-3 mr-1 text-slate-400" />
                        <span>{p.phone}</span>
                      </div>
                      {p.email && (
                        <div className="flex items-center text-[10px] text-slate-400 mt-0.5">
                          <Mail className="h-3 w-3 mr-1" />
                          <span>{p.email}</span>
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">
                      <div className="flex items-center">
                        <MapPin className="h-3 w-3 mr-1 text-slate-400 shrink-0" />
                        <span className="truncate max-w-xs">{p.address}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold">
                      {isReceivable && (
                        <span className="text-indigo-700">+{formatNPR(p.currentBalance)} (Dr)</span>
                      )}
                      {isPayable && (
                        <span className="text-amber-800">-{formatNPR(Math.abs(p.currentBalance))} (Cr)</span>
                      )}
                      {!isReceivable && !isPayable && <span className="text-slate-400">Rs. 0.00</span>}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {isPanValid ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Valid 9-Digit
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-500">
                          Retail / Unreg
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

      {/* Add Partner Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-200 pb-2 mb-4" title="नयाँ ग्राहक / आपूर्तिकर्ता">
              Add Business Partner
            </h3>
            <form onSubmit={handleCreatePartner} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Partner Type *</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewType('customer')}
                    className={`py-1.5 px-2 rounded-lg font-semibold text-center border transition-all cursor-pointer ${
                      newType === 'customer'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    Customer
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewType('vendor')}
                    className={`py-1.5 px-2 rounded-lg font-semibold text-center border transition-all cursor-pointer ${
                      newType === 'vendor'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    Vendor
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewType('both')}
                    className={`py-1.5 px-2 rounded-lg font-semibold text-center border transition-all cursor-pointer ${
                      newType === 'both'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    Both
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Business Name *</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Pokhara Valley Garments Pvt. Ltd."
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1" title="९ अङ्कको स्थायी लेखा नम्बर">
                  Nepal IRD PAN / VAT No (9 Digits)
                </label>
                <input
                  type="text"
                  maxLength={9}
                  value={newPan}
                  onChange={(e) => handlePanChange(e.target.value)}
                  placeholder="e.g. 601294851 (Leave empty for consumer)"
                  className={`w-full rounded-lg border p-2 text-xs font-mono focus:outline-hidden ${
                    panValidationError
                      ? 'border-red-500 bg-red-50/30'
                      : 'border-slate-300 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600'
                  }`}
                />
                {panValidationError && (
                  <p className="mt-1 text-[11px] text-red-600 flex items-center">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    {panValidationError}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="98XXXXXXXX"
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="contact@company.com.np"
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1" title="ठेगाना">Address</label>
                <input
                  type="text"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  placeholder="e.g. New Road, Ward 22, Kathmandu"
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:border-indigo-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-600"
                />
              </div>

              <div className="pt-4 flex justify-end space-x-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-sm"
                >
                  Save Partner
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
