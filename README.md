# Designing Machine Learning Systems — Study Companion

An interactive, visual study companion for **[Designing Machine Learning Systems](https://www.oreilly.com/library/view/designing-machine-learning/9781098107956/)** by **Chip Huyen** (O'Reilly, 2022).

It summarizes all **11 chapters** in depth — beginner- and visual-learner friendly, without skipping advanced material — with real-world analogies, **71 hand-drawn 3D diagrams**, comparison tables, and a knowledge-test section (flashcards, quizzes, and assignments) at the end of every chapter.

> This is an **unofficial** educational companion. Summaries are written in our own words and are **not a substitute for the book** — please [buy it](https://www.oreilly.com/library/view/designing-machine-learning/9781098107956/) to support the author.

## Features

- 📚 Every chapter, every topic — concept-by-concept summaries
- 🎨 Rich, subtle-3D diagrams that recolor for light/dark themes (zero text overlap)
- 🌗 Light / dark theme toggle (no flash of unstyled content)
- 🔍 ⌘K full-text search across all chapters (works offline / `file://`)
- 📱 Responsive — collapsible sidebar on desktop, drawer on mobile
- 🧠 Flashcards, quizzes, and assignments to test your knowledge
- ⚡ No framework — a small static-site build with relative paths

## Tech

Plain static site. Content is authored as Markdown in `content/*.md` and compiled to `dist/*.html` by a small Node build (`src/build.js`) using:

- [`markdown-it`](https://github.com/markdown-it/markdown-it) + `markdown-it-container` / `markdown-it-attrs` for the `:::` directives
- [Shiki](https://shiki.style/) for build-time syntax highlighting
- [KaTeX](https://katex.org/) for build-time math
- [MiniSearch](https://lucaong.github.io/minisearch/) for the inlined full-text index
- Self-hosted **Google Sans Flex** (UI) + **Google Sans Code** (mono)

## Develop

```bash
npm install      # install dependencies
npm run build    # build the site into dist/
npm run serve    # serve dist/ at http://localhost:4321
```

Open `dist/index.html` directly (works from `file://`) or use `npm run serve`.

## Deploy

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds the site and
publishes `dist/` to **GitHub Pages**. All asset paths are relative, so it works from a
project sub-path as well as the domain root.

## Credits

All ideas and the source material belong to **Chip Huyen**. The book grew out of her
Stanford course [CS329S: Machine Learning Systems Design](https://stanford-cs329s.github.io/).
