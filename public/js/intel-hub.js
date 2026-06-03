/**
 * 消息分析 Hub — 右上角情报 + Agent 连通
 */
(function initIntelHub() {
  const $ = id => document.getElementById(id);
  const trigger = $('intelTrigger');
  const panel = $('intelPanel');
  const feedEl = $('intelFeed');
  const badge = $('intelBadge');
  const llmTag = $('intelLlmTag');
  if (!trigger || !panel) return;

  let open = false;
  let pollTimer = null;

  function setOpen(v) {
    open = v;
    trigger.classList.toggle('open', v);
    panel.classList.toggle('open', v);
  }

  function toast(text) {
    if (typeof window.toast === 'function') return window.toast(text);
    const el = $('toast');
    if (!el) return;
    el.textContent = text;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2400);
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

  function actionClass(action) {
    const a = String(action || 'HOLD').toUpperCase();
    if (a === 'BUY') return 'buy';
    if (a === 'SELL') return 'sell';
    return 'hold';
  }

  function renderFeed(items) {
    if (!items?.length) {
      feedEl.innerHTML = '<div class="notice">输入关键词后点「实时检索」，或添加关注词自动轮询。</div>';
      badge.classList.add('empty');
      badge.textContent = '0';
      return;
    }
    badge.classList.remove('empty');
    badge.textContent = String(Math.min(items.length, 99));

    feedEl.innerHTML = items.map(entry => {
      const news = (entry.news || []).slice(0, 3).map(n =>
        `<li>${n.title || ''} <span class="weak">${n.time || ''}</span></li>`
      ).join('');
      const search = (entry.search || []).slice(0, 2).map(s =>
        `<li>${s.title || s.snippet || ''}</li>`
      ).join('');
      const analysis = entry.analysis;
      const quote = entry.quote;
      const quoteLine = quote
        ? `<div class="intel-meta">行情 ${quote.symbol} <b class="mono">${Number(quote.price).toFixed(2)}</b> (${Number(quote.changePercent || 0).toFixed(2)}%)</div>`
        : '';
      const analysisBlock = analysis
        ? `<div class="intel-summary">${analysis.summary || ''}</div>
           <span class="intel-action ${actionClass(analysis.action)}">${analysis.action || 'HOLD'} · 置信 ${Math.round((analysis.confidence || 0) * 100)}%</span>`
        : '';
      return `<article class="intel-item">
        <div class="intel-meta"><b>${entry.query || entry.symbol || '情报'}</b> · ${new Date(entry.ts).toLocaleTimeString()}</div>
        ${quoteLine}
        ${news ? `<ul class="intel-news">${news}</ul>` : ''}
        ${search ? `<ul class="intel-news">${search}</ul>` : ''}
        ${analysisBlock}
      </article>`;
    }).join('');
  }

  async function refreshFeed() {
    const data = await api('/api/intel/feed?limit=25');
    if (llmTag) {
      llmTag.textContent = data.llmReady ? 'Agent 在线' : 'Agent 未配置';
      llmTag.classList.toggle('ready', !!data.llmReady);
    }
    renderFeed(data.items || []);
  }

  async function loadWatch() {
    const data = await api('/api/intel/watch');
    const chips = $('intelChips');
    if (!chips) return;
    const topics = data.topics || [];
    chips.innerHTML = topics.map(t =>
      `<span class="intel-chip" data-query="${encodeURIComponent(t.query)}" data-symbol="${t.symbol || ''}">
        ${t.query}
        <button type="button" data-remove="${t.id}" aria-label="删除">×</button>
      </span>`
    ).join('');
    chips.querySelectorAll('.intel-chip').forEach(chip => {
      chip.addEventListener('click', e => {
        if (e.target.dataset.remove) return;
        $('intelQuery').value = decodeURIComponent(chip.dataset.query || '');
        if (chip.dataset.symbol) $('intelSymbol').value = chip.dataset.symbol;
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
      llmTag.textContent = data.llmReady ? 'Agent 在线' : 'Agent 未配置';
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
    setOpen(!open);
    if (open) {
      refreshFeed().catch(() => {});
      loadWatch().catch(() => {});
    }
  });

  document.addEventListener('click', e => {
    if (!open) return;
    if (!panel.contains(e.target) && !trigger.contains(e.target)) setOpen(false);
  });

  $('intelCloseBtn')?.addEventListener('click', () => setOpen(false));

  $('intelScanBtn')?.addEventListener('click', async () => {
    const p = queryPayload();
    if (!p.query) return toast('请输入关键词或标的');
    try {
      $('intelScanBtn').disabled = true;
      await api('/api/intel/scan', { method: 'POST', body: JSON.stringify(p) });
      await refreshFeed();
      toast('情报已更新');
    } catch (err) {
      toast(err.message);
    } finally {
      $('intelScanBtn').disabled = false;
    }
  });

  $('intelAnalyzeBtn')?.addEventListener('click', async () => {
    const p = queryPayload();
    if (!p.query) return toast('请输入关键词或标的');
    try {
      $('intelAnalyzeBtn').disabled = true;
      await api('/api/intel/analyze', { method: 'POST', body: JSON.stringify(p) });
      await refreshFeed();
      toast('Agent 解读完成');
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
      const sig = data.signal;
      if (sig) {
        toast(`Agent 信号：${sig.action || '观望'} ${sig.symbol || ''}`);
        if (typeof window.loadAgent === 'function') window.loadAgent();
      } else {
        toast(data.error || '信号生成完成');
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
      toast('已添加关注，后台将自动轮询');
    } catch (err) {
      toast(err.message);
    }
  });

  refreshFeed().catch(() => {});
  loadWatch().catch(() => {});
  pollTimer = setInterval(() => { if (open) refreshFeed().catch(() => {}); }, 12000);

  window.intelHub = { refreshFeed, setOpen, queryPayload };
})();