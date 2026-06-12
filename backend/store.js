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
  // Keep packaged defaults available in Vercel and bundled runtimes.
  PACKAGED_STORE_DATA = require("./data/store.json");
} catch {
  PACKAGED_STORE_DATA = null;
}
const SUPABASE_CONFIG_TABLE = process.env.SUPABASE_CONFIG_TABLE || "app_config";
const SUPABASE_STORE_ID = process.env.SUPABASE_STORE_ID || "maifudi-store";

let supabaseClient = null;
let supabaseChecked = false;

const defaultSkus = [
  { id: "sku-beef-10kg", name: "\u9ea6\u5bcc\u8fea \u725b\u8089\u53cc\u62fc\u5168\u4ef7\u72d7\u7cae 10kg", jdSkuId: "100203375295", series: "\u6210\u72ac\u53cc\u62fc\u7cae", url: "https://item.jd.com/100203375295.html?pcdk=0WLtZV5GWwYatWDp261mhJ-Np8Zf306ShJ_vZiA3TKA=.M8AW.sbc1", status: "active" },
  { id: "sku-chicken-5kg", name: "\u9ea6\u5bcc\u8fea \u9e21\u8089\u51bb\u5e72\u53cc\u62fc\u72d7\u7cae 5kg", jdSkuId: "100266064124", series: "\u6210\u72ac\u53cc\u62fc\u7cae", url: "https://item.jd.com/100266064124.html?pcdk=0WLtZV5GWwYatWDp261mhObYQwnKfixZ_TY2z8ld_oM=.M8AW.sbc1", status: "active" },
  { id: "sku-puppy-2kg", name: "\u9ea6\u5bcc\u8fea \u5e7c\u72ac\u7f8a\u5976\u76ca\u751f\u83cc\u72d7\u7cae 2kg", jdSkuId: "100212205028", series: "\u5e7c\u72ac\u7cae", url: "https://item.jd.com/100212205028.html?pcdk=0WLtZV5GWwYatWDp261mhDWtBpdYzG9PtefZMdbOY_s=.M8AW.sbc1", status: "active" },
  { id: "sku-salmon-6kg", name: "\u9ea6\u5bcc\u8fea \u4e09\u6587\u9c7c\u4f4e\u654f\u5168\u4ef7\u72d7\u7cae 6kg", jdSkuId: "100071138925", series: "\u4f4e\u654f\u914d\u65b9\u7cae", url: "https://item.jd.com/100071138925.html?pcdk=vrwQBhwykrNCS1jM0WDTQA9V9MvqwZ4yhI7l3lD09wE=.M8AW.sbc1", status: "active" },
  { id: "sku-small-3kg", name: "\u9ea6\u5bcc\u8fea \u5c0f\u578b\u72ac\u9c9c\u8089\u72d7\u7cae 3kg", jdSkuId: "100017769428", series: "\u5c0f\u578b\u72ac\u7cae", url: "https://item.jd.com/100017769428.html?pcdk=vrwQBhwykrNCS1jM0WDTQCHz1cNSHyNy5okj5tG0HTk=.M8AW.sbc1", status: "active" },
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
        name: "VOC \u98ce\u9669\u5f52\u56e0 Prompt",
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
      "\u72d7\u72d7\u5f88\u7231\u5403\uff0c\u9897\u7c92\u5927\u5c0f\u5408\u9002\uff0c\u6362\u7cae\u8fc7\u7a0b\u987a\u5229\u3002",
      "\u5305\u88c5\u5b8c\u6574\uff0c\u65e5\u671f\u65b0\u9c9c\uff0c\u56de\u8d2d\u4f53\u9a8c\u4e0d\u9519\u3002",
      "\u9002\u53e3\u6027\u5f88\u597d\uff0c\u4fbf\u4fbf\u6b63\u5e38\uff0c\u4f5c\u4e3a\u65e5\u5e38\u53e3\u7cae\u5f88\u5408\u9002\u3002",
    ],
    neutral: [
      "\u7269\u6d41\u4e00\u822c\uff0c\u5305\u88c5\u6709\u8f7b\u5fae\u538b\u75d5\uff0c\u4f46\u5546\u54c1\u672c\u8eab\u6ca1\u95ee\u9898\u3002",
      "\u9897\u7c92\u7565\u5927\uff0c\u9002\u5408\u4e2d\u5927\u578b\u72ac\uff0c\u5c0f\u578b\u72ac\u5403\u8d77\u6765\u7a0d\u6162\u3002",
      "\u6d3b\u52a8\u4ef7\u8fd8\u53ef\u4ee5\uff0c\u6700\u8fd1\u4ef7\u683c\u6ce2\u52a8\u6709\u70b9\u660e\u663e\u3002",
    ],
    bad: [
      "\u6700\u8fd1\u8fd9\u6b3e\u72d7\u7cae\u72d7\u4e0d\u5403\uff0c\u6253\u5f00\u540e\u6709\u5f02\u5473\u660e\u663e\u3002",
      "\u6362\u7cae\u540e\u51fa\u73b0\u62c9\u7a00\u548c\u8f6f\u4fbf\uff0c\u6000\u7591\u4e0d\u9002\u914d\u3002",
      "\u5305\u88c5\u7834\u635f\u4e14\u5c01\u53e3\u677e\uff0c\u5ba2\u670d\u56de\u590d\u6bd4\u8f83\u6162\u3002",
      "\u9897\u7c92\u592a\u5927\uff0c\u72d7\u72d7\u54ac\u4e0d\u52a8\uff0c\u5403\u4e86\u8fd8\u5455\u5410\u3002",
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
          user: `\u7528\u6237${String(1000 + skuIndex * 100 + dayOffset * 10 + i).slice(-4)}`,
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
          const url = String(sku.url || sku.jdUrl || "").trim();
          const status = sku.status === "inactive" || sku.enabled === false ? "inactive" : "active";
          return {
            id: String(sku.id || "").trim(),
            name: isCorruptedLabel(name) ? fallback?.name || name : name,
            jdSkuId: String(sku.jdSkuId || "").trim(),
            series: isCorruptedLabel(series) ? fallback?.series || series : series,
            url,
            jdUrl: url,
            status,
            enabled: status !== "inactive",
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
    user: String(review.user || review.nickname || "\u533f\u540d\u7528\u6237").trim(),
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

async function updateSkuAsync(id, patch = {}) {
  const skuId = String(id || "").trim();
  if (!skuId) throw new Error("SKU id is required");

  const store = await readStoreAsync();
  const index = store.skus.findIndex((sku) => sku.id === skuId);
  if (index < 0) {
    const error = new Error("SKU not found");
    error.statusCode = 404;
    throw error;
  }

  const current = store.skus[index];
  const nextSku = {
    ...current,
    ...patch,
    id: current.id,
    name: patch.name ?? current.name,
    jdSkuId: patch.jdSkuId ?? current.jdSkuId,
    series: patch.series ?? current.series,
    url: patch.url ?? patch.jdUrl ?? current.url,
    status: patch.enabled === false ? "inactive" : patch.status ?? (patch.enabled === true ? "active" : current.status),
    createdAt: current.createdAt,
    updatedAt: nowIso(),
  };

  const nextSkus = store.skus.slice();
  nextSkus[index] = nextSku;
  store.skus = normalizeSkus(nextSkus);
  store.updatedAt = nowIso();
  await writeStoreAsync(store);
  return store;
}

async function deleteSkuAsync(id) {
  const skuId = String(id || "").trim();
  if (!skuId) throw new Error("SKU id is required");

  const store = await readStoreAsync();
  const exists = store.skus.some((sku) => sku.id === skuId);
  if (!exists) {
    const error = new Error("SKU not found");
    error.statusCode = 404;
    throw error;
  }

  store.skus = normalizeSkus(store.skus.filter((sku) => sku.id !== skuId));
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
  if (value.includes("\u003f\u003f\u003f")) return true;
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
  deleteSkuAsync,
  updateSkus,
  updateSkuAsync,
  updateSkusAsync,
  writeStore,
  writeStoreAsync,
};

