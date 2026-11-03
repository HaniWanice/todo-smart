// "Projets" view: Claude Code projects found by scripts/scan-projects.mjs.
// Pure selection and formatting live here; app.js wires events.

import { escapeHtml } from './parse.js';
import { icon } from './icons.js';

export const PROJECT_SORTS = [
  { key: 'recent', label: 'Activité' },
  { key: 'created', label: 'Création' },
  { key: 'progress', label: 'Avancée' },
  { key: 'name', label: 'Nom' },
];
export const MACHINES = [
  { key: 'all', label: 'Tous' },
  { key: 'windows', label: 'Windows', icon: 'windows' },
  { key: 'mac', label: 'Mac', icon: 'laptop' },
];
export const DEFAULT_PVIEW = { machine: 'all', sort: 'recent', fav: false, hidden: false };

const SORTERS = {
  recent: (a, b) => b.lastActiveAt - a.lastActiveAt,
  created: (a, b) => b.startedAt - a.startedAt,
  progress: (a, b) => (b.progress ?? -1) - (a.progress ?? -1) || b.lastActiveAt - a.lastActiveAt,
  name: (a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }),
};

// Pinned first (latest pin on top), then the chosen order. Hidden ones only with the "Masqués" filter.
export function selectProjects(list, { machine = 'all', sort = 'recent', fav = false, hidden = false, query = '' } = {}) {
  const q = query.trim().toLowerCase();
  return list
    .filter((p) => (hidden ? p.hidden : !p.hidden))
    .filter((p) => machine === 'all' || p.machine === machine)
    .filter((p) => !fav || p.fav)
    .filter((p) => !q || [p.name, p.folder, p.desc, p.goal, p.path].some((s) => s?.toLowerCase().includes(q)))
    .sort((a, b) => (b.pinned ?? 0) - (a.pinned ?? 0) || (SORTERS[sort] ?? SORTERS.recent)(a, b));
}

export function relTime(t, now = Date.now()) {
  const m = Math.round((now - t) / 60000);
  if (m < 1) return 'à l\'instant';
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return 'hier';
  if (d < 30) return `il y a ${d} j`;
  const mo = Math.round(d / 30);
  return mo < 12 ? `il y a ${mo} mois` : `il y a ${Math.round(mo / 12)} an${mo >= 24 ? 's' : ''}`;
}

export function projectStats(list, now = Date.now()) {
  const visible = list.filter((p) => !p.hidden);
  const rated = visible.filter((p) => typeof p.progress === 'number');
  return {
    count: visible.length,
    week: visible.filter((p) => now - p.lastActiveAt < 7 * 864e5).length,
    avg: rated.length ? Math.round(rated.reduce((s, p) => s + p.progress, 0) / rated.length) : null,
    scannedAt: Math.max(0, ...list.map((p) => p.scannedAt ?? 0)),
  };
}

const fDay = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const fFull = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeStyle: 'short' });
const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;

function progressHtml(p) {
  if (typeof p.progress !== 'number') {
    return '<div class="pbar unknown" aria-label="Avancée pas encore estimée"><span class="pbar-track"></span><span class="pbar-num">?</span></div>';
  }
  const tone = p.progress >= 100 ? ' full' : p.progress >= 75 ? ' high' : '';
  return `<div class="pbar${tone}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p.progress}" aria-label="Avancée estimée">
      <span class="pbar-track"><span class="pbar-fill" style="--p:${p.progress}%"></span></span>
      <span class="pbar-num">${p.progress}<small>%</small></span>
    </div>`;
}

function listHtml(items, cls) {
  return items.length ? `<ul class="plist ${cls}">${items.map((t) => `<li>${icon(cls === 'done' ? 'done' : 'circle')}<span>${escapeHtml(t)}</span></li>`).join('')}</ul>` : '';
}

export function projectHtml(p, { open = false, now = Date.now() } = {}) {
  const mac = p.machine === 'mac';
  const details = open ? `
    <div class="proj-details">
      ${p.goal ? `<p class="proj-goal"><b>Objectif</b>${escapeHtml(p.goal)}</p>` : ''}
      <div class="proj-cols">
        ${p.done?.length ? `<div><h3>Fait</h3>${listHtml(p.done, 'done')}</div>` : ''}
        ${p.todo?.length ? `<div><h3>Reste à faire</h3>${listHtml(p.todo, 'todo')}</div>` : ''}
      </div>
      <div class="proj-path">
        <code>${escapeHtml(p.path)}</code>
        <button type="button" class="chip small" data-pact="copy">${icon('copy')}Copier le chemin</button>
        ${p.missing ? '<span class="proj-warn">Dossier introuvable sur la machine</span>' : ''}
      </div>
    </div>` : '';
  return `
  <li class="proj${open ? ' is-open' : ''}${p.pinned ? ' is-pinned' : ''}" data-id="${escapeHtml(p.id)}">
    <div class="proj-main" data-pact="toggle" role="button" tabindex="0" aria-expanded="${open}">
      <div class="proj-head">
        <h2 class="proj-name">${escapeHtml(p.name)}</h2>
        <span class="machine ${mac ? 'mac' : 'win'}" title="${mac ? 'Projet sur le Mac' : 'Projet sur ce PC Windows'}">${icon(mac ? 'laptop' : 'windows')}${mac ? 'Mac' : 'Windows'}</span>
        ${p.phase && p.phase !== 'en cours' ? `<span class="phase">${escapeHtml(p.phase)}</span>` : ''}
      </div>
      ${p.desc ? `<p class="proj-desc">${escapeHtml(p.desc)}</p>` : ''}
      ${progressHtml(p)}
      ${p.next ? `<p class="proj-next"><b>Ensuite</b>${escapeHtml(p.next)}</p>` : ''}
      <div class="proj-meta">
        <time title="Dernière session le ${fFull.format(p.lastActiveAt)}">Repris ${relTime(p.lastActiveAt, now)}</time>
        <time title="Première session le ${fFull.format(p.startedAt)}">Commencé le ${fDay.format(p.startedAt)}</time>
        <span>${plural(p.sessions, 'session')}</span>
        ${p.commits ? `<span>${plural(p.commits, 'commit')}</span>` : ''}
        ${p.folder && p.folder !== p.name ? `<span class="proj-folder">${icon('folder')}${escapeHtml(p.folder)}</span>` : ''}
      </div>
      ${details}
    </div>
    <div class="task-actions proj-actions">
      <button type="button" class="act star${p.fav ? ' on' : ''}" data-pact="fav" aria-pressed="${!!p.fav}" aria-label="Favori" title="Favori">${icon('star')}</button>
      <button type="button" class="act pin${p.pinned ? ' on' : ''}" data-pact="pin" aria-pressed="${!!p.pinned}" aria-label="Épingler en haut" title="Épingler en haut">${icon('pin')}</button>
      <button type="button" class="act${p.hidden ? ' on' : ''}" data-pact="hide" aria-pressed="${!!p.hidden}" aria-label="${p.hidden ? 'Réafficher' : 'Masquer'}" title="${p.hidden ? 'Réafficher' : 'Masquer (projet abandonné ou fini)'}">${icon('eyeOff')}</button>
    </div>
  </li>`;
}

export function projectControlsHtml(pv) {
  const seg = MACHINES.map((m) => `<button type="button" class="seg-btn" data-pf="machine:${m.key}" aria-pressed="${pv.machine === m.key}">${m.icon ? icon(m.icon) : ''}${m.label}</button>`).join('');
  const sorts = PROJECT_SORTS.map((s) => `<button type="button" class="seg-btn" data-pf="sort:${s.key}" aria-pressed="${pv.sort === s.key}">${s.label}</button>`).join('');
  return `
    <div class="seg" role="group" aria-label="Machine">${seg}</div>
    <div class="seg" role="group" aria-label="Trier par">${icon('sort')}${sorts}</div>
    <button type="button" class="chip" data-pf="fav" aria-pressed="${pv.fav}">${icon('star')}Favoris</button>
    <button type="button" class="chip" data-pf="hidden" aria-pressed="${pv.hidden}">${icon('eyeOff')}Masqués</button>`;
}
