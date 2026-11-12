/* eslint-disable -- logik asal dari docs/index.html, dipindahkan tanpa diubah */
// Logik penapis asal dari docs/index.html, dijalankan dalam pelayar oleh komponen Screener.
// OPTS.loadFeed() pulangkan objek bursa.json (dari storan Supabase yang tertutup).
let STARTED = false;
export function startScreener(OPTS) {
if (STARTED) return; STARTED = true;
const MAXD = 150, NB = 64;
let LANG = 'ms';
try { LANG = localStorage.getItem('pb_lang') === 'en' ? 'en' : 'ms'; } catch (e) { }
const tx = (ms, en) => LANG === 'en' ? en : ms;
const DEF_FILTERS = () => ({
  f1: { on: true, min: 0.60, max: null },
  f2: { on: true, min: 0.41, max: null },
  f3: { on: true, min: 0.69, max: null, mode: 'pct' },
  f4: { on: true, min: 53.02, max: null },
  f5: { on: true, fresh: false }
});
function splitLine(line, delim) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (ch === delim && !q) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}
function num(s) { if (s == null) return NaN; s = String(s).replace(/[\s_,]/g, ''); if (s === '') return NaN; return Number(s); }
function normSym(s) { s = String(s || '').trim().toUpperCase().replace(/\.KL$/, ''); return /^[A-Z0-9&.\-]{1,20}$/.test(s) ? s : ''; }
function pad(n) { return String(n).padStart(2, '0'); }
function normDate(s) {
  s = String(s || '').trim(); let y, m, d, k;
  if ((k = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) { y = +k[1]; m = +k[2]; d = +k[3]; }
  else if ((k = s.match(/^(\d{4})(\d{2})(\d{2})$/))) { y = +k[1]; m = +k[2]; d = +k[3]; }
  else if ((k = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/))) { d = +k[1]; m = +k[2]; y = +k[3]; }
  else return '';
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return '';
  return y + '-' + pad(m) + '-' + pad(d);
}
function parseInput(text, S) {
  const lines = String(text).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const pending = {}; let priceRows = 0, shareRows = 0, skipped = 0;
  const touched = new Set(), sharesTouched = new Set(); const bad = [];
  lines.forEach((line, idx) => {
    const delim = line.includes('\t') ? '\t' : (line.includes(';') ? ';' : ',');
    const cols = splitLine(line, delim);
    if (cols.length >= 7) {
      const sym = normSym(cols[0]), date = normDate(cols[1]);
      const o = num(cols[2]), h = num(cols[3]), l = num(cols[4]), c = num(cols[5]), v = num(cols[6]);
      if (!sym || !date || !(c > 0) || !(v >= 0)) { if (idx > 0 || isFinite(num(cols[5]))) { skipped++; if (bad.length < 3) bad.push(idx + 1); } return; }
      (pending[sym] = pending[sym] || {})[date] = [isFinite(o) ? o : c, isFinite(h) ? h : c, isFinite(l) ? l : c, c, v];
      priceRows++; touched.add(sym);
      if (cols.length >= 8) { const sh = num(cols[7]); if (sh > 0) { S.shares[sym] = sh; sharesTouched.add(sym); } }
    } else if (cols.length === 2) {
      const sym = normSym(cols[0]), sh = num(cols[1]);
      if (sym && sh > 0) { S.shares[sym] = sh; sharesTouched.add(sym); shareRows++; }
      else if (idx > 0 || isFinite(sh)) { skipped++; if (bad.length < 3) bad.push(idx + 1); }
    } else { skipped++; if (bad.length < 3) bad.push(idx + 1); }
  });
  for (const sym of touched) {
    const m = {}; const p = S.prices[sym];
    if (p) for (let i = 0; i < p.d.length; i++) m[p.d[i]] = [p.o[i], p.h[i], p.l[i], p.c[i], p.v[i]];
    Object.assign(m, pending[sym]);
    const dates = Object.keys(m).sort().slice(-MAXD);
    S.prices[sym] = { d: dates, o: dates.map(d => m[d][0]), h: dates.map(d => m[d][1]), l: dates.map(d => m[d][2]), c: dates.map(d => m[d][3]), v: dates.map(d => m[d][4]) };
  }
  return { priceRows, shareRows: sharesTouched.size, skipped, bad, touched: [...touched], sharesTouched: [...sharesTouched] };
}
function bucketOf(sym) { let h = 0; for (let i = 0; i < sym.length; i++) h = (h * 31 + sym.charCodeAt(i)) >>> 0; return h % NB; }
function encodeSym(p, maxDays) {
  const n = p.d.length, st = Math.max(0, n - (maxDays || MAXD)); const parts = [];
  for (let i = st; i < n; i++) parts.push([p.d[i].replace(/-/g, ''), p.o[i], p.h[i], p.l[i], p.c[i], p.v[i]].join(','));
  return parts.join(';');
}
function decodeSym(str) {
  const p = { d: [], o: [], h: [], l: [], c: [], v: [] };
  if (!str) return p;
  for (const row of String(str).split(';')) {
    const a = row.split(','); if (a.length < 6) continue;
    const d = normDate(a[0]); const c = +a[4]; if (!d || !(c > 0)) continue;
    p.d.push(d); p.o.push(+a[1]); p.h.push(+a[2]); p.l.push(+a[3]); p.c.push(c); p.v.push(+a[5]);
  }
  return p;
}
function series(p) {
  const c = p.c, n = c.length; const rsi = new Array(n).fill(null), up = new Array(n).fill(null), mid = new Array(n).fill(null);
  if (n > 14) {
    let g = 0, l = 0;
    for (let i = 1; i <= 14; i++) { const ch = c[i] - c[i - 1]; if (ch > 0) g += ch; else l -= ch; }
    let ag = g / 14, al = l / 14; rsi[14] = al === 0 ? (ag === 0 ? 50 : 100) : 100 - 100 / (1 + ag / al);
    for (let i = 15; i < n; i++) { const ch = c[i] - c[i - 1]; ag = (ag * 13 + Math.max(ch, 0)) / 14; al = (al * 13 + Math.max(-ch, 0)) / 14; rsi[i] = al === 0 ? (ag === 0 ? 50 : 100) : 100 - 100 / (1 + ag / al); }
  }
  for (let i = 19; i < n; i++) {
    let s = 0; for (let j = i - 19; j <= i; j++) s += c[j];
    const m = s / 20; let q = 0; for (let j = i - 19; j <= i; j++) q += (c[j] - m) * (c[j] - m);
    const sd = Math.sqrt(q / 20); mid[i] = m; up[i] = m + 2 * sd;
  }
  return { rsi, up, mid };
}
function avg(a, from, to) { let s = 0; for (let i = from; i <= to; i++) s += a[i]; return s / (to - from + 1); }
function inRange(v, f) { return v >= f.min && (f.max == null || v <= f.max); }
function evalAt(sym, p, ser, i, F, shares) {
  const sh = shares[sym]; const c = p.c, v = p.v; const out = [];
  // f1
  { let st = 'na', val = null, why = '';
    if (!(sh > 0)) why = tx('Tiada jumlah saham', 'No shares outstanding');
    else { val = v[i] / sh * 100; st = inRange(val, F.f1) ? 'pass' : 'fail'; }
    out.push({ k: 'f1', on: F.f1.on, st, val, why }); }
  { let st = 'na', val = null, why = '';
    if (i < 5) why = tx('Perlu data 6 hari', 'Needs 6 days of data');
    else { val = (c[i] / c[i - 5] - 1) * 100; st = inRange(val, F.f2) ? 'pass' : 'fail'; }
    out.push({ k: 'f2', on: F.f2.on, st, val, why }); }
  { let st = 'na', val = null, why = ''; const mode = F.f3.mode || 'pct';
    if (mode === 'pct') { if (!(sh > 0)) why = tx('Tiada jumlah saham', 'No shares outstanding'); else if (i < 9) why = tx('Perlu data 10 hari', 'Needs 10 days of data'); else val = avg(v, i - 9, i) / sh * 100; }
    else if (mode === 'ratio') { if (i < 10) why = tx('Perlu data 11 hari', 'Needs 11 days of data'); else { const a = avg(v, i - 10, i - 1); val = a > 0 ? v[i] / a : null; if (val == null) why = tx('Purata volum sifar', 'Average volume is zero'); } }
    else { if (i < 9) why = tx('Perlu data 10 hari', 'Needs 10 days of data'); else val = avg(v, i - 9, i) / 1e6; }
    if (val != null) st = inRange(val, F.f3) ? 'pass' : 'fail';
    out.push({ k: 'f3', on: F.f3.on, st, val, why, mode }); }
  { let st = 'na', val = ser.rsi[i], why = '';
    if (val == null) why = tx('Perlu data 15 hari', 'Needs 15 days of data'); else st = inRange(val, F.f4) ? 'pass' : 'fail';
    out.push({ k: 'f4', on: F.f4.on, st, val, why }); }
  { let st = 'na', val = null, why = '', up = ser.up[i], wasAbove = false;
    if (up == null) why = tx('Perlu data 20 hari', 'Needs 20 days of data');
    else {
      val = (c[i] / up - 1) * 100; const above = c[i] > up;
      wasAbove = i > 0 && ser.up[i - 1] != null && c[i - 1] > ser.up[i - 1];
      if (F.f5.fresh && i > 0 && ser.up[i - 1] == null) { st = 'na'; why = tx('Perlu data 21 hari', 'Needs 21 days of data'); }
      else st = above && !(F.f5.fresh && wasAbove) ? 'pass' : 'fail';
    }
    out.push({ k: 'f5', on: F.f5.on, st, val, why, up, mid: ser.mid[i], wasAbove }); }
  const on = out.filter(x => x.on); const pass = on.filter(x => x.st === 'pass').length;
  return { checks: out, onCount: on.length, pass, all: on.length > 0 && pass === on.length };
}
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function tick(p) { return p < 1 ? 0.005 : p < 10 ? 0.01 : p < 100 ? 0.02 : 0.1; }
function roundTick(p) { const t = tick(p); return Math.max(t, Math.round(p / t) * t); }
function bizDays(endDate, n) {
  const out = []; const d = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  while (out.length < n) { const w = d.getDay(); if (w !== 0 && w !== 6) out.unshift(d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())); d.setDate(d.getDate() - 1); }
  return out;
}
function demoCSV(today) {
  const rnd = mulberry32(20261111); const N = 70; const dates = bizDays(today || new Date(), N);
  const specs = [
    { s: 'DEMO-A', sh: 200e6, p0: 1.20, tr: 0.0025, vo: 0.008, bv: 1.7e6, end: 'break' },
    { s: 'DEMO-B', sh: 500e6, p0: 0.55, tr: 0.003, vo: 0.010, bv: 4.1e6, end: 'break' },
    { s: 'DEMO-C', sh: 300e6, p0: 2.10, tr: 0.002, vo: 0.008, bv: 2.4e6, end: 'near' },
    { s: 'DEMO-D', sh: 1200e6, p0: 3.40, tr: 0.002, vo: 0.007, bv: 3.0e6, end: 'break' },
    { s: 'DEMO-E', sh: 400e6, p0: 0.82, tr: -0.003, vo: 0.014, bv: 2.0e6, end: 'none' },
    { s: 'DEMO-F', sh: 600e6, p0: 1.75, tr: 0.0, vo: 0.010, bv: 5.0e6, end: 'none' },
    { s: 'DEMO-G', sh: 250e6, p0: 0.395, tr: 0.001, vo: 0.016, bv: 1.2e6, end: 'none' }
  ];
  const lines = ['simbol,tarikh,open,high,low,close,volume,jumlah_saham'];
  for (const sp of specs) {
    const c = []; let p = sp.p0;
    for (let i = 0; i < N; i++) { p = p * (1 + sp.tr + (rnd() - 0.5) * 2 * sp.vo); c.push(p); }
    const v = c.map(() => Math.round(sp.bv * (0.75 + rnd() * 0.5) / 100) * 100);
    const last = N - 1;
    if (sp.end === 'break' || sp.end === 'near') {
      v[last] = Math.round(sp.bv * 2.3 / 100) * 100;
      const win = c.slice(last - 19, last);
      const upFor = x => { const a = win.concat([x]); const m = a.reduce((s, y) => s + y, 0) / 20; const sd = Math.sqrt(a.reduce((s, y) => s + (y - m) * (y - m), 0) / 20); return m + 2 * sd; };
      if (sp.end === 'break') { let x = c[last - 1] * 1.02; let g = 0; while (x <= upFor(x) * 1.01 && g++ < 60) x *= 1.01; c[last] = x; }
      else { let x = Math.max(c[last - 1] * 1.004, c[last - 5] * 1.015); let g = 0; while (x >= upFor(x) * 0.995 && g++ < 60) x *= 0.995; c[last] = x; }
    }
    for (let i = 0; i < N; i++) {
      const cl = roundTick(c[i]); const op = roundTick(i ? c[i - 1] : cl);
      const hi = roundTick(Math.max(cl, op) * (1 + rnd() * 0.01)); const lo = roundTick(Math.min(cl, op) * (1 - rnd() * 0.01));
      lines.push([sp.s, dates[i], op.toFixed(3), hi.toFixed(3), lo.toFixed(3), cl.toFixed(3), v[i], i === 0 ? sp.sh : ''].join(',').replace(/,$/, ''));
    }
  }
  return lines.join('\n');
}
const TBL = {
  ms: {
    FN: { f1: 'Volum harian ÷ saham beredar', f2: 'Perubahan harga 5 hari', f3: 'Purata volum 10 hari', f4: 'RSI 14 hari', f5: 'Bollinger breakout (20, 2)' },
    FS: { f1: 'Vol', f2: '5H', f3: 'V10', f4: 'RSI', f5: 'BB' },
    FD: {
      f1: 'Volum hari ini sebagai peratus daripada jumlah saham beredar. Tinggi bermaksud saham itu luar biasa aktif.',
      f2: 'Harga tutup hari ini berbanding 5 hari dagangan lepas.',
      f3: 'Purata volum 10 hari dagangan terakhir, menunjukkan minat yang berterusan.',
      f4: 'Momentum harga dari 0 hingga 100. Atas 50 bermaksud pembeli lebih kuat kebelakangan ini.',
      f5: 'Harga tutup melepasi jalur atas Bollinger Band (purata 20 hari + 2 sisihan piawai).'
    },
    F3MODES: { pct: '% saham beredar', ratio: 'Nisbah volum hari ini ÷ purata 10 hari', juta: 'Juta unit saham' },
    MON: ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis']
  },
  en: {
    FN: { f1: 'Daily volume ÷ shares outstanding', f2: '5-day price change', f3: '10-day average volume', f4: '14-day RSI', f5: 'Bollinger breakout (20, 2)' },
    FS: { f1: 'Vol', f2: '5D', f3: 'V10', f4: 'RSI', f5: 'BB' },
    FD: {
      f1: "Today's volume as a percentage of shares outstanding. High means the stock is unusually active.",
      f2: "Today's closing price compared with 5 trading days ago.",
      f3: 'Average volume over the last 10 trading days, showing sustained interest.',
      f4: 'Price momentum from 0 to 100. Above 50 means buyers have been stronger lately.',
      f5: 'Closing price breaks above the upper Bollinger Band (20-day average + 2 standard deviations).'
    },
    F3MODES: { pct: '% of shares outstanding', ratio: "Today's volume ÷ 10-day average", juta: 'Million shares' },
    MON: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  }
};
let FN, FS, FD, F3MODES, MON;
function applyTables() { ({ FN, FS, FD, F3MODES, MON } = TBL[LANG]); }
applyTables();

const S = { prices: {}, shares: {}, watch: {}, filters: DEF_FILTERS() };
let RES = null, VIEW = null, QUERY = '', LIMIT = 150, TAB = 'saringan';
let DB = null, BASE = null, loadingRemote = false, changedDuringLoad = { main: false, syms: new Set() };
let dirtyMain = false; const dirtyB = new Set(); const usedBuckets = new Set(); let flushing = false, flushTimer = null;

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LS = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { } }
};
function fmtDate(d) { if (!d) return '–'; const [y, m, dd] = d.split('-'); return (+dd) + ' ' + MON[+m - 1] + ' ' + y; }
function fmtPx(p) { return p < 10 ? p.toFixed(3) : p.toFixed(2); }
function fmtPct(v) { return (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2) + '%'; }
function fmtBig(n) { if (n >= 1e9) return (n / 1e9).toFixed(2) + tx(' bilion', ' billion'); if (n >= 1e6) return (n / 1e6).toFixed(2) + tx(' juta', ' million'); return Math.round(n).toLocaleString('en-US'); }
function trimNum(x) { return String(+x.toFixed(4)); }
function fmtTh(n) { return Math.abs(n * 100 - Math.round(n * 100)) < 1e-9 ? n.toFixed(2) : trimNum(n); }

/* ---------- storage ---------- */
function mainBody() { return { v: 1, filters: S.filters, shares: S.shares, watch: S.watch }; }
function applyMain(m) {
  if (!m) return; const d = DEF_FILTERS();
  if (m.filters) for (const k in d) S.filters[k] = Object.assign({}, d[k], m.filters[k] || {});
  S.shares = Object.assign({}, m.shares || {}); S.watch = Object.assign({}, m.watch || {});
}
function saveLocalMain() { LS.set('pb_main', JSON.stringify(mainBody())); }
function saveLocalPx() {
  const px = {}; for (const s in S.prices) px[s] = encodeSym(S.prices[s]);
  if (!LS.set('pb_px', JSON.stringify(px))) LS.del('pb_px');
}
function loadLocal() {
  try { const m = JSON.parse(LS.get('pb_main') || 'null'); if (m) applyMain(m); } catch (e) { }
  try { const px = JSON.parse(LS.get('pb_px') || 'null'); if (px) for (const s in px) { const p = decodeSym(px[s]); if (p.d.length) S.prices[s] = p; } } catch (e) { }
}
function bucketBody(k) {
  let days = MAXD;
  for (;;) {
    const rows = {}; for (const s in S.prices) if (bucketOf(s) === k) rows[s] = encodeSym(S.prices[s], days);
    const body = { rows };
    if (JSON.stringify(body).length < 240000 || days <= 40) return body;
    days -= 20;
  }
}
function markMain() { dirtyMain = true; if (loadingRemote) changedDuringLoad.main = true; saveLocalMain(); scheduleFlush(); }
function markSyms(syms) { for (const s of syms) { dirtyB.add(bucketOf(s)); if (loadingRemote) changedDuringLoad.syms.add(s); } saveLocalPx(); scheduleFlush(); }
function scheduleFlush() { if (!DB) return; clearTimeout(flushTimer); flushTimer = setTimeout(flush, 600); }
async function writeDoc(path, body) {
  for (let a = 0; ; a++) {
    try { await DB.doc(path).set(body); return; }
    catch (e) { const c = e && e.code; if ((c === 'resource_exhausted' || c === 'unavailable') && a < 3) { await sleep(700 * (a + 1) + Math.random() * 400); continue; } throw e; }
  }
}
async function flush() {
  if (!DB || flushing || loadingRemote) return; if (!dirtyMain && !dirtyB.size) return;
  flushing = true; setSave('saving');
  try {
    if (dirtyMain) { dirtyMain = false; await writeDoc(BASE, mainBody()); }
    while (dirtyB.size) { const k = dirtyB.values().next().value; dirtyB.delete(k); await writeDoc(BASE + '/px/b' + k, bucketBody(k)); usedBuckets.add(k); }
    setSave('saved');
  } catch (e) {
    const c = e && e.code;
    if (c === 'quota_exceeded') setSave('full');
    else { DB = null; setSave('local'); }
  }
  flushing = false;
  if (DB && (dirtyMain || dirtyB.size)) scheduleFlush();
}
function setSave(st) {
  const t = { loading: 'Memuatkan data akaun…', saving: 'Menyimpan…', saved: 'Tersimpan dalam akaun anda', local: 'Disimpan dalam pelayar ini sahaja', slow: 'Storan akaun belum dapat dicapai, data mungkin tidak terkini', full: 'Storan akaun penuh. Padam sebahagian data untuk terus menyimpan.' }[st] || '';
  $('#saveStatus').textContent = t;
}
let FEED = null;
function fmtStamp(iso) {
  const k = String(iso || '').match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!k) return '–';
  const hr = +k[2], t = (hr % 12 || 12) + ':' + k[3] + (LANG === 'en' ? (hr < 12 ? ' am' : ' pm') : hr < 12 ? ' pagi' : hr < 19 ? ' petang' : ' malam');
  return fmtDate(k[1]) + ', ' + t;
}
function mergeFeed(f) {
  for (const s in (f.prices || {})) {
    const np = decodeSym(f.prices[s]); if (!np.d.length) continue;
    const m = {}; const p = S.prices[s];
    if (p) for (let i = 0; i < p.d.length; i++) m[p.d[i]] = [p.o[i], p.h[i], p.l[i], p.c[i], p.v[i]];
    for (let i = 0; i < np.d.length; i++) m[np.d[i]] = [np.o[i], np.h[i], np.l[i], np.c[i], np.v[i]];
    const dates = Object.keys(m).sort().slice(-MAXD);
    S.prices[s] = { d: dates, o: dates.map(d => m[d][0]), h: dates.map(d => m[d][1]), l: dates.map(d => m[d][2]), c: dates.map(d => m[d][3]), v: dates.map(d => m[d][4]) };
  }
  for (const s in (f.shares || {})) if (f.shares[s] > 0) S.shares[s] = f.shares[s];
}
function feedText() {
  const n = Object.keys(FEED.prices || {}).length;
  return tx('Harga ' + n + ' kaunter ditarik dari Yahoo Finance setiap petang hari bekerja selepas pasaran tutup. Kemas kini terakhir: ',
    'Prices for ' + n + ' counters are pulled from Yahoo Finance every weekday evening after the market closes. Last updated: ') +
    '<strong>' + esc(fmtStamp(FEED.updated)) + '</strong>. ' +
    tx('Yahoo Finance bukan sumber rasmi Bursa, jadi semak sekali-sekala dengan platform broker.', 'Yahoo Finance is not an official Bursa source, so check against your broker platform from time to time.');
}
function missNote() {
  const n = missingRows().length; if (!n) return '';
  return '<button class="linkbtn" data-act="gotomiss">' + n + tx(' kaunter tiada dalam saringan atau datanya tidak lengkap', ' counters are not in the screener or have incomplete data') + '</button>. ';
}
function noticeHTML() {
  if (!FEED) return '';
  return '<aside class="notice" aria-labelledby="nt-h"><svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 5.5v5.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="10" cy="14.3" r="1.2" fill="currentColor"/></svg>' +
    '<div><h2 id="nt-h">' + tx('Data automatik', 'Automatic data') + '</h2><p>' + feedText() + ' ' + missNote() + tx('Alat analisis teknikal sahaja, bukan nasihat pelaburan.', 'A technical analysis tool only, not investment advice.') + '</p></div></aside>';
}
function setTheme(v) {
  v = v === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', v);
  LS.set('pb_theme', v);
  document.querySelectorAll('[data-act="theme"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.val === v)));
}
function renderStatus() {
  $('#saveStatus').textContent = FEED ? tx('Dikemas kini ', 'Updated ') + fmtStamp(FEED.updated) : tx('Data automatik tidak dapat dimuatkan', 'Automatic data could not be loaded');
}
function setLang(v) {
  LANG = v === 'en' ? 'en' : 'ms';
  LS.set('pb_lang', LANG);
  document.documentElement.lang = LANG;
  applyTables();
  document.querySelectorAll('[data-en]').forEach(el => {
    if (el.dataset.ms == null) el.dataset.ms = el.innerHTML;
    el.innerHTML = LANG === 'en' ? el.dataset.en : el.dataset.ms;
  });
  document.querySelectorAll('[data-en-aria]').forEach(el => {
    if (el.dataset.msAria == null) el.dataset.msAria = el.getAttribute('aria-label') || '';
    el.setAttribute('aria-label', LANG === 'en' ? el.dataset.enAria : el.dataset.msAria);
  });
  document.querySelectorAll('[data-act="lang"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.val === LANG)));
}
function renderFeedInfo() {
  const el = $('#feedInfo'); if (!el) return;
  if (!FEED) { el.innerHTML = '<p class="lead">' + tx('Data automatik tidak dapat dimuatkan. Semak sambungan internet dan muat semula halaman.', 'Automatic data could not be loaded. Check your internet connection and reload the page.') + '</p>'; return; }
  el.innerHTML = '<p class="lead">' + feedText() + '</p>';
}
async function loadFeed() {
  $('#saveStatus').textContent = tx('Memuatkan data terkini…', 'Loading latest data…');
  try {
    FEED = await OPTS.loadFeed();
    mergeFeed(FEED);
    NAMES = FEED.names || {};
  } catch (e) {
    FEED = null;
  }
  renderStatus();
  recompute(); renderAll(); renderFeedInfo();
}

/* ---------- screening ---------- */
function recompute() {
  const syms = Object.keys(S.prices); let latest = '';
  for (const s of syms) { const p = S.prices[s]; const d = p.d[p.d.length - 1]; if (d > latest) latest = d; }
  const rows = []; let stale = 0;
  for (const s of syms) {
    const p = S.prices[s]; const n = p.c.length; if (!n) continue;
    const ser = series(p); const cur = p.d[n - 1] === latest;
    const e = evalAt(s, p, ser, n - 1, S.filters, S.shares);
    rows.push({ s, p, ser, e, cur }); if (!cur) stale++;
  }
  RES = { latest, rows, stale, byS: Object.fromEntries(rows.map(r => [r.s, r])) };
}
const f1v = r => { const c = r.e.checks[0]; return c.val == null ? -1 : c.val; };
function groups() {
  const cur = RES.rows.filter(r => r.cur);
  const lulus = cur.filter(r => r.e.all).sort((a, b) => f1v(b) - f1v(a));
  const hampir = cur.filter(r => !r.e.all && r.e.onCount - r.e.pass === 1).sort((a, b) => f1v(b) - f1v(a));
  const semua = RES.rows.slice().sort((a, b) => (b.cur - a.cur) || (b.e.pass - a.e.pass) || a.s.localeCompare(b.s));
  return { lulus, hampir, semua };
}
function unit(k) { if (k === 'f1' || k === 'f2') return '%'; if (k === 'f3') { const m = S.filters.f3.mode; return m === 'ratio' ? '×' : m === 'juta' ? tx(' juta', ' million') : '%'; } return ''; }
function ruleText(k) {
  const f = S.filters[k];
  if (k === 'f5') return f.fresh ? tx('Tutup atas jalur atas, hari pertama', 'Closes above upper band, first day') : tx('Tutup atas jalur atas', 'Closes above upper band');
  const u = unit(k); return f.max == null ? '≥ ' + fmtTh(f.min) + u : fmtTh(f.min) + u + tx(' hingga ', ' to ') + fmtTh(f.max) + u;
}
function valText(ch) {
  if (ch.val == null) return ch.why || '–';
  switch (ch.k) {
    case 'f1': return ch.val.toFixed(2) + '%';
    case 'f2': return fmtPct(ch.val);
    case 'f3': return ch.mode === 'ratio' ? ch.val.toFixed(2) + '×' : ch.mode === 'juta' ? ch.val.toFixed(2) + tx(' juta', ' million') : ch.val.toFixed(2) + '%';
    case 'f4': return ch.val.toFixed(2);
    case 'f5': {
      if (ch.st === 'na') return ch.why;
      if (ch.val > 0 && S.filters.f5.fresh && ch.wasAbove) return tx('Sudah di atas jalur sejak sesi sebelum', 'Already above the band since the previous session');
      return ch.val > 0 ? fmtPct(ch.val) + tx(' atas jalur', ' above band') : fmtPct(ch.val) + tx(' bawah jalur', ' below band');
    }
  }
}
function markText(ch) { if (!ch.on) return ['off', tx('Dimatikan', 'Off')]; if (ch.st === 'pass') return ['pass', tx('Lulus', 'Pass')]; if (ch.st === 'fail') return ['fail', tx('Gagal', 'Fail')]; return ['na', tx('Tiada data', 'No data')]; }
function lamps(e) {
  return '<span class="lamps' + (e.all ? ' full' : '') + '" role="img" aria-label="' + e.pass + tx(' daripada ', ' of ') + e.onCount + tx(' penapis lulus', ' filters pass') + '">' +
    e.checks.map(ch => '<span class="lamp ' + (ch.on ? ch.st : 'off') + '"><i></i><b>' + FS[ch.k] + '</b></span>').join('') + '</span>';
}
function dayChg(p) { const n = p.c.length; return n > 1 ? (p.c[n - 1] / p.c[n - 2] - 1) * 100 : null; }
function pxLine(r) {
  const n = r.p.c.length, ch = dayChg(r.p);
  return '<span class="px num">RM ' + fmtPx(r.p.c[n - 1]) + (ch == null ? '' : ' <em class="' + (ch >= 0 ? 'up' : 'dn') + '">' + fmtPct(ch) + '</em>') + (r.cur ? '' : tx(' · data ', ' · data from ') + fmtDate(r.p.d[n - 1])) + '</span>';
}
/* ---------- carta ---------- */
let NAMES = {};
const CH = {};
function cname(s) { return NAMES[s] ? '<span class="cname">' + esc(NAMES[s]) + '</span>' : ''; }
function niceTicks(mn, mx, count) {
  const raw = (mx - mn) / count, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) || raw;
  const out = []; for (let v = Math.ceil(mn / step) * step; v <= mx + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}
function spark(r) {
  const c = r.p.c.slice(-30); if (c.length < 2) return '';
  const W = 84, H = 28, P = 3, mn = Math.min(...c), mx = Math.max(...c), sp = (mx - mn) || 1;
  const x = i => P + i * (W - 2 * P) / (c.length - 1), y = v => H - P - (v - mn) / sp * (H - 2 * P);
  const ch = (c[c.length - 1] / c[0] - 1) * 100, last = c.length - 1;
  return '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + tx('Harga ' + c.length + ' hari: ', c.length + '-day price: ') + fmtPct(ch) + '">' +
    '<polyline class="spark-l" points="' + c.map((v, i) => x(i).toFixed(1) + ',' + y(v).toFixed(1)).join(' ') + '"/>' +
    '<circle r="2.5" class="' + (ch >= 0 ? 'spark-up' : 'spark-dn') + '" cx="' + x(last).toFixed(1) + '" cy="' + y(c[last]).toFixed(1) + '"/></svg>';
}
function chartHTML(r) {
  const n = r.p.c.length, st = Math.max(0, n - 60), K = n - st; if (K < 2) return '';
  const g = { d: [], c: [], up: [], mid: [], lo: [], v: [], rsi: [] };
  for (let i = st; i < n; i++) {
    g.d.push(r.p.d[i]); g.c.push(r.p.c[i]); g.v.push(r.p.v[i]); g.rsi.push(r.ser.rsi[i]);
    const u = r.ser.up[i], m = r.ser.mid[i]; g.up.push(u); g.mid.push(m); g.lo.push(u == null ? null : 2 * m - u);
  }
  const all = g.c.concat(g.up, g.lo).filter(v => v != null);
  let mn = Math.min(...all), mx = Math.max(...all); const pd = (mx - mn) * 0.08 || mx * 0.01; mn -= pd; mx += pd;
  const W = 640, L = 4, R = 66, T = 8, PH = 170, GAP = 16, VH = 50, H = T + PH + GAP + VH + 30;
  const xw = (W - L - R) / K, x = k => L + xw * (k + 0.5), y = v => T + (mx - v) / (mx - mn) * PH;
  const vb = T + PH + GAP + VH, vmax = Math.max(...g.v) || 1;
  const path = (arr, yy) => { let s = '', pen = false; arr.forEach((v, k) => { if (v == null) { pen = false; return; } s += (pen ? 'L' : 'M') + x(k).toFixed(1) + ' ' + yy(v).toFixed(1); pen = true; }); return s; };
  const bandK = g.up.map((u, k) => u == null ? -1 : k).filter(k => k >= 0);
  const band = bandK.length > 1 ? 'M' + bandK.map(k => x(k).toFixed(1) + ' ' + y(g.up[k]).toFixed(1)).join('L') + 'L' + bandK.slice().reverse().map(k => x(k).toFixed(1) + ' ' + y(g.lo[k]).toFixed(1)).join('L') + 'Z' : '';
  const ticks = niceTicks(mn, mx, 4);
  const bw = Math.max(1, xw - 2);
  let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + tx('Carta harga ' + esc(r.s) + ' ' + K + ' hari dagangan terakhir', esc(r.s) + ' price chart, last ' + K + ' trading days') + '">';
  s += ticks.map(t => '<line class="gl" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(t).toFixed(1) + '" y2="' + y(t).toFixed(1) + '"/><text class="ax" x="' + (W - R + 6) + '" y="' + (y(t) + 4).toFixed(1) + '">' + fmtPx(t) + '</text>').join('');
  if (band) s += '<path class="band" d="' + band + '"/><path class="bl" d="' + path(g.up, y) + '"/><path class="bl" d="' + path(g.lo, y) + '"/><path class="mid" d="' + path(g.mid, y) + '"/>';
  s += '<path class="cl" d="' + path(g.c, y) + '"/>';
  s += '<circle class="dot" r="4" cx="' + x(K - 1).toFixed(1) + '" cy="' + y(g.c[K - 1]).toFixed(1) + '"/>';
  s += '<line class="gl" x1="' + L + '" x2="' + (W - R) + '" y1="' + vb + '" y2="' + vb + '"/>';
  s += g.v.map((v, k) => { const h = Math.max(v > 0 ? 1 : 0, v / vmax * VH); return '<rect class="vb' + (k === K - 1 ? ' last' : '') + '" x="' + (x(k) - bw / 2).toFixed(1) + '" y="' + (vb - h).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="' + Math.min(2, bw / 2).toFixed(1) + '"/>'; }).join('');
  s += '<text class="ax" x="' + (W - R + 6) + '" y="' + (vb - VH + 9) + '">' + fmtBig(vmax).replace(/ (bilion|billion)$/, 'b').replace(/ (juta|million)$/, tx('j', 'm')) + '</text><text class="ax" x="' + (W - R + 6) + '" y="' + (vb + 1) + '">' + tx('Volum', 'Volume') + '</text>';
  const xl = [0, Math.floor((K - 1) / 2), K - 1];
  s += xl.map((k, j) => '<text class="ax" text-anchor="' + (j === 0 ? 'start' : j === 2 ? 'end' : 'middle') + '" x="' + (j === 0 ? L : j === 2 ? W - R : x(k)).toFixed(1) + '" y="' + (H - 4) + '">' + fmtDate(g.d[k]) + '</text>').join('');
  s += '<g class="xhg" visibility="hidden"><line class="xh" y1="' + T + '" y2="' + vb + '"/><circle class="dot" r="4"/></g>';
  s += '<rect class="hit" x="' + L + '" y="0" width="' + (W - L - R) + '" height="' + vb + '"/></svg>';
  CH[r.s] = { g, W, L, R, xw, x, y, K };
  return '<div class="ckey"><span><i class="k-cl"></i>' + tx('Harga tutup', 'Close') + '</span>' + (band ? '<span><i class="k-band"></i>' + tx('Jalur Bollinger (20, 2)', 'Bollinger band (20, 2)') + '</span><span><i class="k-mid"></i>SMA20</span>' : '') + '<span><i class="k-vol"></i>' + tx('Volum', 'Volume') + '</span></div>' +
    '<div class="chart" data-sym="' + esc(r.s) + '">' + s + '<div class="tip" hidden></div></div>';
}
function chartMove(e) {
  const box = e.target.closest('.chart'); if (!box) return;
  const C = CH[box.dataset.sym]; if (!C) return;
  const svg = box.querySelector('svg'), rc = svg.getBoundingClientRect(), sc = C.W / rc.width;
  const k = Math.max(0, Math.min(C.K - 1, Math.floor(((e.clientX - rc.left) * sc - C.L) / C.xw)));
  const g = C.g, X = C.x(k), Y = C.y(g.c[k]);
  const grp = svg.querySelector('.xhg'); grp.setAttribute('visibility', 'visible');
  const ln = grp.querySelector('line'); ln.setAttribute('x1', X); ln.setAttribute('x2', X);
  const dt = grp.querySelector('circle'); dt.setAttribute('cx', X); dt.setAttribute('cy', Y);
  const prev = k > 0 ? g.c[k - 1] : null;
  const tip = box.querySelector('.tip');
  tip.innerHTML = '<b>' + fmtDate(g.d[k]) + '</b><br>' + tx('Tutup', 'Close') + ' RM ' + fmtPx(g.c[k]) + (prev ? ' (' + fmtPct((g.c[k] / prev - 1) * 100) + ')' : '') +
    '<br>' + tx('Volum ', 'Volume ') + fmtBig(g.v[k]) + (g.rsi[k] != null ? '<br>RSI ' + g.rsi[k].toFixed(1) : '') + (g.up[k] != null ? '<br>' + tx('Jalur atas', 'Upper band') + ' RM ' + fmtPx(g.up[k]) : '');
  tip.hidden = false;
  const px = X / sc, tw = tip.offsetWidth;
  tip.style.left = Math.max(0, Math.min(rc.width - tw, px + (px > rc.width / 2 ? -tw - 12 : 12))) + 'px';
}
function chartLeave(e) {
  const box = e.target.closest('.chart'); if (!box) return;
  box.querySelector('.xhg').setAttribute('visibility', 'hidden'); box.querySelector('.tip').hidden = true;
}
function funnelHTML() {
  const cur = RES.rows.filter(r => r.cur), N = cur.length; if (!N) return '';
  const keys = ['f1', 'f2', 'f3', 'f4', 'f5'].filter(k => S.filters[k].on);
  const row = (lb, list, cls) => { const n = list.length, w = n / N * 100;
    return '<div class="lb' + (cls ? ' ' + cls : '') + '" title="' + esc(list.map(r => r.s + (NAMES[r.s] ? ' ' + NAMES[r.s] : '')).join(', ') || tx('Tiada', 'None')) + '">' + lb + '</div>' +
      '<div class="bar' + (cls ? ' ' + cls : '') + '" role="img" aria-label="' + n + tx(' daripada ', ' of ') + N + '"><i style="width:' + w.toFixed(1) + '%"></i></div>' +
      '<div class="v num' + (cls ? ' ' + cls : '') + '">' + n + '/' + N + '</div>'; };
  return '<div class="vcard"><h3>' + tx('Siapa lulus setiap penapis', 'Who passes each filter') + '</h3><p class="sub">' + tx('Bilangan kaunter yang lulus setiap syarat pada ', 'Number of counters passing each condition on ') + fmtDate(RES.latest) + '.</p><div class="fun">' +
    keys.map(k => { const idx = ['f1', 'f2', 'f3', 'f4', 'f5'].indexOf(k); return row(FS[k] + ' <small>' + esc(ruleText(k)) + '</small>', cur.filter(r => r.e.checks[idx].st === 'pass')); }).join('') +
    row(tx('Lulus semua', 'Pass all'), cur.filter(r => r.e.all), 'all') + '</div></div>';
}
function moversHTML() {
  let rows = RES.rows.filter(r => r.cur).map(r => ({ r, ch: dayChg(r.p) })).filter(o => o.ch != null).sort((a, b) => b.ch - a.ch);
  if (!rows.length) return '';
  const total = rows.length; if (rows.length > 12) rows = rows.slice(0, 6).concat(rows.slice(-6));
  const mx = Math.max(...rows.map(o => Math.abs(o.ch))) || 1;
  const up = RES.rows.filter(r => r.cur && dayChg(r.p) > 0).length, dn = RES.rows.filter(r => r.cur && dayChg(r.p) < 0).length;
  return '<div class="vcard"><h3>' + tx('Pergerakan harga ', 'Price moves, ') + fmtDate(RES.latest) + '</h3><p class="sub num">' + up + tx(' naik, ', ' up, ') + dn + tx(' turun, ', ' down, ') + (total - up - dn) + tx(' tidak berubah', ' unchanged') + (total > 12 ? tx('. Menunjukkan 6 teratas dan 6 terbawah.', '. Showing the top 6 and bottom 6.') : '.') + '</p>' +
    '<div class="mvhead"><span>' + tx('← Turun', '← Down') + '</span><span>' + tx('Naik →', 'Up →') + '</span></div><div class="mv">' +
    rows.map(({ r, ch }) => { const w = Math.abs(ch) / mx * 50;
      return '<div class="lb" title="' + esc(NAMES[r.s] || r.s) + '"><b>' + esc(r.s) + '</b>' + (NAMES[r.s] ? ' <small style="color:var(--muted)">' + esc(NAMES[r.s]) + '</small>' : '') + '</div>' +
        '<div class="mvbar" role="img" aria-label="' + esc(r.s) + ' ' + fmtPct(ch) + '"><i class="' + (ch >= 0 ? 'pos' : 'neg') + '" style="width:' + w.toFixed(1) + '%"></i></div>' +
        '<div class="v num">' + fmtPct(ch) + '</div>'; }).join('') + '</div></div>';
}
function detailHTML(r) {
  const f5 = r.e.checks[4];
  return '<div class="detail">' + chartHTML(r) + r.e.checks.map(ch => { const [c, t] = markText(ch); return '<div class="chk"><span class="nm">' + FN[ch.k] + '<span class="rule">' + esc(ruleText(ch.k)) + '</span></span><span class="val num">' + esc(valText(ch)) + '</span><span class="mk ' + c + '">' + t + '</span></div>'; }).join('') +
    (f5.up != null ? '<p class="levels num">' + tx('Jalur atas', 'Upper band') + ' RM ' + fmtPx(f5.up) + tx(', jalur tengah (SMA20) RM ', ', middle band (SMA20) RM ') + fmtPx(f5.mid) + tx('. Volum hari ini ', ". Today's volume ") + fmtBig(r.p.v[r.p.v.length - 1]) + tx(' unit.', ' units.') + (S.shares[r.s] ? tx(' Saham beredar ', ' Shares outstanding ') + fmtBig(S.shares[r.s]) + '.' : tx(' Tambah jumlah saham beredar di tab Data.', ' Add shares outstanding in the Data tab.')) + '</p>' : '') + '</div>';
}
function rowHTML(r) {
  const w = !!S.watch[r.s];
  return '<details class="row"><summary><div class="symline"><div><span class="sym">' + esc(r.s) + cname(r.s) + '</span>' + pxLine(r) + '</div>' + spark(r) + '</div>' + lamps(r.e) +
    '<button class="btn' + (w ? ' on' : '') + '" data-act="watch" data-sym="' + esc(r.s) + '" aria-pressed="' + w + '">' + (w ? tx('Dipantau', 'Watching') : tx('Pantau', 'Watch')) + '</button></summary>' + detailHTML(r) + '</details>';
}
function renderSaringan() {
  const el = $('#saringan');
  if (!RES || !RES.rows.length) {
    el.innerHTML = '<div class="empty"><strong>' + tx('Belum ada data harga', 'No price data yet') + '</strong>' + tx('Masukkan data harian di tab Data, atau cuba data contoh untuk lihat cara app ini berfungsi.', 'Add daily data in the Data tab, or try the sample data to see how the app works.') + '<div class="actions"><button class="btn primary" data-act="goto" data-tab="data">' + tx('Masukkan data', 'Add data') + '</button><button class="btn" data-act="demo">' + tx('Cuba data contoh', 'Try sample data') + '</button></div></div>';
    return;
  }
  const g = groups(); const onN = Object.values(S.filters).filter(f => f.on).length;
  const allWord = onN === 5 ? tx('kelima-lima penapis', 'all five filters') : tx('semua ' + onN + ' penapis aktif', 'all ' + onN + ' active filters');
  const cur = RES.rows.length - RES.stale;
  const V = VIEW || 'semua';
  let list = V === 'lulus' ? g.lulus : V === 'hampir' ? g.hampir : g.semua;
  const q = QUERY.trim().toUpperCase(); if (q) list = list.filter(r => r.s.includes(q) || (NAMES[r.s] || '').toUpperCase().includes(q));
  const shown = list.slice(0, LIMIT);
  const emptyMsg = q ? tx('Tiada saham sepadan dengan “', 'No stock matches “') + esc(QUERY.trim()) + '”. ' + tx('Semak senarai kaunter tiada dalam saringan di tab Data.', 'Check the list of counters not in the screener in the Data tab.') : V === 'lulus' ? tx('Tiada saham lulus ' + allWord + ' untuk ', 'No stocks pass ' + allWord + ' on ') + fmtDate(RES.latest) + tx('. Semak senarai hampir lulus.', '. Check the near-pass list.') : V === 'hampir' ? tx('Tiada saham yang kurang satu penapis sahaja.', 'No stocks are just one filter short.') : tx('Tiada data.', 'No data.');
  el.innerHTML =
    '<div class="hero"><h2 class="num">' + (g.lulus.length ? g.lulus.length + tx(' saham lulus ', (g.lulus.length === 1 ? ' stock passes ' : ' stocks pass ')) + allWord : tx('Tiada saham lulus ', 'No stocks pass ') + allWord) + '</h2>' +
    '<p>' + tx('Data ', 'Data for ') + fmtDate(RES.latest) + '. ' + cur + tx(' kaunter disaring', ' counters screened') + (RES.stale ? ', ' + RES.stale + tx(' tiada data untuk tarikh ini', ' have no data for this date') : '') + '.</p></div>' + noticeHTML() +
    (q ? '' : '<h2 class="vh">' + tx('Ringkasan pasaran', 'Market summary') + '</h2><div class="viz">' + funnelHTML() + moversHTML() + '</div>') +
    '<div class="seg" role="group" aria-label="' + tx('Senarai', 'List') + '">' +
    [['semua', tx('Semua', 'All'), g.semua.length], ['lulus', tx('Lulus semua', 'Pass all'), g.lulus.length], ['hampir', tx('Hampir lulus', 'Near pass'), g.hampir.length]].map(([k, t, n]) => '<button data-act="view" data-view="' + k + '" aria-pressed="' + (V === k) + '">' + t + ' <span class="num">' + n + '</span></button>').join('') + '</div>' +
    '<input class="search" id="q" type="search" placeholder="' + tx('Cari simbol atau nama', 'Search symbol or name') + '" aria-label="' + tx('Cari simbol atau nama', 'Search symbol or name') + '" value="' + esc(QUERY) + '">' +
    '<p class="legend">' + tx('Vol = volum harian, 5H = harga 5 hari, V10 = purata volum 10 hari, RSI = RSI 14 hari, BB = Bollinger breakout. Tekan baris untuk lihat carta dan nilai.', 'Vol = daily volume, 5D = 5-day price, V10 = 10-day average volume, RSI = 14-day RSI, BB = Bollinger breakout. Tap a row to see the chart and values.') + '</p>' +
    (shown.length ? '<div class="list">' + shown.map(rowHTML).join('') + '</div>' : '<div class="empty">' + emptyMsg + '</div>') +
    (list.length > LIMIT ? '<button class="btn more" data-act="more">' + tx('Tunjuk lagi (', 'Show more (') + (list.length - LIMIT) + tx(' baki)', ' left)') + '</button>' : '') +
    '<p class="note">' + tx('Alat analisis teknikal sahaja, bukan nasihat pelaburan. Lulus semua penapis tidak menjamin harga akan naik.', 'A technical analysis tool only, not investment advice. Passing all filters does not guarantee the price will rise.') + '</p>';
}
function history(r, days) {
  const n = r.p.c.length, out = [];
  for (let i = Math.max(0, n - days); i < n; i++) {
    const e = evalAt(r.s, r.p, r.ser, i, S.filters, S.shares);
    out.push({ d: r.p.d[i], st: e.all ? 'ok' : (e.onCount - e.pass === 1 ? 'near' : 'off') });
  }
  return out;
}
function renderPantauan() {
  const el = $('#pantauan'); const syms = Object.keys(S.watch);
  let ready = 0;
  if (!syms.length) {
    el.innerHTML = '<div class="empty"><strong>' + tx('Belum ada saham dipantau', 'No stocks on your watchlist yet') + '</strong>' + tx('Tekan “Pantau” pada mana-mana saham di tab Saringan. Setiap hari selepas data baharu dimasukkan, status saham di sini dikemas kini.', 'Tap “Watch” on any stock in the Screener tab. Each day after new data arrives, the status here is updated.') + '</div>';
    $('#wbadge').textContent = ''; return;
  }
  const items = syms.map(s => {
    const r = RES && RES.byS[s];
    const go = !!(r && r.cur && r.e.all); if (go) ready++;
    return { s, r, go, rank: go ? 0 : r && r.cur ? 1 + (r.e.onCount - r.e.pass) : 99 };
  }).sort((a, b) => a.rank - b.rank || a.s.localeCompare(b.s));
  const cards = items.map(({ s, r, go }) => {
    const w = S.watch[s];
    if (!r) return '<div class="card"><div class="card-h"><span class="sym">' + esc(s) + '</span><span class="chip stale">' + tx('Tiada data', 'No data') + '</span></div><p class="meta">' + tx('Masukkan data harga untuk simbol ini.', 'Add price data for this symbol.') + '</p><div class="card-f"><button class="btn" data-act="unwatch" data-sym="' + esc(s) + '">' + tx('Buang', 'Remove') + '</button></div></div>';
    const n = r.p.c.length, last = r.p.c[n - 1];
    const since = w.price ? (last / w.price - 1) * 100 : null;
    const missing = r.e.checks.filter(ch => ch.on && ch.st !== 'pass');
    const chip = !r.cur ? '<span class="chip stale">' + tx('Tiada data ', 'No data for ') + fmtDate(RES.latest) + '</span>' : go ? '<span class="chip go">' + tx('MASUK', 'ENTRY') + '</span>' : '<span class="chip wait">' + tx('Tunggu: kurang ' + missing.length + ' penapis', 'Wait: ' + missing.length + (missing.length === 1 ? ' filter' : ' filters') + ' short') + '</span>';
    const hist = history(r, 10); let streak = 0; for (let i = hist.length - 1; i >= 0 && hist[i].st === 'ok'; i--) streak++;
    const prevOk = hist.slice(0, -1).reverse().find(h => h.st === 'ok');
    return '<div class="card' + (go ? ' go' : '') + '"><div class="card-h"><span class="sym">' + esc(s) + '</span>' + chip + '</div>' +
      '<p class="meta num">RM ' + fmtPx(last) + (since == null ? '' : ', ' + fmtPct(since) + tx(' sejak dipantau pada ', ' since watched on ') + fmtDate(w.added)) + '</p>' + lamps(r.e) +
      (missing.length && r.cur ? '<p class="miss">' + tx('Belum lulus: ', 'Not passing yet: ') + missing.map(ch => FS[ch.k] + ' (' + esc(valText(ch)) + ')').join(', ') + '</p>' : '') +
      (go ? '<p class="miss">' + (streak > 1 ? tx('Lulus semua penapis ' + streak + ' sesi berturut-turut.', 'Passed all filters ' + streak + ' sessions in a row.') : (prevOk ? tx('Lulus semula hari ini. Kali terakhir lulus: ', 'Passing again today. Last passed: ') + fmtDate(prevOk.d) + '.' : tx('Kali pertama lulus semua penapis dalam ' + hist.length + ' sesi terakhir.', 'First time passing all filters in the last ' + hist.length + ' sessions.'))) + tx(' Jalur tengah BB: RM ', ' BB middle band: RM ') + fmtPx(r.e.checks[4].mid) + '.</p>' : '') +
      '<div class="hist"><span>' + hist.length + tx(' sesi lepas', ' past sessions') + '</span><span class="dots" role="img" aria-label="' + tx('Status ' + hist.length + ' sesi lepas', 'Status of the past ' + hist.length + ' sessions') + '">' + hist.map(h => '<span class="' + h.st + '" title="' + fmtDate(h.d) + '"></span>').join('') + '</span><span>' + fmtDate(hist[0].d) + tx(' hingga ', ' to ') + fmtDate(hist[hist.length - 1].d) + '</span></div>' +
      '<div class="card-f"><button class="btn" data-act="unwatch" data-sym="' + esc(s) + '">' + tx('Buang', 'Remove') + '</button></div></div>';
  }).join('');
  el.innerHTML = '<div class="hero"><h2 class="num">' + (ready ? ready + tx(' daripada ', ' of ') + syms.length + tx(' saham pantauan sedia MASUK', ' watched stocks ready for ENTRY') : tx('Belum ada saham pantauan yang lulus semua penapis', 'No watched stock passes all filters yet')) + '</h2>' +
    '<p>' + (RES && RES.latest ? tx('Berdasarkan data ', 'Based on data for ') + fmtDate(RES.latest) + '. ' : '') + tx('Kotak hijau = lulus semua, kuning = kurang satu penapis.', 'Green box = passes all, yellow = one filter short.') + '</p></div><div class="list">' + cards + '</div>' +
    '<p class="note">' + tx('MASUK bermaksud semua penapis teknikal lulus pada data terkini. Ia bukan nasihat pelaburan.', 'ENTRY means all technical filters pass on the latest data. It is not investment advice.') + '</p>';
  $('#wbadge').textContent = ready ? String(ready) : '';
}
let MQ = '';
const MREASON = {
  tiada_data: () => [tx('Tiada data Yahoo', 'No Yahoo data'), 'warn', tx('Ada dalam senarai, tetapi Yahoo Finance tiada harga untuk kaunter ini (mungkin digantung atau baru bertukar kod).', 'In the list, but Yahoo Finance has no prices for it (possibly suspended or recently changed code).')],
  tiada_saham: () => [tx('Tiada jumlah saham', 'No shares outstanding'), 'warn', tx('Ditapis, tetapi tiada jumlah saham beredar, jadi tidak boleh lulus penapis Vol.', 'Screened, but has no shares outstanding, so it cannot pass the Vol filter.')],
  etf: () => [tx('ETF', 'ETF'), '', tx('Dana dagangan bursa, bukan saham syarikat.', 'Exchange-traded funds, not company shares.')],
  keutamaan: () => [tx('Saham keutamaan', 'Preference share'), '', tx('Saham keutamaan, bukan saham biasa.', 'Preference shares, not ordinary shares.')],
  lain: () => [tx('Lain-lain', 'Other'), '', '']
};
function missingRows() {
  const rows = ((FEED && FEED.missing) || []).slice();
  for (const s of Object.keys(S.prices).sort()) if (!(S.shares[s] > 0)) rows.push({ s, n: NAMES[s] || '', r: 'tiada_saham' });
  return rows;
}
function renderMissing() {
  const el = $('#missingInfo'); if (!el) return;
  const rows = missingRows();
  if (!rows.length) { el.innerHTML = '<p class="lead">' + tx('Semua kaunter ada dalam saringan.', 'Every counter is in the screener.') + '</p>'; return; }
  const cnt = {}; rows.forEach(r => { const k = MREASON[r.r] ? r.r : 'lain'; cnt[k] = (cnt[k] || 0) + 1; });
  el.innerHTML = '<p class="lead">' + tx('Kaunter Bursa di bawah tidak ditapis, atau ditapis tetapi datanya tidak lengkap. Senarai ini dikemas kini bersama data automatik.', 'The Bursa counters below are not screened, or are screened with incomplete data. This list updates with the automatic data.') + '</p>' +
    '<ul class="mcount" style="list-style:none;padding:0">' + Object.keys(MREASON).filter(k => cnt[k]).map(k => '<li title="' + esc(MREASON[k]()[2]) + '"><b class="num">' + cnt[k] + '</b> ' + esc(MREASON[k]()[0]) + '</li>').join('') + '</ul>' +
    '<input class="search" id="mq" type="search" placeholder="' + tx('Cari kod atau nama kaunter', 'Search code or counter name') + '" aria-label="' + tx('Cari kaunter tiada dalam saringan', 'Search counters not in the screener') + '" value="' + esc(MQ) + '">' +
    '<div id="missingList"></div>';
  renderMissingList();
}
function renderMissingList() {
  const el = $('#missingList'); if (!el) return;
  const q = MQ.trim().toUpperCase();
  const rows = missingRows().filter(r => !q || r.s.toUpperCase().includes(q) || (r.n || '').toUpperCase().includes(q));
  if (!rows.length) { el.innerHTML = '<p class="lead">' + tx('Tiada kaunter sepadan dengan “', 'No counter matches “') + esc(MQ.trim()) + '”. ' + tx('Kalau ia saham biasa Bursa, ia mungkin sudah ada dalam saringan. Cari di tab Saringan.', 'If it is an ordinary Bursa share, it is probably already in the screener. Search in the Screener tab.') + '</p>'; return; }
  el.innerHTML = '<div class="mlist" role="list">' + rows.map(r => { const m = (MREASON[r.r] || MREASON.lain)(); return '<div class="mrow" role="listitem"><span class="sym">' + esc(r.s) + '</span><span class="mn">' + esc(r.n || '–') + '</span><span class="mtag ' + m[1] + '" title="' + esc(m[2]) + '">' + esc(m[0]) + '</span></div>'; }).join('') + '</div>';
}
function renderDataSummary() {
  const el = $('#dataSummary'); const syms = Object.keys(S.prices);
  if (!syms.length) { el.innerHTML = '<p class="lead">' + tx('Belum ada data.', 'No data yet.') + '</p>'; return; }
  const lens = syms.map(s => S.prices[s].d.length).sort((a, b) => a - b); const med = lens[Math.floor(lens.length / 2)];
  const noSh = syms.filter(s => !(S.shares[s] > 0)).sort();
  const short = lens.filter(x => x < 21).length;
  el.innerHTML = '<div class="stats num"><div class="stat"><b>' + syms.length + '</b><span>' + tx('kaunter', 'counters') + '</span></div><div class="stat"><b>' + fmtDate(RES.latest) + '</b><span>' + tx('tarikh terkini', 'latest date') + '</span></div><div class="stat"><b>' + med + '</b><span>' + tx('hari sejarah (median)', 'days of history (median)') + '</span></div><div class="stat"><b>' + noSh.length + '</b><span>' + tx('tanpa jumlah saham', 'without shares outstanding') + '</span></div></div>' +
    (noSh.length ? '<p class="lead" style="margin-top:10px">' + tx('Saham tanpa jumlah saham beredar tidak boleh lulus penapis Vol', 'Stocks without shares outstanding cannot pass the Vol filter') + (S.filters.f3.mode === 'pct' ? tx(' dan V10', ' or V10') : '') + ': ' + noSh.slice(0, 12).map(esc).join(', ') + (noSh.length > 12 ? tx(' dan ', ' and ') + (noSh.length - 12) + tx(' lagi', ' more') : '') + '.</p>' : '') +
    (short ? '<p class="lead">' + short + tx(' kaunter ada kurang daripada 21 hari data. Bollinger perlukan 20 hari, jadi masukkan data sejarah sekurang-kurangnya sebulan untuk keputusan yang tepat.', ' counters have fewer than 21 days of data. Bollinger needs 20 days, so add at least a month of history for accurate results.') + '</p>' : '');
}
function fieldNum(k, key, label, ph) {
  const v = S.filters[k][key];
  return '<label>' + label + '<input type="number" inputmode="decimal" step="any" data-f="' + k + '" data-key="' + key + '" value="' + (v == null ? '' : fmtTh(v)) + '" placeholder="' + (ph || '') + '"></label>';
}
function renderTetapan() {
  const F = S.filters;
  $('#tetapan').innerHTML = '<h2 class="sec">' + tx('Penapis', 'Filters') + '</h2><p class="lead">' + tx('Saham dilabel MASUK bila semua penapis yang aktif lulus serentak. Kosongkan Maksimum untuk tiada had atas.', 'A stock is labelled ENTRY when all active filters pass at the same time. Leave Maximum empty for no upper limit.') + '</p>' +
    ['f1', 'f2', 'f3', 'f4', 'f5'].map(k => {
      let fields = '';
      if (k === 'f5') fields = '<label class="inline"><input type="checkbox" data-f="f5" data-key="fresh"' + (F.f5.fresh ? ' checked' : '') + '> ' + tx('Pecah baharu sahaja (hari pertama tutup atas jalur)', 'New breakouts only (first day closing above the band)') + '</label>';
      else {
        fields = fieldNum(k, 'min', 'Minimum' + (unit(k).trim() ? ' (' + unit(k).trim() + ')' : '')) + fieldNum(k, 'max', tx('Maksimum', 'Maximum'), tx('Tiada had', 'No limit'));
        if (k === 'f3') fields = '<label class="wide">' + tx('Cara kira', 'Method') + '<select data-f="f3" data-key="mode">' + Object.entries(F3MODES).map(([m, t]) => '<option value="' + m + '"' + (F.f3.mode === m ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></label>' + fields;
      }
      return '<div class="fcard' + (F[k].on ? '' : ' dis') + '"><label class="fhead"><input type="checkbox" data-f="' + k + '" data-key="on"' + (F[k].on ? ' checked' : '') + '>' + FN[k] + '</label><p class="fdesc">' + FD[k] + (k === 'f3' ? tx(' Pastikan cara kira sama dengan sumber penapis anda.', ' Make sure the method matches your screener source.') : '') + (k === 'f4' ? tx(' Bacaan atas 70 selalunya dianggap terlebih beli.', ' A reading above 70 is often considered overbought.') : '') + '</p><div class="fields">' + fields + '</div></div>';
    }).join('') +
    '<div class="actions"><button class="btn" data-act="reset">' + tx('Pulihkan nilai asal', 'Restore defaults') + '</button></div>';
}
function renderTabs() {
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === TAB)));
  document.querySelectorAll('.panel').forEach(p => { p.hidden = p.id !== TAB; });
}
function renderAll() { renderTabs(); renderSaringan(); renderPantauan(); renderDataSummary(); renderMissing(); renderTetapan(); }
function renderScreens() { renderSaringan(); renderPantauan(); renderDataSummary(); renderMissing(); }

/* ---------- actions ---------- */
function setTab(t) { TAB = t; LS.set('pb_tab', t); renderTabs(); window.scrollTo(0, 0); }
function doImport(text, label) {
  const msg = $('#importMsg'); msg.className = 'msg';
  if (!String(text).trim()) { msg.className = 'msg err'; msg.textContent = tx('Tiada data. Tampal baris CSV atau pilih fail.', 'No data. Paste CSV rows or choose a file.'); return false; }
  const r = parseInput(text, S);
  if (!r.priceRows && !r.shareRows) { msg.className = 'msg err'; msg.textContent = tx('Tiada baris yang sah. Semak format: ', 'No valid rows. Check the format: ') + 'simbol,tarikh,open,high,low,close,volume' + (r.bad.length ? tx(' (baris ', ' (row ') + r.bad.join(', ') + ')' : '') + '.'; return false; }
  if (r.touched.length) markSyms(r.touched);
  if (r.sharesTouched.length) markMain();
  recompute(); renderScreens();
  msg.className = 'msg ok';
  msg.textContent = (label ? label + ': ' : '') + (r.priceRows ? r.priceRows + tx(' baris harga untuk ', ' price rows for ') + r.touched.length + tx(' kaunter dimasukkan. ', ' counters added. ') : '') + (r.shareRows ? r.shareRows + tx(' jumlah saham beredar disimpan. ', ' shares-outstanding values saved. ') : '') + (r.skipped ? r.skipped + tx(' baris dilangkau (baris ', ' rows skipped (rows ') + r.bad.join(', ') + (r.skipped > r.bad.length ? ', …' : '') + ').' : '');
  return true;
}
let clearArmed = null;
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act],[data-tab]'); if (!t) return;
  if (t.matches('.tabs button')) { setTab(t.dataset.tab); return; }
  const act = t.dataset.act;
  if (act === 'theme') { setTheme(t.dataset.val); return; }
  if (act === 'lang') { setLang(t.dataset.val); recompute(); renderAll(); renderFeedInfo(); renderStatus(); return; }
  if (act === 'goto') setTab(t.dataset.tab);
  if (act === 'gotomiss') { setTab('data'); const h = $('#missingH'); if (h) h.scrollIntoView({ block: 'start' }); const m = $('#mq'); if (m) m.focus({ preventScroll: true }); return; }
  else if (act === 'view') { VIEW = t.dataset.view; LIMIT = 150; renderSaringan(); }
  else if (act === 'more') { LIMIT += 150; renderSaringan(); }
  else if (act === 'watch' || act === 'unwatch') {
    e.preventDefault(); e.stopPropagation(); const s = t.dataset.sym;
    if (S.watch[s]) delete S.watch[s];
    else { const r = RES.byS[s]; S.watch[s] = { added: r ? r.p.d[r.p.d.length - 1] : RES.latest, price: r ? r.p.c[r.p.c.length - 1] : null }; }
    markMain();
    if (act === 'watch') { const on = !!S.watch[s]; t.classList.toggle('on', on); t.textContent = on ? tx('Dipantau', 'Watching') : tx('Pantau', 'Watch'); t.setAttribute('aria-pressed', String(on)); renderPantauan(); }
    else renderScreens();
  }
  else if (act === 'import') { if (doImport($('#csv').value)) $('#csv').value = ''; }
  else if (act === 'demo') {
    const ok = doImport(demoCSV(new Date()), tx('Data contoh', 'Sample data'));
    if (ok) { for (const s of ['DEMO-A', 'DEMO-C']) if (!S.watch[s] && RES.byS[s]) { const p = RES.byS[s].p, i = p.d.length - 6; S.watch[s] = { added: p.d[i], price: p.c[i] }; } markMain(); renderPantauan(); VIEW = 'lulus'; renderSaringan(); setTab('saringan'); }
  }
  else if (act === 'clear') {
    if (clearArmed) {
      clearTimeout(clearArmed); clearArmed = null; t.classList.remove('arm'); t.textContent = tx('Padam data dalam pelayar ini', 'Delete data in this browser');
      const bks = new Set(usedBuckets); for (const s in S.prices) bks.add(bucketOf(s));
      S.prices = {}; S.shares = {}; S.watch = {};
      bks.forEach(k => dirtyB.add(k)); markMain(); saveLocalPx(); recompute(); renderScreens();
      $('#importMsg').className = 'msg ok'; $('#importMsg').textContent = tx('Data dalam pelayar ini dipadam. Muat semula halaman untuk dapatkan data automatik semula. Tetapan penapis dikekalkan.', 'Data in this browser was deleted. Reload the page to get the automatic data again. Filter settings are kept.');
    } else {
      t.classList.add('arm'); t.textContent = tx('Tekan sekali lagi untuk padam', 'Tap again to delete');
      clearArmed = setTimeout(() => { clearArmed = null; t.classList.remove('arm'); t.textContent = tx('Padam data dalam pelayar ini', 'Delete data in this browser'); }, 4000);
    }
  }
  else if (act === 'reset') { S.filters = DEF_FILTERS(); markMain(); recompute(); renderTetapan(); renderScreens(); }
});
document.addEventListener('pointermove', e => { if (e.target.closest && e.target.closest('.chart')) chartMove(e); });
document.addEventListener('pointerdown', e => { if (e.target.closest && e.target.closest('.chart')) chartMove(e); });
document.addEventListener('pointerout', e => { if (e.target.closest && e.target.closest('.chart') && !(e.relatedTarget && e.target.closest('.chart').contains(e.relatedTarget))) chartLeave(e); });
document.addEventListener('input', e => {
  if (e.target.id === 'mq') { MQ = e.target.value; renderMissingList(); return; }
  if (e.target.id === 'q') { QUERY = e.target.value; LIMIT = 150; const pos = e.target.selectionStart; renderSaringan(); const q = $('#q'); q.focus(); try { q.setSelectionRange(pos, pos); } catch (x) { } }
});
let ftimer = null;
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'file') {
    const f = t.files && t.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => { doImport(String(rd.result || ''), f.name); t.value = ''; };
    rd.onerror = () => { $('#importMsg').className = 'msg err'; $('#importMsg').textContent = tx('Fail tidak dapat dibaca. Cuba simpan semula sebagai CSV.', 'The file could not be read. Try saving it again as CSV.'); };
    rd.readAsText(f); return;
  }
  const k = t.dataset && t.dataset.f; if (!k) return; const key = t.dataset.key; const F = S.filters[k];
  if (t.type === 'checkbox') F[key] = t.checked;
  else if (t.tagName === 'SELECT') F[key] = t.value;
  else {
    const raw = t.value.trim().replace(',', '.');
    if (key === 'max') F.max = raw === '' ? null : (isFinite(+raw) ? +raw : F.max);
    else if (raw !== '' && isFinite(+raw)) F.min = +raw;
    t.value = F[key] == null ? '' : fmtTh(F[key]);
  }
  markMain(); recompute();
  if (key === 'on' || key === 'mode') renderTetapan();
  clearTimeout(ftimer); ftimer = setTimeout(renderScreens, 150);
});

/* ---------- start ---------- */
loadLocal();
TAB = LS.get('pb_tab') || 'saringan';
if (!['saringan', 'pantauan', 'data', 'tetapan'].includes(TAB)) TAB = 'saringan';
setTheme(document.documentElement.getAttribute('data-theme'));
setLang(LANG);
recompute(); renderAll();
loadFeed();
}
