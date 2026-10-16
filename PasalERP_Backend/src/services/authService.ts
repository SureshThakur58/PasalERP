import crypto from 'node:crypto';
import { getPool, sql } from '../config/db.js';
import { env } from '../config/env.js';
import { HttpError } from '../middleware/errorHandler.js';

export const ROLES = [
  'super_admin',
  'admin',
  'accountant',
  'sales',
  'purchase',
  'inventory',
  'viewer',
] as const;

export type Role = typeof ROLES[number];

export const ROLE_PERMISSIONS: Record<Role, string[]> = {
  super_admin: ['dashboard', 'master_data', 'sales', 'purchase', 'inventory', 'accounting', 'ird', 'setup', 'users'],
  admin: ['dashboard', 'master_data', 'sales', 'purchase', 'inventory', 'accounting', 'ird', 'setup', 'users'],
  accountant: ['dashboard', 'accounting', 'ird'],
  sales: ['dashboard', 'master_data', 'sales'],
  purchase: ['dashboard', 'master_data', 'purchase'],
  inventory: ['dashboard', 'master_data', 'inventory'],
  viewer: ['dashboard'],
};

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  isActive: boolean;
  permissions: string[];
  database: string;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
  database: string;
}

let authSchemaReady = new Set<string>();

function normalizeUsername(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function validateRole(role: unknown): asserts role is Role {
  if (!ROLES.includes(String(role) as Role)) {
    throw new HttpError(400, `Invalid role. Allowed roles: ${ROLES.join(', ')}.`);
  }
}

function hashPassword(password: string, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
}

function encodeBase64Url(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function createToken(user: Omit<AuthUser, 'database'>, database: string): string {
  const payload = {
    sub: user.id,
    username: user.username,
    role: user.role,
    database,
    exp: Date.now() + 8 * 60 * 60 * 1000,
  };
  const encoded = encodeBase64Url(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', env.AUTH_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyToken(token: string): { sub: string; username: string; role: Role; database: string } {
  const [encoded, signature] = String(token ?? '').split('.');
  if (!encoded || !signature) throw new HttpError(401, 'Invalid authentication token.');

  const expected = crypto.createHmac('sha256', env.AUTH_SECRET).update(encoded).digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new HttpError(401, 'Invalid authentication token.');
  }

  let payload: any;
  try {
    payload = JSON.parse(decodeBase64Url(encoded));
  } catch {
    throw new HttpError(401, 'Invalid authentication token.');
  }

  if (!payload?.sub || !payload?.database || !payload?.exp || Number(payload.exp) < Date.now()) {
    throw new HttpError(401, 'Your login session has expired.');
  }

  validateRole(payload.role);
  return payload;
}

export async function ensureAuthSchema(database?: string) {
  const dbName = database ?? env.DB_NAME;
  if (authSchemaReady.has(dbName)) return;

  const pool = await getPool(dbName);

  await pool.request().query(`
    IF OBJECT_ID('dbo.Users','U') IS NULL
    BEGIN
      CREATE TABLE dbo.Users (
        id nvarchar(80) NOT NULL CONSTRAINT PK_Users PRIMARY KEY,
        username nvarchar(100) NOT NULL,
        displayName nvarchar(200) NOT NULL,
        passwordHash nvarchar(300) NOT NULL,
        role nvarchar(30) NOT NULL,
        isActive bit NOT NULL CONSTRAINT DF_Users_IsActive DEFAULT 1,
        createdAt datetime2(0) NOT NULL CONSTRAINT DF_Users_CreatedAt DEFAULT SYSUTCDATETIME(),
        updatedAt datetime2(0) NOT NULL CONSTRAINT DF_Users_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_Users_Username UNIQUE(username),
        CONSTRAINT CK_Users_Role CHECK(role IN ('super_admin','admin','accountant','sales','purchase','inventory','viewer'))
      );
    END;
  `);

  const manager = await pool.request()
    .input('username', sql.NVarChar(100), 'manager')
    .query(`SELECT TOP 1 id FROM dbo.Users WHERE username=@username`);

  if (!manager.recordset[0]) {
    await pool.request()
      .input('id', sql.NVarChar(80), crypto.randomUUID())
      .input('username', sql.NVarChar(100), 'manager')
      .input('displayName', sql.NVarChar(200), 'System Manager')
      .input('passwordHash', sql.NVarChar(300), hashPassword('manager@123'))
      .input('role', sql.NVarChar(30), 'super_admin')
      .query(`
        INSERT INTO dbo.Users(id,username,displayName,passwordHash,role,isActive)
        VALUES(@id,@username,@displayName,@passwordHash,@role,1)
      `);
  }

  authSchemaReady.add(dbName);
}

async function getUserByUsername(username: string, database: string) {
  await ensureAuthSchema(database);
  const pool = await getPool(database);
  const result = await pool.request()
    .input('username', sql.NVarChar(100), username)
    .query(`
      SELECT TOP 1 id,username,displayName,passwordHash,role,isActive
      FROM dbo.Users
      WHERE username=@username
    `);
  return result.recordset[0] ?? null;
}

async function getUserById(id: string, database: string) {
  await ensureAuthSchema(database);
  const pool = await getPool(database);
  const result = await pool.request()
    .input('id', sql.NVarChar(80), id)
    .query(`
      SELECT TOP 1 id,username,displayName,passwordHash,role,isActive
      FROM dbo.Users
      WHERE id=@id
    `);
  return result.recordset[0] ?? null;
}

function toAuthUser(row: any, database: string): AuthUser {
  const role = String(row.role) as Role;
  validateRole(role);
  return {
    id: String(row.id),
    username: String(row.username),
    displayName: String(row.displayName),
    role,
    isActive: Boolean(row.isActive),
    permissions: ROLE_PERMISSIONS[role],
    database,
  };
}

export async function listDatabases() {
  const pool = await getPool('master');
  const result = await pool.request().query(`
    SELECT d.name
    FROM sys.databases d
    WHERE d.state_desc='ONLINE'
      AND d.name NOT IN ('master','model','msdb','tempdb')
    ORDER BY CASE WHEN d.name = '${env.DB_NAME.replace(/'/g, "''")}' THEN 0 ELSE 1 END, d.name
  `);

  const available: { name: string; companyName: string | null }[] = [];
  for (const row of result.recordset) {
    const name = String(row.name);
    try {
      const db = await getPool(name);
      const settings = await db.request().query(`
        IF OBJECT_ID('dbo.CompanySettings','U') IS NOT NULL
          SELECT TOP 1 companyName FROM dbo.CompanySettings WHERE id=1;
        ELSE
          SELECT CAST(NULL AS nvarchar(200)) AS companyName;
      `);
      const companyName = settings.recordset[0]?.companyName ?? null;
      // Only expose databases that are actual ERP databases.
      if (companyName || name === env.DB_NAME) {
        available.push({ name, companyName });
      }
    } catch {
      // Ignore databases the configured SQL login cannot open.
    }
  }

  if (!available.some(x => x.name === env.DB_NAME)) {
    available.unshift({ name: env.DB_NAME, companyName: null });
  }

  return available;
}

export async function login(database: string, username: string, password: string): Promise<AuthSession> {
  const databases = await listDatabases();
  if (!databases.some(x => x.name === database)) {
    throw new HttpError(400, 'Selected database is not available to this ERP server.');
  }

  const row = await getUserByUsername(normalizeUsername(username), database);
  if (!row || !Boolean(row.isActive) || !verifyPassword(String(password ?? ''), String(row.passwordHash))) {
    throw new HttpError(401, 'Invalid database, user name, or password.');
  }

  const user = toAuthUser(row, database);
  const token = createToken(user, database);
  return { token, user, database };
}

export async function currentUser(userId: string, database: string): Promise<AuthUser> {
  const row = await getUserById(userId, database);
  if (!row || !Boolean(row.isActive)) throw new HttpError(401, 'Your user account is inactive or no longer exists.');
  return toAuthUser(row, database);
}

export async function listUsers(database: string) {
  await ensureAuthSchema(database);
  const pool = await getPool(database);
  const result = await pool.request().query(`
    SELECT id,username,displayName,role,isActive,createdAt,updatedAt
    FROM dbo.Users
    ORDER BY CASE WHEN username='manager' THEN 0 ELSE 1 END, username
  `);
  return result.recordset.map((row: any) => {
    const user = toAuthUser(row, database);
    return { ...user, createdAt: row.createdAt, updatedAt: row.updatedAt };
  });
}

export async function createUser(database: string, input: { username: string; displayName: string; password: string; role: Role }) {
  await ensureAuthSchema(database);
  const username = normalizeUsername(input.username);
  const displayName = String(input.displayName ?? '').trim();
  const password = String(input.password ?? '');
  validateRole(input.role);

  if (!/^[a-z0-9._-]{3,100}$/.test(username)) throw new HttpError(400, 'User name must be 3-100 characters and use letters, numbers, dot, underscore or hyphen.');
  if (displayName.length < 2) throw new HttpError(400, 'Display name is required.');
  if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');
  if (username === 'manager' && input.role !== 'super_admin') throw new HttpError(400, 'The default manager user must remain Super Admin.');

  const pool = await getPool(database);
  const existing = await pool.request().input('username', sql.NVarChar(100), username).query(`SELECT 1 FROM dbo.Users WHERE username=@username`);
  if (existing.recordset[0]) throw new HttpError(409, 'That user name already exists.');

  const id = crypto.randomUUID();
  await pool.request()
    .input('id', sql.NVarChar(80), id)
    .input('username', sql.NVarChar(100), username)
    .input('displayName', sql.NVarChar(200), displayName)
    .input('passwordHash', sql.NVarChar(300), hashPassword(password))
    .input('role', sql.NVarChar(30), input.role)
    .query(`INSERT INTO dbo.Users(id,username,displayName,passwordHash,role,isActive) VALUES(@id,@username,@displayName,@passwordHash,@role,1)`);

  return currentUser(id, database);
}

export async function updateUser(database: string, id: string, input: { displayName?: string; role?: Role; isActive?: boolean; password?: string }) {
  await ensureAuthSchema(database);
  const row = await getUserById(id, database);
  if (!row) throw new HttpError(404, 'User not found.');

  const username = String(row.username);
  if (username === 'manager') {
    if (input.role && input.role !== 'super_admin') throw new HttpError(400, 'The default manager user must remain Super Admin.');
    if (input.isActive === false) throw new HttpError(400, 'The default manager user cannot be disabled.');
  }

  if (input.role !== undefined) validateRole(input.role);
  if (input.password !== undefined && String(input.password).length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');

  const pool = await getPool(database);
  const sets: string[] = ['updatedAt=SYSUTCDATETIME()'];
  const req = pool.request().input('id', sql.NVarChar(80), id);

  if (input.displayName !== undefined) {
    const displayName = String(input.displayName).trim();
    if (displayName.length < 2) throw new HttpError(400, 'Display name is required.');
    req.input('displayName', sql.NVarChar(200), displayName);
    sets.push('displayName=@displayName');
  }
  if (input.role !== undefined) {
    req.input('role', sql.NVarChar(30), input.role);
    sets.push('role=@role');
  }
  if (input.isActive !== undefined) {
    req.input('isActive', sql.Bit, Boolean(input.isActive));
    sets.push('isActive=@isActive');
  }
  if (input.password !== undefined) {
    req.input('passwordHash', sql.NVarChar(300), hashPassword(String(input.password)));
    sets.push('passwordHash=@passwordHash');
  }

  await req.query(`UPDATE dbo.Users SET ${sets.join(', ')} WHERE id=@id`);
  return currentUser(id, database);
}

export async function deleteUser(database: string, id: string) {
  await ensureAuthSchema(database);
  const row = await getUserById(id, database);
  if (!row) throw new HttpError(404, 'User not found.');

  const username = String(row.username);
  if (username === 'manager') {
    throw new HttpError(400, 'The default manager user cannot be deleted.');
  }

  const pool = await getPool(database);
  await pool.request()
    .input('id', sql.NVarChar(80), id)
    .query('DELETE FROM dbo.Users WHERE id=@id');
}
