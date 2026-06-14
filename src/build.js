/* ============================================================================
   Build: content/*.md  ->  dist/*.html  (+ search index, landing page)
   No framework. markdown-it + container/attrs, Shiki, KaTeX. Relative paths.
   ========================================================================== */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import MarkdownIt from "markdown-it";
import mdContainer from "markdown-it-container";
import mdAttrs from "markdown-it-attrs";
import katex from "katex";
import { createHighlighter } from "shiki";
import { icons, refIcon } from "./icons.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CONTENT = path.join(ROOT, "content");
const DIST = path.join(ROOT, "dist");
const ASSETS = path.join(ROOT, "assets");

const meta = JSON.parse(fs.readFileSync(path.join(CONTENT, "_meta.json"), "utf8"));
const SECTIONS = meta.sections;

/* ---- category -> accent color var + roadmap grouping ---- */
const CAT_COLOR = {
  "Project Setup": "--blue", "Data": "--green", "Modeling": "--amber",
  "Deployment": "--coral", "Operations": "--violet", "People": "--accent"
};
const STAGES = [
  { key: "Project Setup", title: "Frame the problem", desc: "Why ML, business alignment, requirements, and how to frame the task." },
  { key: "Data", title: "Engineer the data", desc: "Pipelines, training data, sampling, labeling, and features — the fuel of ML." },
  { key: "Modeling", title: "Develop & evaluate models", desc: "Pick, train, track, and rigorously evaluate models before they ship." },
  { key: "Deployment", title: "Deploy a prediction service", desc: "Batch vs online, compression, and serving on cloud or edge." },
  { key: "Operations", title: "Operate in production", desc: "Detect distribution shifts, monitor, retrain continually, and test live." },
  { key: "People", title: "The human side", desc: "User experience, team structure, and responsible AI." }
];

/* ============================================================================
   Shiki (preload once; codeToHtml is sync afterwards)
   ========================================================================== */
const highlighter = await createHighlighter({
  themes: ["github-light", "github-dark"],
  langs: ["python", "javascript", "typescript", "bash", "json", "yaml", "sql", "text", "diff"]
});
function highlight(code, lang) {
  const l = highlighter.getLoadedLanguages().includes(lang) ? lang : "text";
  return highlighter.codeToHtml(code, {
    lang: l,
    themes: { light: "github-light", dark: "github-dark" },
    defaultColor: false
  });
}

/* ============================================================================
   markdown-it
   ========================================================================== */
const md = new MarkdownIt({ html: true, linkify: true, typographer: true, breaks: false });
md.use(mdAttrs);

/* ---- per-page render state ---- */
let figCounter = 0;
let curNum = "";

/* ---- math: $inline$ and $$block$$ ---- */
function mathInline(state, silent) {
  const src = state.src, start = state.pos;
  if (src.charCodeAt(start) !== 0x24 /* $ */) return false;
  if (src.charCodeAt(start + 1) === 0x24) return false;
  // avoid "$5" currency: require non-space right after $
  if (/\s/.test(src[start + 1] || " ")) return false;
  let end = start + 1;
  while (end < src.length) {
    if (src[end] === "\\") { end += 2; continue; }
    if (src[end] === "$") break;
    end++;
  }
  if (end >= src.length || end === start + 1) return false;
  const content = src.slice(start + 1, end);
  // guard against prose/currency false-positives (e.g. "$86.61 ... $158")
  if (content.length > 140 || /\.\s|\s{3,}|^\s|\s$/.test(content)) return false;
  if (!silent) { const t = state.push("math_inline", "", 0); t.content = content; }
  state.pos = end + 1;
  return true;
}
function mathBlock(state, startLine, endLine, silent) {
  const pos = state.bMarks[startLine] + state.tShift[startLine];
  const max = state.eMarks[startLine];
  if (pos + 2 > max) return false;
  if (state.src.slice(pos, pos + 2) !== "$$") return false;
  let firstLine = state.src.slice(pos + 2, max);
  let content = "", nextLine = startLine, found = false;
  if (firstLine.trim().endsWith("$$")) { content = firstLine.trim().slice(0, -2); found = true; }
  while (!found) {
    nextLine++;
    if (nextLine >= endLine) break;
    const ls = state.bMarks[nextLine] + state.tShift[nextLine];
    const le = state.eMarks[nextLine];
    const line = state.src.slice(ls, le);
    if (line.trim().endsWith("$$")) { content += "\n" + line.trim().slice(0, -2); found = true; }
    else { content += (content ? "\n" : "") + line; }
  }
  if (!found) return false;
  if (silent) return true;
  const token = state.push("math_block", "", 0);
  token.content = (firstLine.trim().endsWith("$$") ? content : content).trim();
  token.map = [startLine, nextLine + 1];
  state.line = nextLine + 1;
  return true;
}
md.inline.ruler.after("escape", "math_inline", mathInline);
md.block.ruler.after("blockquote", "math_block", mathBlock, { alt: ["paragraph", "blockquote", "list"] });
md.renderer.rules.math_inline = (t, i) => katex.renderToString(t[i].content, { throwOnError: false });
md.renderer.rules.math_block = (t, i) =>
  '<div class="math-block">' + katex.renderToString(t[i].content, { displayMode: true, throwOnError: false }) + "</div>";

/* ---- tables wrapped for horizontal scroll ---- */
md.renderer.rules.table_open = () => '<div class="table-wrap"><table>';
md.renderer.rules.table_close = () => "</table></div>";

/* ---- headings get ids + anchor; collect for TOC ---- */
function slugify(s) {
  return s.toLowerCase().replace(/<[^>]+>/g, "").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60);
}

// Split raw markdown into the intro (title:null) + one entry per H2 (ignoring fenced blocks).
function splitSections(mdText) {
  const lines = mdText.split("\n");
  const secs = []; let cur = { title: null, lines: [] }; let inFence = false;
  for (const ln of lines) {
    if (/^```/.test(ln)) inFence = !inFence;
    const m = !inFence && /^##\s+(.+)$/.exec(ln);
    if (m) { secs.push(cur); cur = { title: m[1].trim(), lines: [] }; }
    else cur.lines.push(ln);
  }
  secs.push(cur);
  return secs;
}
// Strip markdown/HTML/directives down to plain searchable text.
function stripMd(s) {
  return s.replace(/```[\s\S]*?```/g, " ").replace(/<[^>]+>/g, " ")
    .replace(/:::[^\n]*/g, " ").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`|]/g, " ").replace(/\s+/g, " ").trim();
}

/* ============================================================================
   Containers: objectives, callout, takeaways
   ========================================================================== */
md.use(mdContainer, "objectives", {
  validate: (p) => /^objectives\s*(.*)$/.test(p.trim()),
  render(tokens, idx) {
    if (tokens[idx].nesting === 1) {
      const m = tokens[idx].info.trim().match(/^objectives\s*"?([^"]*)"?$/);
      const title = (m && m[1]) ? m[1] : "What you'll learn";
      return `<section class="objectives"><div class="obj-head">${icons.target}<span>${title}</span></div>`;
    }
    return "</section>\n";
  }
});

const CALLOUT_META = {
  tip: { icon: "bulb", label: "Tip" }, note: { icon: "info", label: "Note" },
  warning: { icon: "warn", label: "Watch out" }, analogy: { icon: "analogy", label: "Analogy" },
  example: { icon: "example", label: "Example" }, key: { icon: "key", label: "Key idea" },
  math: { icon: "math", label: "The math" }
};
md.use(mdContainer, "callout", {
  validate: (p) => /^callout\s+(\w+)/.test(p.trim()),
  render(tokens, idx) {
    if (tokens[idx].nesting === 1) {
      const m = tokens[idx].info.trim().match(/^callout\s+(\w+)\s*"?([^"]*)"?$/);
      const type = (m && CALLOUT_META[m[1]]) ? m[1] : "note";
      const cm = CALLOUT_META[type];
      const title = (m && m[2]) ? m[2] : cm.label;
      return `<div class="callout ${type}"><span class="callout-icon">${icons[cm.icon]}</span>` +
        `<div class="callout-title">${title}</div>`;
    }
    return "</div>\n";
  }
});

md.use(mdContainer, "takeaways", {
  validate: (p) => /^takeaways/.test(p.trim()),
  render(tokens, idx) {
    if (tokens[idx].nesting === 1)
      return `<section class="takeaways"><div class="tk-head">${icons.takeaway}<span>Key takeaways</span></div>`;
    return "</section>\n";
  }
});

/* ============================================================================
   Fences: diagram, flashcards, quiz, assignment, refs, code
   ========================================================================== */
const defaultFence = md.renderer.rules.fence.bind(md.renderer.rules);
md.renderer.rules.fence = function (tokens, idx, options, env, self) {
  const token = tokens[idx];
  const info = (token.info || "").trim();
  const lang = info.split(/\s+/)[0];
  const rest = info.slice(lang.length).trim();
  const code = token.content;

  if (lang === "diagram") return renderDiagram(code, rest);
  if (lang === "flashcards") return renderFlashcards(code);
  if (lang === "quiz") return renderQuiz(code);
  if (lang === "assignment") return renderAssignment(code, rest);
  if (lang === "refs") return renderRefs(code);

  // regular code block via Shiki, with header + optional title/collapsible
  const titleMatch = rest.match(/title="([^"]*)"/);
  const title = titleMatch ? titleMatch[1] : lang;
  const collapsible = /\bcollapsible\b/.test(rest);
  let html;
  try { html = highlight(code, lang || "text"); }
  catch (e) { html = "<pre class='shiki'><code>" + escapeHtml(code) + "</code></pre>"; }
  return `<div class="code-block${collapsible ? " collapsible" : ""}">` +
    `<div class="code-head"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span>` +
    `<span class="ttl">${escapeHtml(title)}</span><button class="copy">Copy</button></div>` +
    html +
    (collapsible ? `<button class="code-expand">Show all</button>` : "") +
    `</div>`;
};

function renderDiagram(svg, rest) {
  figCounter++;
  const capMatch = rest.match(/"([^"]*)"/);
  const caption = capMatch ? capMatch[1] : rest;
  const figNum = curNum ? `${curNum}.${figCounter}` : `${figCounter}`;
  const capHtml = caption ? `<figcaption><span class="fig-num">Figure ${figNum}</span> — ${md.renderInline(caption)}</figcaption>` : "";
  return `<figure class="diagram">${svg}\n${capHtml}</figure>\n`;
}

function renderFlashcards(content) {
  const cards = content.split(/\n-{3,}\n/).map((c) => c.trim()).filter(Boolean);
  const out = cards.map((c, i) => {
    const qm = c.match(/Q:\s*([\s\S]*?)(?:\nA:|$)/);
    const am = c.match(/A:\s*([\s\S]*)$/);
    const q = qm ? qm[1].trim() : c;
    const a = am ? am[1].trim() : "";
    return `<div class="flashcard${i === 0 ? " active" : ""}"><div class="flashcard-inner">` +
      `<div class="flashcard-face flashcard-front"><div class="fc-tag">Flashcard ${i + 1}</div><div class="fc-q">${md.renderInline(q)}</div>` +
      `<div class="fc-hint">${icons.flip} tap to flip</div></div>` +
      `<div class="flashcard-face flashcard-back"><div class="fc-tag">Answer</div><div class="fc-a">${md.renderInline(a)}</div></div>` +
      `</div></div>`;
  }).join("\n");
  // one card at a time, with prev/next navigation
  return `<div class="flashcards" data-deck>` +
    `<div class="fc-viewport">${out}</div>` +
    `<div class="fc-nav"><button class="fc-prev" aria-label="Previous card">${icons.chevronLeft}<span>Prev</span></button>` +
    `<span class="fc-counter"><b>1</b> / ${cards.length}</span>` +
    `<button class="fc-next" aria-label="Next card"><span>Next</span>${icons.chevronRight}</button></div>` +
    `</div>\n`;
}

function renderQuiz(content) {
  const lines = content.split("\n");
  const questions = [];
  let cur = null;
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    const opt = line.match(/^\s*-\s*\(([ xX])\)\s*(.*)$/);
    if (opt) { if (cur) cur.options.push({ text: opt[2], correct: opt[1].toLowerCase() === "x" }); continue; }
    if (/^\s*>\s?/.test(line)) { if (cur) cur.explain += (cur.explain ? " " : "") + line.replace(/^\s*>\s?/, ""); continue; }
    if (line.trim() === "") continue;
    cur = { text: line.trim(), options: [], explain: "" };
    questions.push(cur);
  }
  const out = questions.map((q, qi) => {
    const opts = q.options.map((o) =>
      `<div class="quiz-opt" data-correct="${o.correct ? 1 : 0}"><span class="opt-mark"></span><span>${md.renderInline(o.text)}</span></div>`
    ).join("");
    const ex = q.explain ? `<div class="quiz-explain"><b>Why:</b> ${md.renderInline(q.explain)}</div>` : "";
    return `<div class="quiz-q"><div class="q-text"><span class="q-n">Q${qi + 1}.</span>${md.renderInline(q.text)}</div>${opts}${ex}</div>`;
  }).join("\n");
  return `<div class="quiz">${out}</div>\n`;
}

function renderAssignment(content, rest) {
  const titleMatch = rest.match(/"([^"]*)"/);
  const title = titleMatch ? titleMatch[1] : "Assignment";
  const levelMatch = rest.match(/level=(\w+)/);
  const level = levelMatch ? levelMatch[1].toLowerCase() : "intermediate";
  const body = md.render(content);
  return `<div class="assignment"><div class="as-head">${icons.assignment}<span class="as-title">${escapeHtml(title)}</span>` +
    `<span class="as-level ${level}">${level}</span></div>${body}</div>\n`;
}

function renderRefs(content) {
  const rows = content.split("\n").map((l) => l.trim()).filter(Boolean);
  const out = rows.map((row) => {
    const parts = row.split("|").map((s) => s.trim());
    const [type, title, url, desc] = [parts[0] || "blog", parts[1] || "", parts[2] || "#", parts[3] || ""];
    const t = ["paper", "video", "blog", "course", "docs", "book"].includes(type) ? type : "blog";
    const host = url.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return `<a class="ref-item" href="${url}" target="_blank" rel="noopener">` +
      `<span class="ref-type ${t}">${refIcon(t)}</span>` +
      `<span class="ref-body"><span class="ref-title">${escapeHtml(title)}</span>` +
      (desc ? `<span class="ref-desc">${escapeHtml(desc)}</span>` : "") +
      `<span class="ref-url">${escapeHtml(host)}</span></span></a>`;
  }).join("\n");
  return `<div class="refs">${out}</div>\n`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// Return the full <div>…</div> starting at startIdx, accounting for nested divs.
function extractDiv(html, startIdx) {
  const tagRe = /<\/?div\b[^>]*>/g;
  tagRe.lastIndex = startIdx;
  let depth = 0, m;
  while ((m = tagRe.exec(html))) {
    depth += m[0][1] === "/" ? -1 : 1;
    if (depth === 0) return { block: html.slice(startIdx, tagRe.lastIndex), end: tagRe.lastIndex };
  }
  return null;
}
// Group the chapter's flashcards / quiz / assignment blocks into a tabbed widget.
function wrapKnowledge(html) {
  const fIdx = html.indexOf('<div class="flashcards"');
  if (fIdx < 0) return html;
  const f = extractDiv(html, fIdx);
  if (!f) return html;
  const qIdx = html.indexOf('<div class="quiz"', f.end);
  const q = qIdx >= 0 ? extractDiv(html, qIdx) : null;
  const aIdx = html.indexOf('<div class="assignment"', q ? q.end : f.end);
  const a = aIdx >= 0 ? extractDiv(html, aIdx) : null;
  const nCards = (f.block.match(/class="flashcard[ "]/g) || []).length;
  const nQuiz = q ? (q.block.match(/class="quiz-q"/g) || []).length : 0;
  const tabs =
    `<div class="kn-tabs">` +
    `<div class="kn-tablist" role="tablist">` +
    `<button class="kn-tab active" data-tab="fc">${icons.cards}<span>Flashcards</span><span class="kn-count">${nCards}</span></button>` +
    (q ? `<button class="kn-tab" data-tab="qz">${icons.quiz}<span>Quizzes</span><span class="kn-count">${nQuiz}</span></button>` : "") +
    (a ? `<button class="kn-tab" data-tab="as">${icons.assignment}<span>Assignment</span></button>` : "") +
    `</div>` +
    `<div class="kn-panel active" data-panel="fc">${f.block}</div>` +
    (q ? `<div class="kn-panel" data-panel="qz">${q.block}</div>` : "") +
    (a ? `<div class="kn-panel" data-panel="as">${a.block}</div>` : "") +
    `</div>`;
  const endIdx = a ? a.end : (q ? q.end : f.end);
  return html.slice(0, fIdx) + tabs + html.slice(endIdx);
}

/* ============================================================================
   Render one markdown doc -> { html, toc, headings, plain }
   ========================================================================== */
function renderDoc(mdText, num) {
  figCounter = 0; curNum = num;
  const env = {};
  const tokens = md.parse(mdText, env);
  const toc = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === "heading_open" && (t.tag === "h2" || t.tag === "h3")) {
      const inline = tokens[i + 1];
      const text = inline.content;
      const id = slugify(text);
      t.attrSet("id", id);
      t.attrSet("class", "anchored");
      toc.push({ level: t.tag === "h2" ? 2 : 3, id, text });
    }
  }
  const html = wrapKnowledge(md.renderer.render(tokens, md.options, env));
  const plain = mdText.replace(/```[\s\S]*?```/g, " ").replace(/[#>*_`|:-]/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return { html, toc, plain };
}

/* ============================================================================
   Page shell
   ========================================================================== */
function head(title, desc) {
  return `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(desc || meta.title)}">
<script>(function(){try{var t=localStorage.getItem('dmls-theme');if(!t)t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.setAttribute('data-theme',t);if(localStorage.getItem('dmls-side')==='collapsed'&&!window.matchMedia('(max-width:820px)').matches)document.documentElement.classList.add('side-collapsed');}catch(e){document.documentElement.setAttribute('data-theme','light');}})();</script>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="assets/fonts/fonts.css">
<link rel="stylesheet" href="assets/katex/katex.min.css">
<link rel="stylesheet" href="assets/css/styles.css">
<link rel="icon" href="assets/favicon.svg">
</head>`;
}

const SVG_DEFS = `<svg class="dg-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>
<linearGradient id="dg-surface" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="dgs0"/><stop offset="1" class="dgs1"/></linearGradient>
<linearGradient id="dg-accent" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="dga0"/><stop offset="1" class="dga1"/></linearGradient>
<linearGradient id="dg-blue" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="dgb0"/><stop offset="1" class="dgb1"/></linearGradient>
<linearGradient id="dg-green" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="dgg0"/><stop offset="1" class="dgg1"/></linearGradient>
<linearGradient id="dg-amber" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="dgam0"/><stop offset="1" class="dgam1"/></linearGradient>
<linearGradient id="dg-coral" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="dgc0"/><stop offset="1" class="dgc1"/></linearGradient>
<linearGradient id="dg-violet" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="dgv0"/><stop offset="1" class="dgv1"/></linearGradient>
<marker id="dg-arrow" markerWidth="9" markerHeight="9" refX="7.2" refY="3" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L7.5,3 L0,6 Z" class="dg-ah"/></marker>
<marker id="dg-arrow-accent" markerWidth="9" markerHeight="9" refX="7.2" refY="3" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L7.5,3 L0,6 Z" class="dg-ah-accent"/></marker>
</defs></svg>`;

function topbar() {
  return `<header class="topbar">
<button class="icon-btn sidebar-toggle" data-side-toggle aria-label="Toggle sidebar">${icons.menu}</button>
<a class="brand" href="index.html"><span class="brand-logo">ML</span><span class="brand-text"><b>Designing ML Systems</b><span>Study companion</span></span></a>
<div class="spacer"></div>
<button class="search-trigger" data-search-open aria-label="Search"><span>${icons.search}</span><span class="st-label">Search…</span><kbd>⌘K</kbd></button>
<button class="icon-btn" data-theme-toggle aria-label="Toggle theme"><span class="theme-sun">${icons.sun}</span></button>
</header>`;
}

function sidebar(activeSlug) {
  // partition chapters into the same colored groups used on the landing page
  const groups = STAGES
    .map((st) => ({ key: st.key, color: CAT_COLOR[st.key] || "--accent", items: SECTIONS.filter((s) => s.category === st.key) }))
    .filter((g) => g.items.length);
  const groupsHtml = groups.map((g) => {
    const links = g.items.map((s) =>
      `<a class="side-link${s.slug === activeSlug ? " active" : ""}" href="${s.slug}.html"><span class="num">${s.num}</span><span>${escapeHtml(s.title)}</span></a>`
    ).join("\n");
    return `<div class="side-group" style="--cat: var(${g.color})">
<div class="side-glabel"><span class="side-dot"></span>${escapeHtml(g.key)}</div>
<div class="side-glinks">${links}</div>
</div>`;
  }).join("\n");
  return `<aside class="sidebar"><nav>${groupsHtml}</nav></aside>
<button class="side-reopen" data-side-toggle aria-label="Open sidebar">${icons.chevronRight}</button>`;
}

function tocRail(num, toc) {
  const items = toc.map((h) =>
    `<a class="${h.level === 3 ? "lvl-3" : "lvl-2"}" href="#${h.id}">${escapeHtml(h.text)}</a>`
  ).join("\n");
  return `<nav class="toc"><div class="toc-bignum">${num}</div><div class="toc-h">On this page</div>${items}</nav>`;
}

function searchOverlay() {
  return `<div class="search-overlay" id="search-overlay">
<div class="search-modal">
<div class="search-input-row">${icons.search}<input id="search-input" type="text" placeholder="Search chapters, concepts, terms…" autocomplete="off" spellcheck="false"><kbd>esc</kbd></div>
<div class="search-results" id="search-results"></div>
</div></div>
<div class="scrim" id="scrim"></div>`;
}

function scripts() {
  return `<script src="assets/js/minisearch.min.js"></script>
<script src="assets/search-index.js"></script>
<script src="assets/js/app.js"></script>`;
}

function pager(idx) {
  const prev = SECTIONS[idx - 1], next = SECTIONS[idx + 1];
  let h = '<nav class="pager">';
  h += prev ? `<a href="${prev.slug}.html"><div class="pg-dir">← Previous</div><div class="pg-title">${escapeHtml(prev.title)}</div></a>` : "<span style='flex:1'></span>";
  h += next ? `<a class="pg-next" href="${next.slug}.html"><div class="pg-dir">Next →</div><div class="pg-title">${escapeHtml(next.title)}</div></a>` : "<span style='flex:1'></span>";
  h += "</nav>";
  return h;
}

function chapterPage(section, idx, rendered) {
  const catColor = CAT_COLOR[section.category] || "--accent";
  const nCards = (rendered.html.match(/class="flashcard[ "]/g) || []).length;
  const nQuiz = (rendered.html.match(/class="quiz-q"/g) || []).length;
  const nAssign = (rendered.html.match(/class="assignment"/g) || []).length;
  const plural = (n, s, p) => `${n} ${n === 1 ? s : (p || s + "s")}`;
  const metaItems = [
    { ic: icons.clock, t: `~${section.time} min` },
    { ic: icons.cards, t: plural(nCards, "flashcard") },
    { ic: icons.quiz, t: plural(nQuiz, "quiz", "quizzes") },
    { ic: icons.assignment, t: plural(nAssign, "assignment") }
  ];
  const metaHtml = metaItems.map((m) => `<span class="cm-item">${m.ic}<span>${m.t}</span></span>`).join("");
  return head(`${section.num}. ${section.title} — ${meta.title}`, section.desc) +
    `<body>` + SVG_DEFS + topbar() + `<div class="app">` + sidebar(section.slug) +
    `<main class="main"><article class="content">` +
    `<div class="chapter-kicker"><span class="kicker-tag" style="color:var(${catColor});background:color-mix(in srgb, var(${catColor}) 12%, transparent);border-color:color-mix(in srgb, var(${catColor}) 30%, transparent)">Chapter ${section.num} · ${escapeHtml(section.category)}</span></div>` +
    `<h1>${escapeHtml(section.title)}</h1>` +
    (section.lede ? `<p class="chapter-lede">${escapeHtml(section.lede)}</p>` : "") +
    `<div class="chapter-meta">${metaHtml}</div>` +
    rendered.html +
    pager(idx) +
    `</article></main>` +
    tocRail(section.num, rendered.toc) +
    `</div>` + searchOverlay() + scripts() + `</body></html>`;
}

/* ============================================================================
   Landing page
   ========================================================================== */
function landingPage() {
  const features = [
    { ic: "book", color: "--accent", t: "Every chapter, in depth", d: "All 11 chapters summarized topic-by-topic — beginner-friendly, but nothing advanced is skipped." },
    { ic: "analogy", color: "--violet", t: "Real-world analogies", d: "Hard ideas — distribution shift, leakage, bandits — explained with everyday comparisons." },
    { ic: "diagram", color: "--blue", t: "Rich 3D diagrams", d: "Hand-drawn, theme-aware visuals for architectures, pipelines, and trade-offs." },
    { ic: "quiz", color: "--green", t: "Test your knowledge", d: "Flashcards, quizzes, and hands-on assignments close every chapter." }
  ];
  const featureCards = features.map((f) =>
    `<div class="feature-card"><div class="fc-ic" style="background:linear-gradient(145deg, var(${f.color}), color-mix(in srgb, var(${f.color}) 70%, #000))">${icons[f.ic]}</div><h3>${f.t}</h3><p>${f.d}</p></div>`
  ).join("");

  const cards = SECTIONS.map((s) => {
    const catColor = CAT_COLOR[s.category] || "--accent";
    return `<a class="chapter-card" href="${s.slug}.html">
<div class="cc-top"><span class="cc-num" style="background:linear-gradient(145deg, var(${catColor}), color-mix(in srgb, var(${catColor}) 65%, #000))">${s.num}</span>
<div class="cc-cat" style="color:var(${catColor})">${escapeHtml(s.category)}</div></div>
<h3>${escapeHtml(s.title)}</h3><p>${escapeHtml(s.desc)}</p>
<div class="cc-time">${icons.clock} ~${s.time} min</div></a>`;
  }).join("\n");

  const roadmap = STAGES.map((st, i) => {
    const secs = SECTIONS.filter((s) => s.category === st.key);
    const color = CAT_COLOR[st.key] || "--accent";
    const chips = secs.map((s) => `<a href="${s.slug}.html">Ch ${s.num}</a>`).join("");
    return `<div class="stage"><div class="stage-badge" style="background:linear-gradient(145deg, var(${color}), color-mix(in srgb, var(${color}) 65%, #000))">${i + 1}</div>
<div class="stage-body"><h4>${st.title}</h4><p>${st.desc}</p><div class="stage-chs">${chips}</div></div></div>`;
  }).join("\n");

  const body = `<body>${SVG_DEFS}${topbar()}<div class="app no-toc">${sidebar("")}<main class="main">
<section class="hero">
<h1>Designing <span class="grad">Machine Learning</span> Systems</h1>
<p class="hero-sub">A visual, beginner-friendly companion to Chip Huyen's guide for building production-ready ML systems — from framing the problem to operating models in the wild.</p>
<p class="hero-byline">Based on the book by <strong>Chip Huyen</strong> (O'Reilly, 2022) · 11 chapters</p>
<div class="hero-cta"><a class="btn btn-primary" href="${SECTIONS[0].slug}.html">${icons.book} Start with Chapter 1</a>
<button class="btn btn-ghost" data-search-open>${icons.search} Search the book</button></div>
</section>
<div class="section-wrap">
<h2 class="section-title">Browse the chapters</h2>
<p class="section-desc">Eleven chapters, grouped by the lifecycle of a real ML system.</p>
<div class="browse-grid">${cards}</div>
<h2 class="section-title">The ML systems lifecycle</h2>
<p class="section-desc">How the chapters fit together, end to end.</p>
<div class="roadmap">${roadmap}</div>
<h2 class="section-title">Why this companion?</h2>
<p class="section-desc">Built to make a dense, production-focused book click — and stick.</p>
<div class="feature-grid">${featureCards}</div>
</div>
${footer()}
</main></div>${searchOverlay()}${scripts()}</body></html>`;
  return head(meta.title + " — Study Companion", meta.subtitle) + body;
}

function footer() {
  return `<footer class="site-footer"><div class="footer-inner">
<div class="ft-col"><h4>About this companion</h4>
<p>An unofficial, open study companion summarizing <em>Designing Machine Learning Systems</em> by Chip Huyen. Built for learners — concise summaries, original explanations, diagrams, and self-tests.</p>
<p class="footer-disclaimer">Summaries are written in our own words for educational use and are not a substitute for the book. All credit for the ideas belongs to the author.</p></div>
<div class="ft-col"><h4>Get the book</h4>
<p>Support the author — read the full text:</p>
<p><a href="https://www.oreilly.com/library/view/designing-machine-learning/9781098107956/" target="_blank" rel="noopener">O'Reilly · Designing Machine Learning Systems →</a></p>
<p><a href="https://huyenchip.com/books/" target="_blank" rel="noopener">Chip Huyen — author site →</a></p></div>
</div></footer>`;
}

/* ============================================================================
   Build
   ========================================================================== */
function rmrf(p) { if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true }); }
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

rmrf(DIST);
fs.mkdirSync(DIST, { recursive: true });

// assets
copyDir(ASSETS, path.join(DIST, "assets"));
// minisearch UMD
const miniSrc = path.join(ROOT, "node_modules", "minisearch", "dist", "umd", "index.js");
fs.copyFileSync(miniSrc, path.join(DIST, "assets", "js", "minisearch.min.js"));
// katex css + fonts
const katexDist = path.join(ROOT, "node_modules", "katex", "dist");
fs.mkdirSync(path.join(DIST, "assets", "katex", "fonts"), { recursive: true });
fs.copyFileSync(path.join(katexDist, "katex.min.css"), path.join(DIST, "assets", "katex", "katex.min.css"));
copyDir(path.join(katexDist, "fonts"), path.join(DIST, "assets", "katex", "fonts"));
// favicon
fs.writeFileSync(path.join(DIST, "assets", "favicon.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#cf1d6e"/><text x="32" y="44" font-family="Arial" font-size="30" font-weight="700" fill="#fff" text-anchor="middle">ML</text></svg>`);

// chapters
const searchDocs = [];
let docId = 1;
SECTIONS.forEach((section, idx) => {
  const file = path.join(CONTENT, section.slug + ".md");
  if (!fs.existsSync(file)) { console.warn("⚠ missing", section.slug + ".md"); return; }
  const mdText = fs.readFileSync(file, "utf8");
  const rendered = renderDoc(mdText, section.num);
  fs.writeFileSync(path.join(DIST, section.slug + ".html"), chapterPage(section, idx, rendered));

  // search docs: a whole-chapter doc + one per H2 section (with section body text)
  const plain = rendered.plain;
  const parsed = splitSections(mdText);
  const intro = stripMd(parsed[0].lines.join("\n"));
  searchDocs.push({ id: docId++, title: section.title, chapter: section.title, num: section.num, url: `${section.slug}.html`, body: plain.slice(0, 9000), snippet: (section.lede || intro).slice(0, 180) });
  parsed.slice(1).forEach((s) => {
    const body = stripMd(s.lines.join("\n"));
    const id = slugify(s.title);
    searchDocs.push({ id: docId++, title: s.title, chapter: section.title, num: section.num, url: `${section.slug}.html#${id}`, body: (s.title + " " + body).slice(0, 4000), snippet: body.slice(0, 160) || ("Section in Chapter " + section.num) });
  });
  console.log("✓", section.slug, "(" + rendered.toc.length + " headings)");
});

// landing
fs.writeFileSync(path.join(DIST, "index.html"), landingPage());

// search index
fs.writeFileSync(path.join(DIST, "assets", "search-index.js"), "window.__SEARCH_DOCS__=" + JSON.stringify(searchDocs) + ";");

console.log("\nBuilt", SECTIONS.length, "chapters + landing →", path.relative(ROOT, DIST));
