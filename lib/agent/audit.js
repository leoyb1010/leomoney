/**
 * Leomoney Agent 审计链
 * 记录 observation → prompt → raw output → parsed action → risk → execution 完整链路
 * 必须持久化，不能只存在内存数组
 */

const fs = require('fs');
const path = require('path');

const AUDIT_DIR = path.join(__dirname, '../../data/audit');
const MAX_MEM_AUDIT = 200; // 内存中保留最近 N 条

let audits = [];

// 确保审计目录存在
function _ensureDir() {
  if (!fs.existsSync(AUDIT_DIR)) fs.mkdirSync(AUDIT_DIR, { recursive: true });
}

/**
 * 记录一次 Agent 决策审计
 * @param {Object} entry
 */
function recordAudit(entry) {
  const audit = {
    id: entry.id || `audit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    decisionId: entry.decisionId,
    proposalId: entry.proposalId,
    accountId: entry.accountId,
    symbol: entry.symbol,
    observationSnapshot: entry.observationSnapshot,
    promptText: entry.promptText,
    rawModelOutput: entry.rawModelOutput,
    parsedAction: entry.parsedAction,
    parseError: entry.parseError || null,
    riskDecision: entry.riskDecision,
    submittedOrderIds: entry.submittedOrderIds || [],
    executionResult: entry.executionResult,
    createdAt: entry.createdAt || new Date().toISOString(),
  };

  // 内存缓存
  audits.unshift(audit);
  if (audits.length > MAX_MEM_AUDIT) audits.length = MAX_MEM_AUDIT;

  // 文件持久化（异步，不阻塞）
  _ensureDir();
  const filePath = path.join(AUDIT_DIR, `${audit.id}.json`);
  fs.writeFile(filePath, JSON.stringify(audit, null, 2), () => {});

  return audit;
}

function getAudits(limit = 50) {
  return audits.slice(0, limit);
}

function getAuditById(id) {
  // 先查内存
  const mem = audits.find(a => a.id === id);
  if (mem) return mem;
  // 再查文件
  const filePath = path.join(AUDIT_DIR, `${id}.json`);
  if (fs.existsSync(filePath)) {
    try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
  }
  return null;
}

function getAuditsBySymbol(symbol, limit = 20) {
  return audits.filter(a => a.symbol === symbol).slice(0, limit);
}

function getAuditsByDecisionId(decisionId) {
  return audits.filter(a => a.decisionId === decisionId);
}

module.exports = {
  recordAudit,
  getAudits,
  getAuditById,
  getAuditsBySymbol,
  getAuditsByDecisionId,
};
