const fs = require('fs');
const path = require('path');
const readline = require('readline');

const AUDIT_DIR = path.join(__dirname, '..', '..', '..', 'data', 'audit');
const MAX_READ_FILES = 7;

function ensureAuditDir() {
  if (!fs.existsSync(AUDIT_DIR)) fs.mkdirSync(AUDIT_DIR, { recursive: true });
}

function auditFileForDate(date = new Date()) {
  const day = date.toISOString().slice(0, 10);
  return path.join(AUDIT_DIR, `${day}.jsonl`);
}

function safeJson(value) {
  return JSON.stringify(value, (_key, item) => {
    if (typeof item === 'bigint') return item.toString();
    if (item instanceof Error) return { name: item.name, message: item.message, stack: item.stack };
    return item;
  });
}

async function recordAuditEvent(event) {
  ensureAuditDir();
  const payload = {
    id: event.id || `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ts: event.ts || new Date().toISOString(),
    ...event,
  };
  await fs.promises.appendFile(auditFileForDate(), `${safeJson(payload)}\n`, 'utf8');
  return payload;
}

function recentAuditFiles() {
  ensureAuditDir();
  return fs.readdirSync(AUDIT_DIR)
    .filter(name => name.endsWith('.jsonl'))
    .sort()
    .reverse()
    .slice(0, MAX_READ_FILES)
    .map(name => path.join(AUDIT_DIR, name));
}

async function readAuditEvents({ runId, type, limit = 100 } = {}) {
  const events = [];
  for (const file of recentAuditFiles()) {
    const stream = fs.createReadStream(file, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        if (runId && event.runId !== runId) continue;
        if (type && event.type !== type) continue;
        events.push(event);
      } catch {
        events.push({ type: 'audit_parse_error', file, raw: line.slice(0, 500) });
      }
    }
  }
  events.sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')));
  return events.slice(0, limit);
}

async function getReplay(runId) {
  const events = await readAuditEvents({ runId, limit: 500 });
  return {
    runId,
    events: events.reverse(),
    found: events.length > 0,
  };
}

module.exports = {
  AUDIT_DIR,
  recordAuditEvent,
  readAuditEvents,
  getReplay,
};
