// Scans Claude Code sessions on this PC and the Mac, summarizes each project with Sol,
// and writes the result to Firestore (spaces/<space>/projects), where the "Projets" tab reads it.
//
//   node scripts/scan-projects.mjs --space <id>   first run: remembers the space id
//   node scripts/scan-projects.mjs                later runs (scheduled task)
//   node scripts/scan-projects.mjs --dry          print, write nothing
//
// Only projects with new activity are re-summarized, so a run without changes costs no Sol call.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import crypto from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { MAC_HOST, parseSession, groupSessions, digest, parseSummary, localPath, fsVal } from './scan-lib.mjs';

const STATE_DIR = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), '.local'), 'todo-smart-scan');
const CONFIG = path.join(STATE_DIR, 'config.json');
const CACHE = path.join(STATE_DIR, 'cache.json');
const FIREBASE = { projectId: 'todo-1d5e9', apiKey: 'AIzaSyCVDixlbRMMSVDmN3nIInLjzFvHISNWjQw' };
const SOL = 'http://127.0.0.1:47321/v1/chat/completions';
const MAX_SUMMARIES = 40; // per run; the rest waits for the next run
const PARALLEL = 3; // more makes the Sol bridge drop calls

const SOURCES = [
  { machine: 'windows', dir: path.join(os.homedir(), '.claude', 'projects') },
  { machine: 'mac', dir: `${MAC_HOST}/.claude/projects` },
];

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const log = (...a) => console.log(new Date().toLocaleString('fr-FR'), ...a);

fs.mkdirSync(STATE_DIR, { recursive: true });
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const config = readJson(CONFIG, {});
if (opt('--space')) { config.space = opt('--space').replace(/^.*#/, ''); fs.writeFileSync(CONFIG, JSON.stringify(config, null, 2)); }
const cache = readJson(CACHE, { files: {}, projects: {} });

/* ---------- Sessions ---------- */

async function readSession(file) {
  const lines = [];
  const rl = readline.createInterface({ input: fs.createReadStream(file, 'utf8'), crlfDelay: Infinity });
  for await (const l of rl) {
    // Only lines that can carry a prompt, a cwd or a title are worth parsing.
    if (l.includes('"type":"user"') || l.includes('"summary"') || l.includes('"ai-title"')) lines.push(l);
  }
  return parseSession(lines);
}

async function scanSource({ machine, dir }) {
  let dirs;
  try { dirs = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()); } catch {
    log(`${machine} : ${dir} inaccessible, projets gardés tels quels`);
    return null;
  }
  const out = [];
  for (const d of dirs) {
    let files;
    try { files = fs.readdirSync(path.join(dir, d.name)).filter((f) => f.endsWith('.jsonl')); } catch { continue; }
    for (const f of files) {
      const file = path.join(dir, d.name, f);
      let st;
      try { st = fs.statSync(file); } catch { continue; }
      const key = `${machine}:${d.name}/${f}`;
      const sig = `${st.size}:${st.mtimeMs}`;
      let s = cache.files[key]?.sig === sig ? cache.files[key].s : null;
      if (!s) {
        try { s = await readSession(file); } catch { continue; }
        // Keep the cache small: the first and last prompts are all a digest uses.
        s.prompts = s.prompts.length > 8 ? [...s.prompts.slice(0, 3), ...s.prompts.slice(-5)] : s.prompts;
        s.titles = s.titles.slice(-3);
        cache.files[key] = { sig, s };
      }
      // A Mac folder opened from Windows through the share is a Mac project.
      const mac = s.cwd && /^[\\/]{2}macbook-pro-de-hani\.local[\\/]hani/i.test(s.cwd);
      out.push(mac ? { ...s, machine: 'mac', cwd: s.cwd.replace(/^[\\/]{2}[^\\/]+[\\/]hani/i, '/Users/hani').replace(/\\/g, '/') } : { ...s, machine });
    }
  }
  return out;
}

/* ---------- Project folder facts ---------- */

const run = (cmd, a, ms = 20000) => new Promise((res) => {
  execFile(cmd, a, { timeout: ms, windowsHide: true, maxBuffer: 1 << 20 }, (err, stdout) => res(err ? '' : stdout.trim()));
});

async function folderFacts(dir) {
  if (!fs.existsSync(dir)) return { missing: true };
  const extra = { docs: [] };
  try {
    extra.files = fs.readdirSync(dir).filter((f) => !f.startsWith('.') && f !== 'node_modules').slice(0, 40).join(', ');
  } catch {}
  for (const name of ['HANDOFF.md', 'TODO.md', 'README.md', 'PRODUCT.md', 'CLAUDE.md', 'PLAN.md']) {
    if (extra.docs.length >= 3) break;
    try { extra.docs.push([name, fs.readFileSync(path.join(dir, name), 'utf8')]); } catch {}
  }
  if (fs.existsSync(path.join(dir, '.git'))) {
    const g = ['-c', 'safe.directory=*', '-C', dir];
    const [count, log, head] = await Promise.all([
      run('git', [...g, 'rev-list', '--count', 'HEAD']),
      run('git', [...g, 'log', '-15', '--date=short', '--format=%ad %s']),
      run('git', [...g, 'rev-parse', '--short', 'HEAD']),
    ]);
    if (count) extra.git = { count: +count, log, head };
  }
  return extra;
}

/* ---------- Sol ---------- */

const PROMPT = `Tu résumes l'état d'un projet de code lancé avec Claude Code, pour un tableau de bord personnel.
La personne a un TDAH et lance beaucoup de projets : sois concret, court, en français simple.
Déduis l'objectif final du projet depuis les premières demandes, puis estime honnêtement l'avancée vers cet objectif
(0 = juste une idée, 100 = objectif atteint et utilisable). Ne surestime pas : un prototype non testé est rarement au-dessus de 60.
Réponds UNIQUEMENT avec ce JSON :
{"name": "nom court et parlant (2 à 4 mots)", "description": "une à deux phrases : ce que fait le projet",
 "goal": "l'objectif final en une phrase", "progress": 0-100,
 "done": ["ce qui est fait, 3 à 6 points courts"], "todo": ["ce qui reste pour atteindre l'objectif, 2 à 6 points courts"],
 "next": "la toute prochaine action concrète", "phase": "idée|en cours|presque fini|terminé|en pause"}

Données du projet :
`;

let solKey;
async function solUp() {
  try { solKey ??= readJson(path.join(process.env.LOCALAPPDATA ?? '', 'sol-bridge', 'config.json'), {}).key; } catch {}
  if (!solKey) return false;
  const ping = () => fetch('http://127.0.0.1:47321/v1/models', { headers: { 'x-sol-key': solKey }, signal: AbortSignal.timeout(3000) }).then((r) => r.ok, () => false);
  if (await ping()) return true;
  log('démarrage du pont Sol');
  spawn('sol-bridge start', { shell: true, detached: true, stdio: 'ignore', windowsHide: true }).unref();
  for (let i = 0; i < 15; i++) { await new Promise((r) => setTimeout(r, 2000)); if (await ping()) return true; }
  return false;
}

async function summarize(text) {
  for (let k = 0; k < 2; k++) {
    try {
      const r = await fetch(SOL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-sol-key': solKey },
        body: JSON.stringify({ model: 'gpt-5.6-sol', messages: [{ role: 'user', content: PROMPT + text }] }),
        signal: AbortSignal.timeout(180000),
      });
      const j = await r.json();
      const s = parseSummary(j.choices?.[0]?.message?.content ?? '');
      if (s) return s;
    } catch {}
  }
  return null;
}

/* ---------- Firestore ---------- */

async function writeProject(doc) {
  const fields = Object.fromEntries(Object.entries(doc).map(([k, v]) => [k, fsVal(v)]));
  // The mask leaves fields the app owns (fav, pinned, hidden) untouched.
  const mask = Object.keys(doc).map((k) => `updateMask.fieldPaths=${k}`).join('&');
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE.projectId}/databases/(default)/documents/spaces/${config.space}/projects/${doc.id}?key=${FIREBASE.apiKey}&${mask}`;
  const r = await fetch(url, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fields }) });
  if (!r.ok) throw new Error(`Firestore ${r.status} : ${(await r.text()).slice(0, 200)}`);
}

/* ---------- Main ---------- */

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); }));
}

async function main() {
  if (!config.space && !flag('--dry')) {
    console.error('Espace inconnu : lance une fois avec --space <id> (le texte après # dans le lien ToDo Smart).');
    process.exit(1);
  }
  const sessions = [];
  for (const src of SOURCES) {
    const s = await scanSource(src);
    if (s) { sessions.push(...s); log(`${src.machine} : ${s.length} sessions`); }
  }
  const projects = groupSessions(sessions).sort((a, b) => b.last - a.last);
  log(`${projects.length} projets`);

  const sol = flag('--no-ai') ? false : await solUp();
  if (!sol) log('Sol indisponible : dates mises à jour, résumés gardés');
  let budget = MAX_SUMMARIES;

  await pool(projects, PARALLEL, async (p) => {
    const id = crypto.createHash('sha1').update(`${p.machine}:${p.cwd.toLowerCase()}`).digest('hex').slice(0, 16);
    const facts = await folderFacts(localPath(p.machine, p.cwd));
    const prev = cache.projects[id] ?? {};
    const sig = `${p.last}:${facts.git?.head ?? ''}`;
    let summary = prev.summary;
    if (sol && prev.sig !== sig && budget > 0) {
      budget--;
      const s = await summarize(digest(p, facts));
      if (s) {
        summary = s;
        cache.projects[id] = { sig, summary };
        // Saved at once: a run killed midway keeps the summaries it already paid for.
        fs.writeFileSync(CACHE, JSON.stringify(cache));
        log(`résumé : ${s.name} (${s.progress} %)`);
      }
    }
    const firstPrompt = p.sessions[0].prompts[0] ?? '';
    const doc = {
      id,
      machine: p.machine,
      path: p.cwd,
      folder: p.cwd.replace(/\\/g, '/').split('/').pop(),
      name: summary?.name || p.cwd.replace(/\\/g, '/').split('/').pop(),
      desc: summary?.desc ?? firstPrompt.slice(0, 300),
      goal: summary?.goal ?? '',
      progress: summary?.progress ?? null,
      done: summary?.done ?? [],
      todo: summary?.todo ?? [],
      next: summary?.next ?? '',
      phase: summary?.phase ?? '',
      sessions: p.sessions.length,
      commits: facts.git?.count ?? 0,
      missing: !!facts.missing,
      startedAt: p.first,
      lastActiveAt: p.last,
      scannedAt: Date.now(),
    };
    if (flag('--dry')) { console.log(JSON.stringify(doc)); return; }
    try { await writeProject(doc); } catch (e) { log(`${doc.name} : ${e.message}`); }
  });

  fs.writeFileSync(CACHE, JSON.stringify(cache));
  log('terminé');
}

main().catch((e) => { console.error(e); process.exit(1); });
