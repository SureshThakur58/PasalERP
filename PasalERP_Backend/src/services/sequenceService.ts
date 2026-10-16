import sql from 'mssql';

export async function nextDocumentNumber(tx: sql.Transaction, fiscalYear: string, documentType: string, prefix: string): Promise<string> {
  const request = new sql.Request(tx);
  request.input('fiscalYear', sql.VarChar(7), fiscalYear)
    .input('documentType', sql.VarChar(40), documentType);
  const result = await request.query(`
    DECLARE @n int;
    SELECT @n = nextNumber
      FROM dbo.DocumentSequences WITH (UPDLOCK, HOLDLOCK)
      WHERE fiscalYear=@fiscalYear AND documentType=@documentType;
    IF @n IS NULL
    BEGIN
      SET @n = 1;
      INSERT INTO dbo.DocumentSequences(fiscalYear,documentType,nextNumber)
      VALUES(@fiscalYear,@documentType,2);
    END
    ELSE
      UPDATE dbo.DocumentSequences SET nextNumber=@n+1
      WHERE fiscalYear=@fiscalYear AND documentType=@documentType;
    SELECT @n AS number;
  `);
  const n = Number(result.recordset[0].number);
  return prefix.includes(fiscalYear) ? `${prefix}${String(n).padStart(4, '0')}` : `${prefix}${fiscalYear}-${String(n).padStart(4, '0')}`;
}

export async function nextJournalNumber(tx: sql.Transaction, fiscalYear: string): Promise<string> {
  return nextDocumentNumber(tx, fiscalYear, 'journal', 'JV');
}
