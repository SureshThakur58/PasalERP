IF COL_LENGTH('dbo.CompanySettings','businessNature') IS NULL
BEGIN
    ALTER TABLE dbo.CompanySettings ADD businessNature varchar(3) NOT NULL CONSTRAINT DF_CompanySettings_BusinessNature DEFAULT 'VAT';
END;

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_CompanySettings_BusinessNature' AND parent_object_id = OBJECT_ID('dbo.CompanySettings'))
BEGIN
    ALTER TABLE dbo.CompanySettings ADD CONSTRAINT CK_CompanySettings_BusinessNature CHECK (businessNature IN ('VAT','PAN'));
END;
