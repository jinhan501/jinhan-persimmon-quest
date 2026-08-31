/* Anonymous run counting. Failure must never block the game or photo sharing. */
(() => {
  'use strict';
  const cfg = window.JINHAN_ANALYTICS_CONFIG || {};
  const key = 'jinhan-analytics-outbox-v1';
  const cacheKey = 'jinhan-analytics-summary-v1';
  const enabled = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(cfg.endpoint || '');
  const production = location.origin === cfg.productionOrigin && location.pathname.startsWith(cfg.productionPath || '/jinhan-persimmon-quest/');
  const optOut = new URLSearchParams(location.search).get('stats') === 'off';
  let inFlight = false;
  let timer;
  let retries = 0;
  let summaryRequest;
  let summary = read(cacheKey, null);
  function read(k, fallback) { try { return JSON.parse(localStorage.getItem(k)) || fallback; } catch { return fallback; } }
  function write(k, value) { try { localStorage.setItem(k, JSON.stringify(value)); } catch { /* In-memory progress can continue. */ } }
  let pending = read(key, {});
  if (!pending || Array.isArray(pending) || typeof pending !== 'object') pending = {};
  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = b[6] & 15 | 64; b[8] = b[8] & 63 | 128;
    const h = [...b].map(v => v.toString(16).padStart(2,'0')).join('');
    return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
  }
  function enqueue(run) {
    if (!enabled || !production || !run?.id) return;
    pending = { ...pending, ...read(key, {}) };
    const old = pending[run.id];
    pending[run.id] = {
      v: 1, site: 'jinhan-persimmon-quest', runId: run.id, started: true,
      completed: Boolean(run.completed || old?.completed), excluded: Boolean(run.excluded || old?.excluded)
    };
    write(key, pending);
    retries = 0;
    void flush();
  }
  async function flush() {
    if (!enabled || !production || inFlight || navigator.onLine === false) return;
    clearTimeout(timer);
    const entry = Object.values(pending)[0];
    if (!entry) return;
    const serialized = JSON.stringify(entry);
    inFlight = true;
    let ok = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(cfg.endpoint, {
        method: 'POST', headers: {'Content-Type':'text/plain;charset=UTF-8'}, body: serialized,
        credentials: 'omit', redirect: 'follow', signal: controller.signal, keepalive: true
      });
      const ack = await response.json();
      if (!response.ok || ack.ok !== true || ack.runId !== entry.runId) throw new Error('No acknowledgement');
      ok = true;
      // Do not erase a completion/exclusion queued while the start was in flight.
      pending = { ...pending, ...read(key, {}) };
      if (JSON.stringify(pending[entry.runId]) === serialized) delete pending[entry.runId];
      write(key, pending);
      retries = 0;
      if (entry.completed || entry.excluded) { summary = null; write(cacheKey, null); }
    } catch { retries++; }
    finally { clearTimeout(timeout); inFlight = false; }
    if (Object.keys(pending).length && (ok || retries <= 3)) timer = setTimeout(flush, ok ? 100 : Math.min(60000, 3000 * 2 ** retries));
  }
  function start() {
    if (!enabled || !production) return null;
    const run = { id: uuid(), completed: false, excluded: optOut };
    enqueue(run); return run;
  }
  function resume(run) {
    // Never invent a start for a save created before collection was enabled.
    if (run && optOut) run.excluded = true;
    if (run) enqueue(run);
    else void flush();
  }
  function finish(run) { if (run && !run.completed) { run.completed = true; enqueue(run); } }
  function exclude(run) { if (run && !run.excluded) { run.excluded = true; enqueue(run); } }
  function summaryFresh() { return summary?.ok === true && summary.enabled === true && Number.isSafeInteger(summary.totalCompleted) && summary.totalCompleted >= 0 && Date.now() - Date.parse(summary.updatedAt) < 60000; }
  function paint() {
    const el = document.querySelector('#experience-count');
    if (!el) return;
    el.hidden = !enabled;
    if (!enabled) return;
    const text = el.querySelector('[data-count-text]');
    if (summaryFresh()) text.textContent = `累計完成 ${summary.totalCompleted.toLocaleString('zh-TW')} 次柿餅探索`;
    else text.textContent = '每一次探索，都讓好柿持續發生';
  }
  function refresh() {
    paint();
    if (!enabled || summaryFresh() || summaryRequest) return summaryRequest;
    summaryRequest = new Promise(resolve => {
      // JSONP is read-only and returns only the public aggregate; no private sheet data.
      const callback = `__jinhanStats${Date.now()}${Math.floor(Math.random()*100000)}`;
      const script = document.createElement('script');
      let timeout;
      const cleanup = () => {
        clearTimeout(timeout); script.remove();
        // A timed-out response can arrive late. Leave a temporary harmless callback.
        window[callback] = () => {};
        setTimeout(() => { delete window[callback]; }, 60000);
        resolve();
      };
      window[callback] = value => {
        if (value?.ok === true && value.enabled === true && Number.isSafeInteger(value.totalCompleted) && value.totalCompleted >= 0) {
          summary = value; write(cacheKey, summary);
        }
        paint(); cleanup();
      };
      script.onerror = cleanup;
      timeout = setTimeout(cleanup, 15000);
      script.src = `${cfg.endpoint}?action=summary&callback=${callback}`;
      document.head.append(script);
    }).finally(() => { summaryRequest = null; });
    return summaryRequest;
  }
  window.JinhanStats = { start, resume, finish, exclude, refresh };
  window.addEventListener('storage', event => { if (event.key === key) { pending = read(key, {}); retries = 0; void flush(); } });
  window.addEventListener('online', () => { retries = 0; void flush(); void refresh(); });
  window.addEventListener('pageshow', () => { retries = 0; void flush(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { retries = 0; void flush(); } });
})();
