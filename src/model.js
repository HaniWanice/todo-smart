// Pure data rules: filtering, ordering, capture splitting, legacy migration. No DOM.

import { fold } from './parse.js';

export const STATUSES = ['todo', 'doing', 'done'];
export const COLORS = ['blue', 'green', 'orange', 'purple', 'pink', 'yellow', 'brown', 'red', 'gray'];

// No status filter selected means "everything not done".
export function statusSet(filters = []) {
  const s = filters.filter((f) => STATUSES.includes(f));
  return new Set(s.length ? s : ['todo', 'doing']);
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

// Pinned first (latest pin on top), done last, otherwise newest first.
export function compareItems(a, b) {
  const pa = a.pinned || 0;
  const pb = b.pinned || 0;
  if (pa || pb) return pb - pa;
  const da = a.status === 'done';
  const db = b.status === 'done';
  if (da !== db) return da ? 1 : -1;
  if (da) return (b.doneAt ?? 0) - (a.doneAt ?? 0);
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
