import React, { useEffect, useState } from 'react';
import { Building2, Database, Eye, EyeOff, KeyRound, LineChart, Package, ShoppingCart, WalletCards } from 'lucide-react';
import type { AuthSession, ErpDatabase } from '../types';
import { repository } from '../api/repository';
import { ApiError, saveAuthSession } from '../api/erpApi';

interface LoginPageProps {
  onLogin: (session: AuthSession) => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [databases, setDatabases] = useState<ErpDatabase[]>([]);
  const [database, setDatabase] = useState('');
  const [username, setUsername] = useState('manager');
  const [password, setPassword] = useState('manager@123');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loadingDatabases, setLoadingDatabases] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    repository.auth.databases()
      .then(rows => {
        if (cancelled) return;
        setDatabases(rows);
        if (rows.length) setDatabase(rows[0].name);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Unable to load available databases.');
      })
      .finally(() => {
        if (!cancelled) setLoadingDatabases(false);
      });
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!database || !username.trim() || !password) {
      setError('Select a database and enter your user name and password.');
      return;
    }

    setLoggingIn(true);
    try {
      const session = await repository.auth.login(database, username.trim(), password);
      saveAuthSession(session, rememberMe);
      onLogin(session);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to sign in.');
    } finally {
      setLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] bg-[#faf9f6] text-[#1b1f27]">
      <section className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-[#0c4a6e] text-white px-14 py-12">
        <div className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: 'linear-gradient(#146b9c 1px, transparent 1px), linear-gradient(90deg, #146b9c 1px, transparent 1px)',
            backgroundSize: '64px 64px',
            maskImage: 'radial-gradient(circle at 30% 20%, black, transparent 70%)',
          }}
        />

        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-[10px] bg-[#e8a227] flex items-center justify-center font-bold text-lg text-[#0c4a6e]">
            S
          </div>
          <div className="font-semibold text-xl tracking-tight">Smart<span className="text-[#e8a227] font-bold">ERP</span></div>
        </div>

        <div className="relative z-10 py-12 my-auto">
          <h1 className="font-semibold text-[2.4rem] leading-[1.22] max-w-[420px] mb-5">
            One login. Every part of the business.
          </h1>
          <p className="text-[15px] leading-[1.65] text-[#d2e9f5] max-w-[390px] mb-10">
            Sales, Purchase, Finance, and Inventory, all running on the same live data — sign in to pick up where you left off.
          </p>

          <div className="flex items-center max-w-[430px]">
            {[
              { label: 'Finance', icon: WalletCards },
              { label: 'Inventory', icon: Package },
              { label: 'SmartERP', icon: Building2, hub: true },
              { label: 'Sales', icon: LineChart },
              { label: 'Purchase', icon: ShoppingCart },
            ].map((item, index, arr) => {
              const Icon = item.icon;
              return (
                <React.Fragment key={item.label}>
                  <div className="flex flex-col items-center gap-2 w-[84px] text-center">
                    <div className={`${item.hub ? 'w-[52px] h-[52px] bg-[#e8a227] border-[#e8a227]' : 'w-11 h-11 bg-[#146b9c] border-[#2a93c9]'} rounded-[11px] border flex items-center justify-center`}>
                      <Icon className={`h-5 w-5 ${item.hub ? 'text-[#0b1220]' : 'text-[#cde7f5]'}`} />
                    </div>
                    <span className={`text-[11.5px] ${item.hub ? 'text-white font-medium' : 'text-[#cde7f5]'}`}>{item.label}</span>
                  </div>
                  {index < arr.length - 1 && <div className="flex-1 h-px bg-gradient-to-r from-[#2a93c9] via-[#e8a227] to-[#2a93c9] -mt-4 min-w-[18px]" />}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        <div className="relative z-10 flex justify-between items-end border-t border-[#146b9c] pt-5 text-xs text-[#a9d6eb]">
          <div>© 2026 SmartERP. All rights reserved.</div>
          <div className="flex gap-10">
            <div><b className="block text-lg text-white">99.9%</b>uptime</div>
            <div><b className="block text-lg text-white">24/7</b>support</div>
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-8 sm:px-8">
        <div className="w-full max-w-[380px]">
          <p className="text-[13px] text-[#6b7280] mb-1.5">Welcome back</p>
          <h2 className="font-semibold text-[1.7rem] tracking-tight mb-8">Sign in to SmartERP</h2>

          <form onSubmit={handleSubmit} noValidate>
            <div className="mb-5">
              <label htmlFor="login-database" className="block text-[12.5px] font-medium text-[#6b7280] mb-1.5">Database</label>
              <div className="relative">
                <Database className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6b7280]" />
                <select
                  id="login-database"
                  value={database}
                  onChange={e => setDatabase(e.target.value)}
                  disabled={loadingDatabases || loggingIn}
                  className="w-full h-[46px] rounded-[9px] border border-[#dddbd3] pl-10 pr-10 text-[14.5px] bg-white outline-none focus:border-[#e8a227] focus:ring-4 focus:ring-[#fdf3e1] appearance-none"
                >
                  <option value="" disabled>{loadingDatabases ? 'Loading databases...' : 'Select database'}</option>
                  {databases.map(db => (
                    <option key={db.name} value={db.name}>
                      {db.companyName ? `${db.companyName} — ${db.name}` : db.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mb-5">
              <label htmlFor="login-username" className="block text-[12.5px] font-medium text-[#6b7280] mb-1.5">User name</label>
              <input
                id="login-username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="Enter your user name"
                disabled={loggingIn}
                className="w-full h-[46px] rounded-[9px] border border-[#dddbd3] px-3.5 text-[14.5px] bg-white outline-none focus:border-[#e8a227] focus:ring-4 focus:ring-[#fdf3e1]"
              />
            </div>

            <div className="mb-5">
              <label htmlFor="login-password" className="block text-[12.5px] font-medium text-[#6b7280] mb-1.5">Password</label>
              <div className="relative">
                <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9ca3af]" />
                <input
                  id="login-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  disabled={loggingIn}
                  className="w-full h-[46px] rounded-[9px] border border-[#dddbd3] pl-10 pr-16 text-[14.5px] bg-white outline-none focus:border-[#e8a227] focus:ring-4 focus:ring-[#fdf3e1]"
                />
                <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[12.5px] text-[#6b7280] hover:text-[#1b1f27]">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center text-[13px] mb-6">
              <label className="flex items-center gap-2 text-[#6b7280] cursor-pointer">
                <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} className="w-[15px] h-[15px]" />
                Remember me
              </label>
            </div>

            {error && (
              <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loggingIn || loadingDatabases || !database}
              className="w-full h-12 rounded-[9px] border-0 bg-[#e8a227] hover:bg-[#d18e14] disabled:opacity-60 disabled:cursor-not-allowed text-[#241505] text-[15px] font-semibold tracking-wide transition-colors"
            >
              {loggingIn ? 'Signing in...' : 'Log in'}
            </button>
          </form>

          <p className="mt-6 text-[12.5px] text-[#9ca3af] text-center">
            Default system administrator: <span className="font-semibold text-[#6b7280]">manager</span>
          </p>
          {/* <p className="mt-1 text-[11px] text-[#b0b3b8] text-center">
            First login password: manager@123
          </p> */}
          <p className="mt-5 text-[11px] text-[#b0b3b8] text-center">
            Having trouble signing in? Contact your system administrator.
          </p>
        </div>
      </section>
    </div>
  );
};

export default LoginPage;
