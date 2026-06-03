import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Bot,
  BriefcaseBusiness,
  CandlestickChart,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock,
  Download,
  Eye,
  Globe2,
  Home,
  LineChart,
  ListChecks,
  Menu,
  Moon,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  Target,
  Trash2,
  Upload,
  Wallet,
  X,
} from 'lucide-react';
import { ColorType, CandlestickSeries, createChart } from 'lightweight-charts';
import { api, connectSse } from './api';
import { t } from './i18n';
import { useAppStore } from './store';
import type { Category, Holding, IntelEntry, KlinePeriod, KlinePoint, Order, Quote, ResearchConfig, ResearchMemoryEntry, ResearchRun, Strategy, TradeRecord } from './types';
import { ageText, categoryLabel, cx, money, moneyFromCny, pct, signed, toNumber, upClass } from './utils';

const NAV_ITEMS = [
  { path: '/', key: 'dashboard', icon: Home },
  { path: '/markets', key: 'markets', icon: CandlestickChart },
  { path: '/trade', key: 'trade', icon: CircleDollarSign },
  { path: '/positions', key: 'positions', icon: BriefcaseBusiness },
  { path: '/orders', key: 'orders', icon: ListChecks },
  { path: '/assets', key: 'assets', icon: Wallet },
  { path: '/watchlist', key: 'watchlist', icon: Star },
  { path: '/intel', key: 'intel', icon: Sparkles },
  { path: '/research', key: 'research', icon: BarChart3 },
  { path: '/agent', key: 'agent', icon: Bot },
  { path: '/alerts', key: 'alerts', icon: Bell },
  { path: '/settings', key: 'settings', icon: Settings },
];

const PRIMARY_MOBILE = NAV_ITEMS.slice(0, 5);
const KLINE_PERIODS: Array<{ value: KlinePeriod; label: string }> = [
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '30m', label: '30m' },
  { value: '1h', label: '1H' },
  { value: '1D', label: '日K' },
  { value: '1W', label: '周K' },
  { value: '1M', label: '月K' },
];

function useBootData() {
  const setData = useAppStore(s => s.setData);
  const notify = useAppStore(s => s.notify);

  async function refreshCore(silent = false) {
    try {
      const quotes = await api.quotes();
      setData({ quotes });
      const [overview, summary, account, accounts, watchlist, intel] = await Promise.allSettled([
        api.marketOverview(),
        api.accountSummary(),
        api.account(),
        api.accounts(),
        api.watchlist(),
        api.intelFeed(30),
      ]);
      const patch: Partial<ReturnType<typeof useAppStore.getState>> = {};
      if (overview.status === 'fulfilled') patch.overview = overview.value;
      if (summary.status === 'fulfilled') patch.summary = summary.value;
      if (account.status === 'fulfilled') patch.account = account.value;
      if (accounts.status === 'fulfilled') patch.accounts = accounts.value.accounts || [];
      if (watchlist.status === 'fulfilled') patch.watchlist = watchlist.value.watchlist || [];
      if (intel.status === 'fulfilled') {
        patch.intel = intel.value.items || [];
        patch.llmReady = !!intel.value.llmReady;
      }
      setData(patch);
    } catch (err: any) {
      if (!silent) notify(err.message || '刷新失败', 'error');
    }
  }

  async function refreshMarketOnly(silent = true) {
    try {
      const [quotes, overview] = await Promise.allSettled([
        api.quotes(),
        api.marketOverview(),
      ]);
      const patch: Partial<ReturnType<typeof useAppStore.getState>> = {};
      if (quotes.status === 'fulfilled') patch.quotes = quotes.value;
      if (overview.status === 'fulfilled') patch.overview = overview.value;
      setData(patch);
    } catch (err: any) {
      if (!silent) notify(err.message || '行情刷新失败', 'error');
    }
  }

  useEffect(() => {
    refreshCore();
    const marketTimer = window.setInterval(() => refreshMarketOnly(true), 3500);
    const coreTimer = window.setInterval(() => refreshCore(true), 30000);
    const sse = connectSse((event) => {
      try {
        const payload = JSON.parse(event.data);
        const data = payload?.data || payload;
        if (event.type === 'update' && data?.usstocks) setData({ quotes: { success: true, ...data } });
        if (event.type === 'intel_update' && data?.id) {
          const current = useAppStore.getState().intel || [];
          setData({ intel: [data, ...current.filter(item => item.id !== data.id)].slice(0, 50) });
        }
      } catch {
        // ignore malformed SSE frames
      }
    });
    return () => {
      window.clearInterval(marketTimer);
      window.clearInterval(coreTimer);
      sse.close();
    };
  }, []);

  return { refreshCore };
}

export default function App() {
  const { refreshCore } = useBootData();
  const theme = useAppStore(s => s.theme);
  const upDownMode = useAppStore(s => s.upDownMode);
  const toast = useAppStore(s => s.toast);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.updown = upDownMode;
  }, [theme, upDownMode]);

  return (
    <div className="appShell">
      <Sidebar />
      <div className="mainShell">
        <Topbar onRefresh={() => refreshCore()} />
        <main className="content">
          <AnimatePresence mode="wait">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/markets" element={<Markets />} />
              <Route path="/symbol/:symbol" element={<SymbolDetail />} />
              <Route path="/trade" element={<Trade />} />
              <Route path="/positions" element={<Positions />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/assets" element={<Assets />} />
              <Route path="/watchlist" element={<Watchlist />} />
              <Route path="/intel" element={<IntelCenter />} />
              <Route path="/research" element={<ResearchDeskPage />} />
              <Route path="/agent" element={<AgentCenter />} />
              <Route path="/alerts" element={<Alerts />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </AnimatePresence>
        </main>
      </div>
      <MobileNav />
      <Toast toast={toast} />
    </div>
  );
}

function Sidebar() {
  const lang = useAppStore(s => s.language);
  const collapsed = useAppStore(s => s.sidebarCollapsed);
  const setPreference = useAppStore(s => s.setPreference);
  return (
    <aside className={cx('sidebar', collapsed && 'collapsed')}>
      <div className="brand">
        <div className="brandMark">LM</div>
        {!collapsed && (
          <div>
            <strong>LeoMoney V4</strong>
            <span>US stocks · Crypto</span>
          </div>
        )}
      </div>
      <nav className="sideNav">
        {NAV_ITEMS.map(item => {
          const Icon = item.icon;
          return (
            <NavLink key={item.path} to={item.path} className={({ isActive }) => cx('navItem', isActive && 'active')}>
              <Icon size={18} />
              {!collapsed && <span>{t(lang, item.key)}</span>}
            </NavLink>
          );
        })}
      </nav>
      <button className="iconButton sidebarToggle" onClick={() => setPreference({ sidebarCollapsed: !collapsed })} title={collapsed ? '展开' : '折叠'}>
        {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
      </button>
    </aside>
  );
}

function MobileNav() {
  const lang = useAppStore(s => s.language);
  return (
    <nav className="mobileNav">
      {PRIMARY_MOBILE.map(item => {
        const Icon = item.icon;
        return (
          <NavLink key={item.path} to={item.path} className={({ isActive }) => cx('mobileNavItem', isActive && 'active')}>
            <Icon size={18} />
            <span>{t(lang, item.key)}</span>
          </NavLink>
        );
      })}
      <NavLink to="/settings" className={({ isActive }) => cx('mobileNavItem', isActive && 'active')}>
        <MoreHorizontal size={18} />
        <span>更多</span>
      </NavLink>
    </nav>
  );
}

function Topbar({ onRefresh }: { onRefresh: () => void }) {
  const lang = useAppStore(s => s.language);
  const currency = useAppStore(s => s.currency);
  const theme = useAppStore(s => s.theme);
  const setPreference = useAppStore(s => s.setPreference);
  const summary = useAppStore(s => s.summary);
  const quotes = useAppStore(s => s.quotes);
  return (
    <header className="topbar">
      <div className="mobileBrand">
        <Menu size={18} />
        <strong>LeoMoney V4</strong>
      </div>
      <GlobalSearch />
      <div className="topActions">
        <span className="livePill"><Activity size={14} />{ageText(quotes?.ts)}</span>
        <AccountSwitcher />
        <span className="smallMetric">{moneyFromCny(summary?.totalAssets || 0, currency, summary?.rates)}</span>
        <select value={currency} onChange={e => setPreference({ currency: e.target.value as any })} aria-label="currency">
          <option value="USD">USD</option>
          <option value="CNY">CNY</option>
          <option value="USDT">USDT</option>
          <option value="HKD">HKD</option>
        </select>
        <button className="iconButton" onClick={() => setPreference({ language: lang === 'zh' ? 'en' : 'zh' })} title={t(lang, 'language')}>
          <Globe2 size={18} />
        </button>
        <button className="iconButton" onClick={() => setPreference({ theme: theme === 'light' ? 'dark' : 'light' })} title={t(lang, 'theme')}>
          {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
        </button>
        <button className="iconButton" onClick={onRefresh} title="Refresh">
          <RefreshCw size={18} />
        </button>
      </div>
    </header>
  );
}

function AccountSwitcher() {
  const accounts = useAppStore(s => s.accounts);
  const summary = useAppStore(s => s.summary);
  const setData = useAppStore(s => s.setData);
  const notify = useAppStore(s => s.notify);
  const current = summary?.accountId || accounts[0]?.accountId || '';

  async function switchTo(accountId: string) {
    if (!accountId || accountId === current) return;
    try {
      await api.switchAccount(accountId);
      const [nextAccounts, nextSummary, nextAccount, nextWatchlist] = await Promise.all([
        api.accounts(),
        api.accountSummary(),
        api.account(),
        api.watchlist(),
      ]);
      setData({
        accounts: nextAccounts.accounts || [],
        summary: nextSummary,
        account: nextAccount,
        watchlist: nextWatchlist.watchlist || [],
      });
      notify('账户已切换');
    } catch (err: any) {
      notify(err.message || '账户切换失败', 'error');
    }
  }

  if (!accounts.length) return null;
  return (
    <select className="accountSelect" value={current} onChange={e => switchTo(e.target.value)} aria-label="account">
      {accounts.map(account => (
        <option key={account.accountId} value={account.accountId}>
          {account.accountName || account.accountId}
        </option>
      ))}
    </select>
  );
}

function GlobalSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Quote[]>([]);
  const setSelectedSymbol = useAppStore(s => s.setSelectedSymbol);
  useEffect(() => {
    if (q.trim().length < 1) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      const r = await api.search(q).catch(() => ({ results: [] as Quote[] }));
      setResults(r.results.slice(0, 8));
    }, 240);
    return () => window.clearTimeout(timer);
  }, [q]);
  return (
    <div className="globalSearch">
      <Search size={17} />
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="AAPL / BTC / NVDA" />
      {!!results.length && (
        <div className="searchResults">
          {results.map(item => (
            <button key={`${item.category}-${item.symbol}`} onClick={() => {
              setSelectedSymbol(item.symbol);
              setQ('');
              setResults([]);
              navigate(`/symbol/${encodeURIComponent(item.symbol)}`);
            }}>
              <span>{item.symbol}</span>
              <strong>{item.name}</strong>
              <em>{categoryLabel(item.category)}</em>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return <motion.div className="page" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18, ease: 'easeOut' }}>{children}</motion.div>;
}

function Dashboard() {
  const summary = useAppStore(s => s.summary);
  const currency = useAppStore(s => s.currency);
  const lang = useAppStore(s => s.language);
  const intel = useAppStore(s => s.intel);
  const rates = summary?.rates;
  return (
    <Page>
      <MarketIndexStrip />
      <section className="metricGrid">
        <MetricCard label={t(lang, 'totalAssets')} value={moneyFromCny(summary?.totalAssets || 0, currency, rates)} icon={<Wallet />} />
        <MetricCard label={t(lang, 'available')} value={moneyFromCny(summary?.cash?.available || 0, currency, rates)} icon={<CircleDollarSign />} />
        <MetricCard label={t(lang, 'holdingValue')} value={moneyFromCny(summary?.holdingValue || 0, currency, rates)} icon={<BriefcaseBusiness />} />
        <MetricCard label={t(lang, 'todayPnl')} value={moneyFromCny(summary?.todayRealizedPnL || 0, currency, rates)} trend={summary?.todayRealizedPnL || 0} icon={<LineChart />} />
      </section>
      <section className="dashboardGrid">
        <div className="panel wide">
          <SectionTitle icon={<CandlestickChart />} title="行情工作台" action={<Link to="/markets">查看全部</Link>} />
          <QuoteBoard />
        </div>
        <div className="panel">
          <SectionTitle icon={<BriefcaseBusiness />} title="持仓概览" action={<Link to="/positions">管理</Link>} />
          <HoldingList compact />
        </div>
        <div className="panel">
          <SectionTitle icon={<Sparkles />} title="情报摘要" action={<Link to="/intel">情报中心</Link>} />
          <IntelList entries={intel.slice(0, 4)} compact />
        </div>
        <div className="panel wide">
          <SectionTitle icon={<ShieldCheck />} title="系统状态" action={<Link to="/settings">设置</Link>} />
          <SystemHealth compact />
        </div>
      </section>
    </Page>
  );
}

function MarketIndexStrip() {
  const overview = useAppStore(s => s.overview);
  const quotes = useAppStore(s => s.quotes);
  const upMode = useAppStore(s => s.upDownMode);
  const navigate = useNavigate();
  const fallback = [
    ...(quotes?.usstocks || []).slice(0, 3),
    ...(quotes?.crypto || []).filter(q => ['BTCUSDT', 'ETHUSDT'].includes(q.symbol)).slice(0, 2),
  ];
  const items = [...(overview?.indices || []), ...(overview?.crypto || [])].length
    ? [...(overview?.indices || []), ...(overview?.crypto || [])]
    : fallback;
  if (!items.length) return <div className="skeleton stripSkeleton" />;
  return (
    <section className="indexStrip" aria-label="market overview">
      {items.map(item => (
        <button key={item.symbol} className="indexTile" onClick={() => item.category !== 'indices' && navigate(`/symbol/${encodeURIComponent(item.symbol)}`)}>
          <span>{item.name}</span>
          <strong>{money(item.price, item.currency || 'USD')}</strong>
          <em className={upClass(item.changePercent, upMode)}>{pct(item.changePercent || 0)}</em>
          <small>{ageText(item.asOf || overview?.asOf)}</small>
        </button>
      ))}
    </section>
  );
}

function MetricCard({ label, value, icon, trend }: { label: string; value: string; icon: React.ReactNode; trend?: number }) {
  const mode = useAppStore(s => s.upDownMode);
  return (
    <div className="metricCard">
      <div className="metricIcon">{icon}</div>
      <span>{label}</span>
      <strong className={trend !== undefined ? upClass(trend, mode) : ''}>{value}</strong>
    </div>
  );
}

function SectionTitle({ icon, title, action }: { icon: React.ReactNode; title: string; action?: React.ReactNode }) {
  return (
    <div className="sectionTitle">
      <div>{icon}<h2>{title}</h2></div>
      {action && <div className="sectionAction">{action}</div>}
    </div>
  );
}

function QuoteBoard() {
  const quotes = useAppStore(s => s.quotes);
  const rows = [...(quotes?.usstocks || []), ...(quotes?.crypto || [])].slice(0, 12);
  return <div className="quoteGrid">{rows.map(q => <QuoteCard key={`${q.category}-${q.symbol}`} quote={q} />)}</div>;
}

function QuoteCard({ quote }: { quote: Quote }) {
  const mode = useAppStore(s => s.upDownMode);
  const setSelectedSymbol = useAppStore(s => s.setSelectedSymbol);
  return (
    <Link className="quoteCard" to={`/symbol/${encodeURIComponent(quote.symbol)}`} onClick={() => setSelectedSymbol(quote.symbol)}>
      <div>
        <strong>{quote.symbol}</strong>
        <span>{quote.name}</span>
      </div>
      <div>
        <b>{money(quote.price, quote.currency || 'USD')}</b>
        <em className={upClass(quote.changePercent, mode)}>{pct(quote.changePercent || 0)}</em>
      </div>
      {quote.dataQuality?.isSynthetic && <small className="badge warn">模拟</small>}
    </Link>
  );
}

function Markets() {
  const lang = useAppStore(s => s.language);
  const quotes = useAppStore(s => s.quotes);
  const [tab, setTab] = useState<'usstocks' | 'crypto' | 'indices' | 'more' | 'all'>('usstocks');
  const [filter, setFilter] = useState('');
  const all = useMemo(() => {
    if (!quotes) return [];
    if (tab === 'all') return [...quotes.usstocks, ...quotes.crypto, ...quotes.indices, ...quotes.astocks, ...quotes.hkstocks, ...quotes.metals];
    if (tab === 'more') return [...quotes.astocks, ...quotes.hkstocks, ...quotes.metals];
    return quotes[tab] || [];
  }, [quotes, tab]);
  const list = all.filter(item => `${item.symbol} ${item.name}`.toLowerCase().includes(filter.toLowerCase()));
  return (
    <Page>
      <div className="pageHeader">
        <h1>{t(lang, 'markets')}</h1>
        <input className="inlineInput" value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter" />
      </div>
      <div className="segmented">
        {(['usstocks', 'crypto', 'indices', 'more', 'all'] as const).map(key => (
          <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
            {key === 'more' ? '更多' : key === 'all' ? '全部' : categoryLabel(key, lang)}
          </button>
        ))}
      </div>
      <div className="tablePanel">
        <QuoteTable quotes={list} />
      </div>
    </Page>
  );
}

function QuoteTable({ quotes }: { quotes: Quote[] }) {
  const mode = useAppStore(s => s.upDownMode);
  const navigate = useNavigate();
  const notify = useAppStore(s => s.notify);
  const watchlist = useAppStore(s => s.watchlist);
  const setData = useAppStore(s => s.setData);
  async function toggleWatch(q: Quote) {
    const exists = watchlist.some(w => w.symbol === q.symbol);
    try {
      if (exists) await api.removeWatch(q.symbol);
      else await api.addWatch({ symbol: q.symbol, name: q.name, category: q.category, currency: q.currency });
      const next = await api.watchlist();
      setData({ watchlist: next.watchlist || [] });
      notify(exists ? '已移出自选' : '已加入自选');
    } catch (err: any) {
      notify(err.message, 'error');
    }
  }
  return (
    <div className="dataTable quoteTable">
      <div className="tableHead"><span>标的</span><span>市场</span><span>现价</span><span>涨跌</span><span>来源</span><span></span></div>
      {quotes.map(q => {
        const watched = watchlist.some(w => w.symbol === q.symbol);
        return (
          <div className="tableRow" key={`${q.category}-${q.symbol}`} onClick={() => navigate(`/symbol/${encodeURIComponent(q.symbol)}`)}>
            <span><strong>{q.symbol}</strong><small>{q.name}</small></span>
            <span>{categoryLabel(q.category)}</span>
            <span>{money(q.price, q.currency || 'USD')}</span>
            <span className={upClass(q.changePercent, mode)}>{pct(q.changePercent || 0)}</span>
            <span>{q.dataQuality?.source || q.source || 'market'}</span>
            <button className={cx('iconButton', watched && 'activeStar')} onClick={e => { e.stopPropagation(); toggleWatch(q); }} title="watch">
              <Star size={17} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function SymbolDetail() {
  const params = useParams();
  const symbol = decodeURIComponent(params.symbol || useAppStore.getState().selectedSymbol);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [points, setPoints] = useState<KlinePoint[]>([]);
  const [period, setPeriod] = useState<KlinePeriod>('1D');
  const [chartSource, setChartSource] = useState('');
  const intel = useAppStore(s => s.intel);
  useEffect(() => {
    api.quote(symbol).then(r => setQuote(r.quote)).catch(() => setQuote(null));
    api.kline(symbol, period, period.endsWith('m') || period === '1h' ? 180 : 260)
      .then(r => { setPoints(r.points); setChartSource(r.source); })
      .catch(() => { setPoints([]); setChartSource('no data'); });
  }, [symbol, period]);
  const relatedIntel = intel.filter(entry => entry.symbol === symbol || entry.related?.some(r => r.symbol === symbol)).slice(0, 5);
  return (
    <Page>
      <div className="pageHeader symbolHeader">
        <div>
          <h1>{quote?.symbol || symbol}</h1>
          <span>{quote?.name || '--'} · {categoryLabel(quote?.category)}</span>
        </div>
        {quote && <div className="priceBlock"><strong>{money(quote.price, quote.currency || 'USD')}</strong><em>{pct(quote.changePercent || 0)}</em></div>}
      </div>
      <div className="symbolGrid">
        <div className="panel wide">
          <div className="chartToolbar">
            <div className="segmented compact">
              {KLINE_PERIODS.map(item => (
                <button key={item.value} className={period === item.value ? 'active' : ''} onClick={() => setPeriod(item.value)}>
                  {item.label}
                </button>
              ))}
            </div>
            <span className="badge">{chartSource || 'loading'}</span>
          </div>
          <KlineChart points={points} />
        </div>
        <div className="panel">
          <TradeTicket fixedSymbol={symbol} compact />
        </div>
        <div className="panel wide">
          <SectionTitle icon={<Sparkles />} title="相关情报" action={<Link to="/intel">更多</Link>} />
          <IntelList entries={relatedIntel} compact />
        </div>
      </div>
    </Page>
  );
}

function KlineChart({ points }: { points: KlinePoint[] }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const theme = useAppStore(s => s.theme);
  const upMode = useAppStore(s => s.upDownMode);
  useEffect(() => {
    if (!ref.current) return;
    if (!points.length) return;
    const chart = createChart(ref.current, {
      autoSize: true,
      height: 360,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: theme === 'light' ? '#334155' : '#cbd5e1',
      },
      grid: {
        vertLines: { color: theme === 'light' ? '#e2e8f0' : '#263244' },
        horzLines: { color: theme === 'light' ? '#e2e8f0' : '#263244' },
      },
      rightPriceScale: { borderColor: 'transparent' },
      timeScale: { borderColor: 'transparent' },
    });
    const up = upMode === 'cn' ? '#ef4444' : '#10b981';
    const down = upMode === 'cn' ? '#10b981' : '#ef4444';
    const series = (chart as any).addSeries
      ? (chart as any).addSeries(CandlestickSeries, { upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false })
      : (chart as any).addCandlestickSeries({ upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false });
    series.setData(points.map((p, i) => ({
      time: Math.floor(new Date(p.time).getTime() / 1000) || i,
      open: p.open,
      high: p.high,
      low: p.low,
      close: p.close,
    })));
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [points, theme, upMode]);
  return (
    <div className="klineShell">
      <div className="klineCanvas" ref={ref} />
      {!points.length && <div className="empty chartEmpty">No chart data</div>}
    </div>
  );
}

function Trade() {
  return (
    <Page>
      <div className="pageHeader"><h1>模拟交易</h1><span>Paper only</span></div>
      <div className="tradeGrid">
        <div className="panel"><TradeTicket /></div>
        <div className="panel"><SectionTitle icon={<BriefcaseBusiness />} title="当前持仓" /><HoldingList compact /></div>
        <div className="panel wide"><SectionTitle icon={<ListChecks />} title="订单与成交" /><OrderAndHistory compact /></div>
      </div>
    </Page>
  );
}

function TradeTicket({ fixedSymbol, compact = false }: { fixedSymbol?: string; compact?: boolean }) {
  const selectedSymbol = useAppStore(s => s.selectedSymbol);
  const setSelectedSymbol = useAppStore(s => s.setSelectedSymbol);
  const summary = useAppStore(s => s.summary);
  const notify = useAppStore(s => s.notify);
  const setData = useAppStore(s => s.setData);
  const quotesPayload = useAppStore(s => s.quotes);
  const allQuotes = useMemo(() => {
    if (!quotesPayload) return [];
    return [
      ...(quotesPayload.usstocks || []),
      ...(quotesPayload.crypto || []),
      ...(quotesPayload.indices || []),
      ...(quotesPayload.astocks || []),
      ...(quotesPayload.hkstocks || []),
      ...(quotesPayload.metals || []),
    ];
  }, [quotesPayload]);
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [orderMode, setOrderMode] = useState<'market' | 'limit'>('market');
  const [symbol, setSymbol] = useState(fixedSymbol || selectedSymbol || 'AAPL');
  const [qty, setQty] = useState('1');
  const [limitPrice, setLimitPrice] = useState('');
  const quote = allQuotes.find(q => q.symbol === symbol) || allQuotes.find(q => q.symbol === selectedSymbol);
  const currentPrice = toNumber(limitPrice || quote?.price || 0);
  const notional = currentPrice * toNumber(qty);
  const fee = notional * 0.0003;
  const holding = summary?.holdings?.find(h => h.symbol === symbol);

  async function refreshAccount() {
    const [nextSummary, nextAccount] = await Promise.all([api.accountSummary(), api.account()]);
    setData({ summary: nextSummary, account: nextAccount });
  }

  async function submit() {
    try {
      const body = { symbol, qty: Number(qty), price: orderMode === 'limit' ? Number(limitPrice) : undefined, source: 'manual', mode: 'paper_execution' };
      const result = side === 'buy' ? await api.buy(body) : await api.sell(body);
      await refreshAccount();
      notify(result.message || '已成交');
    } catch (err: any) {
      notify(err.message, 'error');
    }
  }

  async function createStop(triggerType: 'gte' | 'lte') {
    try {
      await api.createOrder({
        symbol,
        name: quote?.name || symbol,
        side: 'sell',
        triggerType,
        triggerPrice: Number(limitPrice || quote?.price || 0),
        qty: Number(qty),
        category: quote?.category || holding?.category || 'usstocks',
      });
      await refreshAccount();
      notify(triggerType === 'gte' ? '止盈已设置' : '止损已设置');
    } catch (err: any) {
      notify(err.message, 'error');
    }
  }

  return (
    <div className={cx('tradeTicket', compact && 'compactTicket')}>
      {!fixedSymbol && (
        <label className="field">
          <span>标的</span>
          <input value={symbol} onChange={e => { setSymbol(e.target.value.toUpperCase()); setSelectedSymbol(e.target.value.toUpperCase()); }} />
        </label>
      )}
      <div className="segmented big">
        <button className={side === 'buy' ? 'active buy' : ''} onClick={() => setSide('buy')}>买入</button>
        <button className={side === 'sell' ? 'active sell' : ''} onClick={() => setSide('sell')}>卖出</button>
      </div>
      <div className="quoteSnap">
        <span>{quote?.name || symbol}</span>
        <strong>{quote ? money(quote.price, quote.currency || 'USD') : '--'}</strong>
      </div>
      <div className="segmented">
        <button className={orderMode === 'market' ? 'active' : ''} onClick={() => setOrderMode('market')}>市价</button>
        <button className={orderMode === 'limit' ? 'active' : ''} onClick={() => setOrderMode('limit')}>限价</button>
      </div>
      {orderMode === 'limit' && <label className="field"><span>限价</span><input type="number" value={limitPrice} onChange={e => setLimitPrice(e.target.value)} /></label>}
      <label className="field"><span>数量</span><input type="number" value={qty} onChange={e => setQty(e.target.value)} /></label>
      <div className="quickBtns">
        {['25', '50', '75', '100'].map(p => (
          <button key={p} onClick={() => {
            if (side === 'sell' && holding) setQty(String(Math.max(0, Math.floor(toNumber(holding.sellableQty) * Number(p) / 100))));
            if (side === 'buy' && quote && summary) {
              const cash = toNumber(summary.cash.available);
              const approx = Math.max(1, Math.floor((cash * Number(p) / 100) / Math.max(1, quote.price * (summary.rates?.[quote.currency || 'USD'] || 7.25))));
              setQty(String(approx));
            }
          }}>{p}%</button>
        ))}
      </div>
      <div className="estimate">
        <span>预计成交额</span><strong>{money(notional, quote?.currency || 'USD')}</strong>
        <span>预计手续费</span><strong>{money(fee, quote?.currency || 'USD')}</strong>
      </div>
      <button className={cx('primaryButton', side === 'sell' && 'danger')} onClick={submit}>
        {side === 'buy' ? '确认买入' : '确认卖出'} {qty || 0} {quote?.category === 'crypto' ? '枚' : '股'}
      </button>
      <div className="conditionBtns">
        <button onClick={() => createStop('gte')}>涨到该价卖出</button>
        <button onClick={() => createStop('lte')}>跌到该价卖出</button>
      </div>
    </div>
  );
}

function Positions() {
  return (
    <Page>
      <div className="pageHeader"><h1>持仓</h1><Link className="smallButton" to="/trade">去交易</Link></div>
      <section className="positionsGrid">
        <div className="panel wide"><HoldingList /></div>
        <div className="panel"><ImportPositions /></div>
      </section>
    </Page>
  );
}

function HoldingList({ compact = false }: { compact?: boolean }) {
  const summary = useAppStore(s => s.summary);
  const currency = useAppStore(s => s.currency);
  const mode = useAppStore(s => s.upDownMode);
  const notify = useAppStore(s => s.notify);
  const setData = useAppStore(s => s.setData);
  const holdings = summary?.holdings || [];
  async function close(h: Holding) {
    try {
      await api.sell({ symbol: h.symbol, qty: h.sellableQty, source: 'manual', mode: 'paper_execution' });
      setData({ summary: await api.accountSummary(), account: await api.account() });
      notify('已平仓');
    } catch (err: any) {
      notify(err.message, 'error');
    }
  }
  if (!holdings.length) return <div className="empty">暂无持仓</div>;
  return (
    <div className={cx('holdingList', compact && 'compactList')}>
      {holdings.map(h => (
        <div className="holdingRow" key={h.symbol}>
          <div><strong>{h.symbol}</strong><span>{h.name}</span></div>
          <div><small>数量</small><b>{h.totalQty}</b></div>
          <div><small>市值</small><b>{moneyFromCny(h.marketValueCNY, currency, summary?.rates)}</b></div>
          <div><small>盈亏</small><b className={upClass(h.unrealizedPnL, mode)}>{moneyFromCny(h.unrealizedPnL, currency, summary?.rates)} · {pct(h.unrealizedPnLRatio)}</b></div>
          {!compact && <button className="smallButton dangerGhost" onClick={() => close(h)}>一键平仓</button>}
        </div>
      ))}
    </div>
  );
}

function ImportPositions() {
  const notify = useAppStore(s => s.notify);
  const setData = useAppStore(s => s.setData);
  const [mode, setMode] = useState<'record' | 'buy'>('record');
  const [rows, setRows] = useState('AAPL,10,150\nBTCUSDT,0.1,65000');
  async function submit() {
    const positions = rows.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
      const [symbol, qty, avgCost, category, currency] = line.split(',').map(x => x.trim());
      return { symbol, qty: Number(qty), avgCost: Number(avgCost), category: category as Category || undefined, currency: currency as any || undefined };
    });
    try {
      await api.importPositions({ mode, positions });
      const [summary, account] = await Promise.all([api.accountSummary(), api.account()]);
      setData({ summary, account });
      notify('持仓已导入');
    } catch (err: any) {
      notify(err.message, 'error');
    }
  }
  return (
    <div className="importBox">
      <SectionTitle icon={<Upload />} title="录入/导入持仓" />
      <div className="segmented">
        <button className={mode === 'record' ? 'active' : ''} onClick={() => setMode('record')}>仅记账</button>
        <button className={mode === 'buy' ? 'active' : ''} onClick={() => setMode('buy')}>扣现金</button>
      </div>
      <textarea value={rows} onChange={e => setRows(e.target.value)} spellCheck={false} />
      <button className="primaryButton" onClick={submit}><Upload size={17} />导入</button>
    </div>
  );
}

function Orders() {
  return (
    <Page>
      <div className="pageHeader"><h1>订单</h1><button className="smallButton" onClick={() => api.checkOrders()}>检查触发</button></div>
      <OrderAndHistory />
    </Page>
  );
}

function OrderAndHistory({ compact = false }: { compact?: boolean }) {
  const account = useAppStore(s => s.account);
  const [orders, setOrders] = useState<Order[]>([]);
  const notify = useAppStore(s => s.notify);
  useEffect(() => { api.orders().then(r => setOrders(r.orders || [])).catch(() => setOrders([])); }, []);
  async function cancel(id: string) {
    try {
      await api.cancelOrder(id);
      setOrders((await api.orders()).orders || []);
      notify('已撤单');
    } catch (err: any) {
      notify(err.message, 'error');
    }
  }
  const history = (account?.history || []).slice(0, compact ? 5 : 30);
  return (
    <div className="ordersGrid">
      <div className="panelSub">
        <h3>条件单</h3>
        {orders.slice(0, compact ? 4 : 30).map(o => (
          <div className="orderRow" key={o.id}>
            <span><strong>{o.symbol}</strong><small>{o.side === 'buy' ? '买入' : '卖出'} · {o.triggerType === 'gte' ? '涨到' : '跌到'} {o.triggerPrice}</small></span>
            <em>{o.qty}</em>
            <b>{o.status}</b>
            <button className="iconButton" onClick={() => cancel(o.id)}><X size={16} /></button>
          </div>
        ))}
        {!orders.length && <div className="empty">暂无条件单</div>}
      </div>
      <div className="panelSub">
        <h3>最近成交</h3>
        {history.map((h: TradeRecord, i) => (
          <div className="orderRow" key={`${h.time}-${i}`}>
            <span><strong>{h.symbol}</strong><small>{h.type} · {ageText(h.time)}</small></span>
            <em>{h.qty}</em>
            <b>{money(h.price, h.currency || 'USD')}</b>
          </div>
        ))}
        {!history.length && <div className="empty">暂无成交</div>}
      </div>
    </div>
  );
}

function Assets() {
  const accounts = useAppStore(s => s.accounts);
  const summary = useAppStore(s => s.summary);
  const currency = useAppStore(s => s.currency);
  const setData = useAppStore(s => s.setData);
  const notify = useAppStore(s => s.notify);
  const [name, setName] = useState('New paper account');
  const [balance, setBalance] = useState('100000');
  async function create() {
    try {
      await api.createAccount({ accountName: name, balance: Number(balance) });
      const [nextAccounts, nextSummary, nextAccount] = await Promise.all([api.accounts(), api.accountSummary(), api.account()]);
      setData({ accounts: nextAccounts.accounts, summary: nextSummary, account: nextAccount });
      notify('账户已创建');
    } catch (err: any) {
      notify(err.message, 'error');
    }
  }
  async function switchTo(id: string) {
    await api.switchAccount(id);
    setData({ accounts: (await api.accounts()).accounts, summary: await api.accountSummary(), account: await api.account() });
  }
  return (
    <Page>
      <div className="pageHeader"><h1>资产</h1><span>{summary?.analytics?.exposurePct || 0}% exposure</span></div>
      <section className="assetGrid">
        <div className="panel wide">
          <SectionTitle icon={<Wallet />} title="账户" />
          <div className="accountGrid">
            {accounts.map(a => (
              <button className="accountCard" key={a.accountId} onClick={() => switchTo(a.accountId)}>
                <strong>{a.accountName || a.accountId}</strong>
                <span>{moneyFromCny(a.balance || 0, currency, summary?.rates)}</span>
                <small>{a.holdingsCount || 0} positions · {a.historyCount || 0} fills</small>
              </button>
            ))}
          </div>
        </div>
        <div className="panel">
          <SectionTitle icon={<Plus />} title="新账户" />
          <label className="field"><span>名称</span><input value={name} onChange={e => setName(e.target.value)} /></label>
          <label className="field"><span>初始资金 CNY</span><input type="number" value={balance} onChange={e => setBalance(e.target.value)} /></label>
          <button className="primaryButton" onClick={create}>创建</button>
        </div>
        <div className="panel wide">
          <SectionTitle icon={<BarChart3 />} title="收益分析" />
          <div className="analysisGrid">
            <MetricCard label="现金占比" value={`${summary?.analytics?.cashPct || 0}%`} icon={<Wallet />} />
            <MetricCard label="持仓占比" value={`${summary?.analytics?.exposurePct || 0}%`} icon={<BriefcaseBusiness />} />
            <MetricCard label="最大单仓" value={`${summary?.analytics?.concentrationTop1Pct || 0}%`} icon={<Target />} />
          </div>
        </div>
      </section>
    </Page>
  );
}

function Watchlist() {
  const watchlist = useAppStore(s => s.watchlist);
  const quotesPayload = useAppStore(s => s.quotes);
  const allQuotes = useMemo(() => {
    if (!quotesPayload) return [];
    return [
      ...(quotesPayload.usstocks || []),
      ...(quotesPayload.crypto || []),
      ...(quotesPayload.indices || []),
      ...(quotesPayload.astocks || []),
      ...(quotesPayload.hkstocks || []),
      ...(quotesPayload.metals || []),
    ];
  }, [quotesPayload]);
  const quotes = watchlist.map(w => allQuotes.find(q => q.symbol === w.symbol)).filter(Boolean) as Quote[];
  return (
    <Page>
      <div className="pageHeader"><h1>自选</h1><Link className="smallButton" to="/markets">添加</Link></div>
      <div className="tablePanel"><QuoteTable quotes={quotes} /></div>
    </Page>
  );
}

function IntelCenter() {
  const intel = useAppStore(s => s.intel);
  const llmReady = useAppStore(s => s.llmReady);
  const setData = useAppStore(s => s.setData);
  const notify = useAppStore(s => s.notify);
  const selectedSymbol = useAppStore(s => s.selectedSymbol);
  const [query, setQuery] = useState(selectedSymbol || 'AAPL');
  const [symbol, setSymbol] = useState(selectedSymbol || 'AAPL');
  const [watch, setWatch] = useState<any[]>([]);
  useEffect(() => { api.intelWatch().then(r => setWatch(r.topics || [])).catch(() => setWatch([])); }, []);
  async function run(kind: 'scan' | 'analyze') {
    try {
      const result = kind === 'scan' ? await api.scanIntel({ query, symbol }) : await api.analyzeIntel({ query, symbol });
      setData({ intel: [result.entry, ...intel.filter(i => i.id !== result.entry.id)].slice(0, 50), llmReady: kind === 'analyze' ? (result as any).llmReady : llmReady });
      notify(kind === 'scan' ? '扫描完成' : '解读完成');
    } catch (err: any) {
      notify(err.message, 'error');
    }
  }
  async function addWatch() {
    await api.addIntelWatch({ query, symbol });
    setWatch((await api.intelWatch()).topics || []);
    notify('已加入关注');
  }
  return (
    <Page>
      <div className="pageHeader">
        <h1>情报中心</h1>
        <span className={cx('badge', llmReady ? 'ok' : 'warn')}>{llmReady ? 'LLM ready' : 'LLM key required'}</span>
      </div>
      <section className="intelGrid">
        <div className="panel">
          <SectionTitle icon={<Search />} title="检索" />
          <label className="field"><span>关键词</span><input value={query} onChange={e => setQuery(e.target.value)} /></label>
          <label className="field"><span>标的</span><input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} /></label>
          <div className="buttonRow">
            <button className="primaryButton" onClick={() => run('scan')}>扫描</button>
            <button className="smallButton" onClick={() => run('analyze')}>深度解读</button>
          </div>
          <button className="smallButton full" onClick={addWatch}><Eye size={16} />订阅</button>
        </div>
        <div className="panel wide">
          <SectionTitle icon={<Sparkles />} title="信息流" />
          <IntelList entries={intel} />
        </div>
        <div className="panel">
          <SectionTitle icon={<Eye />} title="关注词" />
          {watch.map(w => <div className="watchTopic" key={w.id}><span>{w.query}</span><small>{w.symbol}</small></div>)}
        </div>
      </section>
    </Page>
  );
}

function IntelList({ entries, compact = false }: { entries: IntelEntry[]; compact?: boolean }) {
  const navigate = useNavigate();
  if (!entries.length) return <div className="empty">暂无情报</div>;
  return (
    <div className={cx('intelList', compact && 'compactList')}>
      {entries.map(entry => (
        <article className="intelEntry" key={entry.id}>
          <header>
            <strong>{entry.query}</strong>
            <span>{ageText(entry.ts)}</span>
          </header>
          {entry.analysis?.summary && <p>{entry.analysis.summary}</p>}
          {(entry.news || []).slice(0, compact ? 1 : 3).map((n, idx) => (
            <div className="intelItem" key={`${entry.id}-${idx}`}>
              <a href={n.url || '#'} target="_blank" rel="noreferrer">{n.titleZh || n.title}</a>
              <small>{n.source || 'news'} · {n.translationQuality || 'native'}</small>
              {n.snippetZh && <p>{n.snippetZh}</p>}
              <RelatedChips items={n.related || entry.related || []} onClick={sym => navigate(`/symbol/${encodeURIComponent(sym)}`)} />
            </div>
          ))}
        </article>
      ))}
    </div>
  );
}

function RelatedChips({ items, onClick }: { items: any[]; onClick: (symbol: string) => void }) {
  return <div className="chips">{items.slice(0, 5).map(r => <button key={r.symbol} onClick={() => onClick(r.symbol)}>{r.symbol}<span>{pct(r.changePercent || 0)}</span></button>)}</div>;
}

function ResearchDeskPage() {
  const selectedSymbol = useAppStore(s => s.selectedSymbol);
  const notify = useAppStore(s => s.notify);
  const [symbol, setSymbol] = useState(selectedSymbol || 'AAPL');
  const [depth, setDepth] = useState<'quick' | 'deep'>('quick');
  const [horizon, setHorizon] = useState<'intraday' | 'swing' | 'position'>('swing');
  const [loading, setLoading] = useState(false);
  const [run, setRun] = useState<ResearchRun | null>(null);
  const [runs, setRuns] = useState<ResearchRun[]>([]);
  const [memory, setMemory] = useState<ResearchMemoryEntry[]>([]);
  const [config, setConfig] = useState<ResearchConfig | null>(null);
  const normalizedSymbol = symbol.trim().toUpperCase();
  const activeRun = run || runs[0] || null;

  async function refreshResearch(nextSymbol = normalizedSymbol) {
    const [history, mem] = await Promise.all([
      api.researchRuns(nextSymbol, 30).catch(() => ({ runs: [] as ResearchRun[] })),
      api.researchMemory(nextSymbol, 20).catch(() => ({ memory: [] as ResearchMemoryEntry[] })),
    ]);
    setRuns(history.runs || []);
    setMemory(mem.memory || []);
  }

  useEffect(() => {
    api.researchConfig().then(r => setConfig(r.config)).catch(() => setConfig(null));
    refreshResearch(normalizedSymbol).catch(() => undefined);
  }, []);

  async function startResearch() {
    if (!normalizedSymbol) return;
    setLoading(true);
    try {
      const result = await api.researchRun({ symbol: normalizedSymbol, depth, horizon });
      setRun(result.run);
      await refreshResearch(result.run.symbol);
      notify(depth === 'deep' ? '深度研究完成' : '快速研究完成');
    } catch (err: any) {
      notify(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function createDraftProposal() {
    if (!activeRun) return;
    try {
      const result = await api.researchCreateProposal(activeRun.id);
      setRun(result.run || activeRun);
      await refreshResearch(activeRun.symbol);
      notify(`已生成模拟方案 ${result.proposal?.id || ''}`);
    } catch (err: any) {
      notify(err.message, 'error');
    }
  }

  async function evaluateRun() {
    if (!activeRun) return;
    try {
      const result = await api.researchEvaluate(activeRun.id);
      setRun(result.run);
      await refreshResearch(activeRun.symbol);
      notify(`复盘完成：${result.outcome?.verdict || 'done'}`);
    } catch (err: any) {
      notify(err.message, 'error');
    }
  }

  return (
    <Page>
      <div className="pageHeader">
        <h1>研究室</h1>
        <span className="badge">Research Desk · Paper only</span>
      </div>
      <section className="researchGrid">
        <div className="panel">
          <SectionTitle icon={<Sparkles />} title="发起研究" />
          <label className="field"><span>标的</span><input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} /></label>
          <div className="segmented big">
            <button className={depth === 'quick' ? 'active' : ''} onClick={() => setDepth('quick')}>快速</button>
            <button className={depth === 'deep' ? 'active' : ''} onClick={() => setDepth('deep')}>深度</button>
          </div>
          <select value={horizon} onChange={e => setHorizon(e.target.value as any)}>
            <option value="intraday">日内观察</option>
            <option value="swing">波段验证</option>
            <option value="position">持仓复盘</option>
          </select>
          <button className="primaryButton" onClick={startResearch} disabled={loading || !normalizedSymbol}>
            {loading ? <RefreshCw size={16} /> : <BarChart3 size={16} />}
            {loading ? '研究中' : '开始研究'}
          </button>
          <ResearchConfigPanel config={config} symbol={normalizedSymbol} />
        </div>

        <div className="panel wide">
          <SectionTitle icon={<Activity />} title="研究状态" action={activeRun && <span className={cx('badge', activeRun.status === 'completed' ? 'ok' : activeRun.status === 'failed' ? 'warn' : '')}>{activeRun.status}</span>} />
          {activeRun ? <ResearchSnapshot run={activeRun} /> : <div className="empty">输入标的后开始研究</div>}
          {activeRun && <ResearchProgress run={activeRun} />}
        </div>

        <div className="panel wide">
          <SectionTitle icon={<CandlestickChart />} title="四类分析师" />
          {activeRun?.analysts?.length ? (
            <div className="researchCards">
              {activeRun.analysts.map(report => <ResearchAnalystCard key={report.role} report={report} />)}
            </div>
          ) : <div className="empty">暂无分析师报告</div>}
        </div>

        <div className="panel">
          <SectionTitle icon={<Clock />} title="历史研究" />
          <ResearchHistory runs={runs} onPick={item => setRun(item)} />
        </div>

        <div className="panel wide">
          <SectionTitle icon={<Target />} title="多空辩论" />
          {activeRun?.debate ? <ResearchDebate run={activeRun} /> : <div className="empty">暂无辩论记录</div>}
        </div>

        <div className="panel">
          <SectionTitle icon={<ShieldCheck />} title="组合经理" />
          {activeRun?.portfolioManager ? <PortfolioDecision run={activeRun} /> : <div className="empty">等待研究完成</div>}
          <div className="buttonRow">
            <button disabled={!activeRun || activeRun.status !== 'completed'} onClick={createDraftProposal}>生成模拟方案</button>
            <button disabled={!activeRun || activeRun.status !== 'completed'} onClick={evaluateRun}>复盘</button>
          </div>
        </div>

        <div className="panel wide">
          <SectionTitle icon={<ListChecks />} title="交易草稿与风控" />
          {activeRun ? <ResearchTradePlan run={activeRun} /> : <div className="empty">暂无交易草稿</div>}
        </div>

        <div className="panel">
          <SectionTitle icon={<ShieldCheck />} title="产品边界" />
          {(activeRun?.boundaries || ['仅用于研究辅助和模拟交易参考。']).map(text => <p className="boundaryText" key={text}>{text}</p>)}
        </div>

        <div className="panel wide">
          <SectionTitle icon={<RefreshCw />} title="决策记忆与复盘" />
          <ResearchMemoryList memory={memory} outcomes={activeRun?.outcomes || []} />
        </div>
      </section>
    </Page>
  );
}

function ResearchConfigPanel({ config, symbol }: { config: ResearchConfig | null; symbol: string }) {
  if (!config) return <div className="researchConfig"><span>配置读取中</span></div>;
  const benchmark = config.benchmarkMap?.usstocks || config.benchmarkMap?.crypto || '--';
  return (
    <div className="researchConfig">
      <div><span>Quick</span><strong>{config.quickModel}</strong></div>
      <div><span>Deep</span><strong>{config.deepModel}</strong></div>
      <div><span>默认基准</span><strong>{symbol.endsWith('USDT') ? config.benchmarkMap.crypto : benchmark}</strong></div>
    </div>
  );
}

function ResearchSnapshot({ run }: { run: ResearchRun }) {
  const q = run.quote || run.context?.quote;
  return (
    <div className="researchSnapshot">
      <div>
        <span>标的</span>
        <strong>{run.symbol}</strong>
        <small>{q?.name || run.symbol}</small>
      </div>
      <div>
        <span>价格</span>
        <strong>{q ? money(q.price, q.currency || 'USD') : '--'}</strong>
        <small>{q ? pct(q.changePercent || 0) : '--'}</small>
      </div>
      <div>
        <span>综合评级</span>
        <strong>{run.manager?.ratingLabel || '--'}</strong>
        <small>{run.manager?.confidence ? `confidence ${run.manager.confidence}` : '--'}</small>
      </div>
      <div>
        <span>基准</span>
        <strong>{run.benchmark?.symbol || run.context?.benchmark?.symbol || '--'}</strong>
        <small>{run.benchmark?.changePercent !== undefined ? pct(run.benchmark.changePercent) : 'benchmark'}</small>
      </div>
    </div>
  );
}

function ResearchProgress({ run }: { run: ResearchRun }) {
  return (
    <div className="researchProgress">
      {(run.progress || []).map(step => (
        <div className={cx('progressStep', step.status === 'completed' && 'done', step.status === 'failed' && 'failed')} key={step.id}>
          <span>{step.label}</span>
          <small>{step.status}</small>
        </div>
      ))}
    </div>
  );
}

function ResearchAnalystCard({ report }: { report: any }) {
  return (
    <article className="researchCard">
      <header>
        <strong>{report.title}</strong>
        <span className="badge">{report.ratingLabel}</span>
      </header>
      <p>{report.summary}</p>
      <ResearchPointList title="证据" items={report.evidence || []} />
      <ResearchPointList title="风险" items={report.risks || []} muted />
    </article>
  );
}

function ResearchPointList({ title, items, muted = false }: { title: string; items: string[]; muted?: boolean }) {
  if (!items.length) return null;
  return (
    <div className={cx('researchPoints', muted && 'muted')}>
      <span>{title}</span>
      {items.slice(0, 4).map(item => <p key={item}>{item}</p>)}
    </div>
  );
}

function ResearchHistory({ runs, onPick }: { runs: ResearchRun[]; onPick: (run: ResearchRun) => void }) {
  if (!runs.length) return <div className="empty">暂无历史研究</div>;
  return (
    <div className="researchHistory">
      {runs.slice(0, 8).map(item => (
        <button key={item.id} onClick={() => onPick(item)}>
          <strong>{item.symbol}</strong>
          <span>{item.manager?.ratingLabel || item.status}</span>
          <small>{ageText(item.startedAt)}</small>
        </button>
      ))}
    </div>
  );
}

function ResearchDebate({ run }: { run: ResearchRun }) {
  const bull = run.debate?.bullResearcher;
  const bear = run.debate?.bearResearcher;
  return (
    <div className="debateGrid">
      <article className="debateColumn bull">
        <strong>{bull?.title || '多头研究员'}</strong>
        <p>{bull?.thesis}</p>
        {(bull?.points || []).slice(0, 5).map((point: any, idx: number) => <span key={`${point.text}-${idx}`}>{point.text}<small>{point.source}</small></span>)}
      </article>
      <article className="debateColumn bear">
        <strong>{bear?.title || '空头研究员'}</strong>
        <p>{bear?.thesis}</p>
        {(bear?.points || []).slice(0, 5).map((point: any, idx: number) => <span key={`${point.text}-${idx}`}>{point.text}<small>{point.source}</small></span>)}
      </article>
      <article className="debateColumn manager">
        <strong>{run.manager?.title || '研究经理'}</strong>
        <p>{run.manager?.summary}</p>
        {(run.manager?.keyDisagreements || []).map((item: string) => <span key={item}>{item}</span>)}
      </article>
    </div>
  );
}

function PortfolioDecision({ run }: { run: ResearchRun }) {
  const pm = run.portfolioManager;
  return (
    <div className="portfolioDecision">
      <div className={cx('decisionBadge', pm?.approved ? 'ok' : 'warn')}>
        {pm?.approved ? '批准草稿' : '拒绝/观察'}
      </div>
      <p>{pm?.summary}</p>
      {(pm?.reasons || []).slice(0, 4).map((reason: string) => <span key={reason}>{reason}</span>)}
      {run.linkedProposalId && <small>已关联方案 {run.linkedProposalId}</small>}
    </div>
  );
}

function ResearchTradePlan({ run }: { run: ResearchRun }) {
  const draft = run.traderDraft;
  const reviewers = run.riskReview?.reviewers || [];
  if (!draft) return <div className="empty">暂无交易草稿</div>;
  return (
    <div className="tradePlanGrid">
      <div className="planBlock">
        <span>动作</span>
        <strong>{draft.actionLabel}</strong>
        <p>{draft.plan}</p>
      </div>
      <div className="planBlock">
        <span>数量</span>
        <strong>{draft.qty || 0}</strong>
        <p>参考价 {money(draft.entry?.referencePrice || 0, draft.entry?.currency || 'USD')}</p>
      </div>
      <div className="planBlock">
        <span>止损/止盈</span>
        <strong>{draft.riskPlan?.stopLoss} / {draft.riskPlan?.takeProfit}</strong>
        <p>{draft.constraints?.[0]}</p>
      </div>
      {reviewers.map((review: any) => (
        <div className="planBlock" key={review.role}>
          <span>{review.title}</span>
          <strong>{review.stance}</strong>
          <p>{review.summary}</p>
        </div>
      ))}
    </div>
  );
}

function ResearchMemoryList({ memory, outcomes }: { memory: ResearchMemoryEntry[]; outcomes: ResearchMemoryEntry[] }) {
  const rows = [...outcomes, ...memory].filter(Boolean);
  if (!rows.length) return <div className="empty">暂无复盘记忆</div>;
  return (
    <div className="memoryList">
      {rows.slice(0, 8).map((item, idx) => (
        <article className="memoryItem" key={item.id || `${item.runId}-${idx}`}>
          <header>
            <strong>{item.symbol}</strong>
            <span>{item.verdict || item.rating || '--'}</span>
          </header>
          <div className="memoryMetrics">
            <span>收益 {item.rawReturnPct ?? '--'}%</span>
            <span>Alpha {item.alphaPct ?? '--'}%</span>
            <span>{item.benchmark || 'benchmark'}</span>
          </div>
          {(item.lessons || []).slice(0, 2).map(lesson => <p key={lesson}>{lesson}</p>)}
        </article>
      ))}
    </div>
  );
}

function AgentCenter() {
  const [status, setStatus] = useState<any>(null);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [signals, setSignals] = useState<any[]>([]);
  const [proposals, setProposals] = useState<any[]>([]);
  const [backtest, setBacktest] = useState<any>(null);
  const [selectedStrategy, setSelectedStrategy] = useState('balanced');
  const notify = useAppStore(s => s.notify);
  async function refresh() {
    const [s, st, sig, prop] = await Promise.all([api.agentStatus(), api.strategies(), api.signals(), api.proposals()]);
    setStatus(s); setStrategies(st.strategies || []); setSignals(sig.signals || []); setProposals(prop.proposals || []);
  }
  useEffect(() => { refresh().catch(() => undefined); }, []);
  async function actionProposal(id: string, action: 'approve' | 'reject' | 'execute') {
    try {
      if (action === 'approve') await api.approveProposal(id);
      if (action === 'reject') await api.rejectProposal(id);
      if (action === 'execute') await api.executeProposal(id);
      await refresh();
      notify('已处理方案');
    } catch (err: any) {
      notify(err.message, 'error');
    }
  }
  return (
    <Page>
      <div className="pageHeader"><h1>策略中心</h1><span className={cx('badge', status?.llmReady ? 'ok' : 'warn')}>{status?.llmReady ? 'LLM ready' : 'LLM key required'}</span></div>
      <section className="agentGrid">
        <div className="panel wide">
          <SectionTitle icon={<Bot />} title="策略库" />
          <div className="strategyGrid">
            {strategies.map(s => (
              <button className={cx('strategyCard', selectedStrategy === s.id && 'active')} key={s.id} onClick={() => setSelectedStrategy(s.id)}>
                <strong>{s.name}</strong><span>{s.description}</span><small>{s.riskLevel} · {s.confidenceThreshold}</small>
              </button>
            ))}
          </div>
        </div>
        <div className="panel">
          <SectionTitle icon={<ShieldCheck />} title="安全护栏" />
          <StatusStack status={status} />
        </div>
        <div className="panel">
          <SectionTitle icon={<Activity />} title="运行配置" />
          <AgentConfig strategyId={selectedStrategy} onSaved={refresh} />
        </div>
        <div className="panel wide">
          <SectionTitle icon={<Target />} title="信号流" action={<button className="smallButton" onClick={() => api.generateSignal({ symbol: useAppStore.getState().selectedSymbol, strategyId: selectedStrategy }).then(refresh)}>生成信号</button>} />
          <div className="signalList">{signals.map((s, i) => <div className="signalRow" key={s.id || i}><strong>{s.symbol}</strong><span>{s.action || s.操作 || 'HOLD'}</span><em>{s.confidence || s.置信度 || 0}</em></div>)}</div>
        </div>
        <div className="panel wide">
          <SectionTitle icon={<ListChecks />} title="方案审批" />
          {proposals.map(p => (
            <div className="proposalRow" key={p.id}>
              <span><strong>{p.symbol}</strong><small>{p.status}</small></span>
              <p>{p.reason || p.原因 || '--'}</p>
              <div className="buttonRow">
                <button onClick={() => actionProposal(p.id, 'approve')}>批准</button>
                <button onClick={() => actionProposal(p.id, 'reject')}>拒绝</button>
                <button onClick={() => actionProposal(p.id, 'execute')}>执行</button>
              </div>
            </div>
          ))}
          {!proposals.length && <div className="empty">暂无方案</div>}
        </div>
        <div className="panel wide">
          <SectionTitle icon={<BarChart3 />} title="回测" action={<button className="smallButton" onClick={() => api.backtest(selectedStrategy).then(r => setBacktest(r.result || r.results))}>运行</button>} />
          <pre className="jsonBox">{backtest ? JSON.stringify(backtest, null, 2) : 'No backtest yet'}</pre>
        </div>
        <div className="panel">
          <SectionTitle icon={<AlertTriangle />} title="策略闸门演练" />
          <AutomationGate />
        </div>
      </section>
    </Page>
  );
}

function AgentConfig({ strategyId, onSaved }: { strategyId: string; onSaved: () => void }) {
  const [enabled, setEnabled] = useState(false);
  const [level, setLevel] = useState(2);
  const notify = useAppStore(s => s.notify);
  async function save() {
    try {
      await api.updateAgentConfig({ enabled, level, strategyId });
      onSaved();
      notify('配置已保存');
    } catch (err: any) {
      notify(err.message, 'error');
    }
  }
  return (
    <div className="configStack">
      <label className="toggleRow"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />启用</label>
      <label className="field"><span>安全等级</span><input type="number" min={1} max={3} value={level} onChange={e => setLevel(Number(e.target.value))} /></label>
      <button className="primaryButton" onClick={save}>保存</button>
    </div>
  );
}

function StatusStack({ status }: { status: any }) {
  return (
    <div className="statusStack">
      <div><span>熔断</span><strong>{status?.circuitBreaker?.state || '--'}</strong></div>
      <div><span>风险</span><strong>{status?.risk?.todayTrades ?? 0} trades</strong></div>
      <div><span>Agent</span><strong>{status?.agent?.enabled ? 'ON' : 'OFF'}</strong></div>
    </div>
  );
}

function AutomationGate() {
  const [symbol, setSymbol] = useState('AAPL');
  const [mode, setMode] = useState<'dry_run' | 'simulation_only' | 'paper_execution'>('dry_run');
  const [result, setResult] = useState<any>(null);
  return (
    <div className="configStack">
      <label className="field"><span>标的</span><input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} /></label>
      <select value={mode} onChange={e => setMode(e.target.value as any)}>
        <option value="dry_run">只检查</option>
        <option value="simulation_only">模拟演练</option>
        <option value="paper_execution">写入模拟盘</option>
      </select>
      <button className="smallButton" onClick={() => api.automationRun({ symbol, mode, payload: { confidence: 0.8 } }).then(setResult)}>运行</button>
      {result && <pre className="jsonBox small">{JSON.stringify(result, null, 2)}</pre>}
    </div>
  );
}

function Alerts() {
  const [symbol, setSymbol] = useState('AAPL');
  const [price, setPrice] = useState('');
  const [trigger, setTrigger] = useState<'gte' | 'lte'>('gte');
  const notify = useAppStore(s => s.notify);
  async function create() {
    try {
      await api.createOrder({ symbol, side: 'sell', triggerType: trigger, triggerPrice: Number(price), qty: 1, category: 'usstocks' });
      notify('提醒/条件单已创建');
    } catch (err: any) {
      notify(err.message, 'error');
    }
  }
  return (
    <Page>
      <div className="pageHeader"><h1>提醒</h1><span>Price alerts</span></div>
      <div className="panel narrow">
        <SectionTitle icon={<Bell />} title="到价提醒" />
        <label className="field"><span>标的</span><input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} /></label>
        <div className="segmented"><button className={trigger === 'gte' ? 'active' : ''} onClick={() => setTrigger('gte')}>涨到</button><button className={trigger === 'lte' ? 'active' : ''} onClick={() => setTrigger('lte')}>跌到</button></div>
        <label className="field"><span>价格</span><input type="number" value={price} onChange={e => setPrice(e.target.value)} /></label>
        <button className="primaryButton" onClick={create}>创建</button>
      </div>
    </Page>
  );
}

function SettingsPage() {
  const currency = useAppStore(s => s.currency);
  const language = useAppStore(s => s.language);
  const theme = useAppStore(s => s.theme);
  const upDownMode = useAppStore(s => s.upDownMode);
  const setPreference = useAppStore(s => s.setPreference);
  return (
    <Page>
      <div className="pageHeader"><h1>设置</h1><span>V4</span></div>
      <section className="settingsGrid">
        <div className="panel">
          <SectionTitle icon={<Settings />} title="偏好" />
          <label className="field"><span>计价</span><select value={currency} onChange={e => setPreference({ currency: e.target.value as any })}><option>USD</option><option>CNY</option><option>USDT</option><option>HKD</option></select></label>
          <label className="field"><span>语言</span><select value={language} onChange={e => setPreference({ language: e.target.value as any })}><option value="zh">中文</option><option value="en">English</option></select></label>
          <label className="field"><span>主题</span><select value={theme} onChange={e => setPreference({ theme: e.target.value as any })}><option value="dark">Dark</option><option value="light">Light</option><option value="system">System</option></select></label>
          <label className="field"><span>涨跌色</span><select value={upDownMode} onChange={e => setPreference({ upDownMode: e.target.value as any })}><option value="cn">红涨绿跌</option><option value="us">绿涨红跌</option></select></label>
        </div>
        <div className="panel wide"><SectionTitle icon={<Activity />} title="源健康" /><SystemHealth /></div>
        <div className="panel wide"><SectionTitle icon={<ShieldCheck />} title="模拟盘声明" /><p className="disclaimer">仅用于策略研究与模拟交易练习，不构成投资建议，不接实盘。</p></div>
      </section>
    </Page>
  );
}

function SystemHealth({ compact = false }: { compact?: boolean }) {
  const [health, setHealth] = useState<any>(null);
  useEffect(() => { api.health().then(setHealth).catch(() => setHealth(null)); }, []);
  if (!health) return <div className="skeleton healthSkeleton" />;
  const apis = health.apis || {};
  return (
    <div className={cx('healthGrid', compact && 'compactList')}>
      {Object.entries(apis).map(([name, item]: any) => (
        <div className="healthItem" key={name}>
          <span>{name}</span>
          <strong className={item.ok ? 'up-us' : 'down-us'}>{item.status || (item.ok ? 'healthy' : 'degraded')}</strong>
          <small>{item.successRate || 'N/A'} · {Math.round(item.avgLatency || 0)}ms</small>
        </div>
      ))}
      <div className="healthItem"><span>LLM</span><strong className={health.agent?.llmReady ? 'up-us' : 'warnText'}>{health.agent?.llmReady ? 'ready' : 'missing key'}</strong><small>{health.agent?.llm?.provider}</small></div>
    </div>
  );
}

function Toast({ toast }: { toast?: { id: number; kind: string; text: string } }) {
  return (
    <AnimatePresence>
      {toast && (
        <motion.div className={cx('toast', toast.kind)} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}>
          {toast.kind === 'ok' ? <Check size={17} /> : <AlertTriangle size={17} />}
          {toast.text}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
