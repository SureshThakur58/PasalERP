import sql from 'mssql';
import { HttpError } from '../middleware/errorHandler.js';

export interface AccountDetermination {
  cashBank: {
    code: string;
    name: string;
  };

  accountsReceivable: {
    code: string;
    name: string;
  };

  inventory: {
    code: string;
    name: string;
  };

  inputVat: {
    code: string;
    name: string;
  };

  accountsPayable: {
    code: string;
    name: string;
  };

  outputVat: {
    code: string;
    name: string;
  };

  salesRevenue: {
    code: string;
    name: string;
  };

  cogs: {
    code: string;
    name: string;
  };
}


const REQUIRED_MAPPINGS = [
  'CASH_BANK',
  'ACCOUNTS_RECEIVABLE',
  'INVENTORY',
  'INPUT_VAT',
  'ACCOUNTS_PAYABLE',
  'OUTPUT_VAT',
  'SALES_REVENUE',
  'COGS'
];


export async function getAccountDetermination(
  tx: sql.Transaction
): Promise<AccountDetermination> {

  const result = await new sql.Request(tx).query(`
    SELECT
      m.mappingKey,
      a.code,
      a.name,
      a.isActive
    FROM dbo.AccountMappings m
    LEFT JOIN dbo.Accounts a
      ON a.code = m.accountCode
  `);

  const map = new Map<string, any>();

  for (const row of result.recordset) {
    if (!row.code) {
      throw new HttpError(
        400,
        `Account Determination mapping ${row.mappingKey} points to account ${row.accountCode}, but that account does not exist in the Chart of Accounts.`
      );
    }

    if (!row.isActive) {
      throw new HttpError(
        400,
        `Mapped account ${row.code} for ${row.mappingKey} is inactive`
      );
    }


    map.set(row.mappingKey, row);
  }

  for (const key of REQUIRED_MAPPINGS) {
    if (!map.has(key)) {
      throw new HttpError(
        400,
        `Account Determination is incomplete. Please configure ${key} in Finance → Chart of Accounts.`
      );
    }
  }

  return {
    cashBank: map.get('CASH_BANK'),
    accountsReceivable: map.get('ACCOUNTS_RECEIVABLE'),
    inventory: map.get('INVENTORY'),
    inputVat: map.get('INPUT_VAT'),
    accountsPayable: map.get('ACCOUNTS_PAYABLE'),
    outputVat: map.get('OUTPUT_VAT'),
    salesRevenue: map.get('SALES_REVENUE'),
    cogs: map.get('COGS')
  };
}