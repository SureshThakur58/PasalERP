import React, { useEffect, useMemo, useState } from 'react';
import {
  Edit3,
  KeyRound,
  Plus,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import type { AuthUser, ErpRole } from '../types';
import { ApiError } from '../api/erpApi';
import { repository } from '../api/repository';

const ROLES: { value: ErpRole; label: string; description: string }[] = [
  { value: 'super_admin', label: 'Super Admin', description: 'Full access including user management' },
  { value: 'admin', label: 'Administrator', description: 'Full operational access including user management' },
  { value: 'accountant', label: 'Accountant', description: 'Accounting, reports and IRD' },
  { value: 'sales', label: 'Sales', description: 'Sales and customer/master data' },
  { value: 'purchase', label: 'Purchase', description: 'Purchases and vendor/master data' },
  { value: 'inventory', label: 'Inventory', description: 'Inventory, warehouses and master data' },
  { value: 'viewer', label: 'Viewer', description: 'Dashboard read-only access' },
];

interface Props {
  onClose: () => void;
}

type EditForm = {
  displayName: string;
  role: ErpRole;
  isActive: boolean;
  password: string;
};

const emptyEdit: EditForm = {
  displayName: '',
  role: 'viewer',
  isActive: true,
  password: '',
};

const roleLabel = (role: ErpRole) => ROLES.find((r) => r.value === role)?.label ?? role;

const UserManagementModule: React.FC<Props> = ({ onClose }) => {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<ErpRole>('viewer');

  const [editingUser, setEditingUser] = useState<AuthUser | null>(null);
  const [editForm, setEditForm] = useState<EditForm>(emptyEdit);
  const [deletingUser, setDeletingUser] = useState<AuthUser | null>(null);

  const loadUsers = async () => {
    setLoading(true);
    setError('');
    try {
      setUsers(await repository.auth.users.list());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const resetMessages = () => {
    setError('');
    setNotice('');
  };

  const createUser = async (event: React.FormEvent) => {
    event.preventDefault();
    resetMessages();
    setSaving(true);
    try {
      await repository.auth.users.create({ username, displayName, password, role });
      setUsername('');
      setDisplayName('');
      setPassword('');
      setRole('viewer');
      setNotice('User created successfully.');
      await loadUsers();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to create user.');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (user: AuthUser) => {
    resetMessages();
    setEditingUser(user);
    setEditForm({
      displayName: user.displayName,
      role: user.role,
      isActive: user.isActive,
      password: '',
    });
  };

  const saveEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingUser) return;

    resetMessages();
    setSaving(true);
    try {
      const input: {
        displayName: string;
        role: ErpRole;
        isActive: boolean;
        password?: string;
      } = {
        displayName: editForm.displayName,
        role: editForm.role,
        isActive: editForm.isActive,
      };

      if (editForm.password.trim()) input.password = editForm.password;

      await repository.auth.users.update(editingUser.id, input);
      setEditingUser(null);
      setEditForm(emptyEdit);
      setNotice(
        editForm.password.trim()
          ? `${editingUser.displayName}'s details and password were updated.`
          : `${editingUser.displayName}'s details were updated.`
      );
      await loadUsers();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to update user.');
    } finally {
      setSaving(false);
    }
  };

  const toggleUser = async (user: AuthUser) => {
    if (user.username === 'manager') {
      setError('The default manager account cannot be disabled.');
      return;
    }

    resetMessages();
    setSaving(true);
    try {
      await repository.auth.users.update(user.id, { isActive: !user.isActive });
      setNotice(`${user.displayName} is now ${user.isActive ? 'disabled' : 'active'}.`);
      await loadUsers();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to change user status.');
    } finally {
      setSaving(false);
    }
  };

  const deleteUser = async () => {
    if (!deletingUser) return;

    resetMessages();
    setSaving(true);
    try {
      await repository.auth.users.remove(deletingUser.id);
      setNotice(`${deletingUser.displayName} was deleted.`);
      setDeletingUser(null);
      await loadUsers();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to delete user.');
    } finally {
      setSaving(false);
    }
  };

  const activeCount = useMemo(() => users.filter((user) => user.isActive).length, [users]);

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-6xl max-h-[92vh] overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-indigo-600" /> User Management
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Create, edit, disable, delete users and manage their passwords and roles.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100" title="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 pt-4">
          {error && <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}
          {notice && <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{notice}</div>}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[350px_1fr] max-h-[calc(92vh-105px)] overflow-auto">
          <form onSubmit={createUser} className="p-5 border-b lg:border-b-0 lg:border-r border-slate-200 bg-slate-50/70">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Create New User</h3>

            <label className="block text-xs font-semibold text-slate-600 mb-1">User name</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} placeholder="e.g. ram" className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm mb-3 outline-none focus:border-indigo-400" />

            <label className="block text-xs font-semibold text-slate-600 mb-1">Display name</label>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required minLength={2} placeholder="Full name" className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm mb-3 outline-none focus:border-indigo-400" />

            <label className="block text-xs font-semibold text-slate-600 mb-1">Temporary password</label>
            <div className="relative mb-3">
              <KeyRound className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} type="password" placeholder="Minimum 8 characters" className="w-full h-10 rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-indigo-400" />
            </div>

            <label className="block text-xs font-semibold text-slate-600 mb-1">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value as ErpRole)} className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm bg-white mb-1">
              {ROLES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <p className="text-[11px] text-slate-400 mb-5">{ROLES.find((item) => item.value === role)?.description}</p>

            <button type="submit" disabled={saving} className="w-full h-10 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2">
              <Plus className="h-4 w-4" /> {saving ? 'Saving...' : 'Create User'}
            </button>
          </form>

          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">ERP Users</h3>
                <p className="text-[11px] text-slate-400">{activeCount} active of {users.length} user{users.length === 1 ? '' : 's'}</p>
              </div>
              <button type="button" onClick={() => void loadUsers()} disabled={loading || saving} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-50">Refresh</button>
            </div>

            {loading ? (
              <div className="py-12 text-center text-xs text-slate-400">Loading users...</div>
            ) : users.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">No ERP users found.</div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="text-left px-3 py-2.5">User</th>
                      <th className="text-left px-3 py-2.5">Role</th>
                      <th className="text-left px-3 py-2.5">Access</th>
                      <th className="text-center px-3 py-2.5">Status</th>
                      <th className="text-right px-3 py-2.5">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {users.map((user) => (
                      <tr key={user.id} className="hover:bg-slate-50/70">
                        <td className="px-3 py-3">
                          <div className="font-semibold text-slate-800">{user.displayName}</div>
                          <div className="text-[10px] font-mono text-slate-400">@{user.username}</div>
                        </td>
                        <td className="px-3 py-3 font-semibold text-slate-700">{roleLabel(user.role)}</td>
                        <td className="px-3 py-3 text-slate-500">
                          {user.permissions.length >= 9 ? 'All modules' : `${user.permissions.length} module${user.permissions.length === 1 ? '' : 's'}`}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <button type="button" onClick={() => void toggleUser(user)} disabled={saving || user.username === 'manager'} title={user.username === 'manager' ? 'Default manager cannot be disabled' : 'Toggle active status'} className={`inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold ${user.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'} disabled:opacity-60`}>
                            {user.isActive ? <UserCheck className="h-3 w-3" /> : <UserX className="h-3 w-3" />}
                            {user.isActive ? 'Active' : 'Disabled'}
                          </button>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            <button type="button" onClick={() => openEdit(user)} disabled={saving} title="Edit user, role and password" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-slate-600 hover:text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">
                              <Edit3 className="h-3.5 w-3.5" /> Edit
                            </button>
                            <button type="button" onClick={() => setDeletingUser(user)} disabled={saving || user.username === 'manager'} title={user.username === 'manager' ? 'Default manager cannot be deleted' : 'Delete user'} className="p-1.5 rounded-lg text-slate-500 hover:text-rose-700 hover:bg-rose-50 disabled:opacity-40">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {editingUser && (
        <div className="fixed inset-0 z-[110] bg-slate-900/40 flex items-center justify-center p-4">
          <form onSubmit={saveEdit} className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-slate-900">Edit User</h3>
                <p className="text-xs text-slate-500 mt-0.5">@{editingUser.username}</p>
              </div>
              <button type="button" onClick={() => setEditingUser(null)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"><X className="h-4 w-4" /></button>
            </div>

            <label className="block text-xs font-semibold text-slate-600 mb-1">Display name</label>
            <input value={editForm.displayName} onChange={(e) => setEditForm((v) => ({ ...v, displayName: e.target.value }))} required minLength={2} className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm mb-3 outline-none focus:border-indigo-400" />

            <label className="block text-xs font-semibold text-slate-600 mb-1">Role</label>
            <select value={editForm.role} onChange={(e) => setEditForm((v) => ({ ...v, role: e.target.value as ErpRole }))} disabled={editingUser.username === 'manager'} className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm bg-white mb-1 disabled:bg-slate-100">
              {ROLES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            {editingUser.username === 'manager' && <p className="text-[11px] text-amber-600 mb-3">The default manager must remain Super Admin.</p>}

            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 mb-4">
              <input type="checkbox" checked={editForm.isActive} onChange={(e) => setEditForm((v) => ({ ...v, isActive: e.target.checked }))} disabled={editingUser.username === 'manager'} />
              Active user
            </label>

            <label className="block text-xs font-semibold text-slate-600 mb-1">Change password</label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input value={editForm.password} onChange={(e) => setEditForm((v) => ({ ...v, password: e.target.value }))} type="password" minLength={8} placeholder="Leave blank to keep current password" className="w-full h-10 rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-indigo-400" />
            </div>
            <p className="text-[11px] text-slate-400 mt-1 mb-5">Enter a new password to reset the user's password. Minimum 8 characters.</p>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditingUser(null)} className="px-4 h-10 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button type="submit" disabled={saving} className="px-4 h-10 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold">{saving ? 'Saving...' : 'Save Changes'}</button>
            </div>
          </form>
        </div>
      )}

      {deletingUser && (
        <div className="fixed inset-0 z-[120] bg-slate-900/50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl border border-slate-200 p-5">
            <h3 className="font-bold text-slate-900">Delete User?</h3>
            <p className="text-sm text-slate-600 mt-2">
              This will permanently delete <strong>{deletingUser.displayName}</strong> (@{deletingUser.username}) from the selected ERP database.
            </p>
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={() => setDeletingUser(null)} className="px-4 h-10 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button type="button" onClick={() => void deleteUser()} disabled={saving} className="px-4 h-10 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-sm font-semibold">{saving ? 'Deleting...' : 'Delete User'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagementModule;
