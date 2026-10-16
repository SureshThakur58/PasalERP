# Nepal IRD Inventory & Financial ERP — Node.js API + SQL Server

This backend is generated from the uploaded React ERP's current data model and client-side accounting/FIFO logic.

## What it replaces

The React app currently persists these stores in browser `localStorage`:

- settings
- warehouses
- partners
- items
- FIFO batches
- sales invoices
- purchase bills
- chart of accounts
- journal entries

This API moves those records into SQL Server and makes sales, purchases, FIFO stock movements, stock transfers and journal posting transactional on the server.

## Stack

- Node.js
- TypeScript
- Express
- `mssql` driver
- SQL Server
- Zod-ready validation boundary

## Architecture

```text
React/Vite frontend
        |
        | HTTP/JSON
        v
Node.js + Express API
        |
        +-- Master data
        +-- Sales
        +-- Purchases
        +-- FIFO inventory
        +-- Accounting journals
        +-- IRD sales/purchase books
        |
        v
SQL Server
```

## 1. Prerequisites

- Node.js LTS/current supported Node.js
- SQL Server (local SQL Server Express/Developer is fine)
- SSMS is useful but not required

## 2. Configure environment

Copy `.env.example` to `.env` and edit:

```env
PORT=4000
CORS_ORIGIN=http://localhost:3000
DB_SERVER=localhost
DB_PORT=1433
DB_NAME=NepalIRDERP
DB_USER=sa
DB_PASSWORD=YourStrongPasswordHere
DB_ENCRYPT=false
DB_TRUST_SERVER_CERTIFICATE=true
```

The starter configuration uses SQL Server authentication. If your SQL Server is a named instance or Windows-auth-only installation, change the connection setup accordingly.

## 3. Create database/schema

```powershell
npm install
npm run db:init
```

This creates `NepalIRDERP` if it does not exist and creates the ERP tables.

## 4. Seed the demo data from the uploaded frontend

```powershell
npm run db:seed
```

The seed is generated from the frontend's original demo data. It is idempotent in the sense that it skips when company settings already exist.

## 5. Run API

```powershell
npm run dev
```

API:

```text
http://localhost:4000
```

Health check:

```text
GET http://localhost:4000/api/health
```

## Main endpoints

### Master data

```text
GET    /api/settings
PUT    /api/settings
GET    /api/warehouses
POST   /api/warehouses
PUT    /api/warehouses/:id
DELETE /api/warehouses/:id
GET    /api/partners
POST   /api/partners
PUT    /api/partners/:id
DELETE /api/partners/:id
GET    /api/items
POST   /api/items
PUT    /api/items/:id
DELETE /api/items/:id
GET    /api/accounts
GET    /api/batches?itemId=item-1&warehouseId=wh-1
GET    /api/dashboard
```

### Transactions

```text
GET  /api/sales
POST /api/sales
GET  /api/purchases
POST /api/purchases
GET  /api/journals
POST /api/stock-transfers
```

Financial documents intentionally do not expose hard-delete/update endpoints. In a real accounting system, posted documents should be corrected through returns/credit notes/debit notes or controlled reversal workflows rather than destructive deletion.

### IRD reporting

```text
GET /api/ird/sales-book?fiscalYear=2081/82
GET /api/ird/purchase-book?fiscalYear=2081/82
GET /api/ird/vat-summary?fiscalYear=2081/82
```

### Existing frontend backup migration

The current React Setup module exports a JSON backup with these keys:

```text
company
warehouses
partners
items
batches
salesInvoices
purchaseBills
accounts
journalEntries
```

You can POST that exact JSON to:

```text
POST /api/migration/import-localstorage
```

Use `{ "reset": true, ...backup }` when importing into a database that should be replaced by the backup.

## Example sales request

```json
{
  "transactionType": "tax_invoice",
  "fiscalYear": "2081/82",
  "mitiDate": "2081-11-20",
  "adDate": "2025-03-05",
  "customerId": "bp-4",
  "warehouseId": "wh-1",
  "paymentMode": "Credit",
  "syncWithIrd": true,
  "lines": [
    {
      "itemId": "item-1",
      "quantity": 2,
      "unitPrice": 1650,
      "discountPercent": 0
    }
  ],
  "notes": "Sample sale"
}
```

The server then:

1. Locks/loads the customer and warehouse.
2. Loads FIFO batches for each item.
3. Validates stock.
4. Depletes the oldest cost layers first.
5. Calculates taxable/non-taxable amounts and VAT from the company VAT rate.
6. Generates a sequential invoice number.
7. Generates a balanced double-entry journal.
8. Updates account balances.
9. Updates customer balance for credit transactions.
10. Persists the invoice, lines, stock movements and journal in one SQL transaction.

If any step fails, the SQL transaction rolls back.

## Important implementation notes

### FIFO

The frontend's intended FIFO rule is preserved, but the backend deliberately orders by `purchaseDate, id` rather than depending on JavaScript array order.

### VAT

The frontend uses 13% as the default. The backend reads `CompanySettings.vatRate`, so the rate is configurable instead of hard-coded into transaction processing.

### BS/AD dates

Both `mitiDate` and `adDate` are stored. The uploaded frontend currently contains a hard-coded current BS date/fiscal-year approximation. This backend does not pretend to solve BS calendar conversion; it accepts validated `YYYY-MM-DD` strings for BS and AD. A proper BS calendar service should be added before production IRD filing.

### IRD integration

`syncWithIrd` is stored, and IRD books/VAT summary endpoints are provided. This is **not** a claim that the government IRD API submission process is implemented. Official submission/authentication/API requirements must be implemented separately after the applicable IRD specification is confirmed.

## Next step: connect the React frontend

The current React modules should stop calling `localStorage` for ERP records and instead call this API. The UI can remain largely unchanged.

Recommended migration order:

1. Master data: settings, warehouses, partners, items.
2. Read-only dashboard/inventory/accounting from API.
3. Sales posting.
4. Purchase posting.
5. Stock transfers.
6. IRD books/VAT reporting.
7. Authentication/roles/audit trail.
8. Payments/receipts and other ERP modules.


## B2 — API data/repository foundation & migration controls

Migration endpoints now expose server status, preview, merge/replace controls, transactional import, and stock-transfer migration. See the frontend `B2-API-REPOSITORY-MIGRATION.md` for the workflow.


## B3 — Inventory + FIFO API integration
B3 exposes authoritative FIFO batch reads, stock-transfer history/creation, and stock-movement audit reads. Transfer posting uses the existing SQL transaction and FIFO engine.


## B6 — Accounting API Integration
`POST /api/journals` posts manual/opening journals atomically and updates account balances in the same SQL transaction.

## B8 — Dashboard & Reports API

Management reporting is available at `GET /api/dashboard` with `period`, `fiscalYear`, `from`, and `to` query parameters. The endpoint performs server-side sales/purchase aggregation, VAT, COGS/gross profit, FIFO inventory valuation, receivables/payables, warehouse distribution, low-stock analysis, sales trend, top items, and recent document queries.


## B9 — Backup & SQL Migration Hardening
See `B9-BACKUP-SQL-MIGRATION-HARDENING.md`.
