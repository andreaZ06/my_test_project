const fs = require("fs");
const path = require("path");
const os = require("os");

const ROOT = path.resolve(__dirname, "..");
const PACKAGED_DATA_DIR = path.join(ROOT, "backend", "data");
const DATA_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), "maifudi-jd-review-dashboard")
  : PACKAGED_DATA_DIR;
const DB_PATH = path.join(DATA_DIR, "store.json");
const PACKAGED_DB_PATH = path.join(PACKAGED_DATA_DIR, "store.json");
const SUPABASE_CONFIG_TABLE = process.env.SUPABASE_CONFIG_TABLE || "app_config";
const SUPABASE_STORE_ID = process.env.SUPABASE_STORE_ID || "maifudi-store";
let supabaseClient = null;
let supabaseChecked = false;

const defaultSkus = [
  { id: "sku-beef-10kg", name: "麦富迪牛肉双拼全价狗粮 10kg", jdSkuId: "100883991228", series: "成犬双拼粮", url: "https://item.jd.com/100883991228.html", status: "active" },
  { id: "sku-chicken-5kg", name: "麦富迪鸡肉冻干双拼狗粮 5kg", jdSkuId: "100052398765", series: "冻干双拼粮", url: "https://item.jd.com/100052398765.html", status: "active" },
  { id: "sku-puppy-2kg", name: "麦富迪幼犬羊奶益生菌狗粮 2kg", jdSkuId: "100091662104", series: "幼犬粮", url: "https://item.jd.com/100091662104.html", status: "active" },
  { id: "sku-salmon-6kg", name: "麦富迪三文鱼低敏全价狗粮 6kg", jdSkuId: "100071885006", series: "低敏配方粮", url: "https://item.jd.com/100071885006.html", status: "active" },
  { id: "sku-small-3kg", name: "麦富迪小型犬鲜肉狗粮 3kg", jdSkuId: "100064128879", series: "小型犬粮", url: "https://item.jd.com/100064128879.html", status: "active" },
];

function ensureStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_PATH)) return;
  if (PACKAGED_DB_PATH !== DB_PATH && fs.existsSync(PACKAGED_DB_PATH)) {
    fs.copyFileSync(PACKAGED_DB_PATH, DB_PATH);
    return;
  }
  const store = {
    skus: defaultSkus,
    reviews: [],
    updatedAt: new Date().toISOString(),
  };
  store.reviews = buildHistoricalReviews(store.skus);
  writeStore(store);
}

function readStore() {
  ensureStore();
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function writeStore(store) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tempPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, DB_PATH);
}

function updateSkus(nextSkus) {
  const store = readStore();
  store.skus = Array.isArray(nextSkus) ? nextSkus : [];
  store.updatedAt = new Date().toISOString();
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
  if (remoteStore && Array.isArray(remoteStore.skus)) return remoteStore;

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
      value: store,
      updated_at: new Date().toISOString(),
    });
  if (error) throw error;
}

async function updateSkusAsync(nextSkus) {
  const store = await readStoreAsync();
  store.skus = Array.isArray(nextSkus) ? nextSkus : [];
  store.updatedAt = new Date().toISOString();
  await writeStoreAsync(store);
  return store;
}

function normalizeSkus(skus) {
  return Array.isArray(skus) ? skus.map((sku) => ({
    id: String(sku.id || "").trim(),
    name: String(sku.name || "").trim(),
    jdSkuId: String(sku.jdSkuId || "").trim(),
    series: String(sku.series || "").trim(),
    url: String(sku.url || "").trim(),
    status: sku.status === "inactive" ? "inactive" : "active",
    createdAt: sku.createdAt || new Date().toISOString().slice(0, 10),
    updatedAt: sku.updatedAt || new Date().toISOString().slice(0, 10),
  })).filter((sku) => sku.id && sku.name && sku.jdSkuId && sku.series && sku.url) : [];
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
        reviews.push({
          id: `${sku.id}-${date}-${i}`,
          skuId: sku.id,
          content: buildReviewContent(sku, skuIndex, dayIndex, i, ratingType),
          ratingType,
          date,
          crawledAt: formatDate(today),
          user: `用户${String((skuIndex + 1) * 1000 + dayIndex * 17 + i).slice(-4)}`,
          keywords: [],
          source: "mock-jd-adapter",
        });
      }
    }
  });
  return reviews;
}

function buildReviewContent(sku, skuIndex, dayIndex, itemIndex, ratingType) {
  const recent = dayIndex >= 23;
  const good = [
    `家里狗狗适口性不错，${sku.series}活动价入手比较划算，日期新鲜。`,
    "已经复购好几次了，毛发状态稳定，封口也方便。",
    "颗粒大小合适，换粮过渡比较顺，狗狗吃得快。",
  ];
  const neutral = [
    "物流慢了一天，包装有点压痕，狗粮本身还可以。",
    "颗粒大了一点，小狗吃起来慢，客服回复还算及时。",
    "活动价还行，但最近感觉涨价明显。",
  ];
  const bad = [
    "这袋打开有异味，狗狗不吃，担心是不是临期。",
    "换粮后出现软便，便便臭，后面不敢继续喂。",
    "外箱包装破损，封口也松，客服处理比较慢。",
  ];
  const bursts = [["拉稀", "软便", "便便臭"], ["不吃", "狗不吃", "异味"], ["呕吐", "过敏", "换粮"], ["包装破损", "临期", "客服"], ["油腻", "泪痕", "颗粒大"]];
  if (ratingType === "good") return good[(skuIndex + dayIndex + itemIndex) % good.length];
  if (ratingType === "neutral") return neutral[(skuIndex + itemIndex) % neutral.length];
  if (recent && (itemIndex + skuIndex) % 2 === 0) return `最近这款${sku.name.replace("麦富迪", "")}问题变多，${bursts[skuIndex % bursts.length].join("、")}，希望运营尽快看一下。`;
  return bad[(dayIndex + itemIndex) % bad.length];
}

function pickRatingType(skuIndex, dayIndex, itemIndex) {
  const recent = dayIndex >= 23;
  const badModulo = recent && [0, 1, 3].includes(skuIndex) ? 4 : 7;
  if ((itemIndex + dayIndex + skuIndex) % badModulo === 0) return "bad";
  if ((itemIndex + skuIndex) % 5 === 0) return "neutral";
  return "good";
}

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function shiftDate(date, delta) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + delta);
  return formatDate(copy);
}

module.exports = {
  DB_PATH,
  defaultSkus,
  ensureStore,
  normalizeSkus,
  readStore,
  readStoreAsync,
  updateSkus,
  updateSkusAsync,
  writeStore,
  writeStoreAsync,
  getStorageMode,
  isSupabaseConfigured,
};
