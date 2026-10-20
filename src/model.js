// Pure data rules: filtering, ordering, capture splitting, legacy migration. No DOM.

import { fold } from './parse.js';

export const STATUSES = ['todo', 'doing', 'done'];
export const COLORS = ['blue', 'green', 'orange', 'purple', 'pink', 'yellow', 'brown', 'red', 'gray'];

// No status filter selected means every status: done tasks stay listed, at the bottom.
export function statusSet(filters = []) {
  const s = filters.filter((f) => STATUSES.includes(f));
  return new Set(s.length ? s : STATUSES);
}

// view: 'all' | 'fav' | <tab id>
export function selectItems(items, { view = 'all', filters = [], query = '' } = {}) {
  const statuses = statusSet(filters);
  const favOnly = view === 'fav' || filters.includes('fav');
  const q = fold(query.trim());
  return items
    .filter((it) => (view === 'all' || view === 'fav' || it.tab === view)
      && statuses.has(it.status)
      && (!favOnly || it.fav)
      && (!q || fold(`${it.title}\n${it.desc ?? ''}`).includes(q)))
    .sort(compareItems);
}

// Done always last (latest done first), then pinned (latest pin on top), otherwise newest first.
export function compareItems(a, b) {
  const da = a.status === 'done';
  const db = b.status === 'done';
  if (da !== db) return da ? 1 : -1;
  if (da) return (b.doneAt ?? 0) - (a.doneAt ?? 0);
  const pa = a.pinned || 0;
  const pb = b.pinned || 0;
  if (pa || pb) return pb - pa;
  return b.createdAt - a.createdAt;
}

export function sortTabs(tabs) {
  return [...tabs].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}

export function orderBetween(prev, next) {
  if (prev == null && next == null) return 1;
  if (prev == null) return next - 1;
  if (next == null) return prev + 1;
  return (prev + next) / 2;
}

// First non-empty line is the title (list markers dropped), the rest is the description.
export function splitCapture(md) {
  const lines = md.split('\n');
  const i = lines.findIndex((l) => l.trim());
  if (i < 0) return null;
  const title = lines[i].replace(/^\s*(?:[-*•]\s+)?(?:\[[ xX]\]\s*)?/, '').trim();
  const desc = lines.slice(i + 1).join('\n').replace(/^\n+/, '').replace(/\s+$/, '');
  return title ? { title, desc } : null;
}

/* ---------- Backup file ---------- */

export const BACKUP_FORMAT = 'todo-smart-backup';
// Same fields as firestore.rules allows: anything else would be rejected on write.
const ITEM_KEYS = ['id', 'title', 'desc', 'tab', 'status', 'fav', 'pinned', 'createdAt', 'updatedAt', 'doneAt', 'color'];
const TAB_KEYS = ['id', 'name', 'order', 'color', 'createdAt', 'updatedAt'];

export function buildBackup(items, tabs, now) {
  return { format: BACKUP_FORMAT, version: 1, exportedAt: now, tabs: sortTabs(tabs), items: [...items].sort(compareItems) };
}

const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

// Returns the tabs and items worth writing, and how many entries were skipped as invalid.
export function parseBackup(text) {
  let d;
  try { d = JSON.parse(text); } catch { throw new Error('Ce fichier n\'est pas un JSON valide'); }
  if (d?.format !== BACKUP_FORMAT || !Array.isArray(d.items) || !Array.isArray(d.tabs)) throw new Error('Ce fichier n\'est pas une sauvegarde ToDo Smart');
  const okTab = (t) => t && typeof t.id === 'string' && typeof t.name === 'string' && t.name.length <= 60 && typeof t.order === 'number';
  const okItem = (i) => i && typeof i.id === 'string' && typeof i.title === 'string' && i.title.length <= 2000
    && (i.desc == null || (typeof i.desc === 'string' && i.desc.length <= 50000))
    && typeof i.tab === 'string' && STATUSES.includes(i.status) && Number.isInteger(i.createdAt);
  const tabs = d.tabs.filter(okTab).map((t) => pick(t, TAB_KEYS));
  const items = d.items.filter(okItem).map((i) => {
    const o = pick(i, ITEM_KEYS);
    o.desc = o.desc ?? '';
    if (!COLORS.includes(o.color)) delete o.color;
    return o;
  });
  return { tabs, items, skipped: d.tabs.length - tabs.length + d.items.length - items.length };
}

const LEGACY_DEFAULT = 'Général';

// Items from the first version carry `cat` (tab name or null) and `doneAt` without `status`.
// Returns the tabs to create and the items to rewrite in the new shape.
export function migrateLegacy(items, tabs, now, uid) {
  const legacy = items.filter((it) => !('status' in it));
  if (!legacy.length) return { tabs: [], items: [] };
  const byName = new Map(tabs.map((t) => [fold(t.name), t]));
  const created = [];
  let order = Math.max(0, ...tabs.map((t) => t.order));
  const tabFor = (name) => {
    const key = fold(name);
    if (!byName.has(key)) {
      const t = { id: uid(), name, order: ++order, color: COLORS[(tabs.length + created.length) % COLORS.length], createdAt: now, updatedAt: now };
      byName.set(key, t);
      created.push(t);
    }
    return byName.get(key).id;
  };
  const rewritten = legacy.map((it) => ({
    id: it.id,
    title: it.title ?? '',
    desc: it.desc ?? '',
    tab: tabFor(it.cat || LEGACY_DEFAULT),
    status: it.doneAt ? 'done' : 'todo',
    fav: false,
    pinned: 0,
    createdAt: it.createdAt ?? now,
    updatedAt: now,
    doneAt: it.doneAt ?? null,
  }));
  return { tabs: created, items: rewritten };
}
