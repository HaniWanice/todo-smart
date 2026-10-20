// One stroke icon set (24px grid, 1.75 stroke, drawn by CSS .i).

const P = {
  check: '<path d="m7.5 12.5 3 3 6-6.5"/>',
  doing: '<circle cx="12" cy="12" r="8.25"/><path d="M12 3.75a8.25 8.25 0 0 1 0 16.5z" class="fill"/>',
  star: '<path d="m12 3.6 2.6 5.3 5.8.85-4.2 4.1 1 5.8L12 16.9l-5.2 2.75 1-5.8-4.2-4.1 5.8-.85z"/>',
  pin: '<path d="M12 17v4.5"/><path d="M9 10.8a2 2 0 0 1-1.1 1.8l-1.8.9A2 2 0 0 0 5 15.3v.7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.7a2 2 0 0 0-1.1-1.8l-1.8-.9a2 2 0 0 1-1.1-1.8V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
  text: '<path d="M4.5 6.5h15M4.5 12h15M4.5 17.5h9"/>',
  trash: '<path d="M4 6.5h16M18 6.5V19a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6.5M9 6.5V4.8A1.8 1.8 0 0 1 10.8 3h2.4A1.8 1.8 0 0 1 15 4.8v1.7M10 11v5.5M14 11v5.5"/>',
  move: '<path d="M4 7.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9.5a2 2 0 0 0-2-2h-6.2L9.6 5H6a2 2 0 0 0-2 2.5"/><path d="M10 14h6M13.5 11.5 16 14l-2.5 2.5"/>',
  grip: '<circle cx="9" cy="6" r=".9" class="dot"/><circle cx="15" cy="6" r=".9" class="dot"/><circle cx="9" cy="12" r=".9" class="dot"/><circle cx="15" cy="12" r=".9" class="dot"/><circle cx="9" cy="18" r=".9" class="dot"/><circle cx="15" cy="18" r=".9" class="dot"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  send: '<path d="M12 19V5.5M5.5 12 12 5.5l6.5 6.5"/>',
  bold: '<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z"/>',
  italic: '<path d="M18 5h-8M14 19H6M14.5 5l-5 14"/>',
  list: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.5" cy="6.5" r="1" class="dot"/><circle cx="4.5" cy="12" r="1" class="dot"/><circle cx="4.5" cy="17.5" r="1" class="dot"/>',
  checks: '<path d="m3.5 6.5 1.8 1.8L8.5 5M3.5 16.5l1.8 1.8 3.2-3.3M12 6.5h8.5M12 12h8.5M12 17.5h8.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  moon: '<path d="M20 14.2A8 8 0 1 1 9.8 4a6.4 6.4 0 0 0 10.2 10.2z"/>',
  link: '<path d="M10 13.5a4.5 4.5 0 0 0 6.8.5l2.7-2.7a4.5 4.5 0 0 0-6.4-6.4l-1.5 1.5"/><path d="M14 10.5a4.5 4.5 0 0 0-6.8-.5l-2.7 2.7a4.5 4.5 0 0 0 6.4 6.4l1.5-1.5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4"/>',
  more: '<circle cx="5.5" cy="12" r="1.2" class="dot"/><circle cx="12" cy="12" r="1.2" class="dot"/><circle cx="18.5" cy="12" r="1.2" class="dot"/>',
  all: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 12h8M8 15h5"/>',
  circle: '<circle cx="12" cy="12" r="8.25"/>',
  done: '<circle cx="12" cy="12" r="8.25"/><path d="m8.5 12.3 2.4 2.4 4.6-5"/>',
  x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  palette: '<circle cx="12" cy="12" r="8.25"/><circle cx="8.6" cy="11" r=".9" class="dot"/><circle cx="12" cy="7.9" r=".9" class="dot"/><circle cx="15.4" cy="11" r=".9" class="dot"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>',
  upload: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 19.5h14"/>',
  pencil: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
};

export function icon(name, cls = '') {
  return `<svg class="i${cls ? ` ${cls}` : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${P[name]}</svg>`;
}
