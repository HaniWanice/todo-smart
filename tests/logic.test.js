import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderInline, renderBlock } from '../src/parse.js';
import { selectItems, splitCapture, migrateLegacy, orderBetween, statusSet } from '../src/model.js';

test('inline markdown escapes HTML and renders formatting', () => {
  assert.equal(renderInline('<b>x</b>'), '&lt;b&gt;x&lt;/b&gt;');
  assert.equal(renderInline('**gras** et *ital* et `code`'), '<strong>gras</strong> et <em>ital</em> et <code>code</code>');
  assert.equal(renderInline('2*3*4'), '2*3*4');
  assert.match(renderInline('voir https://a.io/x?y=1&z=2.'), /href="https:\/\/a\.io\/x\?y=1&amp;z=2"/);
  assert.doesNotMatch(renderInline('"onmouseover=alert(1)'), /"/);
});

test('block markdown renders lines, bullets and checklists', () => {
  assert.equal(
    renderBlock('Intro\n- [ ] a\n- [x] b\n- puce\n\nfin'),
    '<div>Intro</div><ul class="checks"><li data-checked="false">a</li><li data-checked="true">b</li></ul><ul><li>puce</li></ul><div><br></div><div>fin</div>',
  );
});

test('capture: first line is the title, list markers stripped, rest is description', () => {
  assert.deepEqual(splitCapture('\nTitre **fort**\n- [ ] a\n- [ ] b\n'), { title: 'Titre **fort**', desc: '- [ ] a\n- [ ] b' });
  assert.deepEqual(splitCapture('- [ ] juste une case'), { title: 'juste une case', desc: '' });
  assert.equal(splitCapture('  \n '), null);
});

const T = (id, o) => ({ id, title: id, desc: '', tab: 'a', status: 'todo', fav: false, pinned: 0, createdAt: 0, doneAt: null, ...o });
const items = [
  T('old', { createdAt: 1 }),
  T('new', { createdAt: 5 }),
  T('pinned', { createdAt: 0, pinned: 10 }),
  T('doing', { createdAt: 3, status: 'doing', fav: true }),
  T('done', { createdAt: 9, status: 'done', doneAt: 20 }),
  T('other', { createdAt: 7, tab: 'b' }),
];
const ids = (l) => l.map((i) => i.id).join(',');

test('default view hides done tasks and puts pinned first', () => {
  assert.equal(ids(selectItems(items, { view: 'a' })), 'pinned,new,doing,old');
  assert.equal(ids(selectItems(items, { view: 'all' })), 'pinned,other,new,doing,old');
});

test('filters combine: statuses are OR-ed, favourites narrow', () => {
  assert.equal(ids(selectItems(items, { view: 'a', filters: ['done'] })), 'done');
  assert.equal(ids(selectItems(items, { view: 'a', filters: ['doing', 'done'] })), 'doing,done');
  assert.equal(ids(selectItems(items, { view: 'a', filters: ['fav'] })), 'doing');
  assert.equal(ids(selectItems(items, { view: 'fav' })), 'doing');
  assert.equal(ids(selectItems(items, { view: 'all', query: 'OTH' })), 'other');
  assert.deepEqual([...statusSet(['fav'])], ['todo', 'doing']);
});

test('orderBetween places a tab between neighbours', () => {
  assert.equal(orderBetween(1, 2), 1.5);
  assert.equal(orderBetween(null, 2), 1);
  assert.equal(orderBetween(3, null), 4);
});

test('legacy items migrate to tabs by name and to statuses', () => {
  let n = 0;
  const legacy = [
    { id: 'x', title: 'a', desc: '', cat: 'Trading', auto: true, createdAt: 1, updatedAt: 1, doneAt: null },
    { id: 'y', title: 'b', desc: 'd', cat: null, auto: false, createdAt: 2, updatedAt: 2, doneAt: 5 },
    { id: 'z', title: 'c', desc: '', cat: 'trading', createdAt: 3, updatedAt: 3, doneAt: null },
  ];
  const existing = [{ id: 't0', name: 'Général', order: 1, color: 'gray', createdAt: 0 }];
  const r = migrateLegacy(legacy, existing, 100, () => `t${++n}`);
  assert.deepEqual(r.tabs.map((t) => [t.name, t.order]), [['Trading', 2]]);
  assert.deepEqual(r.items.map((i) => [i.id, i.tab, i.status]), [['x', 't1', 'todo'], ['y', 't0', 'done'], ['z', 't1', 'todo']]);
  assert.ok(r.items.every((i) => !('cat' in i) && !('auto' in i)));
  assert.deepEqual(migrateLegacy(r.items, existing, 100, () => 'no'), { tabs: [], items: [] });
});
