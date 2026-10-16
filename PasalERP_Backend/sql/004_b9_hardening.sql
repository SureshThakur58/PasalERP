USE NepalIRDERP;
GO
IF OBJECT_ID('dbo.ErpSchemaVersion','U') IS NULL
BEGIN
 CREATE TABLE dbo.ErpSchemaVersion (version int NOT NULL CONSTRAINT PK_ErpSchemaVersion PRIMARY KEY, appliedAt datetime2(0) NOT NULL CONSTRAINT DF_ErpSchemaVersion_AppliedAt DEFAULT SYSUTCDATETIME(), description nvarchar(500) NOT NULL);
END;
GO
IF NOT EXISTS (SELECT 1 FROM dbo.ErpSchemaVersion WHERE version=4) INSERT INTO dbo.ErpSchemaVersion(version,description) VALUES(4,N'B9 backup and SQL migration hardening');
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_JournalEntries_FiscalDate' AND object_id=OBJECT_ID('dbo.JournalEntries')) CREATE INDEX IX_JournalEntries_FiscalDate ON dbo.JournalEntries(fiscalYear,adDate,id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_StockMovements_Reference' AND object_id=OBJECT_ID('dbo.StockMovements')) CREATE INDEX IX_StockMovements_Reference ON dbo.StockMovements(referenceId,movementType);
GO
