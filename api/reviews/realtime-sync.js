const { realtimeSync } = require("../../backend/jd-realtime");

const defaultSkus = [
  { id: "sku-beef-10kg", name: "麦富迪 牛肉双拼全价狗粮 10kg", jdSkuId: "100883991228", series: "成犬双拼粮", url: "https://item.jd.com/100883991228.html", status: "active" },
  { id: "sku-chicken-5kg", name: "麦富迪 鸡肉冻干双拼狗粮 5kg", jdSkuId: "100052398765", series: "冻干双拼粮", url: "https://item.jd.com/100052398765.html", status: "active" },
  { id: "sku-puppy-2kg", name: "麦富迪 幼犬羊奶益生菌狗粮 2kg", jdSkuId: "100091662104", series: "幼犬粮", url: "https://item.jd.com/100091662104.html", status: "active" },
  { id: "sku-salmon-6kg", name: "麦富迪 三文鱼低敏全价狗粮 6kg", jdSkuId: "100071885006", series: "低敏配方粮", url: "https://item.jd.com/100071885006.html", status: "active" },
  { id: "sku-small-3kg", name: "麦富迪 小型犬鲜肉狗粮 3kg", jdSkuId: "100064128879", series: "小型犬粮", url: "https://item.jd.com/100064128879.html", status: "active" },
];

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const body = typeof req.body === "object" && req.body ? req.body : {};
    const skus = Array.isArray(body.skus) && body.skus.length ? body.skus : defaultSkus;
    const result = await realtimeSync({
      skus,
      pagesPerRating: Number(body.pagesPerRating || 1),
      pageSize: Number(body.pageSize || 10),
      deepseekApiKey: process.env.DEEPSEEK_API_KEY,
      deepseekModel: process.env.DEEPSEEK_MODEL || "deepseek-chat",
    });
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || "Realtime sync failed" });
  }
};
