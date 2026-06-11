const { handleApiRequest } = require("../backend/voc-core");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const result = await handleApiRequest({
    method: "GET",
    pathname: "/api/health",
    body: {},
    query: {},
  });

  res.status(result.status || 200);
  Object.entries(result.headers || {}).forEach(([key, value]) => res.setHeader(key, value));
  res.json(result.body);
};
