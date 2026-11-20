(() => {
  'use strict';

  const KEY = 'beanAppetit.v1';
  const SEASONS = [
    { k: 'spring', c: 'sp' },
    { k: 'summer', c: 'su' },
    { k: 'autumn', c: 'au' },
    { k: 'winter', c: 'wi' }
  ];
  const BEAN_COLOURS = ['#f4c4bf', '#e9bdb8', '#f8dcb0', '#c9e3c5', '#d3cbec', '#f4e7a8'];

  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pretty = t => String(t || '').replace(/_/g, ' ');
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  /* ---------- Language ---------- */
  const L = () => window.I18N[S.lang] || window.I18N.en;
  const t = (key, vars) => {
    let v = L()[key];
    if (v === undefined) v = window.I18N.en[key];
    if (v === undefined) return key;
    return typeof v === 'string' && vars ? v.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? '')) : v;
  };
  const dayName = i => L().days[i];
  const dayShort = i => L().days_short[i];
  const dname = d => (S.lang === 'sk' && window.SK_DISHES && window.SK_DISHES[d.name]) || d.name;
  const beanName = k => (L().bean && L().bean[k]) || cap(pretty(k));
  const guessLang = () => ((navigator.language || '').toLowerCase().startsWith('sk') ? 'sk' : 'en');

  /* ---------- Dates ---------- */
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const fromIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const today = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
  function upcomingSaturday() {
    const d = today();
    return addDays(d, (6 - d.getDay() + 7) % 7);
  }
  const fmtShort = d => d.toLocaleDateString(L().locale, { day: 'numeric', month: 'short' });
  function seasonNow() {
    const m = new Date().getMonth();
    if (m >= 2 && m <= 4) return 'spring';
    if (m >= 5 && m <= 7) return 'summer';
    if (m >= 8 && m <= 10) return 'autumn';
    return 'winter';
  }

  /* ---------- State ---------- */
  const blankDay = () => ({ dish: null, locked: false, off: false, offLabel: '', note: '', bake: null, sweet: null });
  const defaults = () => ({
    lang: guessLang(), season: seasonNow(), diet: 'fish', dinners: false,
    week: null, weekStart: null, boost: false,
    favs: {}, less: {}, hidden: {}, beanOv: {}, custom: [], history: []
  });

  function load() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* storage unavailable */ } }

  let S = Object.assign(defaults(), load() || {});

  /* ---------- Dishes ---------- */
  let byId = new Map();
  function allDishes() {
    const list = window.DISHES.concat(S.custom || []).map(d => {
      const ov = S.beanOv[d.id];
      if (ov === undefined) return d;
      return Object.assign({}, d, { bean: ov ? (d.bean || 'beans') : null });
    });
    byId = new Map(list.map(d => [d.id, d]));
    return list;
  }
  const isBean = d => !!(d && d.bean);
  const sc = () => SEASONS.find(s => s.k === S.season).c;

  function candidates(beanOnly) {
    const code = sc();
    return allDishes().filter(d => {
      if (S.hidden[d.id]) return false;
      if (d.seasons.length && !d.seasons.includes(code)) return false;
      if (S.diet === 'veg' && d.protein !== 'veg') return false;
      if (S.diet === 'fish' && d.protein === 'meat') return false;
      if (!S.dinners && d.dinner) return false;
      if (beanOnly && !isBean(d)) return false;
      return true;
    });
  }

  const weight = d => (S.favs[d.id] ? 3 : S.less[d.id] ? 0.25 : 1);
  function pick(arr) {
    if (!arr.length) return null;
    const total = arr.reduce((t, d) => t + weight(d), 0);
    let r = Math.random() * total;
    for (const d of arr) { r -= weight(d); if (r <= 0) return d; }
    return arr[arr.length - 1];
  }

  /* ---------- Week handling ---------- */
  function ensureWeek() {
    const stale = !S.weekStart || today() > addDays(fromIso(S.weekStart), 6);
    if (!S.week || S.week.length !== 7 || stale) {
      S.week = Array.from({ length: 7 }, blankDay);
      S.weekStart = iso(upcomingSaturday());
      S.boost = false;
      return true;
    }
    return false;
  }

  function recentIds() {
    return new Set(
      (S.history || [])
        .filter(h => h.start !== S.weekStart)
        .sort((a, b) => a.start.localeCompare(b.start))
        .slice(-2)
        .flatMap(h => h.ids)
    );
  }
  function recordHistory() {
    const ids = S.week.map(d => d.dish).filter(Boolean);
    S.history = (S.history || []).filter(h => h.start !== S.weekStart);
    S.history.push({ start: S.weekStart, ids });
    S.history = S.history.slice(-8);
  }

  function generate(beanOnly) {
    ensureWeek();
    const wk = S.week;
    const targets = wk.map((_, i) => i).filter(i => !wk[i].locked && !wk[i].off);
    const keep = new Set(wk.filter(d => d.locked && d.dish).map(d => d.dish));
    const all = candidates(beanOnly);
    if (!all.length) { toast(t('t_nomatch')); return; }

    const pool = all.filter(d => !keep.has(d.id));
    const recent = recentIds();
    const fresh = pool.filter(d => !recent.has(d.id));
    const src = fresh.length >= targets.length ? fresh : pool;
    const used = new Set();
    let repeats = false;

    targets.forEach(i => {
      let opts = src.filter(d => !used.has(d.id));
      if (!opts.length) opts = pool.filter(d => !used.has(d.id));
      if (!opts.length) { opts = all; repeats = true; }
      const d = pick(opts);
      used.add(d.id);
      wk[i].dish = d.id;
    });

    S.boost = !!beanOnly;
    recordHistory();
    save(); render();
    if (repeats) toast(t('t_repeat'));
  }

  function reroll(i) {
    const wk = S.week;
    const inWeek = new Set(wk.map(d => d.dish));
    const all = candidates(S.boost);
    const recent = recentIds();
    let opts = all.filter(d => !inWeek.has(d.id) && !recent.has(d.id));
    if (!opts.length) opts = all.filter(d => !inWeek.has(d.id));
    if (!opts.length) opts = all.filter(d => d.id !== wk[i].dish);
    const d = pick(opts);
    if (!d) { toast(t('t_noother')); return; }
    wk[i].dish = d.id;
    wk[i].off = false;
    recordHistory(); save(); render();
  }

  function addExtra(kind) {
    ensureWeek();
    const wk = S.week;
    const free = wk.map((_, i) => i).filter(i => !wk[i].off && !wk[i][kind]);
    if (!free.length) { toast(t('t_every')); return; }
    const code = sc();
    const taken = new Set(wk.map(d => d[kind]).filter(Boolean));
    let opts = window.EXTRAS.filter(e => e.kind === kind && (!e.seasons.length || e.seasons.includes(code)) && !taken.has(e.id));
    if (!opts.length) opts = window.EXTRAS.filter(e => e.kind === kind);
    const e = opts[Math.floor(Math.random() * opts.length)];
    const i = free[Math.floor(Math.random() * free.length)];
    wk[i][kind] = e.id;
    save(); render();
    toast(t('t_added_to', { name: dname(e), day: dayName(i) }));
  }
  const extraById = id => window.EXTRAS.find(e => e.id === id);

  /* ---------- Rendering ---------- */
  const ICONS = {
    lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    unlock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/></svg>',
    swap: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0 1 14-5.3L20 9"/><path d="M20 4v5h-5"/><path d="M20 12a8 8 0 0 1-14 5.3L4 15"/><path d="M4 20v-5h5"/></svg>',
    heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
    more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/></svg>'
  };

  function sourceHtml(src) {
    if (!src) return '';
    if (/^https?:\/\//.test(src)) {
      let host = 'recipe';
      try { host = new URL(src).hostname.replace(/^www\./, ''); } catch { /* keep default */ }
      return `<a href="${esc(src)}" target="_blank" rel="noopener">${esc(t('recipe_on', { host }))}</a>`;
    }
    return esc(src === 'My recipe' ? t('my_recipe') : src);
  }

  function renderSeasons() {
    $('#seasons').innerHTML = SEASONS.map(s =>
      `<button type="button" role="radio" class="season" data-s="${s.k}" aria-checked="${S.season === s.k}">${esc(t(s.k))}</button>`
    ).join('');
    document.body.dataset.season = S.season;
  }

  function dayRow(d, i, start) {
    const date = fmtShort(addDays(start, i));
    const dish = d.dish ? byId.get(d.dish) : null;
    const extras = ['bake', 'sweet'].map(k => {
      const e = d[k] && extraById(d[k]);
      return e ? `<span class="chip ${k}">${esc(dname(e))}<button type="button" data-act="rmextra" data-k="${k}" data-i="${i}" aria-label="${esc(t('remove', { name: dname(e) }))}">&times;</button></span>` : '';
    }).join('');
    let body;
    if (d.off) {
      body = `<p class="dish-name off">${esc(d.offLabel || t('eating_out_default'))}</p>`;
    } else if (dish) {
      const chip = isBean(dish) ? `<span class="chip bean">${esc(beanName(dish.bean))}</span>` : '';
      body = `<p class="dish-name">${esc(dname(dish))}</p>` +
        (dish.source ? `<p class="src">${sourceHtml(dish.source)}</p>` : '') +
        (chip || extras ? `<div class="chips">${chip}${extras}</div>` : '');
    } else {
      body = `<p class="dish-name empty">${esc(t('nothing_yet'))}</p>`;
    }
    const note = d.note ? `<p class="note">${esc(d.note)}</p>` : '';
    const extrasWhenOff = d.off && extras ? `<div class="chips">${extras}</div>` : '';
    const fav = dish && S.favs[dish.id];
    return `<li class="day${d.locked ? ' locked' : ''}" data-i="${i}">
      <div class="day-name"><b>${esc(dayShort(i))}</b><small>${date}</small></div>
      <div class="day-body">${body}${extrasWhenOff}${note}</div>
      <div class="icons">
        <button class="icon-btn lock" type="button" data-act="lock" aria-pressed="${d.locked}" aria-label="${esc(t(d.locked ? 'unlock_aria' : 'lock_aria', { day: dayName(i) }))}" title="${esc(d.locked ? t('unlock') : t('lock_day'))}">${d.locked ? ICONS.lock : ICONS.unlock}</button>
        <button class="icon-btn" type="button" data-act="reroll" aria-label="${esc(t('swap_aria', { day: dayName(i) }))}" title="${esc(t('swap_title'))}" ${d.locked || d.off ? 'disabled style="opacity:.35;cursor:default"' : ''}>${ICONS.swap}</button>
        ${dish && !d.off ? `<button class="icon-btn fav" type="button" data-act="fav" aria-pressed="${!!fav}" aria-label="${esc(t('fav'))}" title="${esc(t('fav'))}">${ICONS.heart}</button>` : ''}
        <button class="icon-btn" type="button" data-act="more" aria-label="${esc(t('more_aria', { day: dayName(i) }))}" title="${esc(t('more'))}">${ICONS.more}</button>
      </div>
    </li>`;
  }

  function renderBeanCount() {
    const wk = S.week;
    const n = wk.filter(d => !d.off && d.dish && isBean(byId.get(d.dish))).length;
    const types = [...new Set(wk.filter(d => !d.off && d.dish).map(d => byId.get(d.dish)).filter(isBean).map(d => d.bean).filter(b => b !== 'beans'))].map(b => beanName(b).toLowerCase());
    const dots = wk.map(d => `<i class="${!d.off && d.dish && isBean(byId.get(d.dish)) ? 'on' : ''}"></i>`).join('');
    let line;
    if (n === 7) line = t('full_bean');
    else if (n === 0) line = t('no_beans');
    else line = types.length ? t('lineup', { list: listJoin(types) }) : t('beans_on_menu');
    if (n === 7 && types.length) line = t('full_bean_list', { list: listJoin(types) });
    $('#beanCount').innerHTML = `<div class="dots" aria-hidden="true">${dots}</div><strong>${esc(t('beans_of', { n }))}</strong><p>${esc(line)}</p>`;
  }
  function listJoin(a) {
    if (a.length <= 1) return a.join('');
    return a.slice(0, -1).join(', ') + ' ' + t('and') + ' ' + a[a.length - 1];
  }

  function render() {
    allDishes();
    ensureWeek();
    renderSeasons();
    $('#diet').value = S.diet;
    $('#dinners').checked = S.dinners;
    const start = fromIso(S.weekStart);
    const dateOpts = S.lang === 'sk' ? { day: 'numeric', month: 'long' } : { weekday: 'long', day: 'numeric', month: 'long' };
    $('#weekTitle').textContent = t('week_of', { date: start.toLocaleDateString(L().locale, dateOpts) });
    $('#boostFlag').hidden = !S.boost;
    $('#boost').setAttribute('aria-pressed', String(!!S.boost));
    $('#boostLabel').textContent = S.boost ? t('boosted') : t('boost');
    $('#days').innerHTML = S.week.map((d, i) => dayRow(d, i, start)).join('');
    renderBeanCount();
  }

  /* ---------- Toast, burst ---------- */
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
  }
  function burst() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const layer = $('#burst');
    for (let i = 0; i < 30; i++) {
      const b = document.createElement('i');
      b.className = 'fb';
      b.style.left = Math.random() * 100 + 'vw';
      b.style.animationDelay = Math.random() * 0.6 + 's';
      b.style.setProperty('--r', (Math.random() * 720 - 360) + 'deg');
      b.style.background = BEAN_COLOURS[i % BEAN_COLOURS.length];
      b.style.transform = `rotate(${Math.random() * 90}deg)`;
      layer.appendChild(b);
      setTimeout(() => b.remove(), 3200);
    }
  }

  /* ---------- Day dialog ---------- */
  let editing = -1;
  function openDay(i) {
    editing = i;
    const d = S.week[i];
    $('#dayDlgTitle').textContent = dayName(i);
    const list = allDishes().filter(x => !S.hidden[x.id]).sort((a, b) => dname(a).localeCompare(dname(b), L().locale));
    $('#dayDish').innerHTML = `<option value="">${esc(t('nothing_picked_opt'))}</option>` +
      list.map(x => `<option value="${esc(x.id)}">${esc(dname(x))}</option>`).join('');
    $('#dayDish').value = d.dish || '';
    $('#dayOff').checked = d.off;
    $('#dayOffLabel').value = d.offLabel || '';
    $('#dayNote').value = d.note || '';
    $('#dayLess').checked = !!(d.dish && S.less[d.dish]);
    toggleOffLabel();
    $('#dayDlg').showModal();
  }
  function toggleOffLabel() { $('#dayOffLabelWrap').style.display = $('#dayOff').checked ? '' : 'none'; }

  $('#dayOff').addEventListener('change', toggleOffLabel);
  $('#dayForm').addEventListener('submit', e => {
    e.preventDefault();
    const d = S.week[editing];
    d.dish = $('#dayDish').value || null;
    d.off = $('#dayOff').checked;
    d.offLabel = $('#dayOffLabel').value.trim();
    d.note = $('#dayNote').value.trim();
    if (d.dish) {
      if ($('#dayLess').checked) { S.less[d.dish] = true; delete S.favs[d.dish]; } else delete S.less[d.dish];
    }
    recordHistory(); save(); render();
    $('#dayDlg').close();
  });

  /* ---------- Add dish ---------- */
  $('#addForm').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('#addName').value.trim();
    if (!name) return;
    const seasons = [...document.querySelectorAll('input[name="addSeason"]:checked')].map(x => x.value);
    const dish = {
      id: 'c-' + Date.now().toString(36),
      name,
      source: $('#addSource').value.trim(),
      bean: $('#addBean').value || null,
      seasons,
      protein: $('#addProtein').value,
      dinner: $('#addDinner').checked,
      custom: true
    };
    S.custom.push(dish);
    S.favs[dish.id] = true; // new additions get a little boost so they show up soon
    save(); render();
    $('#addForm').reset();
    $('#addDlg').close();
    toast(t('t_added', { name }));
  });

  /* ---------- Manage dishes ---------- */
  function renderManage() {
    const q = $('#manageSearch').value.trim().toLowerCase();
    const list = allDishes()
      .filter(d => !q || d.name.toLowerCase().includes(q) || dname(d).toLowerCase().includes(q) || (d.source || '').toLowerCase().includes(q))
      .sort((a, b) => dname(a).localeCompare(dname(b), L().locale));
    $('#manageList').innerHTML = list.map(d => {
      const seasons = d.seasons.length ? d.seasons.map(c => t(SEASONS.find(s => s.c === c).k)).join(', ') : t('all_year');
      const meta = [seasons, d.protein === 'veg' ? t('meta_veg') : d.protein === 'fish' ? t('meta_fish') : t('meta_meat'), d.dinner ? t('meta_dinner') : '', d.custom ? t('meta_yours') : ''].filter(Boolean).join(' · ');
      return `<li class="${S.hidden[d.id] ? 'hidden-dish' : ''}" data-id="${esc(d.id)}">
        <div><div class="m-name">${esc(dname(d))}</div><div class="m-meta">${esc(meta)}</div></div>
        <div class="m-tools">
          <label class="check"><input type="checkbox" data-m="bean" ${isBean(d) ? 'checked' : ''}><span>${esc(t('bean_word'))}</span></label>
          <button class="tool" type="button" data-m="fav" aria-pressed="${!!S.favs[d.id]}">${esc(t('love'))}</button>
          <button class="tool less" type="button" data-m="less" aria-pressed="${!!S.less[d.id]}">${esc(t('less'))}</button>
          <button class="tool hide" type="button" data-m="hide" aria-pressed="${!!S.hidden[d.id]}">${esc(S.hidden[d.id] ? t('hidden') : t('hide'))}</button>
          ${d.custom ? `<button class="tool" type="button" data-m="del">${esc(t('del'))}</button>` : ''}
        </div></li>`;
    }).join('') || `<li><span class="m-meta">${esc(t('no_match'))}</span></li>`;
  }
  $('#manageSearch').addEventListener('input', renderManage);
  $('#manageList').addEventListener('click', e => {
    const el = e.target.closest('[data-m]');
    if (!el) return;
    const id = el.closest('li').dataset.id;
    const m = el.dataset.m;
    if (m === 'fav') { S.favs[id] ? delete S.favs[id] : (S.favs[id] = true, delete S.less[id]); }
    else if (m === 'less') { S.less[id] ? delete S.less[id] : (S.less[id] = true, delete S.favs[id]); }
    else if (m === 'hide') { S.hidden[id] ? delete S.hidden[id] : (S.hidden[id] = true); }
    else if (m === 'del') {
      if (!confirm(t('t_confirm_del'))) return;
      S.custom = S.custom.filter(d => d.id !== id);
      S.week.forEach(d => { if (d.dish === id) d.dish = null; });
    } else return;
    save(); renderManage(); render();
  });
  $('#manageList').addEventListener('change', e => {
    const el = e.target.closest('[data-m="bean"]');
    if (!el) return;
    S.beanOv[el.closest('li').dataset.id] = el.checked;
    save(); render();
  });

  /* ---------- Backup ---------- */
  $('#exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'bean-appetit-backup.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('#importFile').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (typeof data !== 'object' || !data) throw new Error('bad');
      S = Object.assign(defaults(), data);
      save(); render();
      $('#backupDlg').close();
      toast(t('t_restored'));
    } catch { toast(t('t_badfile')); }
    e.target.value = '';
  });

  /* ---------- Copy ---------- */
  function weekText() {
    const start = fromIso(S.weekStart);
    const lines = [t('copy_head', { app: $('#appName').textContent, date: fmtShort(start) }), ''];
    S.week.forEach((d, i) => {
      const dish = d.dish && byId.get(d.dish);
      let line = d.off ? (d.offLabel || t('eating_out_default')) : dish ? dname(dish) + (dish.source && !/^https?:/.test(dish.source) ? ` (${dish.source === 'My recipe' ? t('my_recipe') : dish.source})` : '') : '-';
      const ex = ['bake', 'sweet'].map(k => d[k] && extraById(d[k]) && dname(extraById(d[k]))).filter(Boolean);
      if (ex.length) line += ` + ${ex.join(', ')}`;
      if (d.note) line += ` [${d.note}]`;
      lines.push(`${dayShort(i)}: ${line}`);
    });
    return lines.join('\n');
  }
  async function copyText() {
    const txt = weekText();
    try { await navigator.clipboard.writeText(txt); toast(t('t_copied')); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = txt; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast(t('t_copied')); } catch { toast(t('t_nocopy')); }
      ta.remove();
    }
  }

  /* ---------- Events ---------- */
  $('#seasons').addEventListener('click', e => {
    const b = e.target.closest('.season');
    if (!b) return;
    S.season = b.dataset.s;
    save(); renderSeasons();
    toast(t('t_season', { season: t(S.season) }));
  });
  $('#diet').addEventListener('change', e => { S.diet = e.target.value; save(); });
  $('#dinners').addEventListener('change', e => { S.dinners = e.target.checked; save(); });
  $('#gen').addEventListener('click', () => generate(false));
  function flash(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth; // restart the animation
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), 1400);
  }
  $('#boost').addEventListener('click', () => {
    generate(true);
    if (!S.boost) return;
    flash($('#boost'), 'pop');
    flash($('#menu'), 'boosted');
    burst();
    toast(t('t_boost'));
    // On small screens the menu sits below the buttons, so bring it into view.
    const r = $('#menu').getBoundingClientRect();
    if (r.top > window.innerHeight * 0.6) {
      $('#menu').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    }
  });
  $('#addBake').addEventListener('click', () => addExtra('bake'));
  $('#addSweet').addEventListener('click', () => addExtra('sweet'));
  $('#copy').addEventListener('click', copyText);
  $('#print').addEventListener('click', () => window.print());
  $('#openAdd').addEventListener('click', () => $('#addDlg').showModal());
  $('#openManage').addEventListener('click', () => { $('#manageSearch').value = ''; renderManage(); $('#manageDlg').showModal(); });
  $('#openBackup').addEventListener('click', () => $('#backupDlg').showModal());

  document.addEventListener('click', e => {
    const c = e.target.closest('[data-close]');
    if (c) c.closest('dialog').close();
    if (e.target.tagName === 'DIALOG') e.target.close();
  });

  $('#days').addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const i = Number(b.dataset.i ?? b.closest('.day').dataset.i);
    const d = S.week[i];
    switch (b.dataset.act) {
      case 'lock': d.locked = !d.locked; save(); render(); break;
      case 'reroll': if (!d.locked && !d.off) reroll(i); break;
      case 'fav': if (d.dish) { S.favs[d.dish] ? delete S.favs[d.dish] : (S.favs[d.dish] = true, delete S.less[d.dish]); save(); render(); } break;
      case 'more': openDay(i); break;
      case 'rmextra': d[b.dataset.k] = null; save(); render(); break;
    }
  });

  /* ---------- Language switching ---------- */
  function applyStatic() {
    document.documentElement.lang = S.lang;
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
    document.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
    document.querySelectorAll('#addBean option[value]:not([value=""])').forEach(o => { o.textContent = beanName(o.value); });
    document.querySelectorAll('#lang [data-lang]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === S.lang)));
    $('#appName').textContent = window.APP_NAME;
    document.title = window.APP_NAME;
  }
  $('#lang').addEventListener('click', e => {
    const b = e.target.closest('[data-lang]');
    if (!b || b.dataset.lang === S.lang) return;
    S.lang = b.dataset.lang;
    save(); applyStatic(); render();
    if ($('#manageDlg').open) renderManage();
    if ($('#dayDlg').open) $('#dayDlg').close();
  });

  /* ---------- Boot ---------- */
  applyStatic();
  const fresh = ensureWeek();
  allDishes();
  if (fresh || !S.week.some(d => d.dish)) generate(false);
  else render();
})();
