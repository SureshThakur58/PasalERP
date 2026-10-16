import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  'src/api/erpApi.ts',
  'src/api/repository.ts',
  'src/components/AccountingModule.tsx',
  'src/components/InventoryModule.tsx',
  'src/components/PurchaseModule.tsx',
  'src/components/SalesInvoiceModule.tsx',
  'src/components/IrdComplianceModule.tsx',
  'src/components/DashboardModule.tsx',
];
const errors = [];
for (const file of required) if (!fs.existsSync(path.join(root, file))) errors.push(`Missing ${file}`);
const repo = fs.readFileSync(path.join(root, 'src/api/repository.ts'), 'utf8');
const api = fs.readFileSync(path.join(root, 'src/api/erpApi.ts'), 'utf8');
for (const token of ['accounts', 'journals', 'sales', 'purchases', 'inventory', 'ird', 'dashboard', 'migration']) if (!repo.includes(token)) errors.push(`Repository missing integration token: ${token}`);
for (const endpoint of ['/accounts', '/journals', '/sales', '/purchases', '/stock-transfers', '/ird/sales-book', '/ird/purchase-book', '/ird/vat-summary', '/dashboard', '/migration']) if (!api.includes(endpoint)) errors.push(`API client missing endpoint: ${endpoint}`);
const app = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8');
if (!app.includes('repository')) errors.push('App.tsx is not using repository boundary');
if (errors.length) { console.error('B10 frontend integration verification FAILED'); for (const e of errors) console.error(`- ${e}`); process.exit(1); }
console.log('B10 frontend integration verification PASSED');
