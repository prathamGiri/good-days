'use strict';
/* Good Days: a gentle daily check-in for aging pets. Offline, private, localStorage only. */
(function () {
  const KEY = 'gooddays.v1';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  const CATS = [
    { k: 'hurt', name: 'Hurt', hint: 'Is pain well controlled, breathing easy? 10 = comfortable, no pain.' },
    { k: 'hunger', name: 'Hunger', hint: 'Eating enough, on their own or with a little help?' },
    { k: 'hydration', name: 'Hydration', hint: 'Drinking enough, or getting fluids when needed?' },
    { k: 'hygiene', name: 'Hygiene', hint: 'Able to stay clean: coat, sores, accidents.' },
    { k: 'happiness', name: 'Happiness', hint: 'Shows joy and interest, responds to family and toys.' },
    { k: 'mobility', name: 'Mobility', hint: 'Can get up and move around without too much struggle?' },
    { k: 'moreGood', name: 'More good days', hint: 'Do good days still outnumber the bad ones?' }
  ];
  const LABEL = { good: 'Good', meh: 'Meh', bad: 'Bad' };
  const EMOJIS = ['🐶', '🐕', '🦮', '🐩', '🐱', '🐈', '🐈‍⬛', '🐰', '🐹', '🐦', '🦜', '🐢', '🐴', '🐷', '🐾', '💛'];
  const COLORS = ['#E8B86B', '#8FB996', '#9DB4D3', '#D99A7A', '#B9A3D0', '#C9B48A', '#7FB5B0', '#C97C7C'];
  const SPECIES_EMOJI = { dog: '🐶', cat: '🐱', other: '🐾' };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  /* ---------- dates ---------- */
  const pad = n => String(n).padStart(2, '0');
  const dkey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const today = () => dkey(new Date());
  const addDays = (k, n) => { const d = parse(k); d.setDate(d.getDate() + n); return dkey(d); };
  const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
  const fShort = k => { const d = parse(k); return `${MON[d.getMonth()]} ${d.getDate()}`; };
  const fLong = k => { const d = parse(k); return `${DOW[d.getDay()]}, ${MON[d.getMonth()]} ${d.getDate()}`; };
  const fYear = k => { const d = parse(k); return `${MON[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`; };
  const fRange = (a, b) => (parse(a).getFullYear() === parse(b).getFullYear() ? `${fShort(a)} – ${fYear(b)}` : `${fYear(a)} – ${fYear(b)}`);
  const ago = k => { const n = diffDays(k, today()); return n <= 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`; };

  /* ---------- state ---------- */
  const blank = () => ({ pets: [], days: {}, checks: [], settings: { activePetId: null, lastBackupAt: null } });
  function normalize(d) {
    const b = blank();
    if (!d || typeof d !== 'object') return b;
    b.pets = Array.isArray(d.pets) ? d.pets.filter(p => p && p.id && p.name) : [];
    b.pets.forEach(p => { p.favorites = Array.isArray(p.favorites) ? p.favorites : []; p.archived = !!p.archived; p.memorial = !!p.memorial; p.color = p.color || COLORS[0]; p.emoji = p.emoji || '🐾'; p.species = p.species || 'other'; });
    const src = d.days && typeof d.days === 'object' ? d.days : {};
    Object.keys(src).forEach(pid => {
      const m = src[pid]; if (!m || typeof m !== 'object' || Array.isArray(m)) return;
      const out = {};
      Object.keys(m).forEach(k => { const v = m[k]; if (/^\d{4}-\d{2}-\d{2}$/.test(k) && v && LABEL[v.rating]) out[k] = { rating: v.rating, note: typeof v.note === 'string' ? v.note.slice(0, 140) : '', updatedAt: v.updatedAt || 0 }; });
      b.days[pid] = out;
    });
    b.checks = (Array.isArray(d.checks) ? d.checks : []).filter(c => c && c.petId && typeof c.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.date) && c.scores && typeof c.scores === 'object').map(c => {
      const scores = {}; CATS.forEach(x => { const v = Math.round(+c.scores[x.k]); scores[x.k] = v >= 0 && v <= 10 ? v : 0; });
      return { id: c.id || uid(), petId: c.petId, date: c.date, scores, total: CATS.reduce((t, x) => t + scores[x.k], 0), favoritesSeen: c.favoritesSeen && typeof c.favoritesSeen === 'object' ? c.favoritesSeen : {} };
    });
    b.pets.forEach(p => { p.favorites = p.favorites.filter(f => f && f.id && f.label); });
    b.settings = Object.assign(b.settings, d.settings || {});
    return b;
  }
  function load() { try { const r = localStorage.getItem(KEY); if (r) return normalize(JSON.parse(r)); } catch (e) { /* ignore */ } return blank(); }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Could not save on this device'); } }
  let S = load();

  const UI = { tab: 'today', sel: null, win: 7, cal: null, calDir: '', draft: null, range: 14 };

  /* ---------- helpers ---------- */
  const visiblePets = () => S.pets.filter(p => !p.archived);
  function activePet() {
    const v = visiblePets();
    return v.find(p => p.id === S.settings.activePetId) || v[0] || null;
  }
  const getDay = (pid, k) => (S.days[pid] && S.days[pid][k]) || null;
  function setDay(pid, k, rating, note) {
    S.days[pid] = S.days[pid] || {};
    if (!rating) { delete S.days[pid][k]; } else S.days[pid][k] = { rating, note: (note || '').trim(), updatedAt: Date.now() };
    save();
  }
  const checksFor = pid => S.checks.filter(c => c.petId === pid).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  const lastCheck = pid => { const c = checksFor(pid); return c[c.length - 1] || null; };
  const lastLogged = pid => { const ks = Object.keys(S.days[pid] || {}).sort(); return ks[ks.length - 1] || null; };
  function hexA(hex, a) { const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; }
  const petStyle = p => `--pc:${p.color};--pcs:${hexA(p.color, .2)}`;
  const possessive = n => n + (/s$/i.test(n) ? "'" : "'s");
  function ageText(p) { if (!p.birthYear) return ''; const a = new Date().getFullYear() - p.birthYear; return a <= 0 ? 'under a year' : a === 1 ? '1 year old' : `${a} years old`; }
  const speciesName = s => ({ dog: 'Dog', cat: 'Cat', other: 'Pet' }[s] || 'Pet');
  const totalOf = sc => CATS.reduce((t, c) => t + (+sc[c.k] || 0), 0);

  function stats(pid, n, end) {
    let g = 0, m = 0, b = 0, logged = 0;
    for (let i = 0; i < n; i++) { const d = getDay(pid, addDays(end, -i)); if (d && d.rating) { logged++; if (d.rating === 'good') g++; else if (d.rating === 'meh') m++; else b++; } }
    return { g, m, b, logged, n, good: g + m / 2, bad: b + m / 2 };
  }
  function streaks(pid, n, end) {
    let longest = 0, ls = null, le = null, run = 0, rs = null;
    for (let i = n - 1; i >= 0; i--) {
      const k = addDays(end, -i), d = getDay(pid, k);
      if (d && d.rating === 'bad') { if (!run) rs = k; run++; if (run > longest) { longest = run; ls = rs; le = k; } } else run = 0;
    }
    let cur = 0, k = end; if (!getDay(pid, k)) k = addDays(k, -1);
    while (getDay(pid, k) && getDay(pid, k).rating === 'bad') { cur++; k = addDays(k, -1); }
    return { longest, start: ls, end: le, current: cur };
  }
  function status(st, p) {
    const n = p.name;
    if (st.logged < 3) return { c: '', t: 'Just getting started', x: `Log a few more evenings and the balance of ${possessive(n)} days will show here.` };
    const r = st.good / (st.good + st.bad);
    if (p.memorial) {
      if (st.bad > st.good) return { c: 'bad', t: 'Harder days near the end', x: 'You were watching closely and caring for them through it.' };
      if (r >= 0.65) return { c: 'good', t: 'Mostly good days', x: `${n} had plenty of good days in this stretch.` };
      return { c: 'meh', t: 'A mix of days', x: 'Some good, some hard. You were there for all of them.' };
    }
    if (st.bad > st.good) return { c: 'bad', t: 'Bad days are outnumbering good', x: 'This may be worth a gentle conversation with your vet about comfort.' };
    if (r >= 0.65) return { c: 'good', t: 'Mostly good days', x: `The good days are clearly ahead for ${n}. Keep noticing.` };
    return { c: 'meh', t: 'Mixed: keep watching', x: 'Some harder days in the mix. Keep logging and the trend will get clearer.' };
  }
  function favStatus(p) {
    const cks = checksFor(p.id);
    return p.favorites.map(f => {
      let lastSeen = null, notSince = null, recorded = false;
      cks.forEach(c => { const v = c.favoritesSeen ? c.favoritesSeen[f.id] : undefined; if (v === true) { lastSeen = c.date; notSince = null; recorded = true; } else if (v === false) { if (!notSince) notSince = c.date; recorded = true; } });
      return { f, lastSeen, notSince, recorded };
    });
  }
  function catChanges(prev, last) {
    return CATS.map(c => ({ c, a: +prev.scores[c.k] || 0, b: +last.scores[c.k] || 0, d: (+last.scores[c.k] || 0) - (+prev.scores[c.k] || 0) }));
  }

  /* ---------- feedback ---------- */
  let toastT;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200); }
  function buzz(ms) { try { if (window.Android && window.Android.vibrate) window.Android.vibrate(ms); } catch (e) { /* ignore */ } }
  function copyText(text) {
    const fallback = () => {
      const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; } ta.remove(); return ok;
    };
    return new Promise(res => {
      try {
        if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(() => res(true), () => res(fallback()));
        else res(fallback());
      } catch (e) { res(fallback()); }
    });
  }
  function shareText(text) {
    if (window.Android && window.Android.share) { try { window.Android.share(text); return; } catch (e) { /* fallthrough */ } }
    if (navigator.share) { navigator.share({ text }).catch(() => {}); return; }
    copyText(text).then(ok => toast(ok ? 'Copied. Paste it into a message to your vet.' : 'Sharing is not available here'));
  }

  /* ---------- icons ---------- */
  function face(r) {
    const mouth = r === 'good' ? 'M15 27 Q24 35 33 27' : r === 'meh' ? 'M16.5 29.5 L31.5 29.5' : 'M15.5 32.5 Q24 25.5 32.5 32.5';
    return `<svg viewBox="0 0 48 48" class="face" aria-hidden="true"><circle cx="24" cy="24" r="20" fill="currentColor" opacity=".16"/><circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="17" cy="20" r="2.6" fill="currentColor"/><circle cx="31" cy="20" r="2.6" fill="currentColor"/><path d="${mouth}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`;
  }
  const ICON = {
    close: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    left: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
    right: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
    chev: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--faint)"><path d="M9 6l6 6-6 6"/></svg>',
    share: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v13"/></svg>',
    copy: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    rain: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 15a4.5 4.5 0 0 0-1-8.9A6 6 0 0 0 5 8a4 4 0 0 0 .5 8h12z"/><path d="M8 19l-1 2M12 19l-1 2M16 19l-1 2"/></svg>',
    clip: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="M9 4V3h6v1M9 11h6M9 15h4"/></svg>',
    heart: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>'
  };

  /* ---------- layers (sheets & dialogs) ---------- */
  const stack = [];
  function openLayer(html, { dialog = false, full = false, onClose } = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'layer-wrap' + (dialog ? ' dlg' : '');
    wrap.innerHTML = `<div class="backdrop"></div><div class="sheet${full ? ' full' : ''}${dialog ? ' dlg' : ''}" role="dialog" aria-modal="true">${html}</div>`;
    $('#layer').appendChild(wrap);
    const entry = { wrap, sheet: wrap.querySelector('.sheet'), onClose };
    stack.push(entry);
    wrap.querySelector('.backdrop').addEventListener('click', () => closeLayer(entry));
    wrap.addEventListener('click', e => { if (e.target.closest('[data-s="close"]')) closeLayer(entry); });
    requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open')));
    return entry;
  }
  function closeLayer(entry) {
    const i = entry ? stack.indexOf(entry) : stack.length - 1;
    if (i < 0) return;
    const e = stack.splice(i, 1)[0];
    e.wrap.classList.remove('open');
    setTimeout(() => e.wrap.remove(), 300);
    if (e.onClose) e.onClose();
  }
  function confirmDlg({ title, text, ok = 'OK', cancel = 'Cancel', danger = false }) {
    return new Promise(res => {
      let done = false;
      const fin = v => { if (done) return; done = true; res(v); };
      const L = openLayer(`<h2>${esc(title)}</h2><p>${esc(text)}</p><div class="btn-row"><button class="btn ghost" data-s="close">${esc(cancel)}</button><button class="btn ${danger ? 'danger' : 'primary'}" data-s="ok">${esc(ok)}</button></div>`, { dialog: true, onClose: () => fin(false) });
      L.sheet.querySelector('[data-s="ok"]').addEventListener('click', () => { fin(true); closeLayer(L); });
    });
  }

  /* ---------- rendering ---------- */
  function render() {
    const pets = visiblePets();
    const w = $('#welcome');
    const appEl = $('#app');
    if (!pets.length) { renderWelcome(); w.hidden = false; appEl.style.visibility = 'hidden'; return; }
    w.hidden = true; appEl.style.visibility = '';
    const p = activePet();
    S.settings.activePetId = p.id;
    renderChips(p);
    $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === UI.tab));
    const main = $('#main');
    const fn = { today: viewToday, calendar: viewCalendar, check: viewCheck, trends: viewTrends, summary: viewSummary }[UI.tab];
    main.innerHTML = `<div class="view">${fn(p)}</div>`;
    after[UI.tab] && after[UI.tab](p);
  }
  function renderChips(p) {
    $('#chips').innerHTML = visiblePets().map(x => `<button class="chip${x.id === p.id ? ' on' : ''}" role="tab" aria-selected="${x.id === p.id}" data-act="pet" data-id="${x.id}" style="${petStyle(x)}"><span class="em">${x.emoji}</span><span class="nm">${esc(x.name)}</span>${x.memorial ? '<span class="mem">♡</span>' : ''}</button>`).join('') +
      `<button class="chip add" data-act="addPet" aria-label="Add a pet">+</button>`;
    const on = $('#chips .chip.on');
    if (on && on.scrollIntoView) { try { on.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { /* ignore */ } }
  }

  function renderWelcome() {
    const archived = S.pets.length > 0;
    $('#welcome').innerHTML = `
      <svg class="w-ill" viewBox="0 0 150 150" aria-hidden="true">
        <defs><radialGradient id="glow" cx="50%" cy="45%" r="50%"><stop offset="0" stop-color="#E8B86B" stop-opacity=".45"/><stop offset="1" stop-color="#E8B86B" stop-opacity="0"/></radialGradient></defs>
        <circle cx="75" cy="70" r="70" fill="url(#glow)"/>
        <circle cx="75" cy="75" r="46" fill="#2E2A26" stroke="#E8B86B" stroke-opacity=".5" stroke-width="2"/>
        <g fill="#E8B86B"><ellipse cx="75" cy="86" rx="16" ry="13"/><circle cx="56.5" cy="69" r="6.5"/><circle cx="67.5" cy="58" r="6.5"/><circle cx="82.5" cy="58" r="6.5"/><circle cx="93.5" cy="69" r="6.5"/></g>
        <circle cx="122" cy="40" r="7" fill="#8FB996"/><circle cx="132" cy="62" r="5" fill="#D9A85B"/><circle cx="24" cy="104" r="6" fill="#8FB996"/><circle cx="20" cy="46" r="4" fill="#C97C7C" opacity=".8"/>
      </svg>
      <h1>Good Days</h1>
      <p class="lead">A gentle nightly check-in for your older or unwell pet. One tap shows whether the good days still outnumber the bad.</p>
      <ul class="w-pts">
        <li><i>🌙</i><span><b>One tap each evening.</b> Good, meh or bad, plus an optional note.</span></li>
        <li><i>⚖️</i><span><b>See the balance.</b> 7 and 14-day trends, in kind, plain words.</span></li>
        <li><i>🩺</i><span><b>Bring real numbers to your vet.</b> A summary ready to share.</span></li>
        <li><i>🔒</i><span><b>Private and offline.</b> Everything stays on this phone.</span></li>
      </ul>
      <button class="btn primary block" data-act="addPet" id="wAdd">Add your pet</button>
      <button class="btn ghost block" data-act="sample" id="wSample">Explore with a sample pet</button>
      ${archived ? '<button class="btn ghost block" data-act="settings">Manage archived pets</button>' : ''}
      <button class="btn link block" data-act="restore" id="wRestore">Restore from a backup</button>`;
  }

  /* ----- Today ----- */
  function viewToday(p) {
    const t = today();
    if (!UI.sel || diffDays(UI.sel, t) > 6 || diffDays(UI.sel, t) < 0) UI.sel = t;
    let html = '';
    if (p.memorial) {
      const ks = Object.keys(S.days[p.id] || {}).sort();
      html += `<section class="card memorial"><div class="mem-em" style="${petStyle(p)}">${p.emoji}</div>
        <p class="eyebrow">In loving memory</p><h1>Remembering ${esc(p.name)}</h1>
        <p>Every day you noticed is kept here. ${possessive(esc(p.name))} calendar, checks and notes stay safe, just as you left them.</p>
        ${ks.length ? `<p class="tiny">${ks.length} day${ks.length > 1 ? 's' : ''} remembered · ${fShort(ks[0])} to ${fYear(ks[ks.length - 1])}</p>` : ''}</section>`;
    } else {
      const sel = UI.sel, d = getDay(p.id, sel);
      const yd = addDays(t, -1);
      const q = sel === t ? `How was ${possessive(esc(p.name))} day?` : sel === yd ? `How was ${possessive(esc(p.name))} day yesterday?` : `How was ${possessive(esc(p.name))} ${DOW[parse(sel).getDay()]}?`;
      html += `<section class="card" id="checkin"><p class="eyebrow">${sel === t ? 'Tonight · ' + fShort(t) : fLong(sel)}</p>
        <h1 class="big" id="question">${q}</h1>
        <div class="rate${d ? ' has' : ''}">${['good', 'meh', 'bad'].map(r => `<button class="rbtn r-${r}${d && d.rating === r ? ' on' : ''}" data-act="rate" data-r="${r}" id="rate-${r}" aria-pressed="${!!(d && d.rating === r)}">${face(r)}<span>${LABEL[r]}</span></button>`).join('')}</div>
        <div class="logged">${d ? `Logged as <b>${LABEL[d.rating]}</b> · tap another to change` : 'One tap is enough. A note is optional.'}</div>
        <input class="note" id="note" maxlength="140" enterkeyhint="done" placeholder="Add a note, e.g. wouldn't climb stairs" value="${esc(d ? d.note : (UI.pendingNote || ''))}">
        <div class="strip" aria-label="Last 7 days">${[6, 5, 4, 3, 2, 1, 0].map(i => { const k = addDays(t, -i), dd = getDay(p.id, k); return `<button class="sd${dd ? ' r-' + dd.rating : ''}${k === sel ? ' sel' : ''}" data-act="seldate" data-k="${k}" aria-label="${fLong(k)}">${i === 0 ? 'Today' : DOW[parse(k).getDay()].slice(0, 3)}<i></i></button>`; }).join('')}</div>
      </section>`;
    }
    const end = p.memorial ? (lastLogged(p.id) || t) : t;
    const st = stats(p.id, UI.win, end), s = status(st, p);
    const tot = st.good + st.bad;
    const gw = tot ? st.good / tot * 100 : 0, bw = tot ? st.bad / tot * 100 : 0;
    html += `<section class="card" id="gauge"><div class="card-h"><h2>${p.memorial ? 'Their last ' + UI.win + ' days' : 'Balance'}</h2>
      <div class="seg"><button data-act="win" data-n="7" class="${UI.win === 7 ? 'on' : ''}">7 days</button><button data-act="win" data-n="14" id="win14" class="${UI.win === 14 ? 'on' : ''}">14 days</button></div></div>
      <div class="bal" role="img" aria-label="${st.good} good versus ${st.bad} bad"><div class="bal-g" style="width:${gw}%"></div><div class="bal-b" style="width:${bw}%"></div><div class="bal-mid"></div></div>
      <div class="bal-leg"><span class="g">${fmtN(st.good)} good</span><span class="b">${fmtN(st.bad)} bad</span></div>
      <div class="status s-${s.c}" id="status"><strong>${s.t}</strong><p>${s.x}</p></div>
      <p class="tiny">Good ${st.g} · Meh ${st.m} · Bad ${st.b} · ${st.logged} of ${st.n} days logged. Meh counts as half on each side.</p></section>`;

    const sk = streaks(p.id, 14, end);
    if (sk.current >= 3 && !p.memorial) {
      html += notice('rose', ICON.rain, `${sk.current} hard days in a row`, `The last ${sk.current} logged days were bad ones. Runs like this are worth mentioning to your vet.`, '', 'streak');
    } else if (sk.longest >= 3) {
      html += notice('rose', ICON.rain, `${sk.longest} hard days in a row`, `${fShort(sk.start)} – ${fShort(sk.end)}. ${p.memorial ? 'You stayed close through them.' : 'Runs of bad days are worth mentioning to your vet.'}`, '', 'streak');
    }
    if (!p.memorial) {
      const lc = lastCheck(p.id);
      if (!lc || diffDays(lc.date, t) >= 7) {
        html += notice('gold', ICON.clip, lc ? 'Weekly check is due' : 'Try the weekly check', lc ? `The last quality-of-life check was ${ago(lc.date)}. It takes about two minutes.` : `Seven quick sliders that vets use to talk about comfort. It takes about two minutes.`, `<button class="btn primary sm" data-act="tab" data-tab="check">Start weekly check</button>`);
      }
      if (p.favorites.length < 3) {
        html += notice('gold', ICON.heart, `What does ${esc(p.name)} love?`, `List 3–5 favorite things. Noticing when they fade is one of the clearest signs vets look for.`, `<button class="btn ghost sm" data-act="editPet">Add favorite things</button>`);
      }
    }
    return html;
  }
  const fmtN = n => (Math.round(n * 10) / 10).toString();
  function notice(kind, icon, title, text, extra = '', id = '') {
    return `<section class="card notice ${kind}"${id ? ` id="${id}"` : ''}><div class="ic">${icon}</div><div><h3>${title}</h3><p>${text}</p>${extra}</div></section>`;
  }

  /* ----- Calendar ----- */
  function viewCalendar(p) {
    const t = today();
    if (!UI.cal) UI.cal = t.slice(0, 7);
    const [y, m] = UI.cal.split('-').map(Number);
    const first = new Date(y, m - 1, 1), dim = new Date(y, m, 0).getDate(), off = (first.getDay() + 6) % 7;
    const ckDates = new Set(checksFor(p.id).map(c => c.date));
    let cells = '';
    for (let i = 0; i < off; i++) cells += '<span></span>';
    let g = 0, me = 0, b = 0;
    for (let n = 1; n <= dim; n++) {
      const k = `${y}-${pad(m)}-${pad(n)}`, d = getDay(p.id, k), fut = k > t;
      if (d) { if (d.rating === 'good') g++; else if (d.rating === 'meh') me++; else b++; }
      cells += `<button class="cd${d ? ' r-' + d.rating : ''}${k === t ? ' today' : ''}${fut ? ' future' : ''}" data-act="day" data-k="${k}" ${fut ? 'disabled' : ''} aria-label="${fLong(k)}${d ? ', ' + LABEL[d.rating] : ''}">${n}${d && d.note ? '<i class="dot"></i>' : ''}${ckDates.has(k) ? '<i class="chk"></i>' : ''}</button>`;
    }
    const atNow = UI.cal >= t.slice(0, 7);
    return `<section class="card"><div class="cal-nav"><button class="icon-btn" data-act="mon" data-d="-1" aria-label="Previous month">${ICON.left}</button>
      <h2>${MONTHS[m - 1]} ${y}</h2><button class="icon-btn" data-act="mon" data-d="1" aria-label="Next month" ${atNow ? 'disabled style="opacity:.25"' : ''}>${ICON.right}</button></div>
      <div class="cal-dow">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(d => `<span>${d}</span>`).join('')}</div>
      <div class="cal-grid ${UI.calDir}" id="calGrid">${cells}</div>
      <div class="legend"><span><i style="background:var(--good)"></i>Good</span><span><i style="background:var(--meh)"></i>Meh</span><span><i style="background:var(--bad)"></i>Bad</span><span><i style="background:var(--surface3)"></i>Not logged</span><span><i class="dt"></i>Note</span><span><i class="ck"></i>Weekly check</span></div></section>
      <section class="card"><div class="card-h"><h2>${MONTHS[m - 1]} at a glance</h2></div>
      <div class="counts"><div class="g"><b>${g}</b><span>Good</span></div><div class="m"><b>${me}</b><span>Meh</span></div><div class="b"><b>${b}</b><span>Bad</span></div></div>
      <p class="tiny">${p.memorial ? 'Tap any day to look back at it.' : 'Tap any past day to see or change it. Swipe to move between months.'}</p></section>`;
  }
  function openDay(p, k) {
    const d = getDay(p.id, k), ck = S.checks.find(c => c.petId === p.id && c.date === k);
    const editable = !p.memorial && k <= today();
    let sel = d ? d.rating : null;
    const body = `<div class="sheet-h"><h2>${fLong(k)}</h2><button class="icon-btn" data-s="close" aria-label="Close">${ICON.close}</button></div>
      ${editable ? `<div class="rate${sel ? ' has' : ''}" style="margin-top:4px">${['good', 'meh', 'bad'].map(r => `<button class="rbtn r-${r}${sel === r ? ' on' : ''}" data-s="r" data-r="${r}">${face(r)}<span>${LABEL[r]}</span></button>`).join('')}</div>
        <label class="fld" style="margin-top:16px"><span>Note</span><textarea class="inp" id="dNote" maxlength="140" placeholder="Anything worth remembering?">${esc(d ? d.note : '')}</textarea></label>`
        : `<div class="status ${d ? 's-' + d.rating : ''}"><strong>${d ? LABEL[d.rating] + ' day' : 'Not logged'}</strong>${d && d.note ? `<p>${esc(d.note)}</p>` : ''}</div>`}
      ${ck ? `<div class="notice gold" style="margin-top:14px"><div class="ic">${ICON.clip}</div><div><h3>Weekly check: ${ck.total} / 70</h3><p>${ck.total > 35 ? 'Above the 35 reference line.' : 'At or below the 35 reference line.'}</p></div></div>` : ''}
      ${editable ? `<div class="btn-row" style="margin-top:18px">${d ? '<button class="btn ghost" data-s="clear">Clear day</button>' : ''}<button class="btn primary" data-s="save" id="dSave">Save</button></div>` : ''}`;
    const L = openLayer(body);
    if (!editable) return;
    L.sheet.addEventListener('click', e => {
      const rb = e.target.closest('[data-s="r"]');
      if (rb) { sel = rb.dataset.r; $$('.rbtn', L.sheet).forEach(b => b.classList.toggle('on', b.dataset.r === sel)); $('.rate', L.sheet).classList.add('has'); buzz(15); }
      if (e.target.closest('[data-s="save"]')) {
        if (!sel) { toast('Pick Good, Meh or Bad first'); return; }
        setDay(p.id, k, sel, $('#dNote', L.sheet).value); buzz(25); toast(`${fShort(k)} saved`); closeLayer(L); render();
      }
      if (e.target.closest('[data-s="clear"]')) { setDay(p.id, k, null); toast(`${fShort(k)} cleared`); closeLayer(L); render(); }
    });
  }

  /* ----- Weekly check ----- */
  function ensureDraft(p) {
    if (UI.draft && UI.draft.petId === p.id) return UI.draft;
    const t = today(), ex = S.checks.find(c => c.petId === p.id && c.date === t), lc = lastCheck(p.id);
    const src = ex || lc;
    const scores = {}; CATS.forEach(c => { scores[c.k] = src ? +src.scores[c.k] : 5; });
    UI.draft = { petId: p.id, date: t, scores, fav: ex ? Object.assign({}, ex.favoritesSeen) : {}, editing: !!ex };
    return UI.draft;
  }
  function loadDraftDate(p, date) {
    const ex = S.checks.find(c => c.petId === p.id && c.date === date), d = UI.draft;
    d.date = date; d.editing = !!ex;
    if (ex) { CATS.forEach(c => { d.scores[c.k] = +ex.scores[c.k]; }); d.fav = Object.assign({}, ex.favoritesSeen); }
  }
  function viewCheck(p) {
    if (p.memorial) {
      const cks = checksFor(p.id).reverse();
      return `<section class="card memorial"><div class="mem-em" style="${petStyle(p)}">${p.emoji}</div><h1>${possessive(esc(p.name))} checks</h1><p>Weekly checks are paused. Everything you recorded is kept below.</p></section>
        <section class="card"><div class="card-h"><h2>Past checks</h2></div>${cks.length ? cks.map(c => `<div class="ls"><span class="b" style="background:${c.total > 35 ? 'var(--good)' : 'var(--bad)'}"></span><div class="t"><b>${c.total} / 70</b><span>${fYear(c.date)}</span></div></div>`).join('') : '<div class="empty"><p>No weekly checks were recorded.</p></div>'}</section>`;
    }
    const d = ensureDraft(p), t = today(), lc = lastCheck(p.id), tot = totalOf(d.scores);
    return `<section class="card"><p class="eyebrow">Weekly check</p><h1 class="big">How is ${esc(p.name)} doing this week?</h1>
      <p class="sub">Score each area from 0 (very poor) to 10 (doing well). Go with your gut; there are no wrong answers.</p>
      <div class="date-in"><span>${d.editing ? 'Editing the check from' : 'Check date'}</span><input type="date" id="ckDate" value="${d.date}" max="${t}" aria-label="Check date"></div>
      ${lc && !d.editing ? `<p class="tiny">Last check ${ago(lc.date)}: ${lc.total} / 70. Sliders start from those scores.</p>` : ''}</section>
      <section class="card total-card" id="totalCard">${totalHtml(tot)}</section>
      <section class="card">${CATS.map(c => `<div class="sl"><div class="sl-h"><label for="sl-${c.k}">${c.name}</label><output id="o-${c.k}">${d.scores[c.k]}</output></div><p class="hint">${c.hint}</p>
        <input type="range" min="0" max="10" step="1" id="sl-${c.k}" data-cat="${c.k}" value="${d.scores[c.k]}" style="--p:${d.scores[c.k] * 10}%"></div>`).join('')}</section>
      <section class="card" id="favCard"><div class="card-h"><h2>Favorite things</h2><span class="muted" style="font-size:13.5px">Still does this?</span></div>
        ${p.favorites.length ? p.favorites.map(f => `<div class="fav"><span class="lbl">${esc(f.label)}</span><div class="yn"><button class="y${d.fav[f.id] === true ? ' on' : ''}" data-act="fav" data-id="${f.id}" data-v="1">Yes</button><button class="n${d.fav[f.id] === false ? ' on' : ''}" data-act="fav" data-id="${f.id}" data-v="0">Not this week</button></div></div>`).join('')
        : `<p class="muted" style="font-size:14.5px">Add a few things ${esc(p.name)} loves. Each week you'll tick whether they still do them.</p>`}
        ${p.favorites.length < 6 ? `<div class="add-row"><input class="inp" id="favQuick" maxlength="40" placeholder="e.g. Greeting at the door" enterkeyhint="done"><button class="btn sm" data-act="favQuick">Add</button></div>` : ''}
      </section>
      <button class="btn primary block" data-act="saveCheck" id="saveCheck" style="margin-bottom:8px">${d.editing ? 'Update this check' : 'Save this week’s check'}</button>
      <p class="tiny" style="text-align:center;margin-bottom:6px">Based on the HHHHHMM quality-of-life scale. A total above 35 is generally considered acceptable. Not a diagnosis.</p>`;
  }
  function totalHtml(tot) {
    const ok = tot > 35;
    return `<div class="total-row"><span class="num" id="totNum" style="color:${ok ? 'var(--text)' : 'var(--bad)'}">${tot}</span><span class="of">/ 70</span><span class="verdict ${ok ? 'v-ok' : 'v-low'}">${ok ? 'Above 35' : '35 or below'}</span></div>
      <div class="tbar"><i style="width:${tot / 70 * 100}%;background:${ok ? 'var(--accent)' : 'var(--bad)'}"></i><em></em></div>
      <div class="tbar-l"><span>0</span><span>35 reference</span><span>70</span></div>`;
  }

  /* ----- Trends ----- */
  function viewTrends(p) {
    const cks = checksFor(p.id);
    let html = `<section class="card"><div class="card-h"><h2>Quality-of-life score</h2>${cks.length ? `<span class="muted" style="font-size:13.5px">${cks.length} check${cks.length > 1 ? 's' : ''}</span>` : ''}</div>`;
    if (!cks.length) html += `<div class="empty"><div class="ill">📈</div><b>No weekly checks yet</b><p>Complete a weekly check and ${possessive(esc(p.name))} trend line will start here.</p>${p.memorial ? '' : '<button class="btn primary sm" style="margin-top:12px" data-act="tab" data-tab="check">Start weekly check</button>'}</div>`;
    else html += spark(cks.slice(-12));
    html += '</section>';

    if (cks.length) {
      const last = cks[cks.length - 1], prev = cks[cks.length - 2];
      html += `<section class="card" id="cats"><div class="card-h"><h2>By category</h2></div>`;
      if (prev) {
        const ch = catChanges(prev, last), worst = ch.reduce((a, c) => c.d < a.d ? c : a, { d: 0 });
        html += `<div class="key"><span><i style="background:var(--faint)"></i>${fShort(prev.date)}</span><span><i style="background:var(--accent)"></i>${fShort(last.date)}</span></div>`;
        html += ch.map(c => `<div class="cat${worst.c === c.c ? ' hl' : ''}"${worst.c === c.c ? ' id="biggestDrop"' : ''}><span class="nm">${c.c.name}</span><div class="bars"><i class="pv"><b style="width:${c.a * 10}%"></b></i><i class="lt"><b style="width:${c.b * 10}%"></b></i></div><span class="dl ${c.d < 0 ? 'down' : c.d > 0 ? 'up' : ''}">${c.a} → ${c.b}</span></div>`).join('');
        html += `<p class="tiny">${worst.c ? `${worst.c.name} dropped the most since the previous check (${worst.a} → ${worst.b}).` : 'No category dropped since the previous check.'}</p>`;
      } else {
        html += CATS.map(c => `<div class="cat"><span class="nm">${c.name}</span><div class="bars"><i class="lt"><b style="width:${last.scores[c.k] * 10}%"></b></i></div><span class="dl">${last.scores[c.k]}</span></div>`).join('');
        html += `<p class="tiny">After your next check, you'll see which areas changed.</p>`;
      }
      html += '</section>';
    }

    // monthly stacked counts (last 6 months)
    const t = today(), rows = [];
    const base = parse(t); base.setDate(1);
    let maxDays = 0;
    for (let i = 5; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1), pre = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-`;
      let g = 0, m = 0, b = 0;
      Object.entries(S.days[p.id] || {}).forEach(([k, v]) => { if (k.startsWith(pre)) { if (v.rating === 'good') g++; else if (v.rating === 'meh') m++; else b++; } });
      rows.push({ label: MON[d.getMonth()], g, m, b, n: g + m + b }); maxDays = Math.max(maxDays, g + m + b);
    }
    const shown = rows.filter((r, i) => r.n || i === rows.length - 1 || rows.slice(0, i).some(x => x.n));
    html += `<section class="card"><div class="card-h"><h2>Month by month</h2></div>`;
    if (!maxDays) html += `<div class="empty"><p>Daily check-ins will add up here, month by month.</p></div>`;
    else html += shown.map(r => `<div class="mrow"><span class="mn">${r.label}</span><div class="stack" style="width:${Math.max(r.n / Math.max(maxDays, 1) * 100, r.n ? 8 : 100)}%">${r.n ? `<i style="width:${r.g / r.n * 100}%;background:var(--good)"></i><i style="width:${r.m / r.n * 100}%;background:var(--meh)"></i><i style="width:${r.b / r.n * 100}%;background:var(--bad)"></i>` : ''}</div><span class="ct">${r.g}·${r.m}·${r.b}</span></div>`).join('') +
      `<div class="legend" style="margin-top:8px"><span><i style="background:var(--good)"></i>Good</span><span><i style="background:var(--meh)"></i>Meh</span><span><i style="background:var(--bad)"></i>Bad</span></div>`;
    html += '</section>';

    // favorites last seen
    html += `<section class="card" id="favSeen"><div class="card-h"><h2>Favorite things</h2></div>`;
    if (!p.favorites.length) html += `<div class="empty"><p>No favorite things listed yet.</p>${p.memorial ? '' : '<button class="btn ghost sm" style="margin-top:10px" data-act="editPet">Add favorite things</button>'}</div>`;
    else html += favStatus(p).map(s => {
      const col = s.notSince ? 'var(--bad)' : s.lastSeen ? 'var(--good)' : 'var(--faint)';
      const txt = s.notSince ? `Not seen since ${fShort(s.notSince)}${s.lastSeen ? ` · last seen ${fShort(s.lastSeen)}` : ''}` : s.lastSeen ? `Last seen ${fShort(s.lastSeen)} (${ago(s.lastSeen)})` : 'Not checked yet';
      return `<div class="ls"><span class="b" style="background:${col}"></span><div class="t"><b>${esc(s.f.label)}</b><span>${txt}</span></div></div>`;
    }).join('');
    html += '</section>';
    return html;
  }
  function spark(cks) {
    const W = 340, H = 170, L = 30, R = 18, T = 18, B = 30;
    const iw = W - L - R, ih = H - T - B;
    const x = i => cks.length === 1 ? L + iw / 2 : L + i * iw / (cks.length - 1);
    const y = v => T + ih - v / 70 * ih;
    const pts = cks.map((c, i) => [x(i), y(c.total)]);
    const path = pts.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' ');
    const area = cks.length > 1 ? `${path} L${pts[pts.length - 1][0].toFixed(1)} ${T + ih} L${pts[0][0].toFixed(1)} ${T + ih} Z` : '';
    const last = cks[cks.length - 1], prev = cks[cks.length - 2];
    const delta = prev ? last.total - prev.total : null;
    return `<div class="total-row" style="margin-bottom:6px"><span class="num" style="font-size:34px;color:${last.total > 35 ? 'var(--text)' : 'var(--bad)'}">${last.total}</span><span class="of">/ 70 · ${fShort(last.date)}</span>${delta !== null ? `<span class="verdict ${delta >= 0 ? 'v-ok' : 'v-low'}">${delta > 0 ? '+' : ''}${delta} since ${fShort(prev.date)}</span>` : ''}</div>
      <svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="Quality of life totals over time">
        <defs><linearGradient id="ar" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#E8B86B" stop-opacity=".28"/><stop offset="1" stop-color="#E8B86B" stop-opacity="0"/></linearGradient></defs>
        ${[0, 70].map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(255,236,210,.07)"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#7D7468">${v}</text>`).join('')}
        <rect x="${L}" y="${y(35)}" width="${iw}" height="${T + ih - y(35)}" fill="rgba(201,124,124,.06)"/>
        <line x1="${L}" x2="${W - R}" y1="${y(35)}" y2="${y(35)}" stroke="#C97C7C" stroke-opacity=".75" stroke-dasharray="5 5" stroke-width="1.5"/>
        <text x="${L - 8}" y="${y(35) + 4}" text-anchor="end" font-size="11" fill="#C97C7C">35</text>
        ${area ? `<path d="${area}" fill="url(#ar)"/>` : ''}
        <path d="${path}" fill="none" stroke="#E8B86B" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
        ${pts.map((q, i) => `<circle cx="${q[0]}" cy="${q[1]}" r="${i === pts.length - 1 ? 5.5 : 4}" fill="${cks[i].total > 35 ? '#E8B86B' : '#C97C7C'}" stroke="#25221F" stroke-width="2"/>`).join('')}
        ${pts.map((q, i) => (i === 0 || i === pts.length - 1 || cks.length <= 5) ? `<text x="${q[0]}" y="${q[1] - 10}" text-anchor="middle" font-size="11.5" font-weight="700" fill="#F4ECDF">${cks[i].total}</text><text x="${q[0]}" y="${H - 8}" text-anchor="${cks.length > 1 && i === pts.length - 1 ? 'end' : 'middle'}" font-size="11" fill="#7D7468">${fShort(cks[i].date)}</text>` : '').join('')}
      </svg>
      <p class="tiny" style="margin-top:4px">Dashed line: 35 of 70, above which quality of life is generally considered acceptable.</p>`;
  }

  /* ----- Vet summary ----- */
  function buildSummary(p, n) {
    const end = p.memorial ? (lastLogged(p.id) || today()) : today(), start = addDays(end, -(n - 1));
    const st = stats(p.id, n, end), sk = streaks(p.id, n, end), s = status(st, p);
    const L = [];
    const who = [speciesName(p.species).toLowerCase(), ageText(p)].filter(Boolean).join(', ');
    L.push(`Good Days summary for ${p.name}${who ? ` (${who})` : ''}`);
    L.push(`${fRange(start, end)} (${n} days)`);
    if (p.memorial) L.push('Kept in memory.');
    L.push('');
    L.push(`DAILY CHECK-INS: ${st.logged} of ${n} days logged`);
    L.push(`  Good: ${st.g}   Meh: ${st.m}   Bad: ${st.b}`);
    if (st.logged >= 3) L.push(`  Balance: ${fmtN(st.good)} good vs ${fmtN(st.bad)} bad (meh counts half each). ${s.t}.`);
    L.push(`  Longest run of bad days: ${sk.longest}${sk.longest ? ` (${fShort(sk.start)}${sk.longest > 1 ? ' – ' + fShort(sk.end) : ''})` : ''}`);
    const last7 = stats(p.id, 7, end);
    if (n > 7 && last7.logged) L.push(`  Last 7 days: Good ${last7.g}, Meh ${last7.m}, Bad ${last7.b}`);
    L.push('');
    const cks = checksFor(p.id), last = cks[cks.length - 1], prev = cks[cks.length - 2];
    L.push('QUALITY OF LIFE (HHHHHMM scale, out of 70; above 35 generally acceptable)');
    if (!last) L.push('  No weekly checks recorded yet.');
    else {
      L.push(`  Latest: ${last.total}/70 on ${fShort(last.date)}`);
      if (prev) {
        const d = last.total - prev.total;
        L.push(`  Previous: ${prev.total}/70 on ${fShort(prev.date)} (change: ${d > 0 ? '+' : ''}${d})`);
        const ch = catChanges(prev, last).filter(c => c.d).sort((a, b) => Math.abs(b.d) - Math.abs(a.d) || a.d - b.d).slice(0, 3);
        if (ch.length) L.push(`  Biggest changes: ${ch.map(c => `${c.c.name} ${c.a} -> ${c.b} (${c.d > 0 ? '+' : ''}${c.d})`).join(', ')}`);
      }
      L.push(`  Latest scores: ${CATS.map(c => `${c.name} ${last.scores[c.k]}`).join(', ')}`);
    }
    const missing = favStatus(p).filter(x => x.notSince);
    if (p.favorites.length) {
      L.push('');
      L.push('FAVORITE THINGS');
      if (missing.length) missing.forEach(x => L.push(`  - Not seen since ${fShort(x.notSince)}: ${x.f.label}${x.lastSeen ? ` (last seen ${fShort(x.lastSeen)})` : ''}`));
      else L.push('  All favorite things were still seen at the latest check.');
    }
    const notes = [];
    for (let i = 0; i < n; i++) { const k = addDays(end, -i), d = getDay(p.id, k); if (d && d.note) notes.push(`  - ${fShort(k)} (${LABEL[d.rating].toLowerCase()}): ${d.note}`); }
    L.push('');
    L.push('RECENT NOTES');
    if (notes.length) L.push(...notes.slice(0, 10)); else L.push('  No notes in this period.');
    L.push('');
    L.push('Logged each evening with Good Days (private, offline pet quality-of-life tracker).');
    return L.join('\n');
  }
  function viewSummary(p) {
    const text = buildSummary(p, UI.range);
    return `<section class="card"><p class="eyebrow">Vet summary</p><h1 class="big">Something real to bring to the vet</h1>
      <p class="sub">A plain-text snapshot of ${possessive(esc(p.name))} recent days. Send it before an appointment or read it out during one.</p>
      <div class="seg wide" style="margin-top:16px"><button data-act="range" data-n="14" class="${UI.range === 14 ? 'on' : ''}">Last 14 days</button><button data-act="range" data-n="30" id="range30" class="${UI.range === 30 ? 'on' : ''}">Last 30 days</button></div></section>
      <div class="btn-row" style="margin-bottom:14px"><button class="btn primary" data-act="shareSum" id="shareSum">${ICON.share}Share</button><button class="btn" data-act="copySum" id="copySum">${ICON.copy}Copy</button></div>
      <section class="card"><div class="card-h"><h2>Preview</h2></div><div class="preview" id="sumText">${esc(text)}</div></section>`;
  }

  /* ----- after-render hooks ----- */
  const after = {
    today(p) {
      const n = $('#note'); if (!n) return;
      n.addEventListener('change', () => {
        const d = getDay(p.id, UI.sel);
        // No re-render here: 'change' fires on blur, and rebuilding the DOM would swallow the tap that caused the blur.
        if (d) { setDay(p.id, UI.sel, d.rating, n.value); toast('Note saved'); }
        else { UI.pendingNote = n.value; if (n.value.trim()) toast('Now tap Good, Meh or Bad to save it'); }
      });
      n.addEventListener('keydown', e => { if (e.key === 'Enter') n.blur(); });
    },
    calendar(p) {
      const g = $('#calGrid'); let sx = null, sy = 0;
      g.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
      g.addEventListener('touchend', e => {
        if (sx === null) return; const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy; sx = null;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) moveMonth(dx < 0 ? 1 : -1);
      });
      UI.calDir = '';
    },
    check(p) {
      if (p.memorial) return;
      $$('input[type=range]').forEach(r => r.addEventListener('input', () => {
        const v = +r.value; UI.draft.scores[r.dataset.cat] = v; r.style.setProperty('--p', v * 10 + '%');
        $('#o-' + r.dataset.cat).textContent = v; $('#totalCard').innerHTML = totalHtml(totalOf(UI.draft.scores));
      }));
      const di = $('#ckDate');
      di.addEventListener('change', () => { if (!di.value || di.value > today()) { di.value = UI.draft.date; return; } loadDraftDate(p, di.value); render(); });
      const fq = $('#favQuick'); if (fq) fq.addEventListener('keydown', e => { if (e.key === 'Enter') addFavQuick(p); });
    }
  };
  function moveMonth(d) {
    const [y, m] = UI.cal.split('-').map(Number), nd = new Date(y, m - 1 + d, 1), k = `${nd.getFullYear()}-${pad(nd.getMonth() + 1)}`;
    if (k > today().slice(0, 7)) return;
    UI.cal = k; UI.calDir = d > 0 ? 'cal-anim-l' : 'cal-anim-r'; render();
  }
  function addFavQuick(p) {
    const i = $('#favQuick'), v = i.value.trim(); if (!v) { i.focus(); return; }
    p.favorites.push({ id: uid(), label: v, createdAt: Date.now() }); save(); toast(`Added “${v}”`); render();
  }

  /* ---------- actions ---------- */
  function go(tab) { UI.tab = tab; $('#main').scrollTop = 0; render(); }
  const A = {
    tab: el => go(el.dataset.tab),
    pet: el => { if (S.settings.activePetId === el.dataset.id) return; S.settings.activePetId = el.dataset.id; UI.sel = null; save(); render(); },
    addPet: () => openPetEditor(null),
    editPet: () => openPetEditor(activePet()),
    settings: () => openSettings(),
    restore: () => openImport(),
    sample: () => { seedSample(); render(); toast('Meet Pepper, a sample senior dog'); },
    rate: el => {
      const p = activePet(), r = el.dataset.r, prev = getDay(p.id, UI.sel);
      const note = $('#note') ? $('#note').value : '';
      setDay(p.id, UI.sel, r, note); UI.pendingNote = '';
      buzz(30);
      toast(prev ? (prev.rating === r ? `${LABEL[r]} day saved` : `Changed to ${LABEL[r].toLowerCase()} day`) : `${LABEL[r]} day logged for ${p.name}`);
      render();
    },
    seldate: el => { UI.sel = el.dataset.k; UI.pendingNote = ''; render(); },
    win: el => { UI.win = +el.dataset.n; render(); },
    mon: el => moveMonth(+el.dataset.d),
    day: el => openDay(activePet(), el.dataset.k),
    fav: el => { const d = UI.draft, v = el.dataset.v === '1'; d.fav[el.dataset.id] = d.fav[el.dataset.id] === v ? undefined : v; if (d.fav[el.dataset.id] === undefined) delete d.fav[el.dataset.id]; const row = el.parentNode; $$('button', row).forEach(b => b.classList.toggle('on', d.fav[el.dataset.id] === (b.dataset.v === '1'))); },
    favQuick: () => addFavQuick(activePet()),
    saveCheck: () => {
      const p = activePet(), d = UI.draft;
      const ex = S.checks.find(c => c.petId === p.id && c.date === d.date);
      const scores = {}; CATS.forEach(c => { scores[c.k] = +d.scores[c.k]; });
      const rec = { id: ex ? ex.id : uid(), petId: p.id, date: d.date, scores, total: totalOf(scores), favoritesSeen: Object.assign({}, d.fav) };
      if (ex) S.checks[S.checks.indexOf(ex)] = rec; else S.checks.push(rec);
      save(); UI.draft = null; buzz(30); toast(`Weekly check saved: ${rec.total} / 70`); go('trends');
    },
    range: el => { UI.range = +el.dataset.n; render(); },
    shareSum: () => { shareText(buildSummary(activePet(), UI.range)); },
    copySum: () => copyText(buildSummary(activePet(), UI.range)).then(ok => toast(ok ? 'Summary copied' : 'Could not copy on this device'))
  };
  document.addEventListener('click', e => {
    const tb = e.target.closest('.tabs button'); if (tb) { go(tb.dataset.tab); return; }
    const el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
    if (A[el.dataset.act]) A[el.dataset.act](el, e);
  });

  /* ---------- pet editor ---------- */
  function openPetEditor(pet, onDone) {
    const isNew = !pet;
    const ed = isNew ? { id: uid(), name: '', species: 'dog', birthYear: '', emoji: '🐶', color: COLORS[S.pets.length % COLORS.length], favorites: [], archived: false, memorial: false, createdAt: Date.now() } : JSON.parse(JSON.stringify(pet));
    let emojiTouched = !isNew;
    const yr = new Date().getFullYear();
    const html = () => `<div class="sheet-h"><h2>${isNew ? 'Add a pet' : 'Edit ' + esc(pet.name)}</h2><button class="icon-btn" data-s="close" aria-label="Close">${ICON.close}</button></div>
      <div class="avatar-big" id="pAv" style="${petStyle(ed)}">${ed.emoji}</div>
      <label class="fld"><span>Name</span><input class="inp" id="pName" maxlength="24" placeholder="e.g. Biscuit" value="${esc(ed.name)}" autocomplete="off"></label>
      <div class="fld"><span>Species</span><div class="seg wide" id="pSpecies">${['dog', 'cat', 'other'].map(s => `<button data-s="sp" data-v="${s}" class="${ed.species === s ? 'on' : ''}">${speciesName(s) === 'Pet' ? 'Other' : speciesName(s)}</button>`).join('')}</div></div>
      <label class="fld"><span>Birth year (optional)</span><input class="inp" id="pYear" type="number" inputmode="numeric" min="1980" max="${yr}" placeholder="e.g. 2012" value="${esc(ed.birthYear || '')}"></label>
      <div class="fld"><span>Avatar</span><div class="emoji-grid">${EMOJIS.map(e => `<button data-s="em" data-v="${e}" class="${ed.emoji === e ? 'on' : ''}" aria-label="${e}">${e}</button>`).join('')}</div></div>
      <div class="fld"><span>Color</span><div class="swatches">${COLORS.map(c => `<button data-s="col" data-v="${c}" class="${ed.color === c ? 'on' : ''}" style="--c:${c}" aria-label="Color ${c}"></button>`).join('')}</div></div>
      <div class="fld"><span>Favorite things</span><p class="muted" style="font-size:13.5px;margin:-2px 0 8px">3–5 things they love. You'll tick them off in the weekly check.</p>
        <div id="favList">${ed.favorites.map(f => `<div class="fav-ed"><span>${esc(f.label)}</span><button class="icon-btn" data-s="favDel" data-id="${f.id}" aria-label="Remove ${esc(f.label)}">${ICON.close}</button></div>`).join('')}</div>
        ${ed.favorites.length < 6 ? `<div class="add-row"><input class="inp" id="favIn" maxlength="40" placeholder="e.g. Chasing the ball" enterkeyhint="done"><button class="btn sm" data-s="favAdd">Add</button></div>` : ''}</div>
      ${isNew ? '' : `<button class="switch${ed.memorial ? ' on' : ''}" data-s="mem" id="memSwitch"><div class="t"><b>Memorial mode</b><span>Pause check-ins and keep their days, read-only.</span></div><span class="tog"></span></button>
        <button class="switch${ed.archived ? ' on' : ''}" data-s="arch"><div class="t"><b>Archive</b><span>Hide from the pet switcher. Nothing is deleted.</span></div><span class="tog"></span></button>`}
      <button class="btn primary block" data-s="save" id="pSave" style="margin-top:16px">${isNew ? 'Add pet' : 'Save changes'}</button>
      ${isNew ? '' : '<button class="btn danger block" data-s="del" style="margin-top:10px">Delete pet and all their data</button>'}`;
    const L = openLayer(html(), { full: !isNew || true });
    const sync = () => { ed.name = $('#pName', L.sheet).value; ed.birthYear = $('#pYear', L.sheet).value; };
    const redraw = () => { sync(); const st = L.sheet.scrollTop; L.sheet.innerHTML = html(); L.sheet.scrollTop = st; bindIn(); };
    const addFav = () => { const i = $('#favIn', L.sheet); const v = i && i.value.trim(); if (!v) return; ed.favorites.push({ id: uid(), label: v, createdAt: Date.now() }); redraw(); const ni = $('#favIn', L.sheet); if (ni) ni.focus(); };
    const bindIn = () => { const i = $('#favIn', L.sheet); if (i) i.addEventListener('keydown', e => { if (e.key === 'Enter') addFav(); }); };
    bindIn();
    L.sheet.addEventListener('click', async e => {
      const b = e.target.closest('[data-s]'); if (!b) return;
      const s = b.dataset.s;
      if (s === 'sp') { ed.species = b.dataset.v; if (!emojiTouched) ed.emoji = SPECIES_EMOJI[ed.species]; redraw(); }
      else if (s === 'em') { ed.emoji = b.dataset.v; emojiTouched = true; redraw(); }
      else if (s === 'col') { ed.color = b.dataset.v; redraw(); }
      else if (s === 'favAdd') addFav();
      else if (s === 'favDel') { ed.favorites = ed.favorites.filter(f => f.id !== b.dataset.id); redraw(); }
      else if (s === 'mem') {
        sync();
        if (!ed.memorial) {
          const ok = await confirmDlg({ title: `Keep ${possessive(ed.name || 'their')} days as a memorial?`, text: 'Check-ins will be paused and everything you logged stays here, read-only. You can turn this off at any time.', ok: 'Keep as memorial', cancel: 'Not now' });
          if (!ok) return;
        }
        ed.memorial = !ed.memorial; redraw();
      }
      else if (s === 'arch') { ed.archived = !ed.archived; redraw(); }
      else if (s === 'save') {
        sync();
        ed.name = ed.name.trim();
        if (!ed.name) { toast('Please add a name'); $('#pName', L.sheet).focus(); return; }
        const by = parseInt(ed.birthYear, 10); ed.birthYear = by >= 1980 && by <= yr ? by : null;
        const i = S.pets.findIndex(x => x.id === ed.id);
        if (i >= 0) S.pets[i] = ed; else S.pets.push(ed);
        if (isNew || (!ed.archived && !activePet())) S.settings.activePetId = ed.id;
        if (ed.archived && S.settings.activePetId === ed.id) { const v = visiblePets()[0]; S.settings.activePetId = v ? v.id : null; }
        UI.draft = null; save(); closeLayer(L);
        toast(isNew ? `Welcome, ${ed.name}` : 'Saved');
        if (isNew) { UI.tab = 'today'; UI.sel = null; }
        render(); onDone && onDone();
      }
      else if (s === 'del') {
        const ok = await confirmDlg({ title: `Delete ${pet.name}?`, text: `This removes ${possessive(pet.name)} profile, every logged day and every weekly check. If you'd like to keep them, try memorial mode or archive instead.`, ok: 'Delete', danger: true });
        if (!ok) return;
        S.pets = S.pets.filter(x => x.id !== pet.id); delete S.days[pet.id]; S.checks = S.checks.filter(c => c.petId !== pet.id);
        if (S.settings.activePetId === pet.id) S.settings.activePetId = null;
        UI.draft = null; save(); closeLayer(L); toast(`${pet.name} was removed`); render(); onDone && onDone();
      }
    });
  }

  /* ---------- settings ---------- */
  function openSettings() {
    const html = () => {
      const pets = S.pets;
      return `<div class="sheet-h"><h2>Pets & settings</h2><button class="icon-btn" data-s="close" aria-label="Close">${ICON.close}</button></div>
        <p class="sec-t">Your pets</p>
        ${pets.map(p => `<button class="prow" data-s="edit" data-id="${p.id}" style="${petStyle(p)}"><span class="em">${p.emoji}</span><span class="t"><b>${esc(p.name)}${p.memorial ? '<span class="badge">In memory</span>' : ''}${p.archived ? '<span class="badge gray">Archived</span>' : ''}</b><span>${[speciesName(p.species), ageText(p), `${Object.keys(S.days[p.id] || {}).length} days logged`].filter(Boolean).join(' · ')}</span></span>${ICON.chev}</button>`).join('') || '<p class="muted">No pets yet.</p>'}
        <button class="btn ghost block" data-s="add" style="margin-top:4px">+ Add a pet</button>
        <p class="sec-t">Your data</p>
        <p class="muted" style="font-size:14px;margin-bottom:10px">Everything stays on this phone. ${S.settings.lastBackupAt ? `Last backup: ${fYear(dkey(new Date(S.settings.lastBackupAt)))}.` : 'Make a backup now and then, so nothing is lost if you change phones.'}</p>
        <div class="btn-row" style="margin-bottom:10px"><button class="btn" data-s="export">Export backup</button><button class="btn" data-s="import">Import backup</button></div>
        <button class="btn danger block" data-s="reset">Reset everything</button>
        <p class="sec-t">About</p>
        <p class="muted" style="font-size:14px">Good Days follows the advice many vets and hospice services give: mark each day as good or bad, and watch whether bad days begin to outnumber good ones over one to two weeks. The weekly check uses the HHHHHMM quality-of-life scale (Hurt, Hunger, Hydration, Hygiene, Happiness, Mobility, More good days than bad).</p>
        <p class="muted" style="font-size:14px;margin-top:10px">This app does not give medical advice. It helps you notice, and helps you share what you notice with your vet.</p>
        <p class="tiny">Good Days · works fully offline</p>`;
    };
    const L = openLayer(html(), { full: true });
    const refresh = () => { if (stack.includes(L)) { L.sheet.innerHTML = html(); } };
    L.sheet.addEventListener('click', async e => {
      const b = e.target.closest('[data-s]'); if (!b) return;
      const s = b.dataset.s;
      if (s === 'edit') openPetEditor(S.pets.find(p => p.id === b.dataset.id), refresh);
      else if (s === 'add') openPetEditor(null, refresh);
      else if (s === 'export') openExport(refresh);
      else if (s === 'import') openImport(() => closeLayer(L));
      else if (s === 'reset') {
        const ok = await confirmDlg({ title: 'Reset everything?', text: 'This permanently erases all pets, logged days and weekly checks on this phone. Consider exporting a backup first.', ok: 'Erase all data', danger: true });
        if (!ok) return;
        S = blank(); UI.draft = null; UI.sel = null; UI.tab = 'today'; save(); closeLayer(L); render(); toast('All data erased');
      }
    });
  }
  function openExport(onDone) {
    const json = JSON.stringify(S, null, 2);
    const L = openLayer(`<div class="sheet-h"><h2>Export backup</h2><button class="icon-btn" data-s="close" aria-label="Close">${ICON.close}</button></div>
      <p class="muted" style="font-size:14px;margin-bottom:12px">Copy this text and keep it somewhere safe (a note, an email to yourself). Paste it into Import to restore.</p>
      <textarea class="inp code" id="exportText" readonly>${esc(json)}</textarea>
      <div class="btn-row" style="margin-top:12px"><button class="btn primary" data-s="copy" id="expCopy">${ICON.copy}Copy</button><button class="btn" data-s="share">${ICON.share}Share</button></div>`, { full: true });
    const mark = () => { S.settings.lastBackupAt = Date.now(); save(); onDone && onDone(); };
    L.sheet.addEventListener('click', e => {
      const b = e.target.closest('[data-s]'); if (!b) return;
      if (b.dataset.s === 'copy') copyText(json).then(ok => { toast(ok ? 'Backup copied' : 'Select the text and copy it manually'); if (ok) mark(); });
      if (b.dataset.s === 'share') { shareText(json); mark(); }
    });
  }
  function openImport(onDone) {
    const L = openLayer(`<div class="sheet-h"><h2>Import backup</h2><button class="icon-btn" data-s="close" aria-label="Close">${ICON.close}</button></div>
      <p class="muted" style="font-size:14px;margin-bottom:12px">Paste a backup you exported from Good Days. This replaces the data currently on this phone.</p>
      <textarea class="inp code" id="importText" placeholder='{"pets": [...], "days": {...}, "checks": [...]}'></textarea>
      <button class="btn primary block" data-s="go" id="impGo" style="margin-top:12px">Restore backup</button>`, { full: true });
    L.sheet.addEventListener('click', async e => {
      const b = e.target.closest('[data-s="go"]'); if (!b) return;
      let data;
      try { data = JSON.parse($('#importText', L.sheet).value); } catch (err) { toast('That doesn’t look like a Good Days backup'); return; }
      if (!data || !Array.isArray(data.pets)) { toast('That doesn’t look like a Good Days backup'); return; }
      const n = normalize(data);
      const ok = await confirmDlg({ title: 'Replace current data?', text: `This backup has ${n.pets.length} pet${n.pets.length === 1 ? '' : 's'}, ${Object.values(n.days).reduce((t, d) => t + Object.keys(d || {}).length, 0)} logged days and ${n.checks.length} weekly checks.`, ok: 'Restore' });
      if (!ok) return;
      S = n; UI.draft = null; UI.sel = null; UI.tab = 'today'; save(); closeLayer(L); onDone && onDone(); render(); toast('Backup restored');
    });
  }

  /* ---------- sample data ---------- */
  function seedSample() {
    const t = today(), id = uid();
    const fav = ['Greeting at the door', 'Chasing the ball', 'Begging at dinner', 'Napping in the sun'].map((l, i) => ({ id: id + 'f' + i, label: l, createdAt: Date.now() }));
    S.pets.push({ id, name: 'Pepper', species: 'dog', birthYear: new Date().getFullYear() - 14, emoji: '🐕', color: '#E8B86B', favorites: fav, archived: false, memorial: false, createdAt: Date.now() });
    const pattern = 'gggmggggmgggbgmggmgmbgmmbgbm'.split(''); // oldest to newest, 28 days
    const notes = { 3: 'Slow on the morning walk', 12: 'Skipped breakfast, ate dinner', 20: 'Stiff getting up after nap', 24: "Wouldn't climb the stairs", 26: 'Ate well, tail wagging at dinner' };
    S.days[id] = {};
    pattern.forEach((r, i) => {
      const k = addDays(t, -(pattern.length - i));
      S.days[id][k] = { rating: { g: 'good', m: 'meh', b: 'bad' }[r], note: notes[i] || '', updatedAt: Date.now() };
    });
    const mk = (ago, sc, seen) => { const scores = {}; CATS.forEach((c, i) => { scores[c.k] = sc[i]; }); S.checks.push({ id: uid(), petId: id, date: addDays(t, -ago), scores, total: totalOf(scores), favoritesSeen: seen }); };
    mk(22, [8, 8, 8, 7, 8, 6, 8], { [fav[0].id]: true, [fav[1].id]: true, [fav[2].id]: true, [fav[3].id]: true });
    mk(15, [7, 7, 8, 7, 7, 5, 7], { [fav[0].id]: true, [fav[1].id]: true, [fav[2].id]: true, [fav[3].id]: true });
    mk(8, [6, 6, 7, 6, 6, 3, 6], { [fav[0].id]: true, [fav[1].id]: false, [fav[2].id]: true, [fav[3].id]: true });
    S.settings.activePetId = id; save();
  }

  /* ---------- Android back ---------- */
  window.onAndroidBack = function () {
    if (stack.length) { closeLayer(); return true; }
    if (!$('#welcome').hidden) return false;
    if (UI.tab !== 'today') { go('today'); return true; }
    return false;
  };

  // refresh "today" if the app stays open past midnight
  let lastDay = today();
  document.addEventListener('visibilitychange', () => { if (!document.hidden && today() !== lastDay) { lastDay = today(); UI.sel = null; UI.draft = null; render(); } });

  render();
})();
