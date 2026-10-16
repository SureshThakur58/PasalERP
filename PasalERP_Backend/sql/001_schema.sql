IF DB_ID(N'NepalIRDERP') IS NULL
BEGIN
    CREATE DATABASE NepalIRDERP;
END;
GO

USE NepalIRDERP;
GO

IF OBJECT_ID('dbo.CompanySettings','U') IS NULL
CREATE TABLE dbo.CompanySettings (
    id tinyint NOT NULL CONSTRAINT PK_CompanySettings PRIMARY KEY,
    companyName nvarchar(200) NOT NULL,
    tradeName nvarchar(200) NOT NULL,
    panNumber varchar(9) NOT NULL,
    businessNature varchar(3) NOT NULL CONSTRAINT DF_CompanySettings_BusinessNature DEFAULT 'VAT',
    address nvarchar(500) NOT NULL,
    city nvarchar(100) NOT NULL,
    district nvarchar(100) NOT NULL,
    phone nvarchar(100) NOT NULL,
    email nvarchar(200) NOT NULL,
    vatRate decimal(5,2) NOT NULL CONSTRAINT DF_CompanySettings_VatRate DEFAULT 13,
    fiscalYear varchar(7) NOT NULL,
    irdApprovalNo nvarchar(100) NULL,
    invoicePrefix nvarchar(50) NOT NULL,
    purchasePrefix nvarchar(50) NOT NULL,
    bankName nvarchar(200) NULL,
    accountNumber nvarchar(100) NULL,
    accountName nvarchar(200) NULL,
    qrCodeText nvarchar(1000) NULL,
    termsAndConditions nvarchar(max) NULL,
    updatedAt datetime2(0) NOT NULL CONSTRAINT DF_CompanySettings_UpdatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_CompanySettings_BusinessNature CHECK (businessNature IN ('VAT','PAN')),
    CONSTRAINT CK_CompanySettings_PAN CHECK (panNumber LIKE '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]')
);

IF OBJECT_ID('dbo.Warehouses','U') IS NULL
CREATE TABLE dbo.Warehouses (
    id nvarchar(50) NOT NULL CONSTRAINT PK_Warehouses PRIMARY KEY,
    code nvarchar(50) NOT NULL,
    name nvarchar(200) NOT NULL,
    address nvarchar(500) NOT NULL,
    phone nvarchar(100) NOT NULL,
    isDefault bit NOT NULL CONSTRAINT DF_Warehouses_IsDefault DEFAULT 0,
    createdAt datetime2(0) NOT NULL CONSTRAINT DF_Warehouses_CreatedAt DEFAULT SYSUTCDATETIME(),
    updatedAt datetime2(0) NOT NULL CONSTRAINT DF_Warehouses_UpdatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_Warehouses_Code UNIQUE(code)
);

IF OBJECT_ID('dbo.BusinessPartners','U') IS NULL
CREATE TABLE dbo.BusinessPartners (
    id nvarchar(50) NOT NULL CONSTRAINT PK_BusinessPartners PRIMARY KEY,
    code nvarchar(50) NOT NULL,
    name nvarchar(200) NOT NULL,
    type varchar(10) NOT NULL,
    panNumber varchar(9) NOT NULL,
    email nvarchar(200) NOT NULL,
    phone nvarchar(100) NOT NULL,
    address nvarchar(500) NOT NULL,
    currentBalance decimal(18,2) NOT NULL CONSTRAINT DF_BusinessPartners_Balance DEFAULT 0,
    creditLimit decimal(18,2) NULL,
    isVatApplicable bit NOT NULL CONSTRAINT DF_BusinessPartners_IsVatApplicable DEFAULT 1,
    createdAt datetime2(0) NOT NULL CONSTRAINT DF_BusinessPartners_CreatedAt DEFAULT SYSUTCDATETIME(),
    updatedAt datetime2(0) NOT NULL CONSTRAINT DF_BusinessPartners_UpdatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_BusinessPartners_Code UNIQUE(code),
    CONSTRAINT CK_BusinessPartners_Type CHECK(type IN ('customer','vendor','both')),
    CONSTRAINT CK_BusinessPartners_PAN CHECK (panNumber LIKE '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]')
);

IF OBJECT_ID('dbo.Items','U') IS NULL
CREATE TABLE dbo.Items (
    id nvarchar(50) NOT NULL CONSTRAINT PK_Items PRIMARY KEY,
    sku nvarchar(100) NOT NULL,
    barcode nvarchar(100) NOT NULL,
    name nvarchar(250) NOT NULL,
    category nvarchar(100) NOT NULL,
    size nvarchar(50) NOT NULL,
    color nvarchar(100) NOT NULL,
    fabric nvarchar(200) NOT NULL,
    hsnCode nvarchar(50) NOT NULL,
    costPrice decimal(18,2) NOT NULL,
    sellingPrice decimal(18,2) NOT NULL,
    minStockAlert decimal(18,3) NOT NULL,
    isVatApplicable bit NOT NULL,
    description nvarchar(1000) NULL,
    createdAt datetime2(0) NOT NULL CONSTRAINT DF_Items_CreatedAt DEFAULT SYSUTCDATETIME(),
    updatedAt datetime2(0) NOT NULL CONSTRAINT DF_Items_UpdatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_Items_SKU UNIQUE(sku),
    CONSTRAINT UQ_Items_Barcode UNIQUE(barcode)
);

IF OBJECT_ID('dbo.Accounts','U') IS NULL
CREATE TABLE dbo.Accounts (
    code nvarchar(20) NOT NULL CONSTRAINT PK_Accounts PRIMARY KEY,
    name nvarchar(200) NOT NULL,
    category varchar(20) NOT NULL,
    description nvarchar(1000) NOT NULL,
    balance decimal(18,2) NOT NULL CONSTRAINT DF_Accounts_Balance DEFAULT 0,
    CONSTRAINT CK_Accounts_Category CHECK(category IN ('asset','liability','equity','revenue','expense'))
);

IF OBJECT_ID('dbo.DocumentSequences','U') IS NULL
CREATE TABLE dbo.DocumentSequences (
    fiscalYear varchar(7) NOT NULL,
    documentType varchar(40) NOT NULL,
    nextNumber int NOT NULL,
    CONSTRAINT PK_DocumentSequences PRIMARY KEY(fiscalYear, documentType)
);

IF OBJECT_ID('dbo.FifoBatches','U') IS NULL
CREATE TABLE dbo.FifoBatches (
    id nvarchar(80) NOT NULL CONSTRAINT PK_FifoBatches PRIMARY KEY,
    itemId nvarchar(50) NOT NULL,
    warehouseId nvarchar(50) NOT NULL,
    purchaseId nvarchar(80) NOT NULL,
    purchaseBillNo nvarchar(100) NOT NULL,
    purchaseDate varchar(10) NOT NULL,
    unitCost decimal(18,2) NOT NULL,
    originalQty decimal(18,3) NOT NULL,
    remainingQty decimal(18,3) NOT NULL,
    createdAt datetime2(0) NOT NULL CONSTRAINT DF_FifoBatches_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_FifoBatches_Item FOREIGN KEY(itemId) REFERENCES dbo.Items(id),
    CONSTRAINT FK_FifoBatches_Warehouse FOREIGN KEY(warehouseId) REFERENCES dbo.Warehouses(id),
    CONSTRAINT CK_FifoBatches_Qty CHECK(originalQty >= 0 AND remainingQty >= 0 AND remainingQty <= originalQty)
);
CREATE INDEX IX_FifoBatches_ItemWarehouseDate ON dbo.FifoBatches(itemId, warehouseId, purchaseDate, createdAt);

IF OBJECT_ID('dbo.SalesInvoices','U') IS NULL
CREATE TABLE dbo.SalesInvoices (
    id nvarchar(80) NOT NULL CONSTRAINT PK_SalesInvoices PRIMARY KEY,
    transactionType varchar(30) NOT NULL,
    invoiceNo nvarchar(100) NOT NULL,
    refInvoiceNo nvarchar(100) NULL,
    reason nvarchar(1000) NULL,
    fiscalYear varchar(7) NOT NULL,
    mitiDate varchar(10) NOT NULL,
    adDate date NOT NULL,
    customerId nvarchar(50) NOT NULL,
    customerName nvarchar(200) NOT NULL,
    customerPan varchar(9) NOT NULL,
    customerAddress nvarchar(500) NOT NULL,
    warehouseId nvarchar(50) NOT NULL,
    warehouseName nvarchar(200) NOT NULL,
    paymentMode varchar(30) NOT NULL,
    subtotal decimal(18,2) NOT NULL,
    discountAmount decimal(18,2) NOT NULL,
    taxableAmount decimal(18,2) NOT NULL,
    nonTaxableAmount decimal(18,2) NOT NULL,
    vatAmount decimal(18,2) NOT NULL,
    grandTotal decimal(18,2) NOT NULL,
    totalCogs decimal(18,2) NOT NULL,
    journalEntryId nvarchar(80) NOT NULL,
    notes nvarchar(2000) NULL,
    syncWithIrd bit NOT NULL CONSTRAINT DF_SalesInvoices_SyncIrd DEFAULT 0,
    createdAt datetime2(0) NOT NULL CONSTRAINT DF_SalesInvoices_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_SalesInvoices_InvoiceNo UNIQUE(invoiceNo),
    CONSTRAINT FK_SalesInvoices_Customer FOREIGN KEY(customerId) REFERENCES dbo.BusinessPartners(id),
    CONSTRAINT FK_SalesInvoices_Warehouse FOREIGN KEY(warehouseId) REFERENCES dbo.Warehouses(id)
);
CREATE INDEX IX_SalesInvoices_FiscalDate ON dbo.SalesInvoices(fiscalYear, mitiDate, adDate);

IF OBJECT_ID('dbo.SalesInvoiceLines','U') IS NULL
CREATE TABLE dbo.SalesInvoiceLines (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_SalesInvoiceLines PRIMARY KEY,
    invoiceId nvarchar(80) NOT NULL,
    itemId nvarchar(50) NOT NULL,
    sku nvarchar(100) NOT NULL,
    name nvarchar(250) NOT NULL,
    size nvarchar(50) NOT NULL,
    color nvarchar(100) NOT NULL,
    hsnCode nvarchar(50) NOT NULL,
    quantity decimal(18,3) NOT NULL,
    unitPrice decimal(18,2) NOT NULL,
    discountPercent decimal(9,4) NOT NULL,
    isVatApplicable bit NOT NULL,
    taxableAmount decimal(18,2) NOT NULL,
    vatAmount decimal(18,2) NOT NULL,
    lineTotal decimal(18,2) NOT NULL,
    cogsAmount decimal(18,2) NULL,
    CONSTRAINT FK_SalesInvoiceLines_Invoice FOREIGN KEY(invoiceId) REFERENCES dbo.SalesInvoices(id) ON DELETE CASCADE,
    CONSTRAINT FK_SalesInvoiceLines_Item FOREIGN KEY(itemId) REFERENCES dbo.Items(id)
);

IF OBJECT_ID('dbo.PurchaseBills','U') IS NULL
CREATE TABLE dbo.PurchaseBills (
    id nvarchar(80) NOT NULL CONSTRAINT PK_PurchaseBills PRIMARY KEY,
    transactionType varchar(30) NOT NULL,
    billNo nvarchar(100) NOT NULL,
    supplierBillNo nvarchar(100) NOT NULL,
    refBillNo nvarchar(100) NULL,
    reason nvarchar(1000) NULL,
    fiscalYear varchar(7) NOT NULL,
    mitiDate varchar(10) NOT NULL,
    adDate date NOT NULL,
    vendorId nvarchar(50) NOT NULL,
    vendorName nvarchar(200) NOT NULL,
    vendorPan varchar(9) NOT NULL,
    warehouseId nvarchar(50) NOT NULL,
    warehouseName nvarchar(200) NOT NULL,
    paymentMode varchar(30) NOT NULL,
    subtotal decimal(18,2) NOT NULL,
    taxableAmount decimal(18,2) NOT NULL,
    nonTaxableAmount decimal(18,2) NOT NULL,
    vatAmount decimal(18,2) NOT NULL,
    grandTotal decimal(18,2) NOT NULL,
    journalEntryId nvarchar(80) NOT NULL,
    notes nvarchar(2000) NULL,
    isVatBill bit NOT NULL CONSTRAINT DF_PurchaseBills_IsVatBill DEFAULT 0,
    isCapitalizedVat bit NOT NULL CONSTRAINT DF_PurchaseBills_IsCapitalizedVat DEFAULT 0,
    createdAt datetime2(0) NOT NULL CONSTRAINT DF_PurchaseBills_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_PurchaseBills_BillNo UNIQUE(billNo),
    CONSTRAINT FK_PurchaseBills_Vendor FOREIGN KEY(vendorId) REFERENCES dbo.BusinessPartners(id),
    CONSTRAINT FK_PurchaseBills_Warehouse FOREIGN KEY(warehouseId) REFERENCES dbo.Warehouses(id)
);
CREATE INDEX IX_PurchaseBills_FiscalDate ON dbo.PurchaseBills(fiscalYear, mitiDate, adDate);

IF OBJECT_ID('dbo.PurchaseBillLines','U') IS NULL
CREATE TABLE dbo.PurchaseBillLines (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_PurchaseBillLines PRIMARY KEY,
    billId nvarchar(80) NOT NULL,
    itemId nvarchar(50) NOT NULL,
    sku nvarchar(100) NOT NULL,
    name nvarchar(250) NOT NULL,
    size nvarchar(50) NOT NULL,
    color nvarchar(100) NOT NULL,
    hsnCode nvarchar(50) NOT NULL,
    quantity decimal(18,3) NOT NULL,
    unitCost decimal(18,2) NOT NULL,
    isVatApplicable bit NOT NULL,
    taxableAmount decimal(18,2) NOT NULL,
    vatAmount decimal(18,2) NOT NULL,
    lineTotal decimal(18,2) NOT NULL,
    CONSTRAINT FK_PurchaseBillLines_Bill FOREIGN KEY(billId) REFERENCES dbo.PurchaseBills(id) ON DELETE CASCADE,
    CONSTRAINT FK_PurchaseBillLines_Item FOREIGN KEY(itemId) REFERENCES dbo.Items(id)
);

IF OBJECT_ID('dbo.JournalEntries','U') IS NULL
CREATE TABLE dbo.JournalEntries (
    id nvarchar(80) NOT NULL CONSTRAINT PK_JournalEntries PRIMARY KEY,
    entryNo nvarchar(100) NOT NULL,
    fiscalYear varchar(7) NOT NULL,
    mitiDate varchar(10) NOT NULL,
    adDate date NOT NULL,
    referenceType varchar(40) NOT NULL,
    referenceNo nvarchar(100) NOT NULL,
    narration nvarchar(2000) NOT NULL,
    totalDebit decimal(18,2) NOT NULL,
    totalCredit decimal(18,2) NOT NULL,
    isBalanced bit NOT NULL,
    createdAt datetime2(0) NOT NULL CONSTRAINT DF_JournalEntries_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_JournalEntries_EntryNo UNIQUE(entryNo)
);
CREATE INDEX IX_JournalEntries_FiscalDate ON dbo.JournalEntries(fiscalYear, mitiDate, adDate);

IF OBJECT_ID('dbo.JournalLines','U') IS NULL
CREATE TABLE dbo.JournalLines (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_JournalLines PRIMARY KEY,
    journalEntryId nvarchar(80) NOT NULL,
    accountCode nvarchar(20) NOT NULL,
    accountName nvarchar(200) NOT NULL,
    debit decimal(18,2) NOT NULL,
    credit decimal(18,2) NOT NULL,
    partnerId nvarchar(50) NULL,
    partnerName nvarchar(200) NULL,
    description nvarchar(2000) NULL,
    CONSTRAINT FK_JournalLines_Entry FOREIGN KEY(journalEntryId) REFERENCES dbo.JournalEntries(id) ON DELETE CASCADE,
    CONSTRAINT FK_JournalLines_Account FOREIGN KEY(accountCode) REFERENCES dbo.Accounts(code),
    CONSTRAINT FK_JournalLines_Partner FOREIGN KEY(partnerId) REFERENCES dbo.BusinessPartners(id)
);

IF OBJECT_ID('dbo.StockTransfers','U') IS NULL
CREATE TABLE dbo.StockTransfers (
    id nvarchar(80) NOT NULL CONSTRAINT PK_StockTransfers PRIMARY KEY,
    transferNo nvarchar(100) NOT NULL,
    fiscalYear varchar(7) NOT NULL,
    mitiDate varchar(10) NOT NULL,
    adDate date NOT NULL,
    sourceWarehouseId nvarchar(50) NOT NULL,
    sourceWarehouseName nvarchar(200) NOT NULL,
    targetWarehouseId nvarchar(50) NOT NULL,
    targetWarehouseName nvarchar(200) NOT NULL,
    totalValue decimal(18,2) NOT NULL,
    remarks nvarchar(2000) NOT NULL,
    createdAt datetime2(0) NOT NULL CONSTRAINT DF_StockTransfers_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_StockTransfers_TransferNo UNIQUE(transferNo),
    CONSTRAINT FK_StockTransfers_Source FOREIGN KEY(sourceWarehouseId) REFERENCES dbo.Warehouses(id),
    CONSTRAINT FK_StockTransfers_Target FOREIGN KEY(targetWarehouseId) REFERENCES dbo.Warehouses(id)
);

IF OBJECT_ID('dbo.StockTransferLines','U') IS NULL
CREATE TABLE dbo.StockTransferLines (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_StockTransferLines PRIMARY KEY,
    transferId nvarchar(80) NOT NULL,
    itemId nvarchar(50) NOT NULL,
    sku nvarchar(100) NOT NULL,
    name nvarchar(250) NOT NULL,
    quantity decimal(18,3) NOT NULL,
    unitCost decimal(18,2) NOT NULL,
    CONSTRAINT FK_StockTransferLines_Transfer FOREIGN KEY(transferId) REFERENCES dbo.StockTransfers(id) ON DELETE CASCADE,
    CONSTRAINT FK_StockTransferLines_Item FOREIGN KEY(itemId) REFERENCES dbo.Items(id)
);

IF OBJECT_ID('dbo.StockMovements','U') IS NULL
CREATE TABLE dbo.StockMovements (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_StockMovements PRIMARY KEY,
    movementType varchar(30) NOT NULL,
    referenceId nvarchar(80) NOT NULL,
    referenceNo nvarchar(100) NOT NULL,
    itemId nvarchar(50) NOT NULL,
    warehouseId nvarchar(50) NOT NULL,
    quantity decimal(18,3) NOT NULL,
    unitCost decimal(18,2) NOT NULL,
    movementDate varchar(10) NOT NULL,
    createdAt datetime2(0) NOT NULL CONSTRAINT DF_StockMovements_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_StockMovements_Item FOREIGN KEY(itemId) REFERENCES dbo.Items(id),
    CONSTRAINT FK_StockMovements_Warehouse FOREIGN KEY(warehouseId) REFERENCES dbo.Warehouses(id)
);
CREATE INDEX IX_StockMovements_ItemWarehouse ON dbo.StockMovements(itemId, warehouseId, movementDate);
GO
