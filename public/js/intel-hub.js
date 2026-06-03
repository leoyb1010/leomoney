/**
 * 消息分析 Hub — 真实头条 + Agent
 */
(function initIntelHub() {
  const $ = id => document.getElementById(id);
  const trigger = $('intelTrigger');
  const panel = $('intelPanel');
  const backdrop = $('intelBackdrop');
  const feedEl = $('intelFeed');
  const badge = $('intelBadge');
  const llmTag = $('intelLlmTag');
  if (!trigger || !panel) {
    console.warn('[intel-hub] DOM 未找到，请硬刷新页面');
    return;
  }

  let open = false;

  function setOpen(v) {
    open = v;
    trigger.classList.toggle('open', v);
    panel.classList.toggle('open', v);
    if (backdrop) {
      backdrop.classList.toggle('open', v);
      backdrop.setAttribute('aria-hidden', v ? 'false' : 'true');
    }
    trigger.setAttribute('aria-expanded', v ? 'true' : 'false');
  }

  function toast(text) {
    if (typeof window.toast === 'function') return window.toast(text);
    const el = $('toast');
    if (!el) return;
    el.textContent = text;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2800);
  }

  async function api(url, options) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '请求失败');
    return data;
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function actionClass(action) {
    const a = String(action || 'HOLD').toUpperCase();
    if (a === 'BUY') return 'buy';
    if (a === 'SELL') return 'sell';
    return 'hold';
  }

  function renderHeadline(item) {
    const title = esc(item.title);
    const url = item.url || item.link || '';
    const meta = [item.source, item.time].filter(Boolean).join(' · ');
    if (url) {
      return `<li><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${title}</a><span class="weak"> ${esc(meta)}</span></li>`;
    }
    return `<li>${title}<span class="weak"> ${esc(meta)}</span></li>`;
  }

  function renderFeed(items) {
    if (!items?.length) {
      feedEl.innerHTML = '<div class="notice">点击「实时检索」拉取 Google News 头条（免费源）。打开面板时会自动检索当前标的。</div>';
      badge.classList.add('empty');
      badge.textContent = '0';
      return;
    }
    badge.classList.remove('empty');
    badge.textContent = String(Math.min(items.length, 99));

    feedEl.innerHTML = items.map(entry => {
      const news = (entry.news || []).slice(0, 6).map(renderHeadline).join('');
      const search = (entry.search || []).slice(0, 3).map(s => renderHeadline({
        title: s.title || s.snippet,
        url: s.url,
        source: s.source || 'Search',
        time: '',
      })).join('');
      const meta = entry.sourceMeta || {};
      const srcLine = meta.googleEn != null
        ? `<div class="intel-src">来源：Google ${meta.googleEn + meta.googleZh} 条${meta.eastmoney ? ` · 东财 ${meta.eastmoney}` : ''}${meta.searchApi ? ` · 搜索 ${meta.searchApi}` : ''}</div>`
        : '';
      const analysis = entry.analysis;
      const quote = entry.quote;
      const quoteLine = quote
        ? `<div class="intel-meta">行情 <b>${esc(quote.symbol)}</b> <span class="mono">${Number(quote.price).toFixed(2)}</span> <span class="${Number(quote.changePercent) >= 0 ? 'green' : 'red'}">(${Number(quote.changePercent || 0).toFixed(2)}%)</span></div>`
        : '';
      const analysisBlock = analysis?.summary
        ? `<div class="intel-summary">${esc(analysis.summary).replace(/\n/g, '<br>')}</div>
           <span class="intel-action ${actionClass(analysis.action)}">${esc(analysis.action || 'HOLD')} · ${analysis.llmReady ? 'Agent' : '规则'} · ${Math.round((analysis.confidence || 0) * 100)}%</span>`
        : '';
      const emptyHint = !news && !search
        ? '<div class="notice" style="margin-top:8px">未抓到新闻标题，请换关键词或检查网络能否访问 Google News。</div>'
        : '';
      return `<article class="intel-item">
        <div class="intel-meta"><b>${esc(entry.query || entry.symbol)}</b> · ${new Date(entry.ts).toLocaleTimeString()}</div>
        ${quoteLine}${srcLine}
        ${news ? `<div class="intel-section-title">头条</div><ul class="intel-news">${news}</ul>` : ''}
        ${search ? `<div class="intel-section-title">扩展</div><ul class="intel-news">${search}</ul>` : ''}
        ${emptyHint}
        ${analysisBlock}
      </article>`;
    }).join('');
  }

  function setLoading(on) {
    if (on) {
      feedEl.innerHTML = '<div class="notice intel-loading">正在从 Google News 拉取实时头条…</div>';
    }
  }

  async function refreshFeed() {
    const data = await api('/api/intel/feed?limit=25');
    if (llmTag) {
      llmTag.textContent = data.llmReady ? 'Agent 在线' : '规则摘要';
      llmTag.classList.toggle('ready', !!data.llmReady);
    }
    renderFeed(data.items || []);
  }

  async function runScan(silent) {
    const p = queryPayload();
    if (!p.query) {
      if (!silent) toast('请输入关键词或选择左侧标的');
      return null;
    }
    if (!silent) setLoading(true);
    try {
      const data = await api('/api/intel/scan', { method: 'POST', body: JSON.stringify(p) });
      await refreshFeed();
      const n = (data.entry?.news?.length || 0) + (data.entry?.search?.length || 0);
      if (!silent) toast(n > 0 ? `已获取 ${n} 条情报` : '检索完成，暂无头条');
      return data.entry;
    } catch (err) {
      if (!silent) toast(err.message);
      throw err;
    }
  }

  async function loadWatch() {
    const data = await api('/api/intel/watch');
    const chips = $('intelChips');
    if (!chips) return;
    chips.innerHTML = (data.topics || []).map(t =>
      `<span class="intel-chip" data-query="${encodeURIComponent(t.query)}" data-symbol="${esc(t.symbol || '')}">
        ${esc(t.query)}
        <button type="button" data-remove="${t.id}" aria-label="删除">×</button>
      </span>`
    ).join('');
    chips.querySelectorAll('.intel-chip').forEach(chip => {
      chip.addEventListener('click', e => {
        if (e.target.dataset.remove) return;
        $('intelQuery').value = decodeURIComponent(chip.dataset.query || '');
        if (chip.dataset.symbol) $('intelSymbol').value = chip.dataset.symbol;
        runScan(false).catch(() => {});
      });
    });
    chips.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        await api(`/api/intel/watch/${btn.dataset.remove}`, { method: 'DELETE' });
        await loadWatch();
        toast('已移除关注');
      });
    });
    if (llmTag) {
      llmTag.textContent = data.llmReady ? 'Agent 在线' : '规则摘要';
      llmTag.classList.toggle('ready', !!data.llmReady);
    }
  }

  function queryPayload() {
    const query = ($('intelQuery')?.value || '').trim();
    const symbol = ($('intelSymbol')?.value || '').trim();
    const selected = window.app?.selected;
    const autoSym = selected
      ? (selected.category === 'indices' ? (selected.sinaCode || selected.code) : selected.symbol)
      : '';
    return {
      query: query || symbol || autoSym,
      symbol: symbol || autoSym || undefined,
    };
  }

  trigger.addEventListener('click', e => {
    e.stopPropagation();
    const next = !open;
    setOpen(next);
    if (next) {
      refreshFeed().catch(() => {});
      loadWatch().catch(() => {});
      runScan(true).catch(() => {});
    }
  });

  backdrop?.addEventListener('click', () => setOpen(false));

  document.addEventListener('click', e => {
    if (!open) return;
    if (!panel.contains(e.target) && !trigger.contains(e.target)) setOpen(false);
  });

  $('intelCloseBtn')?.addEventListener('click', () => setOpen(false));

  $('intelScanBtn')?.addEventListener('click', async () => {
    $('intelScanBtn').disabled = true;
    try { await runScan(false); } finally { $('intelScanBtn').disabled = false; }
  });

  $('intelAnalyzeBtn')?.addEventListener('click', async () => {
    const p = queryPayload();
    if (!p.query) return toast('请输入关键词或标的');
    try {
      $('intelAnalyzeBtn').disabled = true;
      setLoading(true);
      await api('/api/intel/analyze', { method: 'POST', body: JSON.stringify(p) });
      await refreshFeed();
      toast('解读已更新');
    } catch (err) {
      toast(err.message);
    } finally {
      $('intelAnalyzeBtn').disabled = false;
    }
  });

  $('intelAgentBtn')?.addEventListener('click', async () => {
    const p = queryPayload();
    if (!p.symbol && !p.query) return toast('请填写标的代码');
    try {
      $('intelAgentBtn').disabled = true;
      const data = await api('/api/intel/agent-signal', {
        method: 'POST',
        body: JSON.stringify({ symbol: p.symbol || p.query, query: p.query }),
      });
      await refreshFeed();
      if (data.signal) {
        toast(`Agent：${data.signal.action || '观望'} ${data.signal.symbol || ''}`);
        if (typeof window.loadAgent === 'function') window.loadAgent();
      } else {
        toast(data.error || '需配置 LLM_API_KEY');
      }
    } catch (err) {
      toast(err.message);
    } finally {
      $('intelAgentBtn').disabled = false;
    }
  });

  $('intelWatchAdd')?.addEventListener('click', async () => {
    const q = ($('intelWatchInput')?.value || '').trim();
    if (!q) return toast('请输入关注词');
    try {
      await api('/api/intel/watch', { method: 'POST', body: JSON.stringify({ query: q }) });
      $('intelWatchInput').value = '';
      await loadWatch();
      toast('已添加关注');
    } catch (err) {
      toast(err.message);
    }
  });

  refreshFeed().catch(() => {});
  loadWatch().catch(() => {});
  setInterval(() => { if (open) refreshFeed().catch(() => {}); }, 15000);

  window.intelHub = { refreshFeed, setOpen, queryPayload, runScan };
})();