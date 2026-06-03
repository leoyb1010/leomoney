const fs = require('fs');
const path = require('path');
const { getDataDir } = require('../../../src/server/config');

const MAX_RUNS = 160;
const MAX_MEMORY_PER_SYMBOL = 80;

const DEFAULT_RESEARCH_CONFIG = {
  quickModel: process.env.RESEARCH_QUICK_MODEL || process.env.LLM_QUICK_MODEL || process.env.LLM_MODEL || 'deepseek-chat',
  deepModel: process.env.RESEARCH_DEEP_MODEL || process.env.LLM_DEEP_MODEL || process.env.LLM_MODEL || 'deepseek-reasoner',
  debateRounds: Number(process.env.RESEARCH_DEBATE_ROUNDS || 1),
  riskDiscussRounds: Number(process.env.RESEARCH_RISK_DISCUSS_ROUNDS || 1),
  outputLanguage: process.env.RESEARCH_OUTPUT_LANGUAGE || 'zh',
  defaultDepth: 'quick',
  benchmarkMap: {
    usstocks: process.env.RESEARCH_DEFAULT_BENCHMARK_US || 'QQQ',
    crypto: process.env.RESEARCH_DEFAULT_BENCHMARK_CRYPTO || 'BTCUSDT',
    metals: 'XAU',
    hkstocks: 'HSI',
    astocks: '000001',
    indices: 'SPY',
  },
  dataVendors: ['leomoney-quotes', 'eastmoney-news', 'optional-search'],
};

function filePath(name) {
  const dir = getDataDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, name);
}

function readJson(name, fallback) {
  try {
    const file = filePath(name);
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return fallback;
  }
}

function writeJson(name, value) {
  const file = filePath(name);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

function getDefaultResearchConfig() {
  return JSON.parse(JSON.stringify(DEFAULT_RESEARCH_CONFIG));
}

function getResearchConfig() {
  const saved = readJson('research-config.json', {});
  return {
    ...getDefaultResearchConfig(),
    ...saved,
    benchmarkMap: {
      ...getDefaultResearchConfig().benchmarkMap,
      ...(saved.benchmarkMap || {}),
    },
    dataVendors: Array.isArray(saved.dataVendors) ? saved.dataVendors : getDefaultResearchConfig().dataVendors,
  };
}

function updateResearchConfig(patch = {}) {
  const current = getResearchConfig();
  const next = {
    ...current,
    ...patch,
    benchmarkMap: {
      ...(current.benchmarkMap || {}),
      ...(patch.benchmarkMap || {}),
    },
    updatedAt: new Date().toISOString(),
  };
  writeJson('research-config.json', next);
  return next;
}

function listRuns({ symbol, limit = 40 } = {}) {
  const runs = readJson('research-runs.json', []);
  const normalized = symbol ? String(symbol).trim().toUpperCase() : null;
  return runs
    .filter(run => !normalized || run.symbol === normalized)
    .slice(0, Math.min(Math.max(Number(limit) || 40, 1), MAX_RUNS));
}

function getRun(runId) {
  return readJson('research-runs.json', []).find(run => run.id === runId) || null;
}

function saveRun(run) {
  const runs = readJson('research-runs.json', []);
  const next = [run, ...runs.filter(item => item.id !== run.id)].slice(0, MAX_RUNS);
  writeJson('research-runs.json', next);
  return run;
}

function getMemory(symbol, { limit = 12 } = {}) {
  const normalized = String(symbol || '').trim().toUpperCase();
  const memory = readJson('research-memory.json', {});
  return (memory[normalized] || []).slice(0, Math.min(Math.max(Number(limit) || 12, 1), MAX_MEMORY_PER_SYMBOL));
}

function appendMemory(symbol, entry) {
  const normalized = String(symbol || '').trim().toUpperCase();
  const memory = readJson('research-memory.json', {});
  const row = {
    id: entry.id || `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    symbol: normalized,
    createdAt: new Date().toISOString(),
    ...entry,
  };
  memory[normalized] = [row, ...(memory[normalized] || []).filter(item => item.id !== row.id)].slice(0, MAX_MEMORY_PER_SYMBOL);
  writeJson('research-memory.json', memory);
  return row;
}

module.exports = {
  appendMemory,
  getDefaultResearchConfig,
  getMemory,
  getResearchConfig,
  getRun,
  listRuns,
  saveRun,
  updateResearchConfig,
};
