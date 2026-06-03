const { askLLM, isLLMReady, getLLMInfo } = require('../brain');
const { createProposal } = require('../cognitiveLoop');
const { buildResearchContext } = require('./contextBuilder');
const { buildAnalystReports } = require('./analysts');
const { buildDebate } = require('./debate');
const { buildTraderDraft } = require('./trader');
const { buildRiskReview } = require('./risk');
const { evaluateOutcome } = require('./outcomeEvaluator');
const {
  createProgress,
  makeRunId,
  markProgress,
  normalizeSymbol,
  riskLevelFromScore,
} = require('./schemas');
const {
  getResearchConfig,
  getRun,
  listRuns,
  saveRun,
} = require('./memory');

function publicRun(run) {
  if (!run) return null;
  return {
    ...run,
    context: {
      ...run.context,
      account: run.context?.account,
      position: run.context?.position,
      intel: {
        news: run.context?.intel?.news || [],
        search: run.context?.intel?.search || [],
        sourceConfigured: !!run.context?.intel?.sourceConfigured,
      },
      memory: run.context?.memory || [],
    },
  };
}

async function runResearch(input = {}) {
  const config = getResearchConfig();
  const symbol = normalizeSymbol(input.symbol);
  if (!symbol) throw new Error('缺少 symbol');
  const depth = input.depth === 'deep' ? 'deep' : 'quick';
  const run = {
    id: makeRunId(symbol),
    symbol,
    requestedSymbol: symbol,
    depth,
    horizon: input.horizon || 'swing',
    focus: Array.isArray(input.focus) ? input.focus.slice(0, 8) : [],
    status: 'running',
    progress: createProgress(),
    startedAt: new Date().toISOString(),
    completedAt: null,
    configSnapshot: {
      quickModel: config.quickModel,
      deepModel: config.deepModel,
      debateRounds: config.debateRounds,
      riskDiscussRounds: config.riskDiscussRounds,
      benchmarkMap: config.benchmarkMap,
    },
    llm: getLLMInfo(),
  };
  saveRun(run);

  try {
    run.context = await buildResearchContext({ symbol, config, includeIntelligence: true });
    run.symbol = run.context.symbol;
    run.quote = run.context.quote;
    run.benchmark = run.context.benchmark;
    run.progress = markProgress(markProgress(run.progress, 'quote'), 'intel');
    saveRun(run);

    const assembled = buildResearchFromContext(run.context, config);
    Object.assign(run, assembled);
    for (const step of ['market', 'news', 'sentiment', 'fundamental', 'bull', 'bear', 'manager', 'trader', 'risk', 'portfolio']) {
      run.progress = markProgress(run.progress, step);
    }

    if (depth === 'deep' && isLLMReady()) {
      run.llmOverlay = await buildLlmOverlay(run, config);
      if (run.llmOverlay?.managerNote) {
        run.manager.summary = `${run.manager.summary} ${run.llmOverlay.managerNote}`;
      }
    }

    run.status = 'completed';
    run.completedAt = new Date().toISOString();
    saveRun(run);
    return publicRun(run);
  } catch (err) {
    run.status = 'failed';
    run.error = err.message;
    run.completedAt = new Date().toISOString();
    saveRun(run);
    throw err;
  }
}

function buildResearchFromContext(context, config = getResearchConfig()) {
  const analysts = buildAnalystReports(context);
  const debate = buildDebate(context, analysts, config);
  const traderDraft = buildTraderDraft(context, debate.researchManager);
  const risk = buildRiskReview(context, traderDraft, debate.researchManager, config);
  const dataQualityRisk = !!context.quote.dataQuality?.isSynthetic || !context.quote.price;
  const manager = {
    ...debate.researchManager,
    riskLevel: riskLevelFromScore(debate.researchManager.score, dataQualityRisk),
  };
  return {
    analysts,
    debate: {
      rounds: debate.rounds,
      bullResearcher: debate.bullResearcher,
      bearResearcher: debate.bearResearcher,
    },
    manager,
    traderDraft,
    riskReview: {
      rounds: risk.rounds,
      reviewers: risk.reviewers,
    },
    portfolioManager: risk.portfolioManager,
    boundaries: [
      '仅用于投资研究辅助和模拟交易参考，不构成投资建议。',
      'Research Desk 不能直接执行交易；交易必须经过 proposal、risk gate、用户批准和模拟盘执行。',
      '所有数字来自 LeoMoney 行情/账户/情报快照；缺数据时必须明确降级。',
      '股票、ETF、指数、币种、交易对和金融产品名不强制翻译。',
    ],
  };
}

async function buildLlmOverlay(run, config) {
  const systemPrompt = [
    '你是 LeoMoney Research Desk 的审稿员。',
    '只能基于用户 JSON 中的行情、账户、情报和已有分析做审稿，不得编造价格、财报、成交量或新闻。',
    '不要强制翻译股票、ETF、指数、币种、交易对或金融产品名称，Apple、NVIDIA、BTC、ETH、SPY、QQQ 等可保持英文。',
    '返回 JSON: { "managerNote": "...", "missingData": [], "riskWarnings": [] }。',
  ].join('\n');
  const payload = {
    symbol: run.symbol,
    quote: run.context.quote,
    benchmark: run.context.benchmark,
    analysts: run.analysts,
    debate: run.debate,
    manager: run.manager,
    traderDraft: run.traderDraft,
    portfolioManager: run.portfolioManager,
  };
  try {
    const result = await askLLM(systemPrompt, JSON.stringify(payload, null, 2), {
      validateSchema: false,
      maxRetries: 0,
      modelRole: 'deep',
      model: config.deepModel,
    });
    return typeof result === 'object' && result ? result : { managerNote: '' };
  } catch (err) {
    return { error: err.message };
  }
}

function getResearchRun(runId) {
  return publicRun(getRun(runId));
}

function getResearchRuns(query = {}) {
  return listRuns(query).map(publicRun);
}

function createProposalFromResearch(runId) {
  const run = getRun(runId);
  if (!run) throw new Error('研究记录不存在');
  if (run.status !== 'completed') throw new Error(`研究状态 ${run.status} 不可生成方案`);
  if (!run.portfolioManager?.approved) {
    throw new Error(run.portfolioManager?.summary || '组合经理未批准生成模拟方案');
  }
  if (!run.traderDraft?.canCreateProposal || run.traderDraft.action === 'HOLD') {
    throw new Error('交易员草稿为观望，不生成方案');
  }

  const signal = {
    id: `sig_${run.id}`,
    decisionId: run.id,
    symbol: run.symbol,
    name: run.quote?.name || run.symbol,
    price: run.quote?.price,
    category: run.quote?.category || 'usstocks',
    strategy: 'research-desk',
    strategyName: 'Research Desk',
    action: run.traderDraft.action === 'SELL' ? '卖出' : '买入',
    confidence: run.manager?.confidence || 0.55,
    riskLevel: run.portfolioManager?.riskLevel || run.manager?.riskLevel || '中',
    reason: `${run.manager?.ratingLabel || run.manager?.rating || '研究'}：${run.manager?.summary || ''} ${run.traderDraft?.plan || ''}`,
    source: 'research-desk',
    researchRunId: run.id,
    evidenceRefs: [
      `${run.id}:manager`,
      `${run.id}:debate`,
      `${run.id}:risk`,
    ],
    ts: new Date().toISOString(),
  };
  const proposal = createProposal(signal);
  if (!proposal) throw new Error('现有风控未能生成有效方案，可能是仓位/资金/安全等级限制');
  proposal.source = 'research-desk';
  proposal.researchRunId = run.id;
  proposal.evidenceRefs = signal.evidenceRefs;
  run.linkedProposalId = proposal.id;
  run.linkedProposalAt = new Date().toISOString();
  saveRun(run);
  return { proposal, run: publicRun(run) };
}

async function evaluateResearchRun(runId) {
  const run = getRun(runId);
  if (!run) throw new Error('研究记录不存在');
  const outcome = await evaluateOutcome(run);
  run.outcomes = [outcome, ...(run.outcomes || []).filter(item => item.id !== outcome.id)].slice(0, 12);
  saveRun(run);
  return { outcome, run: publicRun(run) };
}

module.exports = {
  buildResearchFromContext,
  createProposalFromResearch,
  evaluateResearchRun,
  getResearchRun,
  getResearchRuns,
  publicRun,
  runResearch,
};
