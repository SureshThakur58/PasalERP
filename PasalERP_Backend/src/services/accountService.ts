import sql from 'mssql';
import { getPool } from '../config/db.js';
import { HttpError } from '../middleware/errorHandler.js';

type AccountCategory =
  | 'asset'
  | 'liability'
  | 'equity'
  | 'revenue'
  | 'expense';

const STANDARD_ACCOUNTS = [
  {
    code: '1010',
    name: 'Cash & Bank',
    category: 'asset',
    description: 'Cash in hand, bank accounts and digital payment balances'
  },
  {
    code: '1020',
    name: 'Accounts Receivable',
    category: 'asset',
    description: 'Amounts receivable from customers'
  },
  {
    code: '1030',
    name: 'Merchandise Inventory',
    category: 'asset',
    description: 'Inventory valued using FIFO'
  },
  {
    code: '1040',
    name: 'Input VAT Receivable',
    category: 'asset',
    description: 'Recoverable input VAT from eligible purchases'
  },
  {
    code: '2010',
    name: 'Accounts Payable',
    category: 'liability',
    description: 'Amounts payable to suppliers'
  },
  {
    code: '2020',
    name: 'Output VAT Payable',
    category: 'liability',
    description: 'VAT collected from taxable sales'
  },
  {
    code: '3010',
    name: "Owner's Capital",
    category: 'equity',
    description: 'Owner contributed capital'
  },
  {
    code: '3020',
    name: 'Retained Earnings',
    category: 'equity',
    description: 'Accumulated retained earnings'
  },
  {
    code: '4010',
    name: 'Garment Sales Revenue',
    category: 'revenue',
    description: 'Revenue from garment sales'
  },
  {
    code: '4020',
    name: 'Other Operating Income',
    category: 'revenue',
    description: 'Other operating income'
  },
  {
    code: '5010',
    name: 'Cost of Goods Sold',
    category: 'expense',
    description: 'FIFO cost of goods sold'
  },
  {
    code: '5020',
    name: 'Store Rent & Operating Expense',
    category: 'expense',
    description: 'Store rent and operating expenses'
  },
  {
    code: '5030',
    name: 'General & Administrative Expense',
    category: 'expense',
    description: 'General and administrative expenses'
  }
];

const STANDARD_MAPPINGS = [
  ['CASH_BANK', '1010', 'Cash / Bank', 'Cash and bank account used for cash or bank sales and purchases'],
  ['ACCOUNTS_RECEIVABLE', '1020', 'Accounts Receivable', 'Customer receivable account'],
  ['INVENTORY', '1030', 'Inventory', 'Inventory asset account'],
  ['INPUT_VAT', '1040', 'Input VAT', 'Recoverable purchase VAT'],
  ['ACCOUNTS_PAYABLE', '2010', 'Accounts Payable', 'Supplier payable account'],
  ['OUTPUT_VAT', '2020', 'Output VAT', 'VAT payable on sales'],
  ['SALES_REVENUE', '4010', 'Sales Revenue', 'Garment sales revenue'],
  ['COGS', '5010', 'Cost of Goods Sold', 'FIFO cost of goods sold'],
  ['OPERATING_EXPENSE', '5020', 'Operating Expense', 'Default operating expense account'],
  ['OWNER_CAPITAL', '3010', "Owner's Capital", 'Opening capital account']
] as const;


export async function listAccounts() {
  const pool = await getPool();

  const result = await pool.request().query(`
    SELECT
      code,
      name,
      category,
      description,
      balance,
      isActive,
      isSystem
    FROM dbo.Accounts
    ORDER BY code
  `);

  return result.recordset;
}


export async function createAccount(body: any) {
  const code = String(body.code ?? '').trim();
  const name = String(body.name ?? '').trim();
  const category = String(body.category ?? '');
  const description = String(body.description ?? '').trim();

  if (!code) {
    throw new HttpError(400, 'Account code is required');
  }

  if (!name) {
    throw new HttpError(400, 'Account name is required');
  }

  if (!['asset', 'liability', 'equity', 'revenue', 'expense'].includes(category)) {
    throw new HttpError(400, 'Invalid account category');
  }

  if (code.length > 20) {
    throw new HttpError(400, 'Account code cannot exceed 20 characters');
  }

  const pool = await getPool();

  const existing = await pool.request()
    .input('code', code)
    .query(`
      SELECT code
      FROM dbo.Accounts
      WHERE code = @code
    `);

  if (existing.recordset[0]) {
    throw new HttpError(409, `Account ${code} already exists`);
  }

  await pool.request()
    .input('code', code)
    .input('name', name)
    .input('category', category)
    .input('description', description)
    .query(`
      INSERT INTO dbo.Accounts
      (
        code,
        name,
        category,
        description,
        balance,
        isActive,
        isSystem
      )
      VALUES
      (
        @code,
        @name,
        @category,
        @description,
        0,
        1,
        0
      )
    `);

  return getAccount(code);
}


export async function getAccount(code: string) {
  const pool = await getPool();

  const result = await pool.request()
    .input('code', code)
    .query(`
      SELECT
        code,
        name,
        category,
        description,
        balance,
        isActive,
        isSystem
      FROM dbo.Accounts
      WHERE code = @code
    `);

  if (!result.recordset[0]) {
    throw new HttpError(404, `Account ${code} not found`);
  }

  return result.recordset[0];
}


export async function updateAccount(code: string, body: any) {
  const pool = await getPool();

  const existing = await getAccount(code);

  const name = String(body.name ?? existing.name).trim();
  const description = String(
    body.description ?? existing.description
  ).trim();

  const category = String(
    body.category ?? existing.category
  );

  const isActive =
    body.isActive === undefined
      ? existing.isActive
      : Boolean(body.isActive);

  if (!name) {
    throw new HttpError(400, 'Account name is required');
  }

  if (!['asset', 'liability', 'equity', 'revenue', 'expense'].includes(category)) {
    throw new HttpError(400, 'Invalid account category');
  }

  /*
   * Account code is intentionally immutable.
   * JournalLines reference Accounts(code).
   */
  await pool.request()
    .input('code', code)
    .input('name', name)
    .input('category', category)
    .input('description', description)
    .input('isActive', isActive ? 1 : 0)
    .query(`
      UPDATE dbo.Accounts
      SET
        name = @name,
        category = @category,
        description = @description,
        isActive = @isActive
      WHERE code = @code
    `);

  return getAccount(code);
}


export async function deleteAccount(code: string) {
  const pool = await getPool();

  const account = await getAccount(code);

  if (account.isSystem) {
    throw new HttpError(
      409,
      'System account cannot be deleted. Deactivate it instead.'
    );
  }

  const used = await pool.request()
    .input('code', code)
    .query(`
      SELECT TOP 1 1 AS used
      FROM dbo.JournalLines
      WHERE accountCode = @code
    `);

  if (used.recordset[0]) {
    throw new HttpError(
      409,
      'Account cannot be deleted because it has journal transactions. Deactivate it instead.'
    );
  }

  const mapped = await pool.request()
    .input('code', code)
    .query(`
      SELECT TOP 1 mappingKey
      FROM dbo.AccountMappings
      WHERE accountCode = @code
    `);

  if (mapped.recordset[0]) {
    throw new HttpError(
      409,
      'Account cannot be deleted because it is assigned to Account Determination.'
    );
  }

  await pool.request()
    .input('code', code)
    .query(`
      DELETE FROM dbo.Accounts
      WHERE code = @code
    `);
}


export async function initializeStandardChart() {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);

  await tx.begin();

  try {
    for (const account of STANDARD_ACCOUNTS) {
      const request = new sql.Request(tx);

      request
        .input('code', account.code)
        .input('name', account.name)
        .input('category', account.category)
        .input('description', account.description);

      await request.query(`
        IF NOT EXISTS (
          SELECT 1
          FROM dbo.Accounts
          WHERE code = @code
        )
        BEGIN
          INSERT INTO dbo.Accounts
          (
            code,
            name,
            category,
            description,
            balance,
            isActive,
            isSystem
          )
          VALUES
          (
            @code,
            @name,
            @category,
            @description,
            0,
            1,
            1
          );
        END
      `);
    }

    for (const [
      mappingKey,
      accountCode,
      label,
      description
    ] of STANDARD_MAPPINGS) {

      const request = new sql.Request(tx);

      request
        .input('mappingKey', mappingKey)
        .input('accountCode', accountCode)
        .input('label', label)
        .input('description', description);

      await request.query(`
        IF NOT EXISTS (
          SELECT 1
          FROM dbo.AccountMappings
          WHERE mappingKey = @mappingKey
        )
        BEGIN
          INSERT INTO dbo.AccountMappings
          (
            mappingKey,
            accountCode,
            label,
            description,
            isRequired
          )
          VALUES
          (
            @mappingKey,
            @accountCode,
            @label,
            @description,
            1
          );
        END
      `);
    }

    await tx.commit();

    return {
      createdAccounts: STANDARD_ACCOUNTS.length,
      mappings: STANDARD_MAPPINGS.length
    };

  } catch (error) {
    try {
      await tx.rollback();
    } catch {}

    throw error;
  }
}


export async function listAccountMappings() {
  const pool = await getPool();

  const result = await pool.request().query(`
    SELECT
      m.mappingKey,
      m.accountCode,
      a.name AS accountName,
      a.category,
      m.label,
      m.description,
      m.isRequired
    FROM dbo.AccountMappings m
    INNER JOIN dbo.Accounts a
      ON a.code = m.accountCode
    ORDER BY m.mappingKey
  `);

  return result.recordset;
}


export async function updateAccountMapping(
  mappingKey: string,
  accountCode: string
) {
  const pool = await getPool();

  const account = await pool.request()
    .input('code', accountCode)
    .query(`
      SELECT code, name, isActive
      FROM dbo.Accounts
      WHERE code = @code
    `);

  if (!account.recordset[0]) {
    throw new HttpError(
      400,
      `Account ${accountCode} does not exist`
    );
  }

  if (!account.recordset[0].isActive) {
    throw new HttpError(
      400,
      `Account ${accountCode} is inactive`
    );
  }

  const mapping = await pool.request()
    .input('mappingKey', mappingKey)
    .query(`
      SELECT mappingKey
      FROM dbo.AccountMappings
      WHERE mappingKey = @mappingKey
    `);

  if (!mapping.recordset[0]) {
    throw new HttpError(
      404,
      `Account mapping ${mappingKey} does not exist`
    );
  }

  await pool.request()
    .input('mappingKey', mappingKey)
    .input('accountCode', accountCode)
    .query(`
      UPDATE dbo.AccountMappings
      SET
        accountCode = @accountCode,
        updatedAt = SYSUTCDATETIME()
      WHERE mappingKey = @mappingKey
    `);

  return listAccountMappings();
}