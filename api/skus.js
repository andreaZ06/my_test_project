const storeData = require("../backend/store");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
    res.status(204).end();
    return;
  }

  try {
    if (req.method === "GET") {
      const store = storeData.readStore();
      res.status(200).json({ skus: store.skus, updatedAt: store.updatedAt });
      return;
    }

    if (req.method === "PUT" || req.method === "POST") {
      const body = typeof req.body === "object" && req.body ? req.body : {};
      const store = storeData.updateSkus(storeData.normalizeSkus(body.skus));
      res.status(200).json({ ok: true, skus: store.skus, updatedAt: store.updatedAt });
      return;
    }

    res.setHeader("Allow", "GET, PUT, POST, OPTIONS");
    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || "Failed to save SKU configuration" });
  }
};
