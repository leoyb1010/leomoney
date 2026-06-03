const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'leomoney-v4-'));
process.env.LEOMONEY_DATA_DIR = tmpDir;
process.env.LEOMONEY_RATE_LIMIT_MAX_REQUESTS = '0';
process.env.LEOMONEY_ALLOWED_ORIGINS = '';

const { createApp } = require('../../../server');

let server;
let base;

async function json(pathname, options = {}) {
  const res = await fetch(`${base}${pathname}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

describe('V4 API contracts', () => {
  before(async () => {
    server = createApp().listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('imports existing US stock and crypto positions into the current account', async () => {
    const imported = await json('/api/account/positions/import', {
      method: 'POST',
      body: JSON.stringify({
        mode: 'record',
        positions: [
          { symbol: 'AAPL', qty: 10, avgCost: 150, category: 'usstocks', currency: 'USD' },
          { symbol: 'BTCUSDT', qty: 0.1, avgCost: 65000, category: 'crypto', currency: 'USD' },
        ],
      }),
    });
    assert.equal(imported.success, true);
    assert.equal(imported.imported.length, 2);

    const account = await json('/api/account');
    assert.equal(Boolean(account.positions.AAPL), true);
    assert.equal(Boolean(account.positions.BTCUSDT), true);
    assert.equal(account.history.filter(item => item.type === 'position_import').length, 2);
  });
});
