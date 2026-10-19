// Rich text editing on contenteditable elements, stored as Markdown.
// Formatting comes from buttons, shortcuts or the selection toolbar, never typed syntax.

import { renderBlock } from './parse.js';

export const mdToHtml = renderBlock;

/* ---------- HTML -> Markdown ---------- */

function wrap(mark, text) {
  const [, lead, core, trail] = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
  return core ? `${lead}${mark}${core}${mark}${trail}` : text;
}

function inline(node) {
  let s = '';
  for (const c of node.childNodes) {
    if (c.nodeType === 3) s += c.textContent.replace(/ /g, ' ');
    else if (c.nodeType !== 1) continue;
    else if (c.nodeName === 'BR') s += '\n';
    else if (c.nodeName === 'UL' || c.nodeName === 'OL') continue;
    else if (/^(B|STRONG)$/.test(c.nodeName) || /bold|[6-9]00/.test(c.style?.fontWeight)) s += wrap('**', inline(c));
    else if (/^(I|EM)$/.test(c.nodeName) || c.style?.fontStyle === 'italic') s += wrap('*', inline(c));
    else if (c.nodeName === 'CODE') s += wrap('`', inline(c));
    else if (/^(S|STRIKE|DEL)$/.test(c.nodeName)) s += wrap('~~', inline(c));
    else s += inline(c);
  }
  return s;
}

const oneLine = (node) => inline(node).replace(/\n$/, '').replace(/\n/g, ' ');

export function htmlToMd(root) {
  const lines = [];
  let pending = null;
  const flush = () => { if (pending !== null) { lines.push(...pending.split('\n')); pending = null; } };
  const walk = (parent) => {
    for (const c of parent.childNodes) {
      const name = c.nodeName;
      if (c.nodeType === 3 || (c.nodeType === 1 && !/^(DIV|P|H[1-6]|UL|OL|LI|BR)$/.test(name))) {
        const frag = document.createElement('span');
        frag.append(c.cloneNode(true));
        pending = (pending ?? '') + inline(frag);
      } else if (name === 'BR') {
        if (pending !== null) flush(); else lines.push('');
      } else if (name === 'UL' || name === 'OL') {
        flush();
        const checks = c.classList.contains('checks');
        for (const li of c.children) {
          if (li.nodeName !== 'LI') continue;
          const t = oneLine(li);
          lines.push(checks ? `- [${li.dataset.checked === 'true' ? 'x' : ' '}] ${t}` : `- ${t}`);
          li.querySelectorAll(':scope > ul, :scope > ol').forEach((sub) => walk({ childNodes: [sub] }));
        }
      } else if (/^H[1-6]$/.test(name)) {
        flush();
        lines.push(`### ${oneLine(c)}`);
      } else if (c.querySelector?.(':scope > ul, :scope > ol, :scope > div, :scope > p')) {
        flush();
        walk(c);
      } else {
        flush();
        lines.push(...inline(c).replace(/\n$/, '').split('\n'));
      }
    }
  };
  walk(root);
  flush();
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\s*\n/, '').replace(/\s+$/, '');
}

/* ---------- Formatting ---------- */

function caretElement() {
  const sel = getSelection();
  if (!sel.rangeCount) return null;
  const n = sel.anchorNode;
  return n?.nodeType === 1 ? n : n?.parentElement;
}

export function editableRoot(node) {
  const el = node?.nodeType === 1 ? node : node?.parentElement;
  const root = el?.closest('[contenteditable="true"]');
  return root?.classList.contains('rich') ? root : null;
}

function markChecklist(ul) {
  ul.classList.add('checks');
  for (const li of ul.children) if (!li.dataset.checked) li.dataset.checked = 'false';
}

export function format(kind) {
  const root = editableRoot(caretElement());
  if (!root) return;
  if (kind === 'bold' || kind === 'italic') { document.execCommand(kind); return; }
  if (root.dataset.single === 'true') return;
  const ul = caretElement()?.closest('ul');
  const inChecks = !!ul?.classList.contains('checks');
  if (kind === 'bullets') {
    if (ul && inChecks) { ul.classList.remove('checks'); for (const li of ul.children) delete li.dataset.checked; }
    else document.execCommand('insertUnorderedList');
  } else if (kind === 'checks') {
    if (ul && !inChecks) markChecklist(ul);
    else {
      document.execCommand('insertUnorderedList');
      if (!inChecks) { const nu = caretElement()?.closest('ul'); if (nu) markChecklist(nu); }
    }
  }
  root.dispatchEvent(new Event('input', { bubbles: true }));
}

// Toggles a checklist box when the click lands on it. Returns true when it did.
export function toggleCheckFromClick(e) {
  const li = e.target.closest?.('ul.checks > li');
  if (!li) return false;
  if (e.clientX - li.getBoundingClientRect().left > 28) return false;
  li.dataset.checked = li.dataset.checked === 'true' ? 'false' : 'true';
  return true;
}

/* ---------- Behaviour ---------- */

// single: Enter submits (titles). Otherwise Enter = new line and Shift/Ctrl+Enter submits.
export function attachEditor(el, { single = false, onSubmit, onCancel } = {}) {
  el.contentEditable = 'true';
  el.dataset.single = String(single);
  el.spellcheck = true;
  const onKey = (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Enter' && !e.isComposing && (single || e.shiftKey || mod)) { e.preventDefault(); onSubmit?.(); return; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel?.(); return; }
    if (mod && !e.shiftKey && e.key.toLowerCase() === 'b') { e.preventDefault(); format('bold'); return; }
    if (mod && !e.shiftKey && e.key.toLowerCase() === 'i') { e.preventDefault(); format('italic'); return; }
    if (mod && e.shiftKey && (e.code === 'Digit8' || e.key === '8')) { e.preventDefault(); format('bullets'); return; }
    if (mod && e.shiftKey && (e.code === 'Digit9' || e.key === '9')) { e.preventDefault(); format('checks'); return; }
    // A new checklist line starts unchecked.
    if (e.key === 'Enter' && caretElement()?.closest('ul.checks')) {
      requestAnimationFrame(() => { const li = caretElement()?.closest('li'); if (li) li.dataset.checked = 'false'; });
    }
  };
  const onPaste = (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, single ? text.replace(/\s*\n\s*/g, ' ') : text);
  };
  const onInput = () => {
    // Keep :empty working for the placeholder.
    if (!el.textContent.trim() && !el.querySelector('li')) el.innerHTML = '';
  };
  el.addEventListener('keydown', onKey);
  el.addEventListener('paste', onPaste);
  el.addEventListener('input', onInput);
  return () => {
    el.removeEventListener('keydown', onKey);
    el.removeEventListener('paste', onPaste);
    el.removeEventListener('input', onInput);
    el.contentEditable = 'false';
  };
}

export function placeCaretAtEnd(el) {
  el.focus();
  const r = document.createRange();
  r.selectNodeContents(el);
  r.collapse(false);
  const s = getSelection();
  s.removeAllRanges();
  s.addRange(r);
}

export function selectAll(el) {
  el.focus();
  const r = document.createRange();
  r.selectNodeContents(el);
  const s = getSelection();
  s.removeAllRanges();
  s.addRange(r);
}
