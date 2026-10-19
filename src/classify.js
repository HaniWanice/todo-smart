// Local auto-classification: a tiny naive Bayes trained on the user's own
// categorised items. A background class (uniform over the vocabulary) means a
// category only wins when the text shares distinctive words with it.

import { fold } from './parse.js';

const STOP = new Set(`les des une est pour par avec dans sur pas que qui mais plus tout faire
fait ces son ses aux elle ils nous vous mon mes ton tes leur cette comme bien tres trop alors
donc car the and for with that this from have are not you your but all can will just`.split(/\s+/));

export function tokens(text) {
  return (fold(text).match(/[a-z0-9]{3,}/g) ?? [])
    .filter((w) => !STOP.has(w))
    .map((w) => w.replace(/s$/, '').slice(0, 7));
}

// items: [{ title, desc, cat }] — items without a category ("Inbox") are ignored.
export function train(items) {
  const cats = new Map();
  const vocab = new Set();
  let docs = 0;
  for (const it of items) {
    if (!it.cat) continue;
    const c = cats.get(it.cat) ?? { docs: 0, total: 0, words: new Map() };
    c.docs++;
    docs++;
    for (const w of tokens(`${it.title} ${it.desc ?? ''}`)) {
      c.words.set(w, (c.words.get(w) ?? 0) + 1);
      c.total++;
      vocab.add(w);
    }
    cats.set(it.cat, c);
  }
  return { cats, vocab, docs };
}

// Returns { cat, p } or null when no category is convincing enough.
export function predict(model, text, { minDocs = 2, threshold = 0.5 } = {}) {
  const words = tokens(text).filter((w) => model.vocab.has(w));
  if (!words.length) return null;
  const V = model.vocab.size + 1;
  const K = model.cats.size;
  const scores = [];
  for (const [cat, c] of model.cats) {
    if (c.docs < minDocs) continue;
    let s = Math.log(c.docs / model.docs) + Math.log(K / (K + 1));
    for (const w of words) s += Math.log(((c.words.get(w) ?? 0) + 1) / (c.total + V));
    scores.push([cat, s]);
  }
  if (!scores.length) return null;
  const bg = Math.log(1 / (K + 1)) + words.length * Math.log(1 / V);
  const max = Math.max(bg, ...scores.map(([, s]) => s));
  const z = Math.exp(bg - max) + scores.reduce((a, [, s]) => a + Math.exp(s - max), 0);
  const [cat, s] = scores.reduce((a, b) => (b[1] > a[1] ? b : a));
  const p = Math.exp(s - max) / z;
  return p >= threshold ? { cat, p } : null;
}
