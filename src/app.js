import { renderInline, renderBlock, escapeHtml } from './parse.js';
import { selectItems, splitCapture, migrateLegacy, orderBetween, sortTabs, buildBackup, parseBackup, COLORS } from './model.js';
import { attachEditor, htmlToMd, format, editableRoot, toggleCheckFromClick, placeCaretAtEnd, selectAll } from './editor.js';
import { localBackend, firestoreBackend } from './backends.js';
import { firebaseConfig } from './config.js';
import { icon } from './icons.js';

const $ = (s) => document.querySelector(s);
const els = {
  cap: $('#cap'), send: $('#send'), dest: $('#dest'), list: $('#list'), empty: $('#empty'),
  tabs: $('#tabs'), viewIcon: $('#viewIcon'), viewTitle: $('#viewTitle'), viewMeta: $('#viewMeta'),
  viewMenu: $('#viewMenu'), filters: $('#filters'), search: $('#search'), sync: $('#sync'),
  share: $('#share'), backup: $('#backup'), importFile: $('#importFile'), theme: $('#theme'), toast: $('#toast'), menu: $('#menu'), fmtbar: $('#fmtbar'),
};

// view: 'all' | 'fav' | <tab id>
const state = {
  items: new Map(), tabs: new Map(), view: 'all', filters: {}, query: '',
  openDesc: null, fresh: null, cache: { items: true, tabs: true },
};
const nodes = new Map();
let backend;
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
    history.replaceState(null, '', `${location.pathname}${location.search}#${s}`);
  }
  safeSet('todosmart:last', s);
  return s;
}

/* ---------- Time ---------- */

const fDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const fTime = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const fFull = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeStyle: 'medium' });
const stamp = (t) => `${fDate.format(t)} à ${fTime.format(t)}`;

/* ---------- Data helpers ---------- */

const allItems = () => [...state.items.values()];
const tabList = () => sortTabs(state.tabs.values());
const tabVars = (tab) => (tab ? `--tc:var(--c-${tab.color});--tc-bg:var(--c-${tab.color}-bg);--tc-strong:var(--c-${tab.color})` : '');
const isTabView = () => state.tabs.has(state.view);
const filtersOf = (view = state.view) => state.filters[view] ?? [];

// Writes land in local state first: Firestore echoes them back asynchronously,
// and flows like "create a tab, then rename it" must not wait for that echo.
function save(coll, doc) {
  state[coll].set(doc.id, doc);
  backend.put(coll, doc);
}
function put(coll, doc) { save(coll, { ...doc, updatedAt: Date.now() }); }
function update(it, patch) { put('items', { ...it, ...patch }); }
// Firestore rejects `undefined`, so "no colour" means the field is absent.
function setItemColor(it, color) {
  const { color: _old, ...rest } = it;
  put('items', color ? { ...rest, color } : rest);
}

function ensureTab() {
  const first = tabList()[0];
  if (first) return first.id;
  const t = Date.now();
  const tab = { id: uid(9), name: 'Général', order: 1, color: 'blue', createdAt: t, updatedAt: t };
  save('tabs', tab);
  return tab.id;
}

function targetTab() {
  return isTabView() ? state.view : tabList()[0];
}

/* ---------- Capture ---------- */

function capture() {
  const p = splitCapture(htmlToMd(els.cap));
  if (!p) { els.cap.focus(); return; }
  const tab = isTabView() ? state.view : ensureTab();
  const t = Date.now();
  const item = { id: uid(9), title: p.title, desc: p.desc, tab, status: 'todo', fav: state.view === 'fav', pinned: 0, createdAt: t, updatedAt: t, doneAt: null };
  state.fresh = item.id;
  save('items', item);
  els.cap.innerHTML = '';
  els.cap.focus();
  updateComposer();
  if (!selectItems([item], { view: state.view, filters: filtersOf() }).length) {
    toast(`Ajouté dans ${state.tabs.get(tab)?.name ?? 'Général'}, masqué par les filtres`);
  }
}

function updateComposer() {
  const empty = !els.cap.textContent.trim();
  els.send.disabled = empty;
  const tab = targetTab();
  const t = typeof tab === 'string' ? state.tabs.get(tab) : tab;
  els.dest.innerHTML = t ? `dans <b style="${tabVars(t)}">${escapeHtml(t.name)}</b>` : 'dans <b>Général</b>';
}

/* ---------- Status, favourites, pins ---------- */

function setStatus(it, s, row) {
  const next = it.status === s ? 'todo' : s;
  const patch = { status: next, doneAt: next === 'done' ? Date.now() : null };
  const hides = !selectItems([{ ...it, ...patch }], { view: state.view, filters: filtersOf(), query: state.query }).length;
  const apply = () => {
    update(it, patch);
    if (next === 'done') toast('Tâche terminée', 'Annuler', () => update(state.items.get(it.id) ?? it, { status: it.status, doneAt: it.doneAt }));
  };
  if (hides && row) { row.classList.add('leaving'); setTimeout(apply, 200); } else apply();
}

function moveTo(it, tabId) {
  if (it.tab === tabId) return;
  const from = it.tab;
  update(it, { tab: tabId });
  toast(`Déplacé vers ${state.tabs.get(tabId)?.name}`, 'Annuler', () => update(state.items.get(it.id) ?? it, { tab: from }));
}

/* ---------- Render ---------- */

const STATE_FILTERS = [
  { key: 'fav', label: 'Favoris', icon: 'star' },
  { key: 'todo', label: 'À faire', icon: 'circle' },
  { key: 'doing', label: 'En cours', icon: 'doing' },
  { key: 'done', label: 'Terminés', icon: 'done' },
];

function render() {
  renderTabs();
  renderHead();
  renderList();
  updateComposer();
}

function renderTabs() {
  if (els.tabs.querySelector('.tab-name-input')) return;
  const items = allItems().filter((i) => i.status !== 'done');
  const count = (pred) => items.filter(pred).length || '';
  const cur = (v) => (state.view === v ? ' aria-current="page"' : '');
  els.tabs.innerHTML = `
    <button class="tab" data-view="all"${cur('all')} title="Alt+1">${icon('all')}<span>Tout</span><span class="n">${count(() => true)}</span></button>
    <button class="tab" data-view="fav"${cur('fav')} title="Alt+2" style="--tc:var(--star);--tc-bg:var(--c-yellow-bg);--tc-strong:var(--c-yellow)">${icon('star')}<span>Favoris</span><span class="n">${count((i) => i.fav)}</span></button>
    <span class="tab-sep" aria-hidden="true"></span>
    ${tabList().map((t, i) => `<button class="tab user" data-view="${escapeHtml(t.id)}"${cur(t.id)} draggable="true" style="${tabVars(t)}" title="${i < 7 ? `Alt+${i + 3} · ` : ''}double-clic pour renommer"><span class="dot"></span><span class="tab-name">${escapeHtml(t.name)}</span><span class="n">${count((it) => it.tab === t.id)}</span></button>`).join('')}
    <button class="tab-add" data-act="add-tab" type="button" title="Nouvel onglet">${icon('plus')}<span class="label">Nouvel onglet</span></button>`;
  els.tabs.querySelector('[aria-current]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function renderHead() {
  const tab = state.tabs.get(state.view);
  const title = state.view === 'all' ? 'Toutes les tâches' : state.view === 'fav' ? 'Favoris' : tab?.name ?? '';
  els.viewIcon.innerHTML = state.view === 'fav' ? icon('star') : state.view === 'all' ? icon('all') : '<span class="square"></span>';
  els.viewIcon.style.cssText = tab ? tabVars(tab) : state.view === 'fav' ? '--tc:var(--star);--tc-bg:var(--c-yellow-bg)' : '';
  if (els.viewTitle.contentEditable !== 'true') els.viewTitle.textContent = title;
  els.viewTitle.classList.toggle('renamable', !!tab);
  els.viewTitle.title = tab ? 'Cliquer pour renommer' : '';
  els.viewMenu.hidden = !tab;
  els.viewMenu.innerHTML = icon('more');

  const scope = allItems().filter((i) => state.view === 'all' || (state.view === 'fav' ? i.fav : i.tab === state.view));
  const n = (s) => scope.filter((i) => i.status === s).length;
  const parts = [`${n('todo')} à faire`, `${n('doing')} en cours`, `${n('done')} terminée${n('done') > 1 ? 's' : ''}`];
  els.viewMeta.textContent = parts.join(' · ');

  const active = filtersOf();
  els.filters.innerHTML = STATE_FILTERS
    .filter((f) => !(state.view === 'fav' && f.key === 'fav'))
    .map((f) => `<button type="button" class="chip" data-filter="${f.key}" aria-pressed="${active.includes(f.key)}">${icon(f.icon)}${f.label}</button>`)
    .join('') + (active.length ? '<button type="button" class="chip clear" data-filter="clear">Effacer</button>' : '');
}

function rowHtml(it) {
  const tab = state.tabs.get(it.tab);
  const open = state.openDesc === it.id;
  const hasDesc = !!it.desc?.trim();
  const showTab = !isTabView() && tab;
  const desc = open || hasDesc ? `
      <div class="task-desc${open ? ' is-open' : ''}">
        <div class="desc-inner">
          <div class="rich desc-rich" data-act="open-desc" data-placeholder="Ajoute des détails…">${hasDesc ? renderBlock(it.desc) : ''}</div>
          ${open ? '<p class="desc-hint">Liste et checklist : boutons ou sélection du texte · Échap pour fermer</p>' : ''}
        </div>
      </div>` : '';
  return `
    <button class="grip" draggable="true" type="button" aria-label="Glisser vers un onglet" title="Glisser vers un onglet">${icon('grip')}</button>
    <div class="task-state">
      <button type="button" class="state-btn btn-check" data-act="done" aria-pressed="${it.status === 'done'}" aria-label="Terminer" title="Terminer">${icon('done')}</button>
      <button type="button" class="state-btn btn-doing" data-act="doing" aria-pressed="${it.status === 'doing'}" aria-label="En cours" title="En cours">${icon('doing')}</button>
    </div>
    <div class="task-body">
      <div class="rich task-title" data-act="edit-title">${renderInline(it.title)}</div>
      <div class="task-meta">
        ${showTab ? `<button type="button" class="tab-chip" data-act="move" style="${tabVars(tab)}" title="Changer d'onglet">${escapeHtml(tab.name)}</button>` : ''}
        ${it.status === 'doing' ? '<span class="pill doing">En cours</span>' : ''}
        <time datetime="${new Date(it.createdAt).toISOString()}" title="Créée le ${fFull.format(it.createdAt)}">Créée le ${stamp(it.createdAt)}</time>
        ${it.status === 'done' && it.doneAt ? `<time title="Terminée le ${fFull.format(it.doneAt)}">Terminée le ${stamp(it.doneAt)}</time>` : ''}
      </div>
      ${desc}
    </div>
    <div class="task-actions">
      <button type="button" class="act star${it.fav ? ' on' : ''}" data-act="fav" aria-pressed="${!!it.fav}" aria-label="Favori" title="Favori">${icon('star')}</button>
      <button type="button" class="act pin${it.pinned ? ' on' : ''}" data-act="pin" aria-pressed="${!!it.pinned}" aria-label="Épingler en haut" title="Épingler en haut">${icon('pin')}</button>
      <button type="button" class="act palette${it.color ? ' has' : ''}" data-act="color" aria-label="Couleur" title="Couleur">${icon('palette')}</button>
      <button type="button" class="act${hasDesc ? ' has' : ''}" data-act="toggle-desc" aria-label="Description" title="Description">${icon('text')}</button>
      <button type="button" class="act" data-act="move" aria-label="Déplacer vers un onglet" title="Déplacer vers…">${icon('move')}</button>
      <button type="button" class="act danger" data-act="delete" aria-label="Supprimer" title="Supprimer">${icon('trash')}</button>
    </div>`;
}

function renderList() {
  const list = selectItems(allItems(), { view: state.view, filters: filtersOf(), query: state.query });
  const a = document.activeElement;
  const keep = new Set();
  let prev = null;
  for (const it of list) {
    keep.add(it.id);
    let el = nodes.get(it.id);
    if (!el) {
      el = document.createElement('li');
      el.dataset.id = it.id;
      nodes.set(it.id, el);
    }
    const sig = JSON.stringify([it.title, it.desc, it.tab, it.status, it.fav, it.pinned, it.doneAt, it.color, state.openDesc === it.id, isTabView(), state.tabs.get(it.tab)?.name, state.tabs.get(it.tab)?.color]);
    const editing = a && el.contains(a) && a.isContentEditable;
    if (el._sig !== sig && !editing) {
      el.className = `task${it.status === 'done' ? ' is-done' : ''}${it.status === 'doing' ? ' is-doing' : ''}${it.color ? ' has-color' : ''}`;
      el.style.cssText = it.color ? `--ic:var(--c-${it.color});--ic-bg:var(--c-${it.color}-bg)` : '';
      el.innerHTML = rowHtml(it);
      el._sig = sig;
    }
    if (it.id === state.fresh) { el.classList.add('fresh'); state.fresh = null; }
    const next = prev ? prev.nextSibling : els.list.firstChild;
    if (next !== el) els.list.insertBefore(el, next);
    prev = el;
  }
  for (const [k, el] of nodes) if (!keep.has(k)) { el.remove(); nodes.delete(k); }
  renderEmpty(list.length);
}

function renderEmpty(n) {
  els.empty.hidden = n > 0;
  if (n) return;
  const tab = state.tabs.get(state.view);
  let html;
  if (state.query.trim()) html = `<strong>Aucun résultat</strong>Rien ne contient « ${escapeHtml(state.query.trim())} ».`;
  else if (filtersOf().length) html = '<strong>Rien ne correspond à ces filtres</strong><button type="button" class="chip" data-filter="clear">Effacer les filtres</button>';
  else if (state.view === 'fav') html = '<strong>Pas encore de favoris</strong>Clique sur l\'étoile d\'une tâche, ou glisse-la sur l\'onglet Favoris.';
  else if (tab) html = `<strong>${escapeHtml(tab.name)} est vide</strong>Tape une tâche en haut, puis Maj + Entrée.`;
  else html = '<strong>Rien en cours</strong>Tape une idée en haut, puis Maj + Entrée. Le bouton + en bas crée un onglet.';
  els.empty.innerHTML = html;
}

/* ---------- Editing: titles, descriptions, tab names ---------- */

function startTitleEdit(it, el) {
  if (el.isContentEditable) return;
  el.innerHTML = renderInline(it.title);
  let cancelled = false;
  const detach = attachEditor(el, {
    single: true,
    onSubmit: () => el.blur(),
    onCancel: () => { cancelled = true; el.blur(); },
  });
  placeCaretAtEnd(el);
  el.addEventListener('blur', () => {
    detach();
    const title = htmlToMd(el).replace(/\n+/g, ' ').trim();
    const cur = state.items.get(it.id);
    if (!cancelled && cur && title && title !== cur.title) update(cur, { title });
    else el.innerHTML = renderInline(cur?.title ?? it.title);
  }, { once: true });
}

function openDesc(it) {
  state.openDesc = it.id;
  renderList();
  const el = nodes.get(it.id)?.querySelector('.desc-rich');
  if (!el) return;
  const detach = attachEditor(el, { onSubmit: () => el.blur(), onCancel: () => el.blur() });
  placeCaretAtEnd(el);
  const onBlur = () => {
    el.removeEventListener('blur', onBlur);
    detach();
    const desc = htmlToMd(el);
    const cur = state.items.get(it.id);
    state.openDesc = null;
    if (cur && desc !== (cur.desc ?? '')) update(cur, { desc });
    else renderList();
  };
  el.addEventListener('blur', onBlur);
}

function saveDescFromDom(it, el) {
  const desc = htmlToMd(el);
  if (desc !== it.desc) update(it, { desc });
}

function startViewRename(selectText = false) {
  const tab = state.tabs.get(state.view);
  if (!tab || els.viewTitle.isContentEditable) return;
  const el = els.viewTitle;
  el.contentEditable = 'true';
  el.textContent = tab.name;
  if (selectText) selectAll(el); else placeCaretAtEnd(el);
  const finish = (save) => {
    el.onkeydown = null;
    el.onblur = null;
    el.contentEditable = 'false';
    const name = el.textContent.replace(/\s+/g, ' ').trim().slice(0, 60);
    const cur = state.tabs.get(tab.id);
    if (save && cur && name && name !== cur.name) put('tabs', { ...cur, name });
    render();
  };
  el.onkeydown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
  };
  el.onblur = () => finish(true);
}

/* ---------- Tabs ---------- */

function setView(view) {
  if (view === state.view) return;
  state.view = view;
  state.openDesc = null;
  safeSet('ts:view', view);
  closeMenu();
  render();
}

function addTab() {
  const tabs = tabList();
  const t = Date.now();
  const used = new Set(tabs.map((x) => x.color));
  const color = COLORS.find((c) => !used.has(c)) ?? COLORS[tabs.length % COLORS.length];
  const tab = { id: uid(9), name: 'Nouvel onglet', order: (tabs.at(-1)?.order ?? 0) + 1, color, createdAt: t, updatedAt: t };
  save('tabs', tab);
  setView(tab.id);
  startViewRename(true);
}

function deleteTab(tab) {
  const items = allItems().filter((i) => i.tab === tab.id);
  items.forEach((i) => backend.del('items', i.id));
  backend.del('tabs', tab.id);
  if (state.view === tab.id) setView('all');
  toast(`Onglet « ${tab.name} » supprimé${items.length ? ` avec ${items.length} tâche${items.length > 1 ? 's' : ''}` : ''}`, 'Annuler', () => {
    save('tabs', tab);
    items.forEach((i) => backend.put('items', i));
  });
}

/* ---------- Menus ---------- */

function openMenu(anchor, html, onClick) {
  els.menu.innerHTML = html;
  els.menu.hidden = false;
  const r = anchor.getBoundingClientRect();
  const m = els.menu.getBoundingClientRect();
  const left = Math.max(8, Math.min(r.left, innerWidth - m.width - 8));
  const below = r.bottom + 6 + m.height < innerHeight;
  els.menu.style.left = `${left}px`;
  els.menu.style.top = `${below ? r.bottom + 6 : Math.max(8, r.top - m.height - 6)}px`;
  els.menu.onclick = (e) => {
    const b = e.target.closest('[data-m]');
    if (b) onClick(b.dataset.m, b);
  };
  els.menu.querySelector('button')?.focus({ preventScroll: true });
}
function closeMenu() {
  if (els.menu.hidden) return;
  els.menu.hidden = true;
  els.menu.innerHTML = '';
}

function openMoveMenu(anchor, it) {
  const html = '<div class="menu-label">Déplacer vers</div>' + tabList()
    .map((t) => `<button type="button" class="menu-item${t.id === it.tab ? ' cur' : ''}" data-m="${escapeHtml(t.id)}" style="${tabVars(t)}"><span class="dot"></span>${escapeHtml(t.name)}</button>`)
    .join('');
  openMenu(anchor, html, (id) => {
    closeMenu();
    const cur = state.items.get(it.id);
    if (cur) moveTo(cur, id);
  });
}

const swatchesHtml = (current) => `<div class="swatches">${COLORS.map((c) => `<button type="button" class="swatch" data-m="color:${c}" aria-label="${c}" aria-pressed="${current === c}" style="--tc:var(--c-${c});--tc-bg:var(--c-${c}-bg)"></button>`).join('')}</div>`;

function openItemColorMenu(anchor, it) {
  const html = `<div class="menu-label">Couleur de la tâche</div>${swatchesHtml(it.color)}
    <button type="button" class="menu-item" data-m="none">Aucune couleur</button>`;
  openMenu(anchor, html, (m) => {
    closeMenu();
    const cur = state.items.get(it.id);
    if (cur) setItemColor(cur, m.startsWith('color:') ? m.slice(6) : null);
  });
}

function openTabMenu(anchor, tab) {
  const html = `
    <button type="button" class="menu-item" data-m="rename">${icon('pencil')}Renommer</button>
    <div class="menu-label">Couleur</div>
    ${swatchesHtml(tab.color)}
    <div class="menu-sep"></div>
    <button type="button" class="menu-item danger" data-m="delete">${icon('trash')}Supprimer l'onglet</button>`;
  openMenu(anchor, html, (m) => {
    closeMenu();
    const cur = state.tabs.get(tab.id);
    if (!cur) return;
    if (m === 'rename') { setView(cur.id); startViewRename(true); }
    else if (m === 'delete') deleteTab(cur);
    else if (m.startsWith('color:')) put('tabs', { ...cur, color: m.slice(6) });
  });
}

/* ---------- Toast + undo ---------- */

let toastTimer;
function toast(msg, action, fn) {
  clearTimeout(toastTimer);
  els.toast.innerHTML = `<span>${escapeHtml(msg)}</span>${action ? `<button type="button">${escapeHtml(action)}</button>` : ''}`;
  els.toast.hidden = false;
  undoFn = fn ?? null;
  els.toast.querySelector('button')?.addEventListener('click', runUndo);
  toastTimer = setTimeout(() => { els.toast.hidden = true; undoFn = null; }, fn ? 6000 : 3000);
}
function runUndo() {
  const fn = undoFn;
  undoFn = null;
  els.toast.hidden = true;
  fn?.();
}

/* ---------- Selection format bar ---------- */

function updateFmtbar() {
  const sel = getSelection();
  const root = sel.rangeCount && !sel.isCollapsed ? editableRoot(sel.anchorNode) : null;
  if (!root || !sel.toString().trim()) { els.fmtbar.hidden = true; return; }
  const single = root.dataset.single === 'true';
  els.fmtbar.querySelectorAll('.wide, .fmtbar-sep').forEach((b) => { b.hidden = single; });
  els.fmtbar.hidden = false;
  const r = sel.getRangeAt(0).getBoundingClientRect();
  const w = els.fmtbar.offsetWidth;
  els.fmtbar.style.left = `${Math.max(8, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 8))}px`;
  els.fmtbar.style.top = `${r.top > 60 ? r.top - els.fmtbar.offsetHeight - 8 : r.bottom + 8}px`;
}

/* ---------- Events ---------- */

attachEditor(els.cap, { onSubmit: capture, onCancel: () => { els.cap.innerHTML = ''; updateComposer(); } });
els.cap.addEventListener('input', updateComposer);
els.send.addEventListener('click', capture);

// Format buttons act on whichever rich editor has the caret (the composer by default).
document.addEventListener('mousedown', (e) => {
  if (e.target.closest('[data-fmt]')) e.preventDefault();
});
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-fmt]');
  if (!b) return;
  if (!editableRoot(getSelection().anchorNode)) placeCaretAtEnd(els.cap);
  format(b.dataset.fmt);
  updateFmtbar();
});
document.addEventListener('selectionchange', updateFmtbar);

els.filters.addEventListener('click', (e) => {
  const b = e.target.closest('[data-filter]');
  if (b) toggleFilter(b.dataset.filter);
});
els.empty.addEventListener('click', (e) => {
  const b = e.target.closest('[data-filter]');
  if (b) toggleFilter(b.dataset.filter);
});
function toggleFilter(key) {
  const cur = new Set(filtersOf());
  if (key === 'clear') cur.clear();
  else if (cur.has(key)) cur.delete(key);
  else cur.add(key);
  state.filters[state.view] = [...cur];
  safeSet('ts:filters', JSON.stringify(state.filters));
  render();
}

els.viewTitle.addEventListener('click', () => { if (isTabView()) startViewRename(); });
els.viewMenu.addEventListener('click', (e) => {
  e.stopPropagation();
  const tab = state.tabs.get(state.view);
  if (tab) openTabMenu(els.viewMenu, tab);
});

els.search.addEventListener('input', () => { state.query = els.search.value; renderList(); });

els.list.addEventListener('click', (e) => {
  const row = e.target.closest('li.task');
  const it = row && state.items.get(row.dataset.id);
  if (!it) return;
  // Checklist boxes inside a description toggle in place.
  const rich = e.target.closest('.desc-rich');
  if (rich && toggleCheckFromClick(e)) {
    if (!rich.isContentEditable) saveDescFromDom(it, rich);
    return;
  }
  if (e.target.closest('a') && !e.target.closest('[contenteditable="true"]')) return;
  const act = e.target.closest('[data-act]')?.dataset.act;
  switch (act) {
    case 'done': setStatus(it, 'done', row); break;
    case 'doing': setStatus(it, 'doing', row); break;
    case 'fav': update(it, { fav: !it.fav }); break;
    case 'pin': update(it, { pinned: it.pinned ? 0 : Date.now() }); break;
    case 'move': e.stopPropagation(); openMoveMenu(e.target.closest('[data-act]'), it); break;
    case 'color': e.stopPropagation(); openItemColorMenu(e.target.closest('[data-act]'), it); break;
    case 'edit-title': if (!getSelection().toString()) startTitleEdit(it, e.target.closest('.task-title')); break;
    case 'open-desc': if (!rich.isContentEditable) openDesc(it); break;
    case 'toggle-desc':
      if (state.openDesc === it.id) document.activeElement?.blur?.();
      else openDesc(it);
      break;
    case 'delete':
      backend.del('items', it.id);
      toast('Tâche supprimée', 'Annuler', () => backend.put('items', it));
      break;
  }
});

els.tabs.addEventListener('click', (e) => {
  if (e.target.closest('[data-act="add-tab"]')) { addTab(); return; }
  const b = e.target.closest('[data-view]');
  if (b) setView(b.dataset.view);
});
els.tabs.addEventListener('dblclick', (e) => {
  const b = e.target.closest('.tab.user');
  if (b) { setView(b.dataset.view); startViewRename(true); }
});
els.tabs.addEventListener('contextmenu', (e) => {
  const b = e.target.closest('.tab.user');
  const tab = b && state.tabs.get(b.dataset.view);
  if (!tab) return;
  e.preventDefault();
  openTabMenu(b, tab);
});

/* Drag and drop: tasks onto tabs, tabs to reorder. */
const TASK = 'application/x-todosmart-task';
const TAB = 'application/x-todosmart-tab';
let dragTab = null;

els.list.addEventListener('dragstart', (e) => {
  const grip = e.target.closest?.('.grip');
  const row = grip?.closest('li.task');
  if (!row) return;
  e.dataTransfer.setData(TASK, row.dataset.id);
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setDragImage(row, 24, 24);
  row.classList.add('dragging');
});
els.list.addEventListener('dragend', (e) => e.target.closest?.('li.task')?.classList.remove('dragging'));

els.tabs.addEventListener('dragstart', (e) => {
  const b = e.target.closest('.tab.user');
  if (!b) return;
  dragTab = b.dataset.view;
  e.dataTransfer.setData(TAB, dragTab);
  e.dataTransfer.effectAllowed = 'move';
  b.classList.add('dragging');
});
els.tabs.addEventListener('dragend', () => {
  dragTab = null;
  clearDropMarks();
});
function clearDropMarks() {
  els.tabs.querySelectorAll('.drop, .drop-before, .drop-after, .dragging').forEach((b) => b.classList.remove('drop', 'drop-before', 'drop-after', 'dragging'));
}
els.tabs.addEventListener('dragover', (e) => {
  const types = e.dataTransfer.types;
  const b = e.target.closest('.tab[data-view]');
  clearDropMarks();
  if (!b) return;
  if (types.includes(TASK) && (b.classList.contains('user') || b.dataset.view === 'fav')) {
    e.preventDefault();
    b.classList.add('drop');
  } else if (types.includes(TAB) && b.classList.contains('user') && b.dataset.view !== dragTab) {
    e.preventDefault();
    const r = b.getBoundingClientRect();
    b.classList.add(e.clientX < r.left + r.width / 2 ? 'drop-before' : 'drop-after');
  }
});
els.tabs.addEventListener('dragleave', (e) => { if (!els.tabs.contains(e.relatedTarget)) clearDropMarks(); });
els.tabs.addEventListener('drop', (e) => {
  const b = e.target.closest('.tab[data-view]');
  const before = b?.classList.contains('drop-before');
  clearDropMarks();
  if (!b) return;
  e.preventDefault();
  const taskId = e.dataTransfer.getData(TASK);
  if (taskId) {
    const it = state.items.get(taskId);
    if (!it) return;
    if (b.dataset.view === 'fav') { update(it, { fav: true }); toast('Ajoutée aux favoris'); } else moveTo(it, b.dataset.view);
    return;
  }
  const tabId = e.dataTransfer.getData(TAB);
  const moving = state.tabs.get(tabId);
  if (!moving || b.dataset.view === tabId) return;
  const others = tabList().filter((t) => t.id !== tabId);
  const i = others.findIndex((t) => t.id === b.dataset.view) + (before ? 0 : 1);
  put('tabs', { ...moving, order: orderBetween(others[i - 1]?.order, others[i]?.order) });
});

document.addEventListener('click', (e) => {
  if (!els.menu.contains(e.target)) closeMenu();
});

addEventListener('keydown', (e) => {
  const t = e.target;
  const typing = t.matches?.('input, textarea') || t.isContentEditable;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); els.search.focus(); els.search.select(); return; }
  if (e.altKey && !mod && /^[1-9]$/.test(e.key)) {
    e.preventDefault();
    const views = ['all', 'fav', ...tabList().map((x) => x.id)];
    const v = views[+e.key - 1];
    if (v) setView(v);
    return;
  }
  if (mod && e.key.toLowerCase() === 'z' && !typing && undoFn) { e.preventDefault(); runUndo(); return; }
  if (e.key === 'Escape') {
    closeMenu();
    if (t === els.search) { els.search.value = ''; state.query = ''; renderList(); els.cap.focus(); }
    return;
  }
  // Typing anywhere on the page goes straight into the composer.
  if (!typing && e.key.length === 1 && !mod && !e.altKey) placeCaretAtEnd(els.cap);
});

els.share.innerHTML = icon('link');
els.share.addEventListener('click', async () => {
  if (backend.status === 'local') { toast('Mode local : la synchronisation n\'est pas configurée'); return; }
  try {
    await navigator.clipboard.writeText(location.href);
    toast('Lien copié. Toute personne qui l\'a peut lire et modifier.');
  } catch {
    toast('Copie impossible : copie l\'adresse de la page');
  }
});

/* ---------- Backup: export and import ---------- */

function exportData() {
  const items = allItems();
  const blob = new Blob([JSON.stringify(buildBackup(items, tabList(), Date.now()), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `todo-smart-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(`${items.length} tâche${items.length > 1 ? 's' : ''} exportée${items.length > 1 ? 's' : ''}`);
}

// Merge, never delete: a backup entry replaces the current one only if it is newer.
async function importData(file) {
  let r;
  try { r = parseBackup(await file.text()); } catch (e) { toast(e.message); return; }
  const newer = (cur, next) => !cur || (next.updatedAt ?? 0) > (cur.updatedAt ?? 0);
  let n = 0;
  for (const t of r.tabs) if (newer(state.tabs.get(t.id), t)) save('tabs', t);
  for (const i of r.items) {
    if (!newer(state.items.get(i.id), i)) continue;
    save('items', state.tabs.has(i.tab) ? i : { ...i, tab: ensureTab() });
    n++;
  }
  render();
  toast(`${n} tâche${n > 1 ? 's' : ''} importée${n > 1 ? 's' : ''}${r.skipped ? `, ${r.skipped} ignorée${r.skipped > 1 ? 's' : ''}` : ''}`);
}

els.backup.innerHTML = icon('download');
els.backup.addEventListener('click', (e) => {
  e.stopPropagation();
  openMenu(els.backup, `
    <button type="button" class="menu-item" data-m="export">${icon('download')}Exporter mes données</button>
    <button type="button" class="menu-item" data-m="import">${icon('upload')}Importer un fichier</button>`, (m) => {
    closeMenu();
    if (m === 'export') exportData(); else els.importFile.click();
  });
});
els.importFile.addEventListener('change', () => {
  const f = els.importFile.files[0];
  els.importFile.value = '';
  if (f) importData(f);
});

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  els.theme.innerHTML = icon(theme === 'dark' ? 'sun' : 'moon');
  const label = theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre';
  els.theme.setAttribute('aria-label', label);
  els.theme.title = label;
  document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#191919' : '#f8f7f4';
}
els.theme.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  safeSet('ts:theme', next);
  applyTheme(next);
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

/* ---------- Boot ---------- */

// Waits for server data on both collections; the guard stops the local backend's
// synchronous change events from re-entering mid-migration.
let migrating = false;
function migrateIfReady() {
  if (migrating || state.cache.items || state.cache.tabs) return;
  migrating = true;
  const r = migrateLegacy(allItems(), tabList(), Date.now(), () => uid(9));
  r.tabs.forEach((t) => backend.put('tabs', t));
  r.items.forEach((i) => backend.put('items', i));
  migrating = false;
}

const FMT_ICONS = { bold: 'bold', italic: 'italic', bullets: 'list', checks: 'checks' };

async function init() {
  applyTheme(document.documentElement.dataset.theme);
  // Touch keyboards have no Shift+Enter habit: keep the hint short there.
  const compact = matchMedia('(pointer: coarse), (max-width: 760px)');
  const fullHint = els.cap.dataset.placeholder;
  const setHint = () => { els.cap.dataset.placeholder = compact.matches ? 'Une idée, une tâche…' : fullHint; };
  compact.addEventListener('change', setHint);
  setHint();
  document.querySelectorAll('[data-fmt]').forEach((b) => b.insertAdjacentHTML('afterbegin', icon(FMT_ICONS[b.dataset.fmt])));
  const space = getSpace();
  state.view = safeGet('ts:view') ?? 'all';
  try { state.filters = JSON.parse(safeGet('ts:filters') ?? '{}') ?? {}; } catch {}
  // ?local forces the in-browser backend (tests, offline experiments).
  if (firebaseConfig && !new URLSearchParams(location.search).has('local')) {
    try { backend = await firestoreBackend(space, firebaseConfig); } catch (e) {
      console.error('[todosmart] firebase', e);
      toast('Synchronisation indisponible, mode local');
    }
  }
  backend ??= localBackend(space);
  showStatus(backend.status);
  backend.onStatus(showStatus);
  backend.start((coll, docs, { fromCache }) => {
    state[coll] = new Map(docs.map((d) => [d.id, d]));
    state.cache[coll] = fromCache;
    migrateIfReady();
    if (!['all', 'fav'].includes(state.view) && !state.tabs.has(state.view) && !state.cache.tabs) state.view = 'all';
    render();
  });
  placeCaretAtEnd(els.cap);
}

init();
