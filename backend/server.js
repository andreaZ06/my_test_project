const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const { handleApiRequest } = require("./voc-core");

const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT || 8787);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".md": "text/markdown; charset=utf-8",
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
      sendJson(res, 204, {}, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      });
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      const body = await readJsonBody(req);
      const result = await handleApiRequest({
        method: req.method || "GET",
        pathname: url.pathname,
        query: Object.fromEntries(url.searchParams.entries()),
        body,
      });
      sendJson(res, result.status || 200, result.body, result.headers);
      return;
    }

    serveStatic(res, url.pathname);
  } catch (error) {
    sendJson(res, error.statusCode || 500, { success: false, error: error.message || "Internal server error" });
  }
});

server.listen(PORT, () => {
  console.log(`Maifudi VOC backend running at http://127.0.0.1:${PORT}`);
});

function serveStatic(res, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(ROOT, safePath));
  if (!filePath.startsWith(ROOT)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  const candidates = [
    filePath,
    path.join(ROOT, "public", safePath.replace(/^\//, "")),
    path.join(ROOT, "dist", safePath.replace(/^\//, "")),
  ];

  const hit = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  if (!hit) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", MIME_TYPES[path.extname(hit).toLowerCase()] || "application/octet-stream");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.end(fs.readFileSync(hit));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error(`Invalid JSON body: ${error.message}`));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, data, headers = {}) {
  res.statusCode = status;
  Object.entries(headers).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
  res.setHeader("Cache-Control", "no-store, max-age=0");
  if (!res.getHeader("Content-Type")) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
  }
  res.end(status === 204 ? "" : JSON.stringify(data));
}
