const { handleApiRequest } = require("../backend/voc-core");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
    res.status(204).end();
    return;
  }

  try {
    const body = await readBody(req);
    const result = await handleApiRequest({
      method: req.method || "GET",
      pathname: req.url ? new URL(req.url, `http://${req.headers.host}`).pathname : "/api",
      query: req.query || {},
      body,
    });

    res.status(result.status || 200);
    Object.entries(result.headers || {}).forEach(([key, value]) => res.setHeader(key, value));
    res.json(result.body);
  } catch (error) {
    res.status(500).json({ error: error.message || "Internal server error" });
  }
};

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);

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
