// Pure helpers for the project scanner: path rules, session parsing, grouping, Firestore encoding.

export const MAC_HOST = '//macbook-pro-de-hani.local/hani';

export const norm = (p) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
export const base = (p) => p.replace(/\\/g, '/').replace(/\/+$/, '').split('/').pop();

// Folders that hold projects without being one (home, Desktop, "Autres"...).
const CONTAINERS = new Set(['desktop', 'documents', 'downloads', 'projet ia', 'mac_projectai', 'projectai', 'autres', 'utilisateur', 'hani', 'users', 'onedrive']);
const NOISE = [/\/appdata\/local\/temp\//, /\/\.claude(-[\w-]+)?(\/|$)/, /scratchpad/, /^\/tmp(\/|$)/, /^\/private\//, /\/var\/folders\//, /\/node_modules\//, /^[a-z]:$/, /\/\.[^/]+\//, /^[a-z]:\/windows/];

export function isProjectDir(cwd) {
  const n = norm(cwd);
  if (!n || NOISE.some((r) => r.test(n + '/'))) return false;
  return !CONTAINERS.has(base(n).toLowerCase());
}

// Where the scanner can read a project folder from this PC.
export function localPath(machine, cwd) {
  if (machine !== 'mac') return cwd;
  return cwd.replace(/^\/Users\/hani/, MAC_HOST);
}

// Text a human typed, or null for tool results, hook output and slash-command echoes.
export function userText(line) {
  if (line.type !== 'user' || line.isMeta || line.isSidechain || line.toolUseResult) return null;
  const c = line.message?.content;
  const text = typeof c === 'string' ? c : Array.isArray(c) ? c.filter((x) => x.type === 'text').map((x) => x.text).join('\n') : '';
  // Pasted text is still the user's request: keep it, without the wrapper tags.
  const t = text.replace(/<\/?pasted_content[^>]*>/g, '').trim();
  if (!t || t.startsWith('<') || t.startsWith('Caveat:') || t.startsWith('[Request interrupted')) return null;
  return t;
}

// One session file → its facts. `lines` is an iterable of raw JSONL strings.
export function parseSession(lines) {
  const s = { cwd: null, first: 0, last: 0, prompts: [], titles: [] };
  for (const raw of lines) {
    if (!raw) continue;
    let l;
    try { l = JSON.parse(raw); } catch { continue; }
    if (l.cwd && !s.cwd) s.cwd = l.cwd;
    if (l.type === 'summary' && l.summary) s.titles.push(l.summary);
    if (l.type === 'ai-title' && l.title) s.titles.push(l.title);
    const ts = l.timestamp ? Date.parse(l.timestamp) : 0;
    if (ts) { s.first = s.first ? Math.min(s.first, ts) : ts; s.last = Math.max(s.last, ts); }
    const t = userText(l);
    if (!t) continue;
    s.prompts.push(t.slice(0, 600));
  }
  return s;
}

// Sessions → projects keyed by folder; sub-folders of a project fold into it.
export function groupSessions(sessions) {
  const by = new Map();
  for (const s of sessions) {
    if (!s.cwd || !s.last || !isProjectDir(s.cwd)) continue;
    const k = `${s.machine}:${norm(s.cwd)}`;
    if (!by.has(k)) by.set(k, { machine: s.machine, cwd: s.cwd, sessions: [] });
    by.get(k).sessions.push(s);
  }
  const keys = [...by.keys()].sort((a, b) => a.length - b.length);
  for (const k of keys) {
    const parent = keys.find((p) => p !== k && by.has(p) && k.startsWith(p + '/'));
    if (parent) { by.get(parent).sessions.push(...by.get(k).sessions); by.delete(k); }
  }
  return [...by.values()].map((p) => {
    p.sessions.sort((a, b) => a.first - b.first);
    p.first = Math.min(...p.sessions.map((s) => s.first));
    p.last = Math.max(...p.sessions.map((s) => s.last));
    return p;
  });
}

// Compact, bounded digest of a project for the summarizing model.
export function digest(p, extra = {}) {
  const firstS = p.sessions[0];
  const recent = p.sessions.slice(-3);
  const clip = (t, n) => (t.length > n ? t.slice(0, n) + '…' : t);
  const parts = [
    `Dossier : ${p.cwd} (${p.machine})`,
    `Sessions : ${p.sessions.length}, du ${new Date(p.first).toISOString().slice(0, 10)} au ${new Date(p.last).toISOString().slice(0, 10)}`,
    `Premières demandes :\n${firstS.prompts.slice(0, 3).map((t) => `- ${clip(t, 500)}`).join('\n')}`,
    `Dernières demandes :\n${recent.flatMap((s) => s.prompts.slice(-3)).slice(-8).map((t) => `- ${clip(t, 300)}`).join('\n')}`,
  ];
  const titles = [...new Set(p.sessions.flatMap((s) => s.titles))].slice(-10);
  if (titles.length) parts.push(`Titres de sessions : ${titles.join(' | ')}`);
  if (extra.git) parts.push(`Git (${extra.git.count} commits), derniers :\n${extra.git.log}`);
  if (extra.files) parts.push(`Fichiers à la racine : ${extra.files}`);
  for (const [name, text] of extra.docs ?? []) parts.push(`--- ${name} ---\n${clip(text, 1500)}`);
  return parts.join('\n\n');
}

export function parseSummary(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let j;
  try { j = JSON.parse(m[0]); } catch { return null; }
  const strs = (a, n) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string').map((x) => x.slice(0, 200)).slice(0, n) : []);
  const progress = Math.round(Number(j.progress));
  return {
    name: String(j.name ?? '').slice(0, 80),
    desc: String(j.description ?? '').slice(0, 600),
    goal: String(j.goal ?? '').slice(0, 400),
    progress: Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : null,
    done: strs(j.done, 8),
    todo: strs(j.todo, 8),
    next: String(j.next ?? '').slice(0, 300),
    phase: ['idée', 'en cours', 'presque fini', 'terminé', 'en pause'].includes(j.phase) ? j.phase : 'en cours',
  };
}

// Firestore REST value encoding.
export function fsVal(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(fsVal) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fsVal(x)])) } };
}
