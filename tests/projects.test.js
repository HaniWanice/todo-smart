import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectProjects, relTime, projectStats, projectHtml } from '../src/projects.js';
import { isProjectDir, parseSession, groupSessions, parseSummary, fsVal, userText } from '../scripts/scan-lib.mjs';

const P = (id, o = {}) => ({ id, name: id, machine: 'windows', path: `C:\\p\\${id}`, startedAt: 1, lastActiveAt: 1, sessions: 1, ...o });

test('projects: pinned first, then the chosen order; hidden and machine filters', () => {
  const list = [
    P('a', { lastActiveAt: 30, startedAt: 1, progress: 20 }),
    P('b', { lastActiveAt: 10, startedAt: 9, progress: 90, machine: 'mac' }),
    P('c', { lastActiveAt: 20, startedAt: 5, pinned: 7 }),
    P('d', { lastActiveAt: 99, hidden: true }),
  ];
  const ids = (o) => selectProjects(list, o).map((p) => p.id);
  assert.deepEqual(ids({ sort: 'recent' }), ['c', 'a', 'b']);
  assert.deepEqual(ids({ sort: 'created' }), ['c', 'b', 'a']);
  assert.deepEqual(ids({ sort: 'progress' }), ['c', 'b', 'a']);
  assert.deepEqual(ids({ machine: 'mac' }), ['b']);
  assert.deepEqual(ids({ hidden: true }), ['d']);
  assert.deepEqual(ids({ query: 'C:\\P\\A' }), ['a']);
});

test('projects: relative time and stats', () => {
  const now = 1e12;
  assert.equal(relTime(now - 5 * 60000, now), 'il y a 5 min');
  assert.equal(relTime(now - 3 * 3600000, now), 'il y a 3 h');
  assert.equal(relTime(now - 864e5, now), 'hier');
  assert.equal(relTime(now - 10 * 864e5, now), 'il y a 10 j');
  const st = projectStats([P('a', { lastActiveAt: now, progress: 40 }), P('b', { lastActiveAt: now - 30 * 864e5, progress: 60 }), P('c', { hidden: true })], now);
  assert.deepEqual([st.count, st.week, st.avg], [2, 1, 50]);
});

test('projects: row escapes model text and shows the machine', () => {
  const html = projectHtml(P('x', { name: '<b>x</b>', machine: 'mac', progress: 42 }));
  assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;'));
  assert.ok(html.includes('aria-valuenow="42"'));
  assert.ok(html.includes('>Mac<'));
});

test('scanner: containers, temp and hidden folders are not projects', () => {
  assert.equal(isProjectDir('C:\\Users\\Utilisateur\\Documents\\Projet IA\\ToDo Smart'), true);
  assert.equal(isProjectDir('/Users/hani/Desktop/MAC_ProjectAi/GPT scraper'), true);
  for (const p of ['C:\\Users\\Utilisateur', '/Users/hani/Desktop', 'C:\\Users\\Utilisateur\\Documents\\Projet IA\\Autres',
    'C:\\Users\\UTILIS~1\\AppData\\Local\\Temp\\x', 'C:\\Users\\Utilisateur\\.claude\\jobs\\1', '/Users/hani/.reverse-api/runs', '/private/tmp/x', 'C:\\Windows.old\\Users\\a\\b']) {
    assert.equal(isProjectDir(p), false, p);
  }
});

test('scanner: session parsing keeps typed prompts only', () => {
  const L = (o) => JSON.stringify(o);
  const s = parseSession([
    L({ type: 'user', cwd: 'C:\\p', timestamp: '2026-01-01T10:00:00Z', message: { content: '<pasted_content id="1">Fais une app</pasted_content>' } }),
    L({ type: 'user', timestamp: '2026-01-01T10:01:00Z', message: { content: [{ type: 'tool_result', content: 'x' }] }, toolUseResult: {} }),
    L({ type: 'user', timestamp: '2026-01-01T10:02:00Z', message: { content: '<command-name>/model</command-name>' } }),
    L({ type: 'assistant', timestamp: '2026-01-01T11:00:00Z' }),
  ]);
  assert.equal(s.cwd, 'C:\\p');
  assert.deepEqual(s.prompts, ['Fais une app']);
  assert.equal(s.last - s.first, 3600000);
  assert.equal(userText({ type: 'user', isMeta: true, message: { content: 'x' } }), null);
});

test('scanner: sub-folders fold into their project', () => {
  const S = (cwd, first, last) => ({ machine: 'windows', cwd, first, last, prompts: [], titles: [] });
  const g = groupSessions([S('C:\\a\\Brain', 5, 9), S('C:\\a\\Brain\\sub', 1, 20), S('C:\\a\\Other', 2, 3), S('C:\\Users\\Utilisateur', 1, 2)]);
  assert.deepEqual(g.map((p) => [p.cwd, p.sessions.length, p.first, p.last]), [['C:\\a\\Brain', 2, 1, 20], ['C:\\a\\Other', 1, 2, 3]]);
});

test('scanner: summary parsing clamps and validates', () => {
  const s = parseSummary('Voici : {"name":"App","description":"d","progress":140,"done":["a",3],"todo":[],"phase":"bizarre"}');
  assert.deepEqual([s.name, s.progress, s.done, s.phase], ['App', 100, ['a'], 'en cours']);
  assert.equal(parseSummary('pas de json'), null);
  assert.deepEqual(fsVal({ a: [1, 1.5, null, 'x', true] }), { mapValue: { fields: { a: { arrayValue: { values: [
    { integerValue: '1' }, { doubleValue: 1.5 }, { nullValue: null }, { stringValue: 'x' }, { booleanValue: true }] } } } } });
});
