// Capture parsing and lightweight Markdown rendering. Pure functions, no DOM.

const TAG = /(^|\s)#([\p{L}\p{N}_-]+)/gu;

export function fold(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function normalizeCat(s) {
  s = s.trim().replace(/[-_]+/g, ' ');
  return s.charAt(0).toLocaleUpperCase('fr') + s.slice(1);
}

// Reuse an existing category when the tag matches it, ignoring case and accents.
export function resolveCat(name, existing) {
  const key = fold(normalizeCat(name));
  return existing.find((c) => fold(c) === key) ?? normalizeCat(name);
}

// "Idée #business **vite**\ndétails" -> { title, desc, tag }
export function parseCapture(text) {
  const [first, ...rest] = text.split('\n');
  let tag = null;
  const title = first
    .replace(TAG, (m, pre, t) => { tag ??= t; return pre; })
    .replace(/\s{2,}/g, ' ')
    .trim();
  return { title, desc: rest.join('\n').trim(), tag };
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

// Block Markdown for descriptions: paragraphs, bullets, checklists, headings.
// Checkbox items carry their source line index so the UI can toggle them.
export function renderBlock(text) {
  const out = [];
  let list = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  const open = (kind) => { if (list !== kind) { close(); out.push(`<${kind}>`); list = kind; } };

  text.split('\n').forEach((line, i) => {
    let m;
    if ((m = line.match(CHECK))) {
      open('ul class="checks"');
      const on = m[1] !== ' ';
      out.push(`<li class="${on ? 'on' : ''}"><input type="checkbox" data-line="${i}"${on ? ' checked' : ''}><span>${renderInline(m[2])}</span></li>`);
    } else if ((m = line.match(BULLET))) {
      open('ul');
      out.push(`<li>${renderInline(m[1])}</li>`);
    } else if ((m = line.match(HEADING))) {
      close();
      out.push(`<h4>${renderInline(m[1])}</h4>`);
    } else if (line.trim()) {
      close();
      out.push(`<p>${renderInline(line)}</p>`);
    } else {
      close();
    }
  });
  close();
  // close() pushes "</ul class=...>" for check lists; normalise the tag.
  return out.join('').replace(/<\/ul class="checks">/g, '</ul>');
}

export function toggleCheckLine(text, index) {
  const lines = text.split('\n');
  lines[index] = lines[index].replace(/\[( |x|X)\]/, (m, c) => (c === ' ' ? '[x]' : '[ ]'));
  return lines.join('\n');
}
