# Nepal IRD Garment ERP — Frontend

React + TypeScript frontend for a Nepal IRD-oriented garment inventory and financial ERP.

## Current phase

**Frontend F1 + F2** focuses on a stable frontend foundation and master-data workflows. The existing AGS UI is intentionally preserved while data persistence and validation are cleaned up.

### Included

- Company and IRD setup
- Fiscal-year validation in BS `YYYY/YY` format
- Warehouse/outlet management
- Item master
- Business partner master (customer/vendor/both)
- Nepal PAN validation
- Duplicate SKU / partner / warehouse-code protection
- Safe versioned local-storage persistence for frontend-only development
- Centralized ID/barcode generation utilities
- CSV helper infrastructure
- API-ready environment configuration for the later backend integration

### Not yet connected

The Node.js + SQL Server backend is intentionally **not called by this frontend yet**. Backend integration will begin only after the frontend phases are completed.

## Run

```bash
npm install
npm run dev
```

Frontend runs on `http://localhost:3000`.

## Validation

```bash
npm run lint
npm run build
```

## Architecture direction

```text
Current F1/F2
React → frontend state → isolated persistence layer

Later integration
React → API services → Node.js/Express → SQL Server
```

## F7 — Nepal IRD Compliance
The current baseline includes fiscal-year-scoped statutory registers, configurable VAT-rate handling, IRD CSV exports, and frontend reconciliation/readiness checks. Direct IRD e-filing is not implemented in frontend-only mode.


## F8 — Dashboard & Reports
See `F8-DASHBOARD-REPORTS.md` for the F8 reporting scope.


## F9 — Backup & Data Management

See `F9-BACKUP-DATA-MANAGEMENT.md` for versioned backup/restore validation, legacy compatibility, destructive-operation safeguards, and the frontend/backend data-management boundary.


## F10 — Frontend Hardening

F10 is the final frontend-only stabilization baseline before backend integration. See `F10-FRONTEND-HARDENING.md`.

## B1 Backend Integration

The frontend now uses `VITE_API_BASE_URL` (default `http://localhost:4000/api`) for Settings, Warehouses, Business Partners, and Items. The API is authoritative for master-data saves when reachable; localStorage remains a cache/fallback during this staged migration.

For an existing SQL Server database, run the backend one-time migration:

```powershell
npm run db:migrate:b1
```


## Backend integration phase

B1 connected Settings and Master Data. B2 adds the reusable API repository boundary and controlled local-to-SQL migration controls. See `B2-API-REPOSITORY-MIGRATION.md`.


## B3 — Inventory + FIFO API integration
B3 connects FIFO batches, stock transfers, and stock movements to the backend API. Inventory transfer posting is now server-authoritative; see `B3-INVENTORY-API-INTEGRATION.md`.


## B6 — Accounting API Integration
Manual journal/opening balance posting is server-authoritative through `POST /api/journals`; accounts and journal history are refreshed from SQL Server after successful posting.


## B9 — Backup & SQL Migration Hardening
See `B9-BACKUP-SQL-MIGRATION-HARDENING.md`.
