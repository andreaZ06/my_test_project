const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PACKAGED_DATA_DIR = path.join(ROOT, "backend", "data");
const DATA_DIR = process.env.VERCEL ? path.join(os.tmpdir(), "maifudi-voc-dashboard") : PACKAGED_DATA_DIR;
const DB_PATH = path.join(DATA_DIR, "store.json");
const PACKAGED_DB_PATH = path.join(PACKAGED_DATA_DIR, "store.json");
let PACKAGED_STORE_DATA = null;

try {
  // 让 Vercel / 打包环境也能静态包含默认数据，避免运行时文件缺失后回退乱码。
  PACKAGED_STORE_DATA = require("./data/store.json");
} catch {
  PACKAGED_STORE_DATA = null;
}
const SUPABASE_CONFIG_TABLE = process.env.SUPABASE_CONFIG_TABLE || "app_config";
const SUPABASE_STORE_ID = process.env.SUPABASE_STORE_ID || "maifudi-store";

let supabaseClient = null;
let supabaseChecked = false;

const defaultSkus = [
  { id: "sku-beef-10kg", name: "麦富迪 牛肉双拼全价狗粮 10kg", jdSkuId: "100203375295", series: "成犬双拼粮", url: "https://item.jd.com/100203375295.html?pcdk=0WLtZV5GWwYatWDp261mhJ-Np8Zf306ShJ_vZiA3TKA=.M8AW.sbc1", status: "active" },
  { id: "sku-chicken-5kg", name: "麦富迪 鸡肉冻干双拼狗粮 5kg", jdSkuId: "100266064124", series: "成犬双拼粮", url: "https://item.jd.com/100266064124.html?pcdk=0WLtZV5GWwYatWDp261mhObYQwnKfixZ_TY2z8ld_oM=.M8AW.sbc1", status: "active" },
  { id: "sku-puppy-2kg", name: "麦富迪 幼犬羊奶益生菌狗粮 2kg", jdSkuId: "100212205028", series: "幼犬粮", url: "https://item.jd.com/100212205028.html?pcdk=0WLtZV5GWwYatWDp261mhDWtBpdYzG9PtefZMdbOY_s=.M8AW.sbc1", status: "active" },
  { id: "sku-salmon-6kg", name: "麦富迪 三文鱼低敏全价狗粮 6kg", jdSkuId: "100071138925", series: "低敏配方粮", url: "https://item.jd.com/100071138925.html?pcdk=vrwQBhwykrNCS1jM0WDTQA9V9MvqwZ4yhI7l3lD09wE=.M8AW.sbc1", status: "active" },
  { id: "sku-small-3kg", name: "麦富迪 小型犬鲜肉狗粮 3kg", jdSkuId: "100017769428", series: "小型犬粮", url: "https://item.jd.com/100017769428.html?pcdk=vrwQBhwykrNCS1jM0WDTQCHz1cNSHyNy5okj5tG0HTk=.M8AW.sbc1", status: "active" },
];

function nowIso() {
  return new Date().toISOString();
}

function today() {
  return nowIso().slice(0, 10);
}

function buildDefaultStore() {
  return {
    version: "3.0",
    skus: defaultSkus.map((sku) => ({ ...sku, createdAt: today(), updatedAt: today() })),
    reviews: buildSeedReviews(defaultSkus),
    pendingTerms: [],
    crawlConfig: {
      mode: "realtime",
      frequencyMinutes: 1440,
      pagesPerRating: 1,
      pageSize: 10,
      autoSyncEnabled: false,
      lastRunAt: "",
    },
    prompts: [
      {
        id: "prompt-v3-core",
        name: "VOC 风险归因 Prompt",
        version: "v3.0",
        updatedAt: today(),
      },
    ],
    evalSets: [],
    badCases: [],
    productNotes: [],
    updatedAt: nowIso(),
  };
}

function buildSeedReviews(skus) {
  const templates = {
    good: [
      "狗狗很爱吃，颗粒大小合适，换粮过程顺利。",
      "包装完整，日期新鲜，回购体验不错。",
      "适口性很好，便便正常，作为日常口粮很合适。",
    ],
    neutral: [
      "物流一般，包装有轻微压痕，但商品本身没问题。",
      "颗粒略大，适合中大型犬，小型犬吃起来稍慢。",
      "活动价还可以，最近价格波动有点明显。",
    ],
    bad: [
      "最近这款狗粮狗不吃，打开后有异味明显。",
      "换粮后出现拉稀和软便，怀疑不适配。",
      "包装破损且封口松，客服回复比较慢。",
      "颗粒太大，狗狗咬不动，吃了还呕吐。",
    ],
  };

  const reviews = [];
  const baseDate = new Date();
  skus.forEach((sku, skuIndex) => {
    for (let dayOffset = 0; dayOffset < 15; dayOffset += 1) {
      const date = new Date(baseDate);
      date.setDate(baseDate.getDate() - (14 - dayOffset));
      const dateValue = date.toISOString().slice(0, 10);
      const ratingCycle = [
        "good", "good", "neutral", "good", "bad", "good", "neutral", "good",
      ];
      for (let i = 0; i < ratingCycle.length; i += 1) {
        const ratingType = ratingCycle[(i + skuIndex + dayOffset) % ratingCycle.length];
        const list = templates[ratingType];
        const content = list[(skuIndex + dayOffset + i) % list.length];
        reviews.push({
          id: `${sku.id}-${dateValue}-${i}`,
          skuId: sku.id,
          skuName: sku.name,
          content,
          ratingType,
          date: dateValue,
          crawledAt: nowIso(),
          user: `用户${String(1000 + skuIndex * 100 + dayOffset * 10 + i).slice(-4)}`,
          source: "seed",
          reviewUrl: `${sku.url}#comment-${sku.id}-${dateValue}-${i}`,
          productUrl: sku.url,
        });
      }
    }
  });
  return reviews;
}

function normalizeSkus(skus) {
  const defaultsById = new Map(defaultSkus.map((sku) => [sku.id, sku]));
  return Array.isArray(skus)
    ? skus
        .map((sku) => {
          const fallback = defaultsById.get(String(sku.id || "").trim());
          const name = String(sku.name || "").trim();
          const series = String(sku.series || "").trim();
          return {
            id: String(sku.id || "").trim(),
            name: isCorruptedLabel(name) ? fallback?.name || name : name,
            jdSkuId: String(sku.jdSkuId || "").trim(),
            series: isCorruptedLabel(series) ? fallback?.series || series : series,
            url: String(sku.url || "").trim(),
            status: sku.status === "inactive" ? "inactive" : "active",
            createdAt: sku.createdAt || today(),
            updatedAt: sku.updatedAt || today(),
          };
        })
        .filter((sku) => sku.id && sku.name && sku.jdSkuId && sku.series && sku.url)
    : [];
}

function normalizeReview(review) {
  if (!review || typeof review !== "object") return null;
  const skuId = String(review.skuId || review.jdSkuId || "").trim();
  const content = String(review.content || review.text || review.comment || "").trim();
  if (!skuId || !content) return null;

  const ratingType = normalizeRatingType(review.ratingType ?? review.rating ?? review.score);

  return {
    id: String(review.id || review.reviewId || `${skuId}-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    skuId,
    skuName: String(review.skuName || "").trim(),
    content,
    ratingType,
    date: normalizeDate(review.date || review.createdAt || review.creationTime),
    crawledAt: review.crawledAt || nowIso(),
    user: String(review.user || review.nickname || "鍖垮悕鐢ㄦ埛").trim(),
    source: String(review.source || "imported").trim(),
    productUrl: String(review.productUrl || review.url || "").trim(),
    reviewUrl: String(review.reviewUrl || "").trim(),
    domain: String(review.domain || "").trim(),
    topic: String(review.topic || "").trim(),
    standardKeyword: String(review.standardKeyword || "").trim(),
    riskLevel: normalizeRiskLevel(review.riskLevel),
    expectedAction: String(review.expectedAction || "").trim(),
    evidenceRequired: String(review.evidenceRequired || "").trim(),
    shouldEscalateToQC: Boolean(review.shouldEscalateToQC),
    suggestedOwner: String(review.suggestedOwner || "").trim(),
    matchedAliases: Array.isArray(review.matchedAliases) ? review.matchedAliases.map(String) : [],
    confidence: Number.isFinite(Number(review.confidence)) ? Number(review.confidence) : 0,
    evidenceReviewId: String(review.evidenceReviewId || review.id || "").trim(),
    aiSummary: String(review.aiSummary || "").trim(),
    note: String(review.note || "").trim(),
  };
}

function normalizeReviews(reviews) {
  return Array.isArray(reviews)
    ? reviews.map(normalizeReview).filter(Boolean)
    : [];
}

function normalizePendingTerms(entries) {
  return Array.isArray(entries)
    ? entries
        .map((item) => ({
          id: String(item.id || `pending-${Date.now()}-${Math.random().toString(16).slice(2)}`),
          rawTerm: String(item.rawTerm || item.term || "").trim(),
          suggestedKeyword: String(item.suggestedKeyword || "").trim(),
          suggestedDomain: String(item.suggestedDomain || "").trim(),
          suggestedTopic: String(item.suggestedTopic || "").trim(),
          reason: String(item.reason || "").trim(),
          evidenceReviewIds: Array.isArray(item.evidenceReviewIds) ? item.evidenceReviewIds.map(String) : [],
          status: item.status || "pending",
          createdAt: item.createdAt || nowIso(),
        }))
        .filter((item) => item.rawTerm)
    : [];
}

function normalizeCrawlConfig(config = {}) {
  return {
    mode: ["realtime", "scheduled"].includes(config.mode) ? config.mode : "realtime",
    frequencyMinutes: Math.max(5, Number(config.frequencyMinutes || 1440)),
    pagesPerRating: Math.max(1, Math.min(5, Number(config.pagesPerRating || 1))),
    pageSize: Math.max(1, Math.min(30, Number(config.pageSize || 10))),
    autoSyncEnabled: Boolean(config.autoSyncEnabled),
    lastRunAt: String(config.lastRunAt || ""),
  };
}

function normalizeStore(store) {
  const base = buildDefaultStore();
  const next = {
    ...base,
    ...store,
  };

  next.skus = normalizeSkus(store?.skus || base.skus);
  next.reviews = normalizeReviews(store?.reviews || base.reviews);
  next.pendingTerms = normalizePendingTerms(store?.pendingTerms || base.pendingTerms);
  next.crawlConfig = normalizeCrawlConfig(store?.crawlConfig || base.crawlConfig);
  next.prompts = Array.isArray(store?.prompts) ? store.prompts : base.prompts;
  next.evalSets = Array.isArray(store?.evalSets) ? store.evalSets : base.evalSets;
  next.badCases = Array.isArray(store?.badCases) ? store.badCases : base.badCases;
  next.productNotes = Array.isArray(store?.productNotes) ? store.productNotes : base.productNotes;
  next.updatedAt = store?.updatedAt || base.updatedAt;
  return next;
}

function ensureStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_PATH)) return;

  if (PACKAGED_STORE_DATA) {
    writeStore(PACKAGED_STORE_DATA);
    return;
  }

  if (PACKAGED_DB_PATH !== DB_PATH && fs.existsSync(PACKAGED_DB_PATH)) {
    fs.copyFileSync(PACKAGED_DB_PATH, DB_PATH);
    return;
  }

  writeStore(buildDefaultStore());
}

function readStore() {
  ensureStore();
  const raw = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  return normalizeStore(raw);
}

function writeStore(store) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tempPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(normalizeStore(store), null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, DB_PATH);
}

function updateSkus(nextSkus) {
  const store = readStore();
  store.skus = normalizeSkus(nextSkus);
  store.updatedAt = nowIso();
  writeStore(store);
  return store;
}

function getSupabaseClient() {
  if (supabaseChecked) return supabaseClient;
  supabaseChecked = true;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const { createClient } = require("@supabase/supabase-js");
  supabaseClient = createClient(url, key, {
    auth: { persistSession: false },
  });
  return supabaseClient;
}

function getStorageMode() {
  return getSupabaseClient() ? "supabase" : "local";
}

function isSupabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY));
}

function normalizeRemoteStore(value) {
  if (!value) return null;
  if (typeof value === "string") return JSON.parse(value);
  return value;
}

async function readStoreAsync() {
  const supabase = getSupabaseClient();
  if (!supabase) return readStore();

  const { data, error } = await supabase
    .from(SUPABASE_CONFIG_TABLE)
    .select("value")
    .eq("id", SUPABASE_STORE_ID)
    .maybeSingle();
  if (error) throw error;

  const remoteStore = normalizeRemoteStore(data?.value);
  if (remoteStore && Array.isArray(remoteStore.skus)) return normalizeStore(remoteStore);

  const localStore = readStore();
  await writeStoreAsync(localStore);
  return localStore;
}

async function writeStoreAsync(store) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    writeStore(store);
    return;
  }

  const { error } = await supabase
    .from(SUPABASE_CONFIG_TABLE)
    .upsert({
      id: SUPABASE_STORE_ID,
      value: normalizeStore(store),
      updated_at: nowIso(),
    });
  if (error) throw error;
}

async function updateSkusAsync(nextSkus) {
  const store = await readStoreAsync();
  store.skus = normalizeSkus(nextSkus);
  store.updatedAt = nowIso();
  await writeStoreAsync(store);
  return store;
}

function normalizeRatingType(value) {
  if (value === "good" || value === "neutral" || value === "bad") return value;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    if (numeric <= 2) return "bad";
    if (numeric === 3) return "neutral";
    return "good";
  }
  return "neutral";
}

function normalizeRiskLevel(value) {
  const text = String(value || "").toLowerCase();
  if (["high", "medium", "low"].includes(text)) return text;
  return "medium";
}

function normalizeDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return today();
  return date.toISOString().slice(0, 10);
}

function isCorruptedLabel(text) {
  const value = String(text || "").trim();
  if (!value) return true;
  if (value.includes("???")) return true;
  const letters = value.replace(/[\s\d./_-]/g, "");
  return /^[?]+$/.test(letters);
}

module.exports = {
  DB_PATH,
  defaultSkus,
  buildDefaultStore,
  ensureStore,
  getStorageMode,
  getSupabaseClient,
  isSupabaseConfigured,
  normalizeReview,
  normalizeReviews,
  normalizeCrawlConfig,
  normalizeSkus,
  normalizeStore,
  readStore,
  readStoreAsync,
  updateSkus,
  updateSkusAsync,
  writeStore,
  writeStoreAsync,
};

