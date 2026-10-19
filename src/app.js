import { parseCapture, resolveCat, renderInline, renderBlock, toggleCheckLine, escapeHtml, fold } from './parse.js';
import { train, predict } from './classify.js';
import { localBackend, firestoreBackend } from './backends.js';
import { firebaseConfig } from './config.js';

const $ = (s) => document.querySelector(s);
const els = {
  cap: $('#cap'), route: $('#route'), tabs: $('#tabs'), search: $('#search'), list: $('#list'),
  empty: $('#empty'), toast: $('#toast'), menu: $('#menu'), sync: $('#sync'), share: $('#share'),
};

const INBOX = 'Inbox';
// tab: 'all' | 'inbox' | 'archive' | 'c:<category>'
const state = { items: new Map(), tab: 'all', query: '', open: new Set(), editTitle: null, editDesc: null, fresh: null };
const nodes = new Map();
let backend;
let model = train([]);
let undoFn = null;

const safeGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const safeSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

function uid(bytes = 16) {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// The space id in the URL hash is the shared secret: whoever has the link can edit.
function getSpace() {
  let s = location.hash.slice(1);
  if (!/^[\w-]{20,}$/.test(s)) {
    s = safeGet('todosmart:last') ?? uid();
    history.replaceState(null, '', `#${s}`);
  }
  safeSet('todosmart:last', s);
  return s;
}

/* ---------- Time ---------- */

const fmt = (o) => new Intl.DateTimeFormat('fr-FR', o);
const fTime = fmt({ hour: '2-digit', minute: '2-digit' });
const fDay = fmt({ weekday: 'short', day: 'numeric', month: 'short' });
const fDayY = fmt({ day: 'numeric', month: 'short', year: 'numeric' });
const fLong = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
const fFull = fmt({ dateStyle: 'full', timeStyle: 'medium' });
const dayStart = (t) => new Date(t).setHours(0, 0, 0, 0);

function when(t) {
  const d = (dayStart(Date.now()) - dayStart(t)) / 864e5;
  if (d === 0) return fTime.format(t);
  if (d === 1) return `hier ${fTime.format(t)}`;
  const sameYear = new Date(t).getFullYear() === new Date().getFullYear();
  return `${(sameYear ? fDay : fDayY).format(t)} ${fTime.format(t)}`;
}
function dayLabel(t) {
  const d = (dayStart(Date.now()) - dayStart(t)) / 864e5;
  return d === 0 ? "Aujourd'hui" : d === 1 ? 'Hier' : fLong.format(t);
}

/* ---------- Data ---------- */

const all = () => [...state.items.values()];
const catOfTab = (tab) => (tab.startsWith('c:') ? tab.slice(2) : undefined);
function allCats() {
  return [...new Set(all().map((i) => i.cat).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
}
function inTab(it, tab = state.tab) {
  if (tab === 'archive') return !!it.doneAt;
  if (it.doneAt) return false;
  if (tab === 'all') return true;
  if (tab === 'inbox') return !it.cat;
  return it.cat === catOfTab(tab);
}

function update(it, patch) {
  backend.put({ ...it, ...patch, updatedAt: Date.now() });
}

// Where a capture will land: explicit #tag > current tab > learned guess > Inbox.
function routeFor(p) {
  if (p.tag) return { cat: resolveCat(p.tag, allCats()), how: 'tag' };
  if (state.tab === 'inbox') return { cat: null, how: 'tab' };
  const c = catOfTab(state.tab);
  if (c) return { cat: c, how: 'tab' };
  const g = predict(model, `${p.title} ${p.desc}`);
  return g ? { cat: g.cat, how: 'auto' } : { cat: null, how: 'none' };
}

function capture() {
  const p = parseCapture(els.cap.value);
  if (!p.title && !p.desc) return;
  if (!p.title) [p.title, p.desc] = [p.desc.split('\n')[0], p.desc.split('\n').slice(1).join('\n')];
  const r = routeFor(p);
  const t = Date.now();
  const item = { id: uid(9), title: p.title, desc: p.desc, cat: r.cat, auto: r.how === 'auto', createdAt: t, updatedAt: t, doneAt: null };
  state.fresh = item.id;
  backend.put(item);
  els.cap.value = '';
  autosize(els.cap);
  updateRoute();
  if (!inTab(item)) toast(`Ajouté dans ${item.cat ?? INBOX}`);
}

function archive(it, el) {
  el?.classList.add('leaving');
  setTimeout(() => {
    update(it, { doneAt: Date.now() });
    toast('Terminé, rangé dans les archives', 'Annuler', () => update(it, { doneAt: null }));
  }, el ? 220 : 0);
}

/* ---------- Render ---------- */

const MORE_ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 4h10M3 8h10M3 12h6"/></svg>';

function tabList() {
  const active = all().filter((i) => !i.doneAt);
  const count = (t) => all().filter((i) => inTab(i, t)).length;
  const cats = allCats().filter((c) => active.some((i) => i.cat === c) || state.tab === `c:${c}`);
  return [
    { key: 'all', label: 'Tout', n: active.length },
    { key: 'inbox', label: INBOX, n: count('inbox') },
    ...cats.map((c) => ({ key: `c:${c}`, label: c, n: count(`c:${c}`) })),
    { key: 'archive', label: 'Archives', n: count('archive') },
  ];
}

function renderTabs() {
  els.tabs.innerHTML = tabList().map((t, i) => `<button class="tab${t.key === state.tab ? ' on' : ''}${t.key === 'archive' ? ' archive' : ''}" data-tab="${escapeHtml(t.key)}" title="Alt+${i + 1}">${escapeHtml(t.label)}<span class="n">${t.n || ''}</span></button>`).join('');
  els.tabs.querySelector('.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function rowHtml(it, isArchive) {
  const open = state.open.has(it.id);
  const hasDesc = !!it.desc?.trim();
  const title = state.editTitle === it.id
    ? `<textarea class="title-input" rows="1">${escapeHtml(it.title)}</textarea>`
    : `<div class="title">${renderInline(it.title) || '<span class="ph">Sans titre</span>'}</div>`;
  const desc = !open ? ''
    : state.editDesc === it.id
      ? `<div class="desc"><textarea class="desc-input" placeholder="Détails, puces (- ), checklist ([ ] )…">${escapeHtml(it.desc ?? '')}</textarea></div>`
      : `<div class="desc" data-act="edit-desc">${renderBlock(it.desc)}</div>`;
  const times = isArchive
    ? `<time title="${fFull.format(it.createdAt)}">créé ${when(it.createdAt)}</time><time title="${fFull.format(it.doneAt)}">terminé ${when(it.doneAt)}</time>`
    : `<time title="Créé le ${fFull.format(it.createdAt)}">${when(it.createdAt)}</time>`;
  return `
    ${isArchive ? '' : '<button class="check" data-act="done" aria-label="Terminer" title="Terminer"></button>'}
    <div class="main">
      ${title}
      <div class="meta">
        <button class="chip" data-act="cat" title="${it.auto ? 'Rangé automatiquement, clique pour changer' : 'Changer d\'onglet'}">${it.auto ? '<i>✦</i>' : ''}${escapeHtml(it.cat ?? INBOX)}</button>
        ${times}
      </div>
      ${desc}
    </div>
    <div class="side">
      ${isArchive ? '<button class="act" data-act="restore">Restaurer</button><button class="act danger" data-act="delete">Supprimer</button>' : ''}
      <button class="more${hasDesc ? ' has' : ''}${open ? ' open' : ''}" data-act="toggle" aria-label="Détails" title="Détails">${MORE_ICON}</button>
    </div>`;
}

function render() {
  renderTabs();
  const isArchive = state.tab === 'archive';
  const q = fold(state.query.trim());
  const list = all()
    .filter((it) => inTab(it) && (!q || fold(`${it.title} ${it.desc} ${it.cat ?? INBOX}`).includes(q)))
    .sort(isArchive ? (a, b) => b.doneAt - a.doneAt : (a, b) => b.createdAt - a.createdAt);

  const rows = [];
  let day;
  for (const it of list) {
    if (isArchive && dayLabel(it.doneAt) !== day) {
      day = dayLabel(it.doneAt);
      rows.push({ key: `d:${day}`, cls: 'day', sig: day, html: () => escapeHtml(day) });
    }
    const sig = JSON.stringify([it.title, it.desc, it.cat, it.auto, it.doneAt, state.open.has(it.id), state.editTitle === it.id, state.editDesc === it.id, isArchive, when(it.createdAt)]);
    rows.push({ key: it.id, cls: 'item', sig, html: () => rowHtml(it, isArchive) });
  }
  patch(rows);

  els.empty.hidden = list.length > 0;
  els.empty.textContent = q ? `Aucun résultat pour « ${state.query.trim()} ».`
    : isArchive ? 'Les tâches terminées arrivent ici, avec leur date exacte.'
    : 'Rien en cours. Tape une idée, Entrée, c\'est noté.';
}

// Keyed DOM patch: rows being typed into are never replaced under the cursor.
function patch(rows) {
  const keep = new Set();
  let prev = null;
  const a = document.activeElement;
  for (const r of rows) {
    keep.add(r.key);
    let el = nodes.get(r.key);
    if (!el) {
      el = document.createElement('li');
      el.dataset.id = r.key;
      nodes.set(r.key, el);
    }
    const typing = a && el.contains(a) && a.matches('textarea, input:not([type=checkbox])');
    if (el._sig !== r.sig && !typing) {
      el.className = r.cls;
      el.innerHTML = r.html();
      el._sig = r.sig;
    }
    if (r.key === state.fresh) { el.classList.add('fresh'); state.fresh = null; }
    const next = prev ? prev.nextSibling : els.list.firstChild;
    if (next !== el) els.list.insertBefore(el, next);
    prev = el;
  }
  for (const [k, el] of nodes) if (!keep.has(k)) { el.remove(); nodes.delete(k); }
}

function updateRoute() {
  const p = parseCapture(els.cap.value);
  if (!p.title && !p.desc) { els.route.textContent = ''; els.route.className = 'route'; return; }
  const r = routeFor(p);
  els.route.className = `route ${r.how}`;
  els.route.textContent = `${r.how === 'auto' ? '✦ ' : '→ '}${r.cat ?? INBOX}`;
}

function setTab(tab) {
  state.tab = tab;
  safeSet('todosmart:tab', tab);
  render();
  updateRoute();
}

/* ---------- Editing helpers ---------- */

function autosize(ta) {
  ta.style.height = 'auto';
  ta.style.height = `${ta.scrollHeight}px`;
}

// Enter inside a list line continues the list; Enter on an empty bullet ends it.
function continueList(ta, e) {
  const { value, selectionStart: s, selectionEnd } = ta;
  if (s !== selectionEnd) return false;
  const lineStart = value.lastIndexOf('\n', s - 1) + 1;
  const line = value.slice(lineStart, s);
  const m = line.match(/^(\s*)([-*]\s+\[[ xX]\]\s|\[[ xX]\]\s|[-*•]\s|\d+\.\s)(.*)$/);
  if (!m) return false;
  e.preventDefault();
  if (!m[3].trim()) {
    ta.setRangeText('', lineStart, s, 'end');
  } else {
    let prefix = m[2].replace(/\[[xX]\]/, '[ ]');
    const n = prefix.match(/^(\d+)\./);
    if (n) prefix = `${+n[1] + 1}. `;
    ta.setRangeText(`\n${m[1]}${prefix}`, s, s, 'end');
  }
  autosize(ta);
  return true;
}

function startTitleEdit(it) {
  state.editTitle = it.id;
  render();
  const ta = nodes.get(it.id)?.querySelector('.title-input');
  if (!ta) return;
  autosize(ta);
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
  const finish = (save) => {
    ta.onblur = null;
    state.editTitle = null;
    const p = parseCapture(ta.value.replace(/\n/g, ' '));
    const cur = state.items.get(it.id);
    if (save && cur && p.title) {
      const patch = { title: p.title };
      if (p.tag) Object.assign(patch, { cat: resolveCat(p.tag, allCats()), auto: false });
      if (patch.title !== cur.title || patch.cat !== undefined) { ta.blur(); update(cur, patch); return; }
    }
    ta.blur();
    render();
  };
  ta.onblur = () => finish(true);
  ta.onkeydown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
  };
  ta.oninput = () => autosize(ta);
}

function startDescEdit(it) {
  state.open.add(it.id);
  state.editDesc = it.id;
  render();
  const ta = nodes.get(it.id)?.querySelector('.desc-input');
  if (!ta) return;
  autosize(ta);
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
  ta.oninput = () => autosize(ta);
  ta.onkeydown = (e) => {
    if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); e.stopPropagation(); ta.blur(); return; }
    if (e.key === 'Enter' && !e.shiftKey) continueList(ta, e);
  };
  ta.onblur = () => {
    state.editDesc = null;
    const cur = state.items.get(it.id);
    const desc = ta.value.replace(/\s+$/, '');
    if (!desc) state.open.delete(it.id);
    ta.blur();
    if (cur && desc !== (cur.desc ?? '')) update(cur, { desc });
    else render();
  };
}

/* ---------- Category menu ---------- */

function openMenu(anchor, it) {
  const cats = allCats();
  els.menu.innerHTML = [null, ...cats]
    .map((c) => `<button data-cat="${escapeHtml(c ?? '')}" class="${(it.cat ?? null) === c ? 'cur' : ''}">${escapeHtml(c ?? INBOX)}</button>`)
    .join('') + '<input placeholder="Nouvel onglet… (Entrée)" aria-label="Nouvel onglet">';
  els.menu.hidden = false;
  const r = anchor.getBoundingClientRect();
  const w = els.menu.offsetWidth;
  els.menu.style.left = `${Math.max(8, Math.min(r.left, innerWidth - w - 8)) + scrollX}px`;
  els.menu.style.top = `${r.bottom + scrollY + 4}px`;
  const pick = (cat) => {
    closeMenu();
    const cur = state.items.get(it.id);
    if (cur) update(cur, { cat, auto: false });
  };
  els.menu.onclick = (e) => {
    const b = e.target.closest('button');
    if (b) pick(b.dataset.cat || null);
  };
  const input = els.menu.querySelector('input');
  input.onkeydown = (e) => {
    if (e.key === 'Enter' && input.value.trim()) pick(resolveCat(input.value.replace(/^#/, ''), cats));
    if (e.key === 'Escape') closeMenu();
  };
  input.focus();
}
function closeMenu() {
  if (els.menu.hidden) return;
  els.menu.hidden = true;
  els.menu.innerHTML = '';
}

/* ---------- Toast + undo ---------- */

let toastTimer;
function toast(msg, action, fn) {
  clearTimeout(toastTimer);
  els.toast.innerHTML = `<span>${escapeHtml(msg)}</span>${action ? `<button>${escapeHtml(action)}</button>` : ''}`;
  els.toast.hidden = false;
  undoFn = fn ?? null;
  els.toast.querySelector('button')?.addEventListener('click', runUndo);
  toastTimer = setTimeout(() => { els.toast.hidden = true; undoFn = null; }, fn ? 6000 : 2500);
}
function runUndo() {
  const fn = undoFn;
  undoFn = null;
  els.toast.hidden = true;
  fn?.();
}

/* ---------- Events ---------- */

els.cap.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); capture(); return; }
  if (e.key === 'Enter' && e.shiftKey && continueList(els.cap, e)) updateRoute();
  if (e.key === 'Escape') { els.cap.value = ''; autosize(els.cap); updateRoute(); }
});
els.cap.addEventListener('input', () => { autosize(els.cap); updateRoute(); });

els.tabs.addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (b) setTab(b.dataset.tab);
});

els.search.addEventListener('input', () => { state.query = els.search.value; render(); });

els.list.addEventListener('click', (e) => {
  const li = e.target.closest('li.item');
  if (!li) return;
  const it = state.items.get(li.dataset.id);
  if (!it || e.target.closest('a')) return;
  const box = e.target.closest('input[type=checkbox][data-line]');
  if (box) { update(it, { desc: toggleCheckLine(it.desc, +box.dataset.line) }); return; }
  const act = e.target.closest('[data-act]')?.dataset.act
    ?? (e.target.closest('.title') ? 'edit-title' : null);
  switch (act) {
    case 'done': archive(it, li); break;
    case 'cat': e.stopPropagation(); openMenu(e.target.closest('.chip'), it); break;
    case 'toggle':
      if (state.open.has(it.id)) { state.open.delete(it.id); render(); }
      else if (it.desc?.trim()) { state.open.add(it.id); render(); }
      else startDescEdit(it);
      break;
    case 'edit-desc': startDescEdit(it); break;
    case 'edit-title': if (!getSelection().toString()) startTitleEdit(it); break;
    case 'restore':
      update(it, { doneAt: null });
      toast(`Restauré dans ${it.cat ?? INBOX}`, 'Annuler', () => update(state.items.get(it.id) ?? it, { doneAt: it.doneAt }));
      break;
    case 'delete':
      backend.del(it.id);
      toast('Supprimé définitivement', 'Annuler', () => backend.put(it));
      break;
  }
});

document.addEventListener('click', (e) => { if (!els.menu.contains(e.target)) closeMenu(); });

addEventListener('keydown', (e) => {
  const typing = e.target.matches?.('input, textarea');
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); els.search.focus(); els.search.select(); return; }
  if (e.altKey && !mod && /^[1-9]$/.test(e.key)) {
    e.preventDefault();
    const t = tabList()[+e.key - 1];
    if (t) setTab(t.key);
    return;
  }
  if (mod && e.key.toLowerCase() === 'z' && !typing && undoFn) { e.preventDefault(); runUndo(); return; }
  if (e.key === 'Escape') {
    closeMenu();
    if (e.target === els.search) { els.search.value = ''; state.query = ''; render(); els.cap.focus(); }
    return;
  }
  // Typing anywhere on the page goes straight into the capture box.
  if (!typing && e.key.length === 1 && !mod && !e.altKey) els.cap.focus();
});

els.share.addEventListener('click', async () => {
  if (backend.status === 'local') {
    toast('Mode local : branche Firebase pour partager (voir README)');
    return;
  }
  try {
    await navigator.clipboard.writeText(location.href);
    toast('Lien copié. Toute personne qui l\'a peut lire et modifier.');
  } catch {
    prompt('Copie ce lien :', location.href);
  }
});

function showStatus(s) {
  els.sync.className = `sync ${s}`;
  els.sync.textContent = { local: 'Local', synced: 'Synchronisé', offline: 'Hors ligne' }[s];
  els.sync.title = {
    local: 'Données enregistrées dans ce navigateur uniquement',
    synced: 'Toutes les modifications sont enregistrées en ligne',
    offline: 'Modifications gardées localement, envoyées au retour du réseau',
  }[s];
}

addEventListener('hashchange', () => location.reload());
addEventListener('resize', () => autosize(els.cap));

/* ---------- Boot ---------- */

async function init() {
  const space = getSpace();
  const saved = safeGet('todosmart:tab');
  if (saved) state.tab = saved;
  if (firebaseConfig) {
    try {
      backend = await firestoreBackend(space, firebaseConfig);
      migrateLocal(space);
    } catch (e) {
      console.error('[todosmart] firebase', e);
      toast('Synchronisation indisponible, mode local');
    }
  }
  backend ??= localBackend(space);
  showStatus(backend.status);
  backend.onStatus(showStatus);
  backend.start((items) => {
    state.items = new Map(items.map((i) => [i.id, i]));
    model = train(items);
    if (state.tab.startsWith('c:') && !allCats().includes(catOfTab(state.tab))) state.tab = 'all';
    render();
    updateRoute();
  });
  els.cap.focus();
}

// One-time upload of items created before sync was enabled.
function migrateLocal(space) {
  const key = `todosmart:${space}`;
  const raw = safeGet(key);
  if (!raw || safeGet(`${key}:migrated`)) return;
  try { JSON.parse(raw).forEach((it) => backend.put(it)); safeSet(`${key}:migrated`, '1'); } catch {}
}

init();
