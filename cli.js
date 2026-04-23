#!/usr/bin/env node
/**
 * Leomoney CLI - OpenClaw 可直接调用的命令行接口
 *
 * 用法:
 *   node cli.js quote [symbol]              查行情
 *   node cli.js buy <symbol> <qty> [price]  买入
 *   node cli.js sell <symbol> <qty> [price] 卖出
 *   node cli.js order create <symbol> <type> <triggerPrice> <qty>  创建条件单
 *   node cli.js order list                  查看待执行条件单
 *   node cli.js order cancel <id>           取消条件单
 *   node cli.js portfolio                   持仓明细
 *   node cli.js account                     账户概览
 *   node cli.js market                      市场状态
 *   node cli.js reset                       重置账户
 *   node cli.js search <keyword>            搜索资产
 *   node cli.js auto                        OpenClaw 自动化指南
 */

const pkg = require('./package.json');
const { getMarketStatus } = require('./lib/market');
const { getQuotes, getStockQuote } = require('./lib/quotes');
const {
  getAccount,
  buy,
  sell,
  reset,
  createOrder,
  cancelOrder,
  getPendingOrders,
} = require('./lib/trading');

const command = process.argv[2];
const args = process.argv.slice(3);

function formatMoney(m) { return '¥' + m.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function formatChange(val, pct) {
  const sign = val >= 0 ? '+' : '';
  const color = val >= 0 ? '\x1b[32m' : '\x1b[31m';
  return `${color}${sign}${val.toFixed(2)} (${sign}${pct.toFixed(2)}%)\x1b[0m`;
}
function formatPrice(p) { return p >= 1000 ? p.toFixed(2) : p.toFixed(2); }

async function cmdQuote() {
  const symbol = args[0];
  if (symbol) {
    const q = await getStockQuote(symbol);
    if (!q) return console.log(`❌ 未找到资产: ${symbol}`);
    const cur = q.currency || 'CNY';
    console.log(`\n  ${q.name} (${q.symbol} · ${q.sector}) [${q.category || 'astocks'}]`);
    console.log(`  价格: ${cur === 'USD' ? '$' : '¥'}${q.price?.toFixed(2)}  ${formatChange(q.change, q.changePercent)}`);
    console.log(`  昨收: ${cur === 'USD' ? '$' : '¥'}${q.prevClose?.toFixed(2)}`);
    if (q.volume) console.log(`  成交量: ${q.volume.toLocaleString()}`);
    if (q.unit) console.log(`  单位: ${q.unit}`);
    console.log();
  } else {
    const quotes = await getQuotes();
    console.log('\n📊 大盘指数');
    quotes.indices.forEach(idx => console.log(`  ${idx.name}: ${formatPrice(idx.price)}  ${formatChange(idx.change, idx.changePercent)}`));
    console.log('\n🇨🇳 A股');
    quotes.astocks.forEach(s => console.log(`  ${s.name}(${s.symbol}) ${formatPrice(s.price)} ${formatChange(s.change, s.changePercent)}`));
    console.log('\n🇭🇰 港股');
    quotes.hkstocks.forEach(s => console.log(`  ${s.name}(${s.symbol}) ${formatPrice(s.price)} ${formatChange(s.change, s.changePercent)}`));
    console.log('\n🇺🇸 美股');
    quotes.usstocks.forEach(s => console.log(`  ${s.name}(${s.symbol}) $${s.price?.toFixed(2)} ${formatChange(s.change, s.changePercent)}`));
    console.log('\n🥇 贵金属');
    quotes.metals.forEach(s => console.log(`  ${s.name}(${s.symbol}) $${s.price?.toFixed(2)} ${formatChange(s.change, s.changePercent)}`));
    console.log('\n₿ 加密');
    quotes.crypto.forEach(s => console.log(`  ${s.name}(${s.symbol}) ¥${s.price?.toLocaleString()} ${formatChange(s.change, s.changePercent)}`));
    console.log();
  }
}

async function cmdBuy() {
  const symbol = args[0], qty = parseInt(args[1]), price = args[2] ? parseFloat(args[2]) : null;
  if (!symbol || !qty) {
    console.log('用法: node cli.js buy <symbol> <qty> [price]\n例: node cli.js buy 600519 100');
    return;
  }
  const quote = await getStockQuote(symbol);
  if (!quote) return console.log(`❌ 未找到资产: ${symbol}`);
  const result = await buy({ ...quote, source: 'cli', mode: 'paper_execution' }, qty, price);
  if (!result.success) return console.log(`❌ ${result.error}`);
  console.log(`\n✅ ${result.message}\n   余额: ${formatMoney(result.balance)}\n`);
}

async function cmdSell() {
  const symbol = args[0], qty = parseInt(args[1]), price = args[2] ? parseFloat(args[2]) : null;
  if (!symbol || !qty) {
    console.log('用法: node cli.js sell <symbol> <qty> [price]');
    return;
  }
  const quote = await getStockQuote(symbol);
  if (!quote) return console.log(`❌ 未找到资产: ${symbol}`);
  const result = await sell({ ...quote, source: 'cli', mode: 'paper_execution' }, qty, price);
  if (!result.success) return console.log(`❌ ${result.error}`);
  console.log(`\n✅ ${result.message}\n   余额: ${formatMoney(result.balance)}\n`);
}

function cmdPortfolio() {
  const account = getAccount();
  const holdings = Object.entries(account.holdings || {});
  if (holdings.length === 0) return console.log('\n📭 暂无持仓\n');
  console.log('\n📁 持仓明细');
  console.log('─'.repeat(60));
  holdings.forEach(([sym, h]) => console.log(`  ${h.name}(${sym})  ${h.qty}股  成本: ${h.avgCost.toFixed(2)}`));
  console.log('─'.repeat(60));
  console.log(`  可用资金: ${formatMoney(account.balance)}\n`);
}

function cmdAccount() {
  const account = getAccount();
  console.log('\n🦁 Leomoney 账户');
  console.log('─'.repeat(40));
  console.log(`  可用资金: ${formatMoney(account.balance)}`);
  console.log(`  持仓数量: ${Object.keys(account.holdings || {}).length}`);
  console.log(`  成交笔数: ${(account.history || []).length}`);
  console.log(`  条件单: ${(account.pendingOrders || []).length}`);
  console.log('─'.repeat(40));
  if ((account.history || []).length > 0) {
    console.log('\n📋 最近成交');
    account.history.slice(0, 5).forEach(h => {
      const type = h.type === 'buy' ? '\x1b[32m买入\x1b[0m' : '\x1b[31m卖出\x1b[0m';
      console.log(`  ${type} ${h.name} ${h.qty}${h.unit || '股'} @ ${h.price.toFixed(2)} · 来源:${h.source || 'unknown'}`);
    });
  }
  console.log();
}

function cmdMarket() {
  const s = getMarketStatus();
  console.log('\n🕐 市场状态');
  console.log('─'.repeat(40));
  console.log(`  A股: ${s.a.isOpen ? '🟢' : '🔴'} ${s.a.status}`);
  console.log(`  港股: ${s.hk.isOpen ? '🟢' : '🔴'} ${s.hk.status}`);
  console.log(`  美股: ${s.us.isOpen ? '🟢' : '🔴'} ${s.us.status}`);
  console.log(`  加密: 🟢 ${s.crypto.status}`);
  console.log('─'.repeat(40));
  console.log();
}

async function cmdSearch() {
  const keyword = args.join(' ');
  if (!keyword) return console.log('用法: node cli.js search <keyword>');
  const { searchSymbols } = require('./lib/quotes');
  const matches = await searchSymbols(keyword);
  if (matches.length === 0) return console.log(`❌ 未找到匹配: ${keyword}`);
  console.log(`\n🔍 搜索结果 (${matches.length})`);
  matches.forEach(s => {
    const m = s.market || s.category;
    const cur = s.currency || 'CNY';
    console.log(`  [${m}] ${s.name}(${s.symbol}) · ${s.sector || ''} · ${cur}`);
  });
  console.log();
}

async function cmdOrderCreate() {
  const [symbol, type, triggerPriceStr, qtyStr] = args;
  if (!symbol || !type || !triggerPriceStr || !qtyStr) {
    return console.log('用法: node cli.js order create <symbol> <buy|sell> <triggerPrice> <qty>\n例: node cli.js order create 600519 sell 1700 100  (价格≥1700时卖出100股)');
  }
  const quote = await getStockQuote(symbol);
  if (!quote) return console.log(`❌ 未找到资产: ${symbol}`);
  const triggerPrice = parseFloat(triggerPriceStr);
  const qty = parseInt(qtyStr);
  const triggerType = type === 'buy' ? 'lte' : 'gte';
  const result = await createOrder({
    symbol,
    name: quote.name,
    type,
    triggerType,
    triggerPrice,
    qty,
    category: quote.category,
    source: 'cli',
    mode: 'paper_execution',
  });
  if (result.success) {
    console.log(`\n✅ 条件单已创建`);
    console.log(`   ${quote.name}(${symbol}) ${type === 'buy' ? '≤' : '≥'} ${triggerPrice} 时${type === 'buy' ? '买入' : '卖出'} ${qty}股\n`);
  } else {
    console.log(`❌ ${result.error}`);
  }
}

function cmdOrderList() {
  const orders = getPendingOrders();
  if (orders.length === 0) return console.log('\n📭 暂无待执行条件单\n');
  console.log('\n📋 待执行条件单');
  console.log('─'.repeat(90));
  orders.forEach(o => {
    const sign = o.triggerType === 'gte' ? '≥' : '≤';
    console.log(`  [${o.id}] ${o.name}(${o.symbol}) ${o.type === 'buy' ? '买入' : '卖出'} ${o.qty}股 触发: 价格${sign}${o.triggerPrice} · 来源:${o.source || 'unknown'} · 模式:${o.mode || 'unknown'}`);
  });
  console.log('─'.repeat(90));
  console.log();
}

async function cmdOrderCancel() {
  const id = args[0];
  if (!id) return console.log('用法: node cli.js order cancel <id>');
  const result = await cancelOrder(id);
  console.log(result.success ? `✅ ${result.message}` : `❌ ${result.error}`);
}

function cmdAuto() {
  console.log(`
🤖 OpenClaw 自动化操作指南

═══════════════════════════════════════════════════════════════

方式一: 直接调用 CLI（推荐）
─────────────────────────────────────────────────────────────
OpenClaw 可以在其工作流中直接执行 shell 命令:

  cd /Users/leo/WorkBuddy/20260421163040/leomoney

  # 查询行情
  node cli.js quote
  node cli.js quote 600519

  # 交易
  node cli.js buy 600519 100
  node cli.js sell 600519 100

  # 条件单（自动触发）
  node cli.js order create 600519 sell 1700 100
  node cli.js order list

  # 持仓/账户
  node cli.js portfolio
  node cli.js account

方式二: HTTP API 调用
─────────────────────────────────────────────────────────────
服务端运行时 (node server.js)，OpenClaw 可发送 HTTP 请求:

  GET  http://localhost:3210/api/quotes
  GET  http://localhost:3210/api/account
  POST http://localhost:3210/api/trade/buy
       Body: {"symbol":"600519","qty":100,"source":"automation","mode":"simulation_only"}
  POST http://localhost:3210/api/trade/sell
       Body: {"symbol":"600519","qty":100,"source":"automation","mode":"simulation_only"}
  POST http://localhost:3210/api/orders
       Body: {"symbol":"600519","name":"茅台","type":"sell","triggerType":"gte","triggerPrice":1700,"qty":100,"source":"automation","mode":"simulation_only"}
  GET  http://localhost:3210/api/orders
  DELETE http://localhost:3210/api/orders/<id>

方式三: 定时自动扫描（cron/job）
─────────────────────────────────────────────────────────────
OpenClaw 可配置定时任务，每 5 分钟执行:

  node cli.js quote          # 拉取行情
  curl -s -X POST http://localhost:3210/api/orders/check
                             # 触发条件单检查

═══════════════════════════════════════════════════════════════
`);
}

function cmdHelp() {
  console.log(`
🦁 Leomoney CLI v${pkg.version}

行情查询:
  quote [symbol]              查行情（不传查全部）
  search <keyword>            搜索资产

交易操作:
  buy <symbol> <qty> [price]  买入
  sell <symbol> <qty> [price] 卖出

条件单（自动触发）:
  order create <symbol> <buy|sell> <triggerPrice> <qty>
                              创建条件单
  order list                  查看待执行条件单
  order cancel <id>           取消条件单

账户管理:
  portfolio                   持仓明细
  account                     账户概览
  market                      市场状态
  reset                       重置账户

自动化:
  auto                        OpenClaw 自动化指南
  help                        帮助

示例:
  node cli.js quote 600519
  node cli.js buy 600519 100
  node cli.js order create 600519 sell 1700 100
  node cli.js search 腾讯
`);
}

const commands = {
  quote: cmdQuote,
  q: cmdQuote,
  buy: cmdBuy,
  sell: cmdSell,
  portfolio: cmdPortfolio,
  p: cmdPortfolio,
  account: cmdAccount,
  a: cmdAccount,
  market: cmdMarket,
  m: cmdMarket,
  reset: async () => {
    const r = await reset();
    console.log(`\n${r.success ? '✅' : '❌'} ${r.message || r.error}\n`);
  },
  search: cmdSearch,
  s: cmdSearch,
  order: async () => {
    const sub = args[0];
    if (sub === 'create' || sub === 'c') { args.shift(); return cmdOrderCreate(); }
    if (sub === 'list' || sub === 'l') { args.shift(); return cmdOrderList(); }
    if (sub === 'cancel' || sub === 'd') { args.shift(); return cmdOrderCancel(); }
    console.log('子命令: create, list, cancel');
  },
  auto: cmdAuto,
  help: cmdHelp,
  '--help': cmdHelp,
  '-h': cmdHelp,
};

if (!command || !commands[command]) {
  cmdHelp();
} else {
  Promise.resolve(commands[command]()).catch(err => {
    console.error('❌ Error:', err.message);
    process.exitCode = 1;
  });
}
