// Serves _site/ on localhost, rebuilding it and reloading the browser whenever
// a post, media file, template, the CSS or build.js changes.

import { spawnSync } from "node:child_process";
import { createReadStream, readFileSync, statSync, watch } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";

const root = import.meta.dirname;
const site = join(root, "_site");
const port = Number(process.env.PORT ?? 8000);
const sources = new Set(["posts", "media", "templates", "style.css", "build.js"]);

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
};

// Injected into every page: reload when the server says the site was rebuilt.
const reloader = `<script>new EventSource("/__reload").onmessage = () => location.reload();</script>`;
const clients = new Set();

// Runs build.js fresh each time, so changes to it apply too. A failed build
// leaves the last good one in place.
const build = () => spawnSync(process.execPath, [join(root, "build.js")], { stdio: "inherit" }).status === 0;

build();

let pending;
watch(root, { recursive: true }, (_, file) => {
  if (file && !sources.has(file.split(sep)[0])) return;
  clearTimeout(pending);
  pending = setTimeout(() => {
    if (build()) for (const client of clients) client.write("data: reload\n\n");
  }, 50);
});

const find = (pathname) => {
  let file = join(site, normalize(pathname));
  let stat = statSync(file, { throwIfNoEntry: false });
  if (stat?.isDirectory()) {
    file = join(file, "index.html");
    stat = statSync(file, { throwIfNoEntry: false });
  }
  return stat?.isFile() ? { file, size: stat.size } : null;
};

createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    return res.writeHead(400).end();
  }

  if (pathname === "/__reload") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store" }).flushHeaders();
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  const found = find(pathname);
  if (!found) return res.writeHead(404).end("Not found");

  const { file, size } = found;
  const type = types[extname(file).toLowerCase()] ?? "application/octet-stream";

  if (type.startsWith("text/html")) {
    const html = readFileSync(file, "utf8").replace("</body>", `${reloader}\n</body>`);
    return res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" }).end(html);
  }

  const headers = { "Content-Type": type, "Cache-Control": "no-store", "Accept-Ranges": "bytes" };

  // Byte ranges let browsers seek within video, and Safari needs them to play it at all.
  const range = req.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
  if (range) {
    const [, from, to] = range;
    const start = from ? Number(from) : Math.max(size - Number(to), 0);
    const end = from && to ? Math.min(Number(to), size - 1) : size - 1;
    if (start > end) return res.writeHead(416, { "Content-Range": `bytes */${size}` }).end();
    res.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1 });
    return createReadStream(file, { start, end }).pipe(res);
  }

  res.writeHead(200, { ...headers, "Content-Length": size });
  createReadStream(file).pipe(res);
}).listen(port, "localhost", () => {
  console.log(`Serving http://localhost:${port}, rebuilding on save`);
});
