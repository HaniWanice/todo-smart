import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCapture, resolveCat, renderInline, renderBlock, toggleCheckLine } from '../src/parse.js';
import { train, predict } from '../src/classify.js';

test('capture: tag is extracted, title cleaned, extra lines become description', () => {
  assert.deepEqual(parseCapture('Tester le stop-loss #trading sur BTC\n- détail 1'), {
    title: 'Tester le stop-loss sur BTC', desc: '- détail 1', tag: 'trading',
  });
  assert.equal(parseCapture('Prix en #1 ? non').tag, '1');
  assert.equal(parseCapture('C# est bien').tag, null);
});

test('tags reuse existing categories regardless of case and accents', () => {
  assert.equal(resolveCat('idees', ['Idées', 'Code']), 'Idées');
  assert.equal(resolveCat('side-project', []), 'Side project');
});

test('inline markdown escapes HTML and renders formatting', () => {
  assert.equal(renderInline('<b>x</b>'), '&lt;b&gt;x&lt;/b&gt;');
  assert.equal(renderInline('**gras** et *ital* et `code`'), '<strong>gras</strong> et <em>ital</em> et <code>code</code>');
  assert.equal(renderInline('2*3*4'), '2*3*4');
  assert.match(renderInline('voir https://a.io/x?y=1&z=2.'), /href="https:\/\/a\.io\/x\?y=1&amp;z=2"/);
  assert.doesNotMatch(renderInline('"onmouseover=alert(1)'), /"/);
});

test('block markdown renders checklists that can be toggled by line', () => {
  const src = 'Intro\n- [ ] a\n- [x] b\n- puce';
  const html = renderBlock(src);
  assert.match(html, /<p>Intro<\/p><ul class="checks"><li class=""><input type="checkbox" data-line="1">/);
  assert.match(html, /<\/ul><ul><li>puce<\/li><\/ul>$/);
  assert.equal(toggleCheckLine(src, 1), 'Intro\n- [x] a\n- [x] b\n- puce');
  assert.equal(toggleCheckLine(src, 2), 'Intro\n- [ ] a\n- [ ] b\n- puce');
});

const history = [
  { title: 'Backtest de la stratégie scalping sur BTC', cat: 'Trading' },
  { title: 'Ajouter un stop-loss dynamique au bot', cat: 'Trading' },
  { title: 'Comparer les frais Hyperliquid et dYdX pour le bot', cat: 'Trading' },
  { title: 'Landing page pour vendre des prompts', cat: 'Business' },
  { title: 'Idée de SaaS : abonnement prompts pour freelances', cat: 'Business' },
  { title: 'Acheter du pain', cat: null },
];

test('classifier routes text sharing vocabulary with a category', () => {
  const m = train(history);
  assert.equal(predict(m, 'nouveau backtest du bot sur ETH')?.cat, 'Trading');
  assert.equal(predict(m, 'prix de l\'abonnement prompts')?.cat, 'Business');
});

test('classifier abstains on unrelated text and with too little history', () => {
  const m = train(history);
  assert.equal(predict(m, 'appeler le plombier demain'), null);
  assert.equal(predict(train([{ title: 'bot trading', cat: 'Trading' }]), 'bot trading'), null);
});
