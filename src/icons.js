/* Inline SVG icons (Lucide-style, currentColor). Sized by CSS. */
const S = (p, extra = "") =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${p}</svg>`;

export const icons = {
  menu: S(`<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>`),
  search: S(`<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>`),
  sun: S(`<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>`),
  chevronRight: S(`<polyline points="9 18 15 12 9 6"/>`),
  arrowRight: S(`<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>`),
  clock: S(`<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>`),
  book: S(`<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>`),
  sparkles: S(`<path d="M12 3l1.9 4.8L18 9.5l-4.1 1.7L12 16l-1.9-4.8L6 9.5l4.1-1.7z"/><path d="M19 14l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>`),
  target: S(`<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>`),
  bulb: S(`<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V18h6v-1.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"/>`),
  info: S(`<circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><circle cx="12" cy="8" r="1" fill="currentColor" stroke="none"/>`),
  warn: S(`<path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><circle cx="12" cy="17" r="1" fill="currentColor" stroke="none"/>`),
  analogy: S(`<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/><circle cx="9" cy="12" r="2.2"/><circle cx="15" cy="12" r="2.2"/><line x1="11.2" y1="12" x2="12.8" y2="12"/>`),
  example: S(`<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>`),
  key: S(`<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.5 12.5 19 4l2 2-2 2 1.5 1.5L18 11l-2-2"/>`),
  math: S(`<path d="M4 4h16"/><path d="M4 4l6 8-6 8h12"/>`),
  takeaway: S(`<path d="M20 6 9 17l-5-5"/>`),
  flip: S(`<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>`),
  assignment: S(`<path d="M9 3h6a1 1 0 0 1 1 1v1h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2V4a1 1 0 0 1 1-1z"/><path d="M9 12l2 2 4-4"/>`),
  diagram: S(`<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><path d="M10 6.5h4a3 3 0 0 1 3 3V14"/>`),
  quiz: S(`<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7"/><circle cx="12" cy="16.5" r="1" fill="currentColor" stroke="none"/>`)
};

export function refIcon(type) {
  const m = {
    paper: icons.math, video: icons.example, blog: icons.bulb,
    course: icons.book, docs: icons.info, book: icons.book
  };
  const label = { paper: "Paper", video: "Video", blog: "Blog", course: "Course", docs: "Docs", book: "Book" }[type] || "Link";
  return `<span style="display:flex;flex-direction:column;align-items:center;gap:2px;line-height:1">${(m[type] || icons.info)}<span style="font-size:.5rem">${label}</span></span>`;
}
