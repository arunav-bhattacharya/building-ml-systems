/* Minimal static file server for the built dist/ folder.
   Serves relative to this file's location so cwd doesn't matter. */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "dist");
const PORT = process.env.PORT || 4321;

function homePage() {
  if (process.env.QA_MODE) {
    try {
      const p = fs.readFileSync(path.resolve(__dirname, "..", ".work", "qa_page.txt"), "utf8").trim();
      if (p) return p;
    } catch (e) {}
  }
  return process.env.HOME_PAGE || "index.html";
}

const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json",
  ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff",
  ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".map": "application/json"
};

http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  // In QA_MODE, the root (and /index.html, which the preview requests explicitly) serves
  // whatever page is named in .work/qa_page.txt — so we can switch chapters with a reload.
  if (urlPath === "/" || urlPath === "/index.html") urlPath = "/" + homePage();
  let filePath = path.join(ROOT, urlPath);
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end("Forbidden"); return; }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) filePath = path.join(filePath, "index.html");
  if (!fs.existsSync(filePath)) {
    // try appending .html for clean URLs
    if (fs.existsSync(filePath + ".html")) filePath = filePath + ".html";
    else { res.writeHead(404); res.end("Not found: " + urlPath); return; }
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { "Content-Type": TYPES[ext] || "application/octet-stream", "Cache-Control": "no-cache" });
  fs.createReadStream(filePath).pipe(res);
}).listen(PORT, () => console.log(`Serving dist/ at http://localhost:${PORT}`));
