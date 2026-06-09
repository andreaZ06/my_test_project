const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const { realtimeSync } = require("./jd-realtime");
const storeData = require("./store");

loadEnv();

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "backend", "data");
const DB_PATH = path.join(DATA_DIR, "store.json");
const PORT = Number(process.env.PORT || 8787);

const defaultSkus = [
  { id: "sku-beef-10kg", name: "麦富迪 牛肉双拼全价狗粮 10kg", jdSkuId: "100883991228", series: "成犬双拼粮", url: "https://item.jd.com/100883991228.html", status: "active" },
  { id: "sku-chicken-5kg", name: "麦富迪 鸡肉冻干双拼狗粮 5kg", jdSkuId: "100052398765", series: "冻干双拼粮", url: "https://item.jd.com/100052398765.html", status: "active" },
  { id: "sku-puppy-2kg", name: "麦富迪 幼犬羊奶益生菌狗粮 2kg", jdSkuId: "100091662104", series: "幼犬粮", url: "https://item.jd.com/100091662104.html", status: "active" },
  { id: "sku-salmon-6kg", name: "麦富迪 三文鱼低敏全价狗粮 6kg", jdSkuId: "100071885006", series: "低敏配方粮", url: "https://item.jd.com/100071885006.html", status: "active" },
  { id: "sku-small-3kg", name: "麦富迪 小型犬鲜肉狗粮 3kg", jdSkuId: "100064128879", series: "小型犬粮", url: "https://item.jd.com/100064128879.html", status: "active" },
];

const sensitiveKeywords = ["拉稀", "软便", "呕吐", "过敏", "假货", "变质", "虫子", "发霉", "临期", "不吃", "狗不吃", "包装破损"];
const keywordLexicon = ["拉稀", "软便", "呕吐", "过敏", "假货", "变质", "虫子", "发霉", "临期", "不吃", "狗不吃", "包装破损", "颗粒大", "适口性", "复购", "涨价", "物流慢", "客服", "油腻", "异味", "泪痕", "便便臭", "活动价", "划算", "毛发", "换粮", "日期新鲜", "封口"];

storeData.ensureStore();

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      sendJson(res, 204, {});
      return;
    }
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await routeApi(req, res, url);
      return;
    }
    serveStatic(res, url.pathname);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Internal server error" });
  }
});

server.listen(PORT, () => {
  console.log(`Maifudi dashboard backend running at http://127.0.0.1:${PORT}`);
});

async function routeApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/health") {
    const store = readStore();
    sendJson(res, 200, {
      ok: true,
      deepseekConfigured: Boolean(process.env.DEEPSEEK_API_KEY),
      feishuWebhookConfigured: Boolean(process.env.FEISHU_WEBHOOK_URL),
      storageMode: storeData.getStorageMode(),
      supabaseConfigured: storeData.isSupabaseConfigured(),
      updatedAt: store.updatedAt,
      skuCount: Array.isArray(store.skus) ? store.skus.length : 0,
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/skus") {
    const store = readStore();
    sendJson(res, 200, { skus: store.skus, updatedAt: store.updatedAt });
    return;
  }

  if ((req.method === "PUT" || req.method === "POST") && url.pathname === "/api/skus") {
    const body = await readJson(req);
    const store = readStore();
    store.skus = storeData.normalizeSkus(body.skus);
    store.updatedAt = new Date().toISOString();
    storeData.writeStore(store);
    sendJson(res, 200, { ok: true, skus: store.skus, updatedAt: store.updatedAt });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/dashboard") {
    const store = readStore();
    sendJson(res, 200, buildDashboard(store));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/reviews/sync") {
    const store = readStore();
    store.reviews = buildHistoricalReviews(store.skus);
    store.updatedAt = new Date().toISOString();
    writeStore(store);
    sendJson(res, 200, { ok: true, reviewCount: store.reviews.length, updatedAt: store.updatedAt });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/reviews/realtime-sync") {
    const store = readStore();
    const body = await readJson(req);
    const skus = Array.isArray(store.skus) && store.skus.length ? store.skus : storeData.defaultSkus;
    const result = await realtimeSync({
      skus,
      pagesPerRating: Number(body.pagesPerRating || 1),
      pageSize: Number(body.pageSize || 10),
      deepseekApiKey: process.env.DEEPSEEK_API_KEY,
      deepseekModel: process.env.DEEPSEEK_MODEL || "deepseek-chat",
    });
    if (result.reviews.length) {
      const byId = new Map(store.reviews.map((review) => [review.id, review]));
      result.reviews.forEach((review) => byId.set(review.id, review));
      store.reviews = [...byId.values()];
      store.updatedAt = result.fetchedAt;
      writeStore(store);
    }
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/analyze-keywords") {
    const body = await readJson(req);
    const reviews = Array.isArray(body.reviews) ? body.reviews : [];
    const analysis = await analyzeWithDeepSeek(reviews);
    sendJson(res, 200, analysis);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/feishu/query") {
    const body = await readJson(req);
    sendJson(res, 200, answerFeishuQuery(String(body.query || "")));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/feishu/push-preview") {
    const result = await pushFeishuPreview();
    sendJson(res, 200, result);
    return;
  }

  sendJson(res, 404, { error: "API not found" });
}

function buildDashboard(store) {
  const alerts = buildAlerts(store.reviews, store.skus);
  return {
    skus: store.skus,
    reviews: store.reviews,
    keywordStats: keywordStats(store.reviews),
    alerts,
    updatedAt: store.updatedAt,
  };
}

function buildAlerts(reviews, skus) {
  const alerts = [];
  for (const sku of skus.filter((item) => item.status === "active")) {
    const current = reviews.filter((review) => review.skuId === sku.id && daysAgo(review.date) <= 7);
    for (const stat of keywordStats(current)) {
      const growth = stat.growth;
      const highSensitive = sensitiveKeywords.includes(stat.keyword) && stat.count >= 5;
      const highGrowth = stat.count >= 10 && growth >= 200;
      const mediumGrowth = stat.count >= 8 && growth >= 100;
      const lowGrowth = stat.count >= 5 && growth >= 50;
      const level = highSensitive || highGrowth ? "high" : mediumGrowth ? "medium" : lowGrowth ? "low" : "";
      if (!level) continue;
      const sample = current.find((review) => review.keywords.includes(stat.keyword));
      alerts.push({
        id: `${sku.id}-${stat.keyword}`,
        skuId: sku.id,
        skuName: sku.name,
        keyword: stat.keyword,
        level,
        currentCount: stat.count,
        previousCount: stat.previous,
        growth,
        reason: highSensitive ? "命中高敏词 + 样本量达标" : "词频环比异常上涨",
        sample: sample?.content || "",
        sampleReviewId: sample?.id || "",
        createdAt: formatDate(new Date()),
      });
    }
  }
  return alerts.sort((a, b) => levelWeight(b.level) - levelWeight(a.level) || b.growth - a.growth);
}

async function analyzeWithDeepSeek(reviews) {
  const fallback = {
    provider: "local-fallback",
    keywords: keywordStats(reviews).slice(0, 10).map((item) => ({
      word: item.keyword,
      count: item.count,
      risk_level: sensitiveKeywords.includes(item.keyword) ? "high" : item.badCount > 0 ? "medium" : "low",
      evidence: reviews.find((review) => review.keywords?.includes(item.keyword))?.content || "",
    })),
    summary: "当前未配置 DeepSeek API Key，已使用本地关键词规则完成分析。",
  };

  if (!process.env.DEEPSEEK_API_KEY || !reviews.length) return fallback;

  const prompt = [
    "你是品牌运营评论分析助手。请从京东狗粮评论中提取高频关键词、风险等级和证据。",
    "只输出 JSON，格式为：",
    '{"keywords":[{"word":"拉稀","sentiment":"negative","risk_level":"high","evidence":"评论原文片段","category":"肠胃反应"}],"summary":"一句话总结"}',
    "评论：",
    JSON.stringify(reviews.slice(0, 80).map((item) => ({ ratingType: item.ratingType, content: item.content }))),
  ].join("\n");

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    return { ...fallback, provider: "local-fallback-after-deepseek-error", deepseekStatus: response.status };
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content || "{}";
  try {
    return { provider: "deepseek", ...JSON.parse(stripJsonFence(content)) };
  } catch {
    return { provider: "deepseek", raw: content };
  }
}

async function pushFeishuPreview() {
  const store = readStore();
  const alert = buildAlerts(store.reviews, store.skus)[0];
  if (!alert) return { ok: false, reason: "当前没有可推送预警" };
  const text = `【${levelName(alert.level)}】${alert.skuName}\n关键词：${alert.keyword}\n近 7 天：${alert.currentCount} 次，环比 ${formatGrowth(alert.growth)}\n证据：${alert.sample}`;

  if (!process.env.FEISHU_WEBHOOK_URL) {
    return { ok: true, mode: "preview", text };
  }

  const response = await fetch(process.env.FEISHU_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ msg_type: "text", content: { text } }),
  });
  return { ok: response.ok, mode: "sent", status: response.status, text };
}

function answerFeishuQuery(query) {
  const store = readStore();
  const dashboard = buildDashboard(store);
  const text = query.replace(/\s+/g, "");
  const alerts = text.includes("高风险") ? dashboard.alerts.filter((item) => item.level === "high") : dashboard.alerts;
  if (text.includes("预警") || text.includes("风险")) {
    return {
      reply: alerts.slice(0, 5).map((item, index) => `${index + 1}. [${levelName(item.level)}] ${item.skuName} - ${item.keyword}，近7天 ${item.currentCount} 次，环比 ${formatGrowth(item.growth)}`).join("\n") || "当前没有匹配预警。",
      link: "/index.html",
    };
  }
  return {
    reply: keywordStats(dashboard.reviews).slice(0, 8).map((item, index) => `${index + 1}. ${item.keyword}：${item.count} 次，差评 ${item.badCount} 次，环比 ${formatGrowth(item.growth)}`).join("\n"),
    link: "/index.html",
  };
}

function keywordStats(reviews) {
  const map = new Map();
  for (const review of reviews) {
    const keywords = review.keywords?.length ? review.keywords : extractKeywords(review.content);
    for (const keyword of keywords) {
      const current = map.get(keyword) || { keyword, count: 0, reviewIds: new Set(), badCount: 0 };
      current.count += 1;
      current.reviewIds.add(review.id);
      if (review.ratingType === "bad") current.badCount += 1;
      map.set(keyword, current);
    }
  }
  return [...map.values()].map((item) => {
    const previous = Math.max(0, Math.round(item.count * 0.55));
    return {
      keyword: item.keyword,
      count: item.count,
      reviewCount: item.reviewIds.size,
      badCount: item.badCount,
      previous,
      growth: growthRate(item.count, previous),
    };
  }).sort((a, b) => b.count - a.count || b.growth - a.growth);
}

function buildHistoricalReviews(skus) {
  const today = new Date();
  const reviews = [];
  skus.filter((sku) => sku.status === "active").forEach((sku, skuIndex) => {
    for (let dayIndex = 0; dayIndex < 30; dayIndex += 1) {
      const date = shiftDate(today, dayIndex - 29);
      const dailyTotal = 8 + ((skuIndex * 5 + dayIndex * 3) % 7);
      for (let i = 0; i < dailyTotal; i += 1) {
        const ratingType = pickRatingType(skuIndex, dayIndex, i);
        const content = buildReviewContent(sku, skuIndex, dayIndex, i, ratingType);
        reviews.push({
          id: `${sku.id}-${date}-${i}`,
          skuId: sku.id,
          content,
          ratingType,
          date,
          crawledAt: formatDate(today),
          user: `用户${String((skuIndex + 1) * 1000 + dayIndex * 17 + i).slice(-4)}`,
          keywords: extractKeywords(content),
          source: "mock-jd-adapter",
        });
      }
    }
  });
  return reviews;
}

function buildReviewContent(sku, skuIndex, dayIndex, itemIndex, ratingType) {
  const recent = dayIndex >= 23;
  const good = [`家里狗狗适口性不错，${sku.series}活动价入手比较划算，日期新鲜。`, "已经复购几次了，毛发状态稳定，封口也方便。", "颗粒大小合适，换粮过渡比较顺，狗狗吃得快。"];
  const neutral = ["物流慢了一天，包装有点压痕，狗粮本身还可以。", "颗粒大了一点，小狗吃起来慢，客服回复还算及时。", "活动价还行，但最近感觉涨价明显。"];
  const bad = ["这袋打开有异味，狗狗不吃，担心是不是临期。", "换粮后出现软便，便便臭，后面不敢继续喂。", "外箱包装破损，封口也松，客服处理比较慢。"];
  const bursts = [["拉稀", "软便", "便便臭"], ["不吃", "狗不吃", "异味"], ["呕吐", "过敏", "换粮"], ["包装破损", "临期", "客服"], ["油腻", "泪痕", "颗粒大"]];
  if (ratingType === "good") return good[(skuIndex + dayIndex + itemIndex) % good.length];
  if (ratingType === "neutral") return neutral[(skuIndex + itemIndex) % neutral.length];
  if (recent && (itemIndex + skuIndex) % 2 === 0) return `最近这款${sku.name.replace("麦富迪 ", "")}问题变多，${bursts[skuIndex % bursts.length].join("、")}，希望运营尽快看一下。`;
  return bad[(dayIndex + itemIndex) % bad.length];
}

function pickRatingType(skuIndex, dayIndex, itemIndex) {
  const recent = dayIndex >= 23;
  const badModulo = recent && [0, 1, 3].includes(skuIndex) ? 4 : 7;
  if ((itemIndex + dayIndex + skuIndex) % badModulo === 0) return "bad";
  if ((itemIndex + skuIndex) % 5 === 0) return "neutral";
  return "good";
}

function extractKeywords(content) {
  const set = new Set();
  for (const word of keywordLexicon) {
    if (content.includes(word)) set.add(word);
  }
  return [...set].slice(0, 8);
}

function ensureStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_PATH)) return;
  const store = {
    skus: defaultSkus,
    reviews: buildHistoricalReviews(defaultSkus),
    updatedAt: new Date().toISOString(),
  };
  writeStore(store);
}

function readStore() {
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function writeStore(store) {
  const tempPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, DB_PATH);
}

function serveStatic(res, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(ROOT, safePath));
  if (!filePath.startsWith(ROOT)) {
    sendText(res, 403, "Forbidden");
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    sendText(res, 404, "Not found");
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8" };
  res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  });
  res.end(JSON.stringify(payload, null, 2));
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function loadEnv() {
  const envPath = path.resolve(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

function stripJsonFence(value) {
  return value.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
}

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function shiftDate(date, delta) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + delta);
  return formatDate(copy);
}

function daysAgo(dateText) {
  const today = new Date(formatDate(new Date()));
  const date = new Date(dateText);
  return Math.round((today - date) / 86400000);
}

function growthRate(current, previous) {
  if (!previous && current) return 999;
  if (!previous) return 0;
  return Math.round(((current - previous) / previous) * 100);
}

function formatGrowth(value) {
  if (value >= 999) return "新增高发";
  if (value > 0) return `+${value}%`;
  return `${value}%`;
}

function levelName(level) {
  return { high: "高风险", medium: "中风险", low: "低风险" }[level] || level;
}

function levelWeight(level) {
  return { high: 3, medium: 2, low: 1 }[level] || 0;
}
