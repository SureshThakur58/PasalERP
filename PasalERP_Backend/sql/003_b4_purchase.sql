IF COL_LENGTH('dbo.BusinessPartners','isVatApplicable') IS NULL
BEGIN
    ALTER TABLE dbo.BusinessPartners ADD isVatApplicable bit NOT NULL CONSTRAINT DF_BusinessPartners_IsVatApplicable DEFAULT 1;
END;

IF COL_LENGTH('dbo.PurchaseBills','isVatBill') IS NULL
BEGIN
    ALTER TABLE dbo.PurchaseBills ADD isVatBill bit NOT NULL CONSTRAINT DF_PurchaseBills_IsVatBill DEFAULT 0;
END;

IF COL_LENGTH('dbo.PurchaseBills','isCapitalizedVat') IS NULL
BEGIN
    ALTER TABLE dbo.PurchaseBills ADD isCapitalizedVat bit NOT NULL CONSTRAINT DF_PurchaseBills_IsCapitalizedVat DEFAULT 0;
END;
