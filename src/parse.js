// Lightweight Markdown rendering. Pure functions, no DOM.
// Storage format stays plain Markdown; the editor converts to and from this HTML.

export function fold(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function renderInline(s) {
  return escapeHtml(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<s>$1</s>')
    .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
}

const CHECK = /^\s*(?:[-*]\s+)?\[( |x|X)\]\s?(.*)$/;
const BULLET = /^\s*[-*•]\s+(.*)$/;
const HEADING = /^#{1,3}\s+(.*)$/;

// Lines become <div>s (like a contenteditable), lists become <ul>, checklists <ul class="checks">.
export function renderBlock(text) {
  const out = [];
  let list = null;
  const close = () => { if (list) { out.push('</ul>'); list = null; } };
  const open = (kind) => {
    if (list === kind) return;
    close();
    out.push(kind === 'checks' ? '<ul class="checks">' : '<ul>');
    list = kind;
  };
  for (const line of (text ?? '').split('\n')) {
    let m;
    if ((m = line.match(CHECK))) {
      open('checks');
      out.push(`<li data-checked="${m[1] !== ' '}">${renderInline(m[2]) || '<br>'}</li>`);
    } else if ((m = line.match(BULLET))) {
      open('bullets');
      out.push(`<li>${renderInline(m[1]) || '<br>'}</li>`);
    } else if ((m = line.match(HEADING))) {
      close();
      out.push(`<h3>${renderInline(m[1])}</h3>`);
    } else {
      close();
      out.push(`<div>${renderInline(line) || '<br>'}</div>`);
    }
  }
  close();
  return out.join('');
}
