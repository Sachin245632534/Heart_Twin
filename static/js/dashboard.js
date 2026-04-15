/**
 * Digital Twin — Hemodynamics Dashboard JS
 * WebSocket, rolling charts (Chart.js 4), parameter sliders.
 * All key references exposed on `window` for cross-script access.
 */

const MAX_POINTS = 120;

const CHART_COLOR = {
  lv:   '#4f9cf9',
  rv:   '#a78bfa',
  la:   '#34d399',
  ra:   '#fb923c',
  flow: '#22d3ee',
  o2:   '#34d399',
};

/* ── helpers ─────────────────────────────────────────── */
function rolling(arr, val) {
  arr.push(val);
  if (arr.length > MAX_POINTS) arr.shift();
}

function fmt(v, dec = 1) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  return Number(v).toFixed(dec);
}

function setText(id, val) {
  const e = document.getElementById(id);
  if (e) e.textContent = val;
}

function setBar(id, val, min, max) {
  const e = document.getElementById(id);
  if (!e) return;
  const pct = Math.min(100, Math.max(0, ((val - min) / (max - min)) * 100));
  e.style.width = pct + '%';
}

function setBadge(id, val, lo, hi) {
  const e = document.getElementById(id);
  if (!e) return;
  e.className = 'stat-badge ' +
    (val < lo ? 'badge-warn' : val > hi ? 'badge-high' : 'badge-normal');
  e.textContent = val < lo ? 'LOW' : val > hi ? 'HIGH' : 'NORMAL';
}

/* ── Rolling history — exposed globally ─────────────── */
window.hist = {
  t: [],
  lv_P: [], rv_P: [], la_P: [], ra_P: [],
  lv_V: [], rv_V: [], la_V: [], ra_V: [],
  lv_Q: [], rv_Q: [], la_Q: [], ra_Q: [],
  lv_A: [], rv_A: [], la_A: [], ra_A: [],
  flow: [], o2: [],
};

/* ── Clock ───────────────────────────────────────────── */
function startClock() {
  const el = document.getElementById('topbar-clock');
  if (!el) return;
  const tick = () => {
    el.textContent = new Date().toLocaleTimeString('en-US', { hour12: false });
  };
  tick();
  setInterval(tick, 1000);
}

/* ── WebSocket ───────────────────────────────────────── */
let ws = null;

function setWsStatus(online) {
  const dot = document.getElementById('ws-dot');
  if (!dot) return;
  dot.classList.toggle('offline', !online);
  dot.title = online ? 'WebSocket Connected' : 'WebSocket Disconnected';
}

function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen  = () => setWsStatus(true);
  ws.onclose = () => { setWsStatus(false); setTimeout(connectWS, 2000); };
  ws.onerror = () => setWsStatus(false);
  ws.onmessage = (ev) => {
    try { window.onData(JSON.parse(ev.data)); } catch { /* ignore */ }
  };
}

function sendParam(chamber, param, value) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ chamber, param, value: parseFloat(value) }));
}
window.sendParam = sendParam;

/* ── Chart factory ───────────────────────────────────── */
Chart.defaults.color = '#94a3b8';
Chart.defaults.borderColor = 'rgba(99,120,180,0.12)';
Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
Chart.defaults.font.size = 10;

function makeChart(canvasId, datasets, yLabel = '') {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  return new Chart(canvas, {
    type: 'line',
    data: {
      labels: [],
      datasets: datasets.map(ds => ({
        label: ds.label,
        data: [],
        borderColor: ds.color,
        borderWidth: 1.6,
        pointRadius: 0,
        tension: 0.35,
        fill: ds.fill ?? false,
        backgroundColor: ds.fill
          ? ds.color + '14'
          : 'transparent',
      }))
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: datasets.length > 1,
          position: 'top',
          labels: { boxWidth: 10, padding: 10, font: { size: 10 } }
        },
        tooltip: {
          backgroundColor: 'rgba(13,18,32,0.95)',
          borderColor: 'rgba(99,120,180,0.3)',
          borderWidth: 1,
          padding: 8,
          bodyFont: { size: 10, family: "'JetBrains Mono', monospace" },
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(99,120,180,0.07)' },
          ticks: { maxTicksLimit: 6, maxRotation: 0 }
        },
        y: {
          grid: { color: 'rgba(99,120,180,0.07)' },
          title: { display: !!yLabel, text: yLabel, font: { size: 9 } }
        }
      }
    }
  });
}

function pushChart(chart, labels, ...series) {
  if (!chart) return;
  chart.data.labels = labels;
  chart.data.datasets.forEach((ds, i) => {
    if (series[i] !== undefined) ds.data = series[i];
  });
  chart.update('none');
}

/* ── Full-Heart View ─────────────────────────────────── */
const fullCharts = {};

function initFullHeart() {
  fullCharts.pressure = makeChart('chart-pressure', [
    { label: 'LV', color: CHART_COLOR.lv },
    { label: 'RV', color: CHART_COLOR.rv },
    { label: 'LA', color: CHART_COLOR.la },
    { label: 'RA', color: CHART_COLOR.ra },
  ], 'Pressure (mmHg)');

  fullCharts.volume = makeChart('chart-volume', [
    { label: 'LV', color: CHART_COLOR.lv },
    { label: 'RV', color: CHART_COLOR.rv },
    { label: 'LA', color: CHART_COLOR.la },
    { label: 'RA', color: CHART_COLOR.ra },
  ], 'Volume (mL)');

  fullCharts.flow = makeChart('chart-flow',
    [{ label: 'Cardiac Output', color: CHART_COLOR.flow, fill: true }],
    'Flow (mL/s)');

  fullCharts.o2 = makeChart('chart-o2',
    [{ label: 'O₂ Delivery', color: CHART_COLOR.o2, fill: true }],
    'O₂ Delivery');
}

function updateFullHeart(data) {
  const t = fmt(data.t, 2);

  rolling(window.hist.t,    t);
  rolling(window.hist.lv_P, data.lv?.P    ?? 0);
  rolling(window.hist.rv_P, data.rv?.P    ?? 0);
  rolling(window.hist.la_P, data.la?.P    ?? 0);
  rolling(window.hist.ra_P, data.ra?.P    ?? 0);
  rolling(window.hist.lv_V, data.lv?.V    ?? 0);
  rolling(window.hist.rv_V, data.rv?.V    ?? 0);
  rolling(window.hist.la_V, data.la?.V    ?? 0);
  rolling(window.hist.ra_V, data.ra?.V    ?? 0);
  rolling(window.hist.flow, data.flow     ?? 0);
  rolling(window.hist.o2,   data.O2_delivery ?? 0);

  // ── Stat cards
  const lvP = data.lv?.P ?? 0;
  const rvP = data.rv?.P ?? 0;
  const hr  = data.params?.HR ?? 75;
  const o2pct = (data.lung?.O2_out ?? 0) * 100;

  setText('stat-lv-p',  fmt(lvP));
  setText('stat-rv-p',  fmt(rvP));
  setText('stat-hr',    fmt(hr, 0));
  setText('stat-o2',    fmt(o2pct, 1));
  setText('stat-flow',  fmt(data.flow, 1));
  setText('stat-co',    fmt((data.flow ?? 0) * 60 / 1000, 2));

  // Badges
  setBadge('badge-lv', lvP, 80, 130);
  setBadge('badge-hr',  hr, 60, 100);

  // Phys bars
  setBar('bar-lv',   lvP,           0, 140);
  setBar('bar-rv',   rvP,           0, 35);
  setBar('bar-la',   data.la?.P ?? 0, 0, 20);
  setBar('bar-ra',   data.ra?.P ?? 0, 0, 10);
  setBar('bar-flow', data.flow  ?? 0, 0, 30);

  // Mirror secondary spans
  setText('stat-lv-p2',  fmt(lvP));
  setText('stat-rv-p2',  fmt(rvP));
  setText('stat-la-p',   fmt(data.la?.P ?? 0));
  setText('stat-ra-p',   fmt(data.ra?.P ?? 0));
  setText('stat-flow-b', fmt(data.flow ?? 0));
  setText('stat-o2b',    fmt(o2pct, 1));

  const L = window.hist.t;
  pushChart(fullCharts.pressure, L, window.hist.lv_P, window.hist.rv_P, window.hist.la_P, window.hist.ra_P);
  pushChart(fullCharts.volume,   L, window.hist.lv_V, window.hist.rv_V, window.hist.la_V, window.hist.ra_V);
  pushChart(fullCharts.flow,     L, window.hist.flow);
  pushChart(fullCharts.o2,       L, window.hist.o2);
}

/* ── Chamber View ────────────────────────────────────── */
const chamberCharts = {};

function initChamber() {
  const KEY   = window.CHAMBER_KEY;
  const color = CHART_COLOR[KEY] ?? CHART_COLOR.lv;

  chamberCharts.pressure = makeChart('chart-chamber-p',
    [{ label: 'Pressure', color, fill: true }], 'Pressure (mmHg)');

  chamberCharts.volume = makeChart('chart-chamber-v',
    [{ label: 'Volume', color, fill: true }], 'Volume (mL)');

  chamberCharts.flow = makeChart('chart-chamber-flow',
    [{ label: 'Flow Out', color: CHART_COLOR.flow }], 'Flow (mL/s)');

  chamberCharts.activation = makeChart('chart-chamber-act',
    [{ label: 'Activation', color: '#f8d971' }]);
}

function updateChamber(data) {
  const KEY = window.CHAMBER_KEY;
  const c   = data[KEY];
  if (!c) return;
  const t = fmt(data.t, 2);

  rolling(window.hist.t,            t);
  rolling(window.hist[`${KEY}_P`],  c.P     ?? 0);
  rolling(window.hist[`${KEY}_V`],  c.V     ?? 0);
  rolling(window.hist[`${KEY}_Q`],  c.Q_out ?? 0);
  rolling(window.hist[`${KEY}_A`],  c.A     ?? 0);

  setText('stat-chamber-p', fmt(c.P));
  setText('stat-chamber-v', fmt(c.V));
  setText('stat-chamber-q', fmt(c.Q_out));
  setText('stat-chamber-a', fmt(c.A, 3));
  setText('stat-hr',        fmt(data.params?.HR, 0));

  const L = window.hist.t;
  pushChart(chamberCharts.pressure,   L, window.hist[`${KEY}_P`]);
  pushChart(chamberCharts.volume,     L, window.hist[`${KEY}_V`]);
  pushChart(chamberCharts.flow,       L, window.hist[`${KEY}_Q`]);
  pushChart(chamberCharts.activation, L, window.hist[`${KEY}_A`]);
}

/* ── onData dispatcher — exposed globally for patches ── */
window.onData = function(data) {
  if (window.PAGE_TYPE === 'full') {
    updateFullHeart(data);
  } else if (window.PAGE_TYPE === 'chamber') {
    updateChamber(data);
  }
  // call any registered middleware (PV loop, etc.)
  (window._onDataMiddleware || []).forEach(fn => { try { fn(data); } catch {} });
};

window.registerDataMiddleware = function(fn) {
  window._onDataMiddleware = window._onDataMiddleware || [];
  window._onDataMiddleware.push(fn);
};

/* ── Slider wiring ───────────────────────────────────── */
function wireSliders() {
  document.querySelectorAll('[data-param]').forEach(slider => {
    const param   = slider.dataset.param;
    const chamber = slider.dataset.chamber ?? '';
    const dispId  = slider.dataset.display;
    if (dispId) setText(dispId, fmt(slider.value, 2));
    slider.addEventListener('input', () => {
      const val = parseFloat(slider.value);
      if (dispId) setText(dispId, fmt(val, 2));
      sendParam(chamber, param, val);
    });
  });
}

/* ── Boot ────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  startClock();
  wireSliders();
  connectWS();

  if (window.PAGE_TYPE === 'full')    initFullHeart();
  if (window.PAGE_TYPE === 'chamber') initChamber();
});
