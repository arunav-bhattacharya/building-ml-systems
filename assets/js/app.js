/* Designing ML Systems — companion site behavior.
   No framework. Wrapped localStorage in try/catch so it works on file://. */
(function () {
  "use strict";
  var LS = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };

  /* ---------------- Theme toggle ---------------- */
  function setTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    LS.set("dmls-theme", t);
    var btns = document.querySelectorAll("[data-theme-toggle]");
    btns.forEach(function (b) { b.setAttribute("aria-label", t === "dark" ? "Switch to light theme" : "Switch to dark theme"); });
  }
  function currentTheme() { return document.documentElement.getAttribute("data-theme") || "light"; }
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-theme-toggle]");
    if (t) { setTheme(currentTheme() === "dark" ? "light" : "dark"); }
  });

  /* ---------------- Sidebar collapse / mobile drawer ---------------- */
  var root = document.documentElement;
  var isMobile = function () { return window.matchMedia("(max-width: 820px)").matches; };
  // collapsed state is applied pre-paint by the inline <head> script; keep mobile clean
  if (isMobile()) root.classList.remove("side-collapsed");

  function closeDrawer() {
    root.classList.remove("side-open");
    var s = document.getElementById("scrim"); if (s) s.classList.remove("show");
  }
  function toggleSidebar() {
    if (isMobile()) {
      root.classList.toggle("side-open");
      var s = document.getElementById("scrim"); if (s) s.classList.toggle("show", root.classList.contains("side-open"));
    } else {
      root.classList.toggle("side-collapsed");
      LS.set("dmls-side", root.classList.contains("side-collapsed") ? "collapsed" : "open");
    }
  }
  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-side-toggle]")) { e.preventDefault(); toggleSidebar(); }
    if (e.target.id === "scrim") closeDrawer();
  });
  // close mobile drawer after navigating
  document.querySelectorAll(".sidebar a").forEach(function (a) {
    a.addEventListener("click", function () { if (isMobile()) closeDrawer(); });
  });

  /* ---------------- Scroll-spy TOC ---------------- */
  var tocLinks = Array.prototype.slice.call(document.querySelectorAll(".toc a[href^='#']"));
  if (tocLinks.length) {
    var targets = tocLinks.map(function (a) { return document.getElementById(a.getAttribute("href").slice(1)); }).filter(Boolean);
    var spy = function () {
      var pos = window.scrollY + 90;
      var cur = targets[0];
      for (var i = 0; i < targets.length; i++) { if (targets[i].offsetTop <= pos) cur = targets[i]; }
      tocLinks.forEach(function (a) {
        a.classList.toggle("active", cur && a.getAttribute("href") === "#" + cur.id);
      });
    };
    window.addEventListener("scroll", spy, { passive: true });
    window.addEventListener("resize", spy);
    spy();
  }

  /* ---------------- Flashcards: flip ---------------- */
  document.querySelectorAll(".flashcard").forEach(function (c) {
    c.addEventListener("click", function () { c.classList.toggle("flipped"); });
    c.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); c.classList.toggle("flipped"); } });
    c.setAttribute("tabindex", "0");
  });

  /* ---------------- Flashcards: one-at-a-time carousel ---------------- */
  document.querySelectorAll(".flashcards[data-deck]").forEach(function (deck) {
    var cards = deck.querySelectorAll(".flashcard");
    if (!cards.length) return;
    var prev = deck.querySelector(".fc-prev"), next = deck.querySelector(".fc-next");
    var counter = deck.querySelector(".fc-counter b");
    var idx = 0;
    function show(n) {
      cards[idx].classList.remove("active", "flipped");
      idx = Math.max(0, Math.min(n, cards.length - 1));
      cards[idx].classList.add("active");
      cards[idx].classList.remove("flipped");
      if (counter) counter.textContent = idx + 1;
      if (prev) prev.disabled = idx === 0;
      if (next) next.disabled = idx === cards.length - 1;
    }
    if (prev) prev.addEventListener("click", function (e) { e.stopPropagation(); show(idx - 1); });
    if (next) next.addEventListener("click", function (e) { e.stopPropagation(); show(idx + 1); });
    show(0);
  });

  /* ---------------- Knowledge tabs (flashcards / quizzes / assignment) ---------------- */
  document.querySelectorAll(".kn-tabs").forEach(function (tabs) {
    var btns = tabs.querySelectorAll(".kn-tab");
    var panels = tabs.querySelectorAll(".kn-panel");
    btns.forEach(function (b) {
      b.addEventListener("click", function () {
        btns.forEach(function (x) { x.classList.remove("active"); });
        panels.forEach(function (p) { p.classList.remove("active"); });
        b.classList.add("active");
        var panel = tabs.querySelector('.kn-panel[data-panel="' + b.getAttribute("data-tab") + '"]');
        if (panel) panel.classList.add("active");
      });
    });
  });

  /* ---------------- Quiz ---------------- */
  document.querySelectorAll(".quiz-q").forEach(function (q) {
    var opts = q.querySelectorAll(".quiz-opt");
    var explain = q.querySelector(".quiz-explain");
    opts.forEach(function (opt) {
      opt.addEventListener("click", function () {
        if (q.classList.contains("answered")) return;
        q.classList.add("answered");
        var correct = opt.getAttribute("data-correct") === "1";
        opt.classList.add(correct ? "correct" : "wrong");
        opt.querySelector(".opt-mark").textContent = correct ? "✓" : "✕";
        if (!correct) {
          opts.forEach(function (o) {
            if (o.getAttribute("data-correct") === "1") { o.classList.add("correct"); o.querySelector(".opt-mark").textContent = "✓"; }
          });
        }
        opts.forEach(function (o) { o.classList.add("disabled"); });
        if (explain) explain.classList.add("show");
      });
    });
  });

  /* ---------------- Code copy + expand ---------------- */
  document.querySelectorAll(".code-block .copy").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var pre = btn.closest(".code-block").querySelector("pre");
      var txt = pre ? pre.innerText : "";
      try { navigator.clipboard.writeText(txt); btn.textContent = "Copied!"; setTimeout(function () { btn.textContent = "Copy"; }, 1400); } catch (e) {}
    });
  });
  document.querySelectorAll(".code-expand").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var blk = btn.closest(".code-block");
      blk.classList.toggle("open");
      btn.textContent = blk.classList.contains("open") ? "Collapse" : "Show all";
    });
  });

  /* ---------------- Search (MiniSearch, built lazily) ---------------- */
  var overlay = document.getElementById("search-overlay");
  var input = document.getElementById("search-input");
  var resultsEl = document.getElementById("search-results");
  var mini = null, selIdx = -1, curResults = [];
  var BASE = (window.__BASE__ || "");

  function buildIndex() {
    if (mini || typeof MiniSearch === "undefined" || !window.__SEARCH_DOCS__) return;
    mini = new MiniSearch({
      fields: ["title", "chapter", "body"],
      storeFields: ["title", "chapter", "num", "url", "snippet"],
      searchOptions: { boost: { title: 3, chapter: 1 }, prefix: true, fuzzy: 0.2 }
    });
    mini.addAll(window.__SEARCH_DOCS__);
  }
  function openSearch() {
    if (!overlay) return;
    buildIndex();
    overlay.classList.add("open");
    input.value = ""; input.focus(); renderResults([]);
  }
  function closeSearch() { if (overlay) overlay.classList.remove("open"); }
  function esc(s) { return (s || "").replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function highlight(text, q) {
    if (!q) return esc(text);
    var terms = q.trim().split(/\s+/).filter(Boolean).map(function (t) { return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); });
    if (!terms.length) return esc(text);
    var re = new RegExp("(" + terms.join("|") + ")", "ig");
    return esc(text).replace(re, "<mark>$1</mark>");
  }
  function renderResults(res, q) {
    curResults = res; selIdx = res.length ? 0 : -1;
    if (!q) { resultsEl.innerHTML = '<div class="search-empty">Type to search all 11 chapters…</div>'; return; }
    if (!res.length) { resultsEl.innerHTML = '<div class="search-empty">No matches for “' + esc(q) + '”.</div>'; return; }
    resultsEl.innerHTML = res.slice(0, 20).map(function (r, i) {
      return '<a class="search-result' + (i === 0 ? " sel" : "") + '" href="' + BASE + r.url + '">' +
        '<div class="sr-title">' + highlight(r.title, q) + "</div>" +
        '<div class="sr-crumb">' + esc("Ch " + r.num + " · " + r.chapter) + "</div>" +
        '<div class="sr-snippet">' + highlight(r.snippet || "", q) + "</div></a>";
    }).join("");
  }
  function doSearch() {
    var q = input.value.trim();
    if (!mini || !q) { renderResults([], q); return; }
    var res = mini.search(q).map(function (r) { return r; });
    renderResults(res, q);
  }
  if (input) {
    input.addEventListener("input", doSearch);
    input.addEventListener("keydown", function (e) {
      var items = resultsEl.querySelectorAll(".search-result");
      if (e.key === "ArrowDown") { e.preventDefault(); selIdx = Math.min(selIdx + 1, items.length - 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); selIdx = Math.max(selIdx - 1, 0); }
      else if (e.key === "Enter") { if (items[selIdx]) window.location.href = items[selIdx].getAttribute("href"); return; }
      else return;
      items.forEach(function (it, i) { it.classList.toggle("sel", i === selIdx); });
      if (items[selIdx]) items[selIdx].scrollIntoView({ block: "nearest" });
    });
  }
  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-search-open]")) { e.preventDefault(); openSearch(); }
    if (e.target.id === "search-overlay") closeSearch();
  });
  document.addEventListener("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openSearch(); }
    else if (e.key === "/" && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); openSearch(); }
    else if (e.key === "Escape") closeSearch();
  });
})();
