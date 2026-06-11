const { handleApiRequest } = require("../../backend/voc-core");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const result = await handleApiRequest({
      method: "POST",
      pathname: "/api/reviews/realtime-sync",
      body: typeof req.body === "object" && req.body ? req.body : {},
      query: req.query || {},
    });

    res.status(result.status || 200);
    Object.entries(result.headers || {}).forEach(([key, value]) => res.setHeader(key, value));
    res.json(result.body);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || "Realtime sync failed" });
  }
};
