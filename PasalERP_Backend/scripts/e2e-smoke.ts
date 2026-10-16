import assert from 'node:assert/strict';

const base = (process.env.E2E_API_BASE_URL ?? 'http://localhost:4000/api').replace(/\/$/, '');
let passed = 0;
let failed = 0;

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  let body: any = null;
  try { body = await response.json(); } catch { /* empty */ }
  return { response, body };
}

async function check(name: string, fn: () => Promise<void>) {
  try { await fn(); passed++; console.log(`PASS  ${name}`); }
  catch (error) { failed++; console.error(`FAIL  ${name}:`, error instanceof Error ? error.message : error); }
}

async function list(path: string) {
  const { response, body } = await request(path);
  assert.equal(response.ok, true, `${path} returned HTTP ${response.status}`);
  assert.equal(body?.success, true, `${path} did not return success=true`);
  assert.ok(Array.isArray(body?.data), `${path} data is not an array`);
  return body.data;
}

async function main() {
  console.log(`B10 safe E2E smoke test against ${base}`);

  await check('API health', async () => {
    const { response, body } = await request('/health');
    assert.equal(response.status, 200);
    assert.equal(body?.success, true);
  });

  const datasets: Record<string, any[]> = {};
  for (const path of ['/warehouses', '/partners', '/items', '/accounts', '/batches', '/sales', '/purchases', '/journals', '/stock-transfers', '/stock-movements']) {
    await check(`GET ${path}`, async () => { datasets[path] = await list(path); });
  }

  await check('Master data IDs are unique', async () => {
    for (const key of ['/warehouses', '/partners', '/items', '/accounts']) {
      const ids = datasets[key].map(x => String(x.id ?? x.code));
      assert.equal(new Set(ids).size, ids.length, `${key} contains duplicate identifiers`);
    }
  });

  await check('FIFO batches have non-negative quantities and costs', async () => {
    for (const batch of datasets['/batches']) {
      assert.ok(Number(batch.remainingQty) >= 0, `Negative remainingQty in batch ${batch.id}`);
      assert.ok(Number(batch.originalQty) >= Number(batch.remainingQty), `remainingQty exceeds originalQty in batch ${batch.id}`);
      assert.ok(Number(batch.unitCost) >= 0, `Negative unitCost in batch ${batch.id}`);
    }
  });

  await check('All stored journals are balanced', async () => {
    for (const journal of datasets['/journals']) {
      assert.equal(Number(journal.totalDebit).toFixed(2), Number(journal.totalCredit).toFixed(2), `Unbalanced journal ${journal.entryNo ?? journal.id}`);
      assert.equal(Boolean(journal.isBalanced), true, `Journal ${journal.entryNo ?? journal.id} is not marked balanced`);
    }
  });

  await check('Stock movement quantities and types are valid', async () => {
    const valid = new Set(['PURCHASE','SALE','SALES_RETURN','PURCHASE_RETURN','TRANSFER_IN','TRANSFER_OUT']);
    for (const movement of datasets['/stock-movements']) {
      assert.ok(valid.has(String(movement.movementType)), `Unknown movement type ${movement.movementType}`);
      assert.notEqual(Number(movement.quantity), 0, `Zero quantity movement ${movement.referenceNo ?? movement.referenceId}`);
      assert.ok(Number(movement.unitCost) >= 0, `Negative movement cost ${movement.referenceNo ?? movement.referenceId}`);
    }
  });

  for (const path of ['/ird/sales-book', '/ird/purchase-book']) {
    await check(`GET ${path}`, async () => { await list(path); });
  }

  await check('GET /ird/vat-summary', async () => {
    const { response, body } = await request('/ird/vat-summary');
    assert.equal(response.status, 200);
    assert.equal(body?.success, true);
    for (const key of ['outputVat', 'inputVat', 'netVatPayable', 'taxableSales', 'exemptSales', 'taxablePurchases', 'exemptPurchases']) {
      assert.equal(typeof body.data[key], 'number', `${key} must be numeric`);
    }
  });

  await check('GET /ird/compliance', async () => {
    const { response, body } = await request('/ird/compliance');
    assert.equal(response.status, 200);
    assert.equal(body?.success, true);
    assert.ok(body.data && typeof body.data === 'object');
  });

  await check('GET /dashboard', async () => {
    const { response, body } = await request('/dashboard');
    assert.equal(response.status, 200);
    assert.equal(body?.success, true);
    assert.ok(body.data && typeof body.data === 'object');
  });

  await check('GET /migration/status', async () => {
    const { response, body } = await request('/migration/status');
    assert.equal(response.status, 200);
    assert.equal(body?.success, true);
  });

  await check('GET /migration/export returns a versioned backup', async () => {
    const { response, body } = await request('/migration/export');
    assert.equal(response.status, 200);
    assert.equal(body?.success, true);
    assert.equal(body?.data?.format, 'AGS-NEPAL-IRD-ERP');
    assert.ok(Number(body?.data?.version) >= 3, 'Server backup version must be at least 3');
    assert.ok(body?.data?.integrity?.sha256 || body?.data?.sha256, 'Backup integrity hash is missing');
  });

  // Negative POST tests are deliberately non-mutating. They verify API validation without creating ERP data.
  await check('POST /journals rejects an unbalanced voucher', async () => {
    const { response } = await request('/journals', {
      method: 'POST',
      body: JSON.stringify({ fiscalYear: '2099/00', mitiDate: '01/01/2099', adDate: '2099-04-14', referenceNo: 'B10-INVALID-JV', narration: 'B10 validation test', lines: [
        { accountCode: 'INVALID', debit: 100, credit: 0 },
        { accountCode: 'INVALID', debit: 0, credit: 99 },
      ] }),
    });
    assert.equal(response.status >= 400 && response.status < 500, true);
  });

  await check('POST /sales rejects missing required data', async () => {
    const { response } = await request('/sales', { method: 'POST', body: JSON.stringify({}) });
    assert.equal(response.status, 400);
  });

  await check('POST /purchases rejects missing required data', async () => {
    const { response } = await request('/purchases', { method: 'POST', body: JSON.stringify({}) });
    assert.equal(response.status, 400);
  });

  await check('POST /stock-transfers rejects missing required data', async () => {
    const { response } = await request('/stock-transfers', { method: 'POST', body: JSON.stringify({}) });
    assert.equal(response.status, 400);
  });

  await check('POST /migration/import-localstorage rejects replace without confirmation', async () => {
    const { response } = await request('/migration/import-localstorage', { method: 'POST', body: JSON.stringify({ mode: 'replace', bundle: {} }) });
    assert.equal(response.status, 400);
  });

  console.log(`\nB10 result: ${passed} passed, ${failed} failed.`);
  if (failed) process.exitCode = 1;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
