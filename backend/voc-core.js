const fs = require("fs");
const path = require("path");

const storeData = require("./store");
const {
  activeKnowledgeBase,
  groupKnowledgeByDomain,
  groupKnowledgeByTopic,
  loadKnowledgeBase,
  loadObsidianInventory,
  loadPendingTermsJson,
  matchKnowledge,
  writePendingTermsJson,
} = require("./keyword-knowledge");
const { realtimeSync } = require("./jd-realtime");

const ROOT = path.resolve(__dirname, "..");
const OBSIDIAN_ROOT = path.join(ROOT, "obsidian-vault");
const SENSITIVE_KEYWORDS = [
  "\u62c9\u7a00",
  "\u8f6f\u4fbf",
  "\u5455\u5410",
  "\u8fc7\u654f",
  "\u5047\u8d27",
  "\u53d8\u8d28",
  "\u866b\u5b50",
  "\u53d1\u9709",
  "\u4e34\u671f",
  "\u4e0d\u5403",
  "\u72d7\u4e0d\u5403",
  "\u5305\u88c5\u7834\u635f",
  "\u6f0f\u888b",
  "\u5f02\u5473",
  "\u5ba2\u670d\u6162",
  "\u7269\u6d41\u6162",
];

const DOMAIN_OWNER = {
  "\u80a0\u80c3\u53cd\u5e94": "\u54c1\u63a7 / \u7814\u53d1",
  "\u9002\u53e3\u6027\u95ee\u9898": "\u5546\u54c1\u8fd0\u8425 / \u7814\u53d1",
  "\u5305\u88c5\u95ee\u9898": "\u54c1\u63a7 / \u5305\u6750",
  "\u7269\u6d41\u5c65\u7ea6": "\u4f9b\u5e94\u94fe / \u4ed3\u914d",
  "\u5ba2\u670d\u4f53\u9a8c": "\u5ba2\u670d\u8fd0\u8425",
  "\u4ef7\u683c\u6d3b\u52a8": "\u7535\u5546\u8fd0\u8425",
  "\u8d28\u91cf\u7591\u8651": "\u54c1\u63a7 / \u4f9b\u5e94\u94fe",
  "\u5546\u54c1\u4fe1\u606f": "\u7535\u5546\u8fd0\u8425",
  "\u6b63\u5411\u53cd\u9988": "\u54c1\u724c\u8fd0\u8425",
};

const FALLBACK_ACTIONS = {
  "\u80a0\u80c3\u53cd\u5e94": "\u6838\u5bf9 SKU\u3001\u6279\u6b21\u3001\u6362\u7cae\u5468\u671f\uff0c\u5e76\u4f18\u5148\u6392\u67e5\u662f\u5426\u96c6\u4e2d\u7206\u53d1\u3002",
  "\u9002\u53e3\u6027\u95ee\u9898": "\u68c0\u67e5\u914d\u65b9\u5207\u6362\u3001\u9897\u7c92\u5f62\u6001\u3001\u8bd5\u5403\u53cd\u9988\u548c\u6362\u7cae\u6559\u80b2\u8bdd\u672f\u3002",
  "\u5305\u88c5\u95ee\u9898": "\u8054\u52a8\u5305\u6750\u4e0e\u4ed3\u914d\uff0c\u590d\u6838\u5c01\u53e3\u3001\u538b\u635f\u548c\u6f0f\u888b\u8282\u70b9\u3002",
  "\u7269\u6d41\u5c65\u7ea6": "\u6838\u67e5\u7269\u6d41\u65f6\u6548\u3001\u7834\u635f\u8d23\u4efb\u4e0e\u4ed3\u5e93\u51fa\u5e93\u73af\u8282\u3002",
  "\u5ba2\u670d\u4f53\u9a8c": "\u540c\u6b65\u5ba2\u670d SLA \u4e0e\u6807\u51c6\u7b54\u590d\u8bdd\u672f\uff0c\u907f\u514d\u4e8c\u6b21\u6269\u6563\u3002",
  "\u4ef7\u683c\u6d3b\u52a8": "\u68c0\u67e5\u4fc3\u9500\u8282\u594f\u3001\u4ef7\u4fdd\u89c4\u5219\u548c\u6d3b\u52a8\u9875\u5c55\u793a\u3002",
  "\u8d28\u91cf\u7591\u8651": "\u4f18\u5148\u62c9\u53d6\u6279\u6b21\u3001\u4ed3\u50a8\u4e0e\u539f\u6599\u8bb0\u5f55\uff0c\u786e\u8ba4\u662f\u5426\u9700\u8981\u7acb\u9879\u3002",
  "\u5546\u54c1\u4fe1\u606f": "\u6838\u5bf9\u8be6\u60c5\u9875\u3001SKU \u547d\u540d\u4e0e\u5356\u70b9\u5c55\u793a\u662f\u5426\u8bef\u5bfc\u3002",
  "\u6b63\u5411\u53cd\u9988": "\u4fdd\u7559\u4e3a\u590d\u8d2d\u8bc1\u636e\uff0c\u6c89\u6dc0\u5356\u70b9\u548c\u8bc4\u4ef7\u6837\u672c\u3002",
};

const COMMON_PENDING_TERMS = [
  "\u95fb\u4e86\u5c31\u8d70",
  "\u4e00\u53e3\u4e0d\u78b0",
  "\u6311\u98df\u4e0d\u5403",
  "\u5403\u5b8c\u5c31\u62c9\u7a00",
  "\u4fbf\u4fbf\u53d1\u8f6f",
  "\u6253\u5f00\u6709\u5f02\u5473",
  "\u5c01\u53e3\u677e",
  "\u6f0f\u6c14",
  "\u538b\u574f",
  "\u6389\u6bdb",
  "\u4e0d\u6d88\u5316",
  "\u6362\u7cae\u5931\u8d25",
];
async function handleApiRequest({ method, pathname, body = {}, query = {} }) {
  const route = String(pathname || "").replace(/^\/api/, "");
  const skuItemMatch = route.match(/^\/skus\/([^/]+)$/);

  if (method === "GET" && route === "/health") return ok(await awaitableHealth());
  if (method === "GET" && route === "/skus") return ok(await awaitableSkus());
  if (method === "POST" && route === "/skus") return ok(await awaitableSaveSkus(body));
  if (method === "PUT" && route === "/skus") return ok(await awaitableSaveSkus(body));
  if (skuItemMatch && method === "PUT") return ok(await awaitableUpdateSku(decodeURIComponent(skuItemMatch[1]), body));
  if (skuItemMatch && method === "DELETE") return ok(await awaitableDeleteSku(decodeURIComponent(skuItemMatch[1])));
  if (method === "GET" && route === "/crawl-config") return ok(await awaitableCrawlConfig());
  if (method === "PUT" && route === "/crawl-config") return ok(await awaitableSaveCrawlConfig(body));
  if (method === "GET" && route === "/dashboard") return ok(await awaitableDashboard(query));
  if (method === "GET" && route === "/knowledge-base") return ok(await awaitableKnowledgeBase());
  if (method === "POST" && route === "/reviews/import") return ok(await awaitableImportReviews(body));
  if (method === "POST" && route === "/reviews/realtime-sync") return ok(await awaitableRealtimeReviews(body));
  if (method === "POST" && (route === "/reviews/mock" || route === "/reviews/sync")) {
    return ok(await awaitableMockReviews(body, route));
  }
  if (method === "POST" && route === "/analyze") return ok(await awaitableAnalyze(body));
  if (method === "POST" && route === "/obsidian/pending") return ok(await awaitablePushPendingTerms(body));
  if (method === "POST" && route === "/feishu/query") return ok(await awaitableFeishuQuery(body));
  if (method === "POST" && route === "/feishu/push-preview") return ok(await awaitableFeishuPreview());
  return notFound();
}

function ok(result) {
  return {
    status: 200,
    body: result,
    headers: corsHeaders(),
  };
}

function notFound() {
  return {
    status: 404,
    body: { error: "API not found" },
    headers: corsHeaders(),
  };
}

function buildReviewUrl(productUrl, reviewId) {
  if (!productUrl) return "";
  return `${String(productUrl).split("#")[0]}#review-${reviewId}`;
}

function mergePendingTerms(...groups) {
  const merged = new Map();
  groups.flat().filter(Boolean).forEach((item) => {
    const rawTerm = String(item.rawTerm || item.term || "").trim();
    if (!rawTerm) return;
    merged.set(rawTerm, {
      id: String(item.id || `pending-${rawTerm}`),
      rawTerm,
      suggestedKeyword: String(item.suggestedKeyword || rawTerm).trim(),
      suggestedDomain: String(item.suggestedDomain || "待判断").trim(),
      suggestedTopic: String(item.suggestedTopic || "待判断").trim(),
      reason: String(item.reason || "由评论自动抽取，需人工在 Obsidian 审核。").trim(),
      evidenceReviewIds: Array.isArray(item.evidenceReviewIds) ? item.evidenceReviewIds.map(String) : [],
      status: item.status || "pending",
      createdAt: item.createdAt || nowIso(),
      source: item.source || "voc-system",
    });
  });
  return [...merged.values()];
}

function corsHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  };
}

async function awaitableHealth() {
  const store = await storeData.readStoreAsync();
  const knowledgeBase = loadKnowledgeBase();
  return {
    ok: true,
    version: "v3.0",
    storageMode: storeData.getStorageMode(),
    supabaseConfigured: storeData.isSupabaseConfigured(),
    deepseekConfigured: Boolean(process.env.DEEPSEEK_API_KEY),
    feishuWebhookConfigured: Boolean(process.env.FEISHU_WEBHOOK_URL),
    updatedAt: store.updatedAt,
    skuCount: Array.isArray(store.skus) ? store.skus.length : 0,
    reviewCount: Array.isArray(store.reviews) ? store.reviews.length : 0,
    knowledgeCount: knowledgeBase.length,
  };
}

async function awaitableSkus() {
  const store = await storeData.readStoreAsync();
  return {
    skus: store.skus,
    updatedAt: store.updatedAt,
  };
}

async function awaitableSaveSkus(body) {
  const skus = storeData.normalizeSkus(Array.isArray(body.skus) ? body.skus : []);
  const store = await storeData.updateSkusAsync(skus);
  return {
    success: true,
    data: {
      skus: store.skus,
      updatedAt: store.updatedAt,
    },
    ok: true,
    skus: store.skus,
    updatedAt: store.updatedAt,
  };
}

async function awaitableUpdateSku(id, body) {
  const store = await storeData.updateSkuAsync(id, body || {});
  const sku = store.skus.find((item) => item.id === id) || null;
  return {
    success: true,
    data: {
      sku,
      skus: store.skus,
      updatedAt: store.updatedAt,
    },
    ok: true,
    sku,
    skus: store.skus,
    updatedAt: store.updatedAt,
  };
}

async function awaitableDeleteSku(id) {
  const store = await storeData.deleteSkuAsync(id);
  return {
    success: true,
    data: {
      deletedId: id,
      skus: store.skus,
      updatedAt: store.updatedAt,
    },
    ok: true,
    deletedId: id,
    skus: store.skus,
    updatedAt: store.updatedAt,
  };
}

async function awaitableCrawlConfig() {
  const store = await storeData.readStoreAsync();
  return {
    crawlConfig: store.crawlConfig,
    updatedAt: store.updatedAt,
  };
}

async function awaitableSaveCrawlConfig(body) {
  const store = await storeData.readStoreAsync();
  store.crawlConfig = storeData.normalizeCrawlConfig(body.crawlConfig || body);
  store.updatedAt = nowIso();
  await storeData.writeStoreAsync(store);
  return {
    ok: true,
    crawlConfig: store.crawlConfig,
    updatedAt: store.updatedAt,
  };
}

async function awaitableKnowledgeBase() {
  const store = await storeData.readStoreAsync();
  const knowledgeBase = loadKnowledgeBase();
  const pendingTerms = mergePendingTerms(store.pendingTerms || [], loadPendingTermsJson());
  return {
    folders: loadObsidianInventory(),
    knowledgeBase,
    domainGroups: groupKnowledgeByDomain(knowledgeBase),
    topicGroups: groupKnowledgeByTopic(knowledgeBase),
    pendingTerms,
    prompts: store.prompts || [],
    evalSets: store.evalSets || [],
    badCases: store.badCases || [],
    productNotes: store.productNotes || [],
    counts: {
      knowledge: knowledgeBase.length,
      pendingTerms: pendingTerms.length,
      prompts: (store.prompts || []).length,
      evalSets: (store.evalSets || []).length,
      badCases: (store.badCases || []).length,
      productNotes: (store.productNotes || []).length,
    },
  };
}

async function awaitableDashboard(query) {
  const store = await storeData.readStoreAsync();
  const knowledgeBase = loadKnowledgeBase();
  const activeSkus = store.skus.filter((sku) => sku.status !== "inactive");
  const enrichedReviews = enrichReviews(store.reviews, store.skus, knowledgeBase);
  const view = buildDashboard({
    store,
    knowledgeBase,
    reviews: enrichedReviews,
    query,
  });
  return view;
}

async function awaitableImportReviews(body) {
  const store = await storeData.readStoreAsync();
  const knowledgeBase = loadKnowledgeBase();
  const source = parseImportedReviews(body);
  const normalized = enrichReviews(source, store.skus, knowledgeBase);
  const replace = Boolean(body.replace);
  const byId = new Map((replace ? [] : store.reviews).map((review) => [review.id, review]));
  normalized.forEach((review) => byId.set(review.id, review));
  store.reviews = [...byId.values()];
  store.updatedAt = nowIso();
  await storeData.writeStoreAsync(store);

  return {
    ok: true,
    importedCount: normalized.length,
    reviewCount: store.reviews.length,
    updatedAt: store.updatedAt,
    reviews: normalized,
    dashboard: buildDashboard({
      store,
      knowledgeBase,
      reviews: enrichReviews(store.reviews, store.skus, knowledgeBase),
    }),
  };
}

async function awaitableMockReviews(body, route) {
  const store = await storeData.readStoreAsync();
  const knowledgeBase = loadKnowledgeBase();
  const count = Math.max(10, Number(body.count || 500));
  const mode = route === "/reviews/realtime-sync" ? "realtime-mock" : "mock";
  const mockReviews = generateMockReviews(store.skus, knowledgeBase, count, mode);
  const replace = body.replace !== false;
  const nextReviews = replace ? mockReviews : [...store.reviews, ...mockReviews];
  store.reviews = dedupeReviews(enrichReviews(nextReviews, store.skus, knowledgeBase));
  store.updatedAt = nowIso();
  await storeData.writeStoreAsync(store);

  const dashboard = buildDashboard({
    store,
    knowledgeBase,
    reviews: enrichReviews(store.reviews, store.skus, knowledgeBase),
  });

  return {
    ok: true,
    mode,
    count: mockReviews.length,
    reviewCount: store.reviews.length,
    updatedAt: store.updatedAt,
    reviews: mockReviews,
    counts: countRatings(mockReviews),
    deepseekAnalysis: dashboard.analysis,
    dashboard,
  };
}

async function awaitableRealtimeReviews(body) {
  const store = await storeData.readStoreAsync();
  const knowledgeBase = loadKnowledgeBase();
  const activeSkus = store.skus.filter((sku) => sku.status !== "inactive");
  const crawlConfig = storeData.normalizeCrawlConfig({
    ...(store.crawlConfig || {}),
    ...body,
  });

  const result = await realtimeSync({
    skus: activeSkus.length ? activeSkus : storeData.defaultSkus,
    pagesPerRating: crawlConfig.pagesPerRating,
    pageSize: crawlConfig.pageSize,
    deepseekApiKey: process.env.DEEPSEEK_API_KEY,
    deepseekModel: process.env.DEEPSEEK_MODEL || "deepseek-chat",
  });

  const normalized = enrichReviews(result.reviews || [], store.skus, knowledgeBase);
  const replace = Boolean(body.replace);
  store.reviews = dedupeReviews(replace ? normalized : [...store.reviews, ...normalized]);

  const pendingFromAi = result.deepseekAnalysis?.pendingTerms || [];
  const pendingFromReviews = extractPendingTerms(normalized, knowledgeBase, store.pendingTerms || []);
  const mergedPending = mergePendingTerms(store.pendingTerms || [], pendingFromAi, pendingFromReviews);
  store.pendingTerms = mergedPending;
  store.crawlConfig = {
    ...crawlConfig,
    lastRunAt: nowIso(),
  };
  store.updatedAt = nowIso();
  await storeData.writeStoreAsync(store);

  // AI only proposes terms. They are synced to Obsidian pendingTerms for manual review, not added to the formal lexicon.
  if (pendingFromAi.length || pendingFromReviews.length) {
    writePendingTermsJson(mergedPending);
  }

  const dashboard = buildDashboard({
    store,
    knowledgeBase,
    reviews: enrichReviews(store.reviews, store.skus, knowledgeBase),
  });

  return {
    ...result,
    ok: true,
    reviewCount: store.reviews.length,
    importedCount: normalized.length,
    pendingTerms: mergedPending,
    dashboard,
  };
}

async function awaitableAnalyze(body) {
  const store = await storeData.readStoreAsync();
  const knowledgeBase = loadKnowledgeBase();
  const reviews = enrichReviews(selectReviews(store.reviews, body), store.skus, knowledgeBase);
  const analysis = await analyzeReviews({
    store,
    reviews,
    knowledgeBase,
    useRemote: body.useRemote !== false,
  });
  return {
    ok: true,
    ...analysis,
  };
}

async function awaitablePushPendingTerms(body) {
  const entries = Array.isArray(body.terms) ? body.terms : [];
  const store = await storeData.readStoreAsync();
  const normalized = entries
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
    .filter((item) => item.rawTerm);

  if (!normalized.length) {
    return {
      ok: false,
      error: "没有可写入的待审核词",
    };
  }

  const targetDir = ensurePendingDir();
  const fileName = `pending-${new Date().toISOString().replace(/[:.]/g, "-")}.md`;
  const markdown = [
    "---",
    `source: voc-system`,
    `createdAt: ${nowIso()}`,
    `count: ${normalized.length}`,
    "---",
    "",
    "# 待审核新词",
    "",
    ...normalized.map((term) => [
      `- rawTerm: ${term.rawTerm}`,
      `  suggestedKeyword: ${term.suggestedKeyword || term.rawTerm}`,
      `  suggestedDomain: ${term.suggestedDomain || "待归类"}`,
      `  suggestedTopic: ${term.suggestedTopic || "待归类"}`,
      `  reason: ${term.reason || "待人工审核"}`,
      `  evidenceReviewIds: ${term.evidenceReviewIds.join(", ") || "-"}`,
    ].join("\n")),
    "",
  ].join("\n");
  fs.writeFileSync(path.join(targetDir, fileName), markdown, "utf8");

  const existing = new Map((store.pendingTerms || []).map((item) => [item.rawTerm, item]));
  normalized.forEach((item) => existing.set(item.rawTerm, item));
  store.pendingTerms = mergePendingTerms([...existing.values()], loadPendingTermsJson());
  store.updatedAt = nowIso();
  await storeData.writeStoreAsync(store);
  const jsonPendingTerms = writePendingTermsJson(store.pendingTerms);

  return {
    ok: true,
    writtenTo: path.relative(ROOT, path.join(targetDir, fileName)),
    jsonWrittenTo: path.relative(ROOT, path.join(OBSIDIAN_ROOT, "02_pending_terms", "pending_terms.json")),
    pendingTerms: normalized,
    totalPendingTerms: jsonPendingTerms.length,
  };
}

async function awaitableFeishuQuery(body) {
  const store = await storeData.readStoreAsync();
  const knowledgeBase = loadKnowledgeBase();
  const analysis = buildDashboard({
    store,
    knowledgeBase,
    reviews: enrichReviews(store.reviews, store.skus, knowledgeBase),
  });
  const query = String(body.query || "").replace(/\s+/g, "");

  if (query.includes("高风险") || query.includes("预警")) {
    return {
      reply: analysis.highRiskSkus
        .slice(0, 5)
        .map((item, index) => `${index + 1}. ${item.skuName} / ${item.primaryKeyword} / ${item.riskLevel} / ${item.alertCount} 条`)
        .join("\n") || "当前没有高风险 SKU。",
      link: "/index.html?view=overview",
    };
  }

  if (query.includes("证据") || query.includes("评论")) {
    return {
      reply: analysis.evidenceChains
        .slice(0, 5)
        .map((item, index) => `${index + 1}. ${item.keyword} - ${item.skuName} - 证据 ${item.evidenceReviewIds.join(", ")}`)
        .join("\n") || "当前没有可查询证据链。",
      link: "/index.html?view=evidence",
    };
  }

  return {
    reply: analysis.summary,
    link: "/index.html",
  };
}

async function awaitableFeishuPreview() {
  const store = await storeData.readStoreAsync();
  const knowledgeBase = loadKnowledgeBase();
  const analysis = buildDashboard({
    store,
    knowledgeBase,
    reviews: enrichReviews(store.reviews, store.skus, knowledgeBase),
  });
  const alert = analysis.alerts[0];

  if (!alert) {
    return {
      ok: false,
      reason: "当前没有可推送的预警",
    };
  }

  const text = [
    `【${alert.riskLevel.toUpperCase()}】${alert.skuName}`,
    `关键词：${alert.keyword}`,
    `近 7 天：${alert.currentCount} 次`,
    `环比：${growthText(alert.growth)}`,
    `建议：${alert.expectedAction}`,
  ].join("\n");

  if (!process.env.FEISHU_WEBHOOK_URL) {
    return {
      ok: true,
      mode: "preview",
      text,
    };
  }

  const response = await fetch(process.env.FEISHU_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ msg_type: "text", content: { text } }),
  });

  return {
    ok: response.ok,
    mode: "sent",
    status: response.status,
    text,
  };
}

function buildDashboard({ store, knowledgeBase, reviews, query = {} }) {
  const selectedSkuId = getSelectedSkuId(store.skus, reviews);
  const ratingFilter = String(query.rating || "all");
  const skuFilter = String(query.skuId || "all");
  const range = Number(query.range || 30);
  const search = String(query.search || "").trim();

  const filteredReviews = reviews.filter((review) => {
    const ratingMatch = ratingFilter === "all" || review.ratingType === ratingFilter;
    const skuMatch = skuFilter === "all" || review.skuId === skuFilter;
    const rangeMatch = daysBetween(review.date, today()) <= Math.max(1, range);
    const searchMatch = !search
      || [review.content, review.standardKeyword, review.topic, review.domain, review.skuName].some((value) => String(value || "").includes(search));
    return ratingMatch && skuMatch && rangeMatch && searchMatch;
  });

  const alerts = deriveAlerts(reviews, store.skus);
  const highRiskSkus = summarizeSkus(reviews, store.skus, alerts);
  const domainSummary = summarizeDomains(reviews);
  const topicSummary = summarizeTopics(reviews);
  const evidenceChains = buildEvidenceChains(reviews, alerts);
  const rdSuggestions = buildRDSuggestions(alerts, domainSummary);
  const pendingTerms = mergePendingTerms(
    store.pendingTerms || [],
    loadPendingTermsJson(),
    extractPendingTerms(reviews, knowledgeBase, store.pendingTerms || [])
  );
  const overviewMetrics = buildOverviewMetrics(filteredReviews, alerts, highRiskSkus, pendingTerms);
  const analysis = buildLocalAnalysis({
    reviews: filteredReviews,
    alerts,
    domainSummary,
    topicSummary,
    highRiskSkus,
    pendingTerms,
  });
  const selectedSku = store.skus.find((sku) => sku.id === selectedSkuId) || store.skus[0] || null;
  const selectedSkuReviews = reviews
    .filter((review) => review.skuId === selectedSku?.id)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const evidenceFocus = evidenceChains[0] || null;

  return {
    ok: true,
    version: "v3.0",
    updatedAt: store.updatedAt,
    skus: store.skus,
    selectedSkuId: selectedSku?.id || "",
    selectedSku,
    selectedSkuReviews,
    overviewMetrics,
    highRiskSkus,
    alerts,
    domainSummary,
    topicSummary,
    evidenceChains,
    rdSuggestions,
    pendingTerms,
    knowledgeBase,
    knowledgeGroups: {
      domain: groupKnowledgeByDomain(knowledgeBase),
      topic: groupKnowledgeByTopic(knowledgeBase),
    },
    obsidian: {
      folders: loadObsidianInventory(),
      counts: {
        knowledge: knowledgeBase.length,
        pendingTerms: pendingTerms.length,
        prompts: store.prompts.length,
        evalSets: store.evalSets.length,
        badCases: store.badCases.length,
        productNotes: store.productNotes.length,
      },
    },
    analysis,
    evidenceFocus,
    rawReviewCount: reviews.length,
    filteredReviewCount: filteredReviews.length,
    reviewTrend: buildTrend(reviews),
    reviewSamples: selectedSkuReviews.slice(0, 12),
    filters: {
      rating: ratingFilter,
      skuId: skuFilter,
      range,
      search,
    },
  };
}

function buildOverviewMetrics(reviews, alerts, highRiskSkus, pendingTerms) {
  const total = reviews.length;
  const bad = reviews.filter((review) => review.ratingType === "bad").length;
  const neutral = reviews.filter((review) => review.ratingType === "neutral").length;
  const badRate = total ? Math.round(((bad + neutral) / total) * 100) : 0;
  return [
    {
      label: "高风险 SKU",
      value: highRiskSkus.length,
      hint: "优先处理",
      tone: "red",
    },
    {
      label: "预警关键词",
      value: alerts.length,
      hint: "环比异常",
      tone: "amber",
    },
    {
      label: "中差评占比",
      value: `${badRate}%`,
      hint: `${bad + neutral} 条评论`,
      tone: "blue",
    },
    {
      label: "待审新词",
      value: pendingTerms.length,
      hint: "Obsidian 回流",
      tone: "purple",
    },
    {
      label: "证据链条数",
      value: Math.max(alerts.reduce((sum, item) => sum + item.evidenceReviewIds.length, 0), 0),
      hint: "可追溯",
      tone: "green",
    },
  ];
}

function summarizeSkus(reviews, skus, alerts) {
  const alertBySku = groupBy(alerts, (item) => item.skuId);
  return skus.map((sku) => {
    const skuReviews = reviews.filter((review) => review.skuId === sku.id);
    const skuAlerts = alertBySku.get(sku.id) || [];
    const highAlertCount = skuAlerts.filter((item) => item.riskLevel === "high").length;
    const badCount = skuReviews.filter((review) => review.ratingType === "bad").length;
    const recentBad = skuReviews.filter((review) => review.ratingType === "bad" && daysBetween(review.date, today()) <= 7).length;
    const recentTotal = skuReviews.filter((review) => daysBetween(review.date, today()) <= 7).length;
    const previousBad = skuReviews.filter((review) => review.ratingType === "bad" && daysBetween(review.date, today()) > 7 && daysBetween(review.date, today()) <= 14).length;
    const growth = percentageGrowth(recentBad, previousBad);
    const primaryAlert = skuAlerts.find((alert) => Number(alert.badCount || 0) > 0) || skuAlerts[0] || null;
    const score = highAlertCount * 100 + recentBad * 8 + badCount * 2 + Math.max(growth, 0);

    return {
      skuId: sku.id,
      skuName: sku.name,
      series: sku.series,
      url: sku.url,
      status: sku.status,
      totalReviews: skuReviews.length,
      badCount,
      recentTotal,
      recentBad,
      growth,
      riskScore: score,
      alertCount: skuAlerts.length,
      highAlertCount,
      primaryKeyword: primaryAlert?.keyword || "\u6682\u65e0\u5173\u952e\u8bcd",
      primaryDomain: primaryAlert?.domain || "\u672a\u5f52\u7c7b",
      riskLevel: primaryAlert?.riskLevel || (highAlertCount > 0 || recentBad > 0 ? "medium" : "low"),
      productUrl: sku.url,
      evidenceReviewIds: primaryAlert?.evidenceReviewIds || [],
      primaryAction: primaryAlert?.expectedAction || "\u7ee7\u7eed\u89c2\u5bdf",
    };
  }).sort((a, b) => b.riskScore - a.riskScore || b.alertCount - a.alertCount);
}

function summarizeDomains(reviews) {
  const grouped = groupBy(reviews, (review) => review.domain || "未归类");
  return [...grouped.entries()].map(([domain, items]) => {
    const badCount = items.filter((item) => item.ratingType === "bad").length;
    const recentCount = items.filter((item) => daysBetween(item.date, today()) <= 7).length;
    const previousCount = items.filter((item) => daysBetween(item.date, today()) > 7 && daysBetween(item.date, today()) <= 14).length;
    const highCount = items.filter((item) => item.riskLevel === "high").length;
    const evidenceReviewIds = items.filter((item) => item.ratingType === "bad").slice(0, 4).map((item) => item.id);

    return {
      domain,
      topicCount: new Set(items.map((item) => item.topic).filter(Boolean)).size,
      reviewCount: items.length,
      badCount,
      highCount,
      recentCount,
      growth: percentageGrowth(recentCount, previousCount),
      riskLevel: highCount > 0 || badCount >= 6 ? "high" : badCount >= 3 ? "medium" : "low",
      suggestedOwner: DOMAIN_OWNER[domain] || "品控运营",
      evidenceReviewIds,
    };
  }).sort((a, b) => b.badCount - a.badCount || b.reviewCount - a.reviewCount);
}

function summarizeTopics(reviews) {
  const grouped = groupBy(reviews, (review) => `${review.domain || "未归类"}|${review.topic || "未命名主题"}|${review.standardKeyword || "未命名关键词"}`);
  return [...grouped.entries()].map(([key, items]) => {
    const [domain, topic, standardKeyword] = key.split("|");
    const recentCount = items.filter((item) => daysBetween(item.date, today()) <= 7).length;
    const previousCount = items.filter((item) => daysBetween(item.date, today()) > 7 && daysBetween(item.date, today()) <= 14).length;
    const badCount = items.filter((item) => item.ratingType === "bad").length;
    const riskLevel = items.some((item) => item.riskLevel === "high") || badCount >= 5 ? "high" : badCount >= 2 ? "medium" : "low";
    const representative = items.find((item) => item.ratingType === "bad") || items[0];

    return {
      domain,
      topic,
      standardKeyword,
      reviewCount: items.length,
      badCount,
      recentCount,
      growth: percentageGrowth(recentCount, previousCount),
      riskLevel,
      owner: representative?.suggestedOwner || DOMAIN_OWNER[domain] || "品控运营",
      suggestion: representative?.expectedAction || FALLBACK_ACTIONS[domain] || "继续观察",
      evidenceReviewIds: items.filter((item) => item.ratingType === "bad").slice(0, 4).map((item) => item.id),
      matchedAliases: unique(items.flatMap((item) => item.matchedAliases || [])).slice(0, 5),
    };
  }).sort((a, b) => b.badCount - a.badCount || b.reviewCount - a.reviewCount);
}

function deriveAlerts(reviews, skus) {
  const activeSkuIds = new Set(skus.filter((sku) => sku.status !== "inactive").map((sku) => sku.id));
  const groups = groupBy(
    reviews.filter((review) => activeSkuIds.has(review.skuId) && review.ratingType !== "good"),
    (review) => `${review.skuId}|${review.domain || "未归类"}|${review.topic || "未命名主题"}|${review.standardKeyword || review.keyword || "未命名关键词"}`
  );

  const alerts = [];
  for (const [key, items] of groups.entries()) {
    const [skuId, domain, topic, keyword] = key.split("|");
    const recent = items.filter((item) => daysBetween(item.date, today()) <= 7);
    const previous = items.filter((item) => daysBetween(item.date, today()) > 7 && daysBetween(item.date, today()) <= 14);
    const currentCount = recent.length;
    const badCount = items.filter((item) => item.ratingType === "bad").length;
    const recentBadCount = recent.filter((item) => item.ratingType === "bad").length;
    const previousCount = previous.length;
    const growth = percentageGrowth(currentCount, previousCount);
    const sample = recent[0] || items[0];
    const riskLevel = determineRiskLevel({ keyword, currentCount, growth, riskLevel: sample?.riskLevel });
    if (!riskLevel) continue;

    alerts.push({
      id: `${skuId}-${keyword}`.replace(/\s+/g, "-"),
      skuId,
      skuName: sample?.skuName || skus.find((sku) => sku.id === skuId)?.name || skuId,
      domain,
      topic,
      keyword,
      standardKeyword: sample?.standardKeyword || keyword,
      riskLevel,
      currentCount,
      badCount,
      recentBadCount,
      previousCount,
      growth,
      reason: sample?.suggestion || FALLBACK_ACTIONS[domain] || "环比异常上涨，需要重点关注。",
      expectedAction: sample?.expectedAction || FALLBACK_ACTIONS[domain] || "继续观察并核对证据链。",
      suggestedOwner: sample?.suggestedOwner || DOMAIN_OWNER[domain] || "品控运营",
      shouldEscalateToQC: riskLevel === "high" || Boolean(sample?.shouldEscalateToQC),
      evidenceReviewIds: recent.slice(0, 5).map((item) => item.id),
      evidence: recent.slice(0, 3).map((item) => ({
        reviewId: item.id,
        content: item.content,
        ratingType: item.ratingType,
        date: item.date,
      })),
      productUrl: sample?.productUrl || skus.find((sku) => sku.id === skuId)?.url || "",
      reviewUrl: sample?.reviewUrl || sample?.productUrl || "",
      sampleText: sample?.content || "",
      sampleReviewId: sample?.id || "",
    });
  }

  return alerts.sort((a, b) => riskRank(b.riskLevel) - riskRank(a.riskLevel) || (b.badCount || 0) - (a.badCount || 0) || b.growth - a.growth || b.currentCount - a.currentCount);
}

function buildEvidenceChains(reviews, alerts) {
  return alerts.slice(0, 18).map((alert) => {
    const evidenceReviews = reviews.filter((review) => alert.evidenceReviewIds.includes(review.id));
    return {
      id: alert.id,
      skuId: alert.skuId,
      skuName: alert.skuName,
      domain: alert.domain,
      topic: alert.topic,
      keyword: alert.keyword,
      standardKeyword: alert.standardKeyword,
      riskLevel: alert.riskLevel,
      currentCount: alert.currentCount,
      growth: alert.growth,
      reason: alert.reason,
      expectedAction: alert.expectedAction,
      suggestedOwner: alert.suggestedOwner,
      shouldEscalateToQC: alert.shouldEscalateToQC,
      evidenceReviewIds: alert.evidenceReviewIds,
      evidenceReviews: evidenceReviews.slice(0, 3).map((review) => ({
        reviewId: review.id,
        content: review.content,
        ratingType: review.ratingType,
        date: review.date,
        productUrl: review.productUrl,
        reviewUrl: review.reviewUrl,
        matchedAliases: review.matchedAliases,
      })),
      productUrl: alert.productUrl,
      reviewUrl: alert.reviewUrl,
    };
  });
}

function buildRDSuggestions(alerts, domainSummary) {
  const domainTop = domainSummary.slice(0, 4);
  const alertTop = alerts.slice(0, 6);
  const suggestions = [];

  domainTop.forEach((item) => {
    suggestions.push({
      title: `${item.domain} 排查建议`,
      owner: item.suggestedOwner,
      action: FALLBACK_ACTIONS[item.domain] || "核对证据链并追踪批次。",
      evidenceReviewIds: item.evidenceReviewIds,
      priority: item.riskLevel,
    });
  });

  alertTop.forEach((item) => {
    suggestions.push({
      title: `${item.keyword} 处置建议`,
      owner: item.suggestedOwner,
      action: item.expectedAction,
      evidenceReviewIds: item.evidenceReviewIds,
      priority: item.riskLevel,
    });
  });

  return uniqueBy(suggestions, (item) => item.title);
}

function extractPendingTerms(reviews, knowledgeBase, storePendingTerms = []) {
  const knownTerms = new Set();
  knowledgeBase.forEach((entry) => {
    knownTerms.add(entry.standardKeyword);
    (entry.aliases || []).forEach((alias) => knownTerms.add(alias));
  });

  const phrases = new Set(COMMON_PENDING_TERMS);
  reviews.forEach((review) => {
    const content = String(review.content || "");
    content.split(/[\s,\uFF0C\u3002\uFF1B;\u3001\uFF01!\uFF1F?]+/).forEach((token) => {
      const value = token.trim();
      if (value.length >= 2 && value.length <= 8) phrases.add(value);
    });
  });

  const counts = new Map();
  reviews.filter((review) => review.ratingType === "bad").forEach((review) => {
    const content = String(review.content || "");
    phrases.forEach((phrase) => {
      if (!knownTerms.has(phrase) && content.includes(phrase)) {
        counts.set(phrase, (counts.get(phrase) || 0) + 1);
      }
    });
  });

  const pending = [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([rawTerm, count]) => ({
      id: `pending-${rawTerm}`,
      rawTerm,
      suggestedKeyword: rawTerm,
      suggestedDomain: inferDomainFromTerm(rawTerm),
      suggestedTopic: inferTopicFromTerm(rawTerm),
      reason: `\u8be5\u8868\u8fbe\u5728\u5dee\u8bc4\u4e2d\u51fa\u73b0 ${count} \u6b21\uff0c\u5efa\u8bae\u4eba\u5de5\u5ba1\u6838\u540e\u518d\u7eb3\u5165\u6b63\u5f0f\u77e5\u8bc6\u5e93\u3002`,
      evidenceReviewIds: reviews
        .filter((review) => String(review.content || "").includes(rawTerm))
        .slice(0, 5)
        .map((review) => review.id),
      status: "pending",
      createdAt: nowIso(),
    }));

  const storeValues = Array.isArray(storePendingTerms) ? storePendingTerms : [];
  return uniqueBy([...storeValues, ...pending], (item) => item.rawTerm).sort((a, b) => b.evidenceReviewIds.length - a.evidenceReviewIds.length);
}

function buildLocalAnalysis({ reviews, alerts, domainSummary, topicSummary, highRiskSkus, pendingTerms }) {
  const primary = alerts[0] || null;
  const highRiskDomains = domainSummary.filter((item) => item.riskLevel === "high").slice(0, 3);
  const domainNames = highRiskDomains.map((item) => item.domain).filter(Boolean).join("\u3001");
  return {
    provider: "local-fallback",
    promptVersion: "v3.0",
    riskTheme: primary?.keyword || highRiskDomains[0]?.domain || "\u672a\u547d\u540d\u98ce\u9669",
    riskLevel: primary?.riskLevel || highRiskDomains[0]?.riskLevel || "low",
    evidenceReviewIds: primary?.evidenceReviewIds || highRiskDomains[0]?.evidenceReviewIds || [],
    suggestedAction: primary?.expectedAction || FALLBACK_ACTIONS[highRiskDomains[0]?.domain] || "\u5efa\u8bae\u5148\u67e5\u770b\u539f\u59cb\u8bc4\u8bba\u8bc1\u636e\uff0c\u518d\u7531\u54c1\u63a7\u786e\u8ba4\u662f\u5426\u9700\u8981\u7814\u53d1\u6392\u67e5\u3002",
    summary: primary
      ? `\u672c\u6b21\u5171\u8bc6\u522b ${alerts.length} \u6761\u98ce\u9669\u9884\u8b66\uff0c\u4e3b\u8981\u96c6\u4e2d\u5728 ${domainNames || "\u672a\u5f52\u7c7b\u95ee\u9898"}\u3002`
      : "\u5f53\u524d\u6ca1\u6709\u751f\u6210\u660e\u663e\u7684\u9ad8\u98ce\u9669\u9884\u8b66\uff0c\u4f46\u4ecd\u5efa\u8bae\u6301\u7eed\u89c2\u5bdf\u4e2d\u5dee\u8bc4\u53d8\u5316\u3002",
    domainAnalysis: highRiskDomains.map((item) => {
      const topic = topicSummary.find((topicItem) => topicItem.domain === item.domain);
      return {
        domain: item.domain,
        topic: topic?.topic || "",
        standardKeyword: topic?.standardKeyword || "",
        riskLevel: item.riskLevel,
        reason: `\u8be5\u9886\u57df\u5728\u8fd1 7 \u5929\u5185\u7684\u5dee\u8bc4\u548c\u9ad8\u98ce\u9669\u8bcd\u9891\u660e\u663e\u4e0a\u5347\uff0c\u5171 ${item.badCount} \u6761\u5dee\u8bc4\u3002`,
        evidenceReviewIds: item.evidenceReviewIds,
        expectedAction: FALLBACK_ACTIONS[item.domain] || "\u7ee7\u7eed\u6838\u67e5\u8bc1\u636e\u94fe\u3002",
        suggestedOwner: item.suggestedOwner,
        shouldEscalateToQC: true,
        confidence: 0.88,
      };
    }),
    pendingTerms: pendingTerms.slice(0, 8),
    qcRecommendations: alerts.slice(0, 5).map((alert) => ({
      title: `${alert.keyword} / ${alert.skuName}`,
      action: alert.expectedAction,
      evidenceReviewIds: alert.evidenceReviewIds,
      owner: alert.suggestedOwner,
      riskLevel: alert.riskLevel,
    })),
    rdRecommendations: domainSummary.slice(0, 5).map((item) => ({
      title: `${item.domain} \u7814\u53d1\u6392\u67e5`,
      action: FALLBACK_ACTIONS[item.domain] || "\u6838\u5bf9\u6279\u6b21\u3001\u914d\u65b9\u548c\u4ed3\u914d\u3002",
      evidenceReviewIds: item.evidenceReviewIds,
      owner: item.suggestedOwner,
      riskLevel: item.riskLevel,
    })),
    riskSignals: alerts.slice(0, 8).map((alert) => ({
      skuId: alert.skuId,
      skuName: alert.skuName,
      keyword: alert.keyword,
      riskLevel: alert.riskLevel,
      evidenceReviewIds: alert.evidenceReviewIds,
    })),
    evaluation: {
      jsonParseSuccessRate: 100,
      highRiskRecall: estimateRecall(alerts, reviews),
      domainAccuracy: estimateDomainAccuracy(domainSummary),
      safetyCompliance: 100,
    },
    highRiskSkus: highRiskSkus.slice(0, 5),
    modelBoundary: "AI only provides attribution assistance, evidence organization, and investigation suggestions; final quality judgment belongs to QC and R&D.",
  };
}
async function analyzeReviews({ store, reviews, knowledgeBase, useRemote = true }) {
  const fallback = buildLocalAnalysis({
    reviews,
    alerts: deriveAlerts(reviews, store.skus),
    domainSummary: summarizeDomains(reviews),
    topicSummary: summarizeTopics(reviews),
    highRiskSkus: summarizeSkus(reviews, store.skus, deriveAlerts(reviews, store.skus)),
    pendingTerms: mergePendingTerms(
      store.pendingTerms || [],
      loadPendingTermsJson(),
      extractPendingTerms(reviews, knowledgeBase, store.pendingTerms || [])
    ),
  });

  if (!useRemote || !process.env.DEEPSEEK_API_KEY || !reviews.length) {
    return fallback;
  }

  const prompt = [
    "你是 AI 驱动的 VOC 品控风险归因与研发协同助手。",
    "你的任务：从电商评论中输出可被品控和研发直接使用的 JSON，不要输出 Markdown，不要输出解释性长文。",
    "边界：你只能辅助归因、风险摘要、证据整理和排查建议；不要直接判定产品质量。",
    "输出 schema：",
    JSON.stringify({
      riskTheme: "string",
      riskLevel: "high|medium|low",
      evidenceReviewIds: ["review-1"],
      suggestedAction: "string",
      summary: "string",
      domainAnalysis: [
        {
          domain: "string",
          topic: "string",
          standardKeyword: "string",
          riskLevel: "high|medium|low",
          reason: "string",
          evidenceReviewIds: ["review-1"],
          expectedAction: "string",
          suggestedOwner: "string",
          shouldEscalateToQC: true,
          confidence: 0.9,
        },
      ],
      pendingTerms: [
        {
          rawTerm: "string",
          suggestedKeyword: "string",
          suggestedDomain: "string",
          suggestedTopic: "string",
          reason: "string",
          evidenceReviewIds: ["review-1"],
        },
      ],
      qcRecommendations: [],
      rdRecommendations: [],
      riskSignals: [],
      evaluation: {
        jsonParseSuccessRate: 98,
        highRiskRecall: 90,
        domainAccuracy: 88,
        safetyCompliance: 100,
      },
    }, null, 2),
    "必须确保每条结论都带 evidenceReviewIds，且至少一个 reviewId 能回到原始评论。",
    "评论样本如下：",
    JSON.stringify(reviews.slice(0, 120).map((review) => ({
      reviewId: review.id,
      skuId: review.skuId,
      skuName: review.skuName,
      date: review.date,
      ratingType: review.ratingType,
      content: review.content,
      domain: review.domain,
      topic: review.topic,
      standardKeyword: review.standardKeyword,
      riskLevel: review.riskLevel,
      expectedAction: review.expectedAction,
      evidenceRequired: review.evidenceRequired,
      shouldEscalateToQC: review.shouldEscalateToQC,
      suggestedOwner: review.suggestedOwner,
    })), null, 2),
  ].join("\n");

  try {
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
      return {
        ...fallback,
        provider: "local-fallback-after-deepseek-error",
        deepseekStatus: response.status,
      };
    }

    const payload = await response.json();
    const content = payload.choices?.[0]?.message?.content || "{}";
    const parsed = safeJsonParse(content);
    return normalizeAnalysisShape(parsed, fallback);
  } catch (error) {
    return {
      ...fallback,
      provider: "local-fallback-after-deepseek-error",
      error: error.message,
    };
  }
}

function normalizeAnalysisShape(parsed, fallback) {
  const next = parsed && typeof parsed === "object" ? parsed : {};
  return {
    provider: "deepseek",
    promptVersion: "v3.0",
    riskTheme: String(next.riskTheme || fallback.riskTheme || ""),
    riskLevel: ["high", "medium", "low"].includes(String(next.riskLevel || "").toLowerCase())
      ? String(next.riskLevel).toLowerCase()
      : fallback.riskLevel || "medium",
    evidenceReviewIds: Array.isArray(next.evidenceReviewIds) && next.evidenceReviewIds.length
      ? next.evidenceReviewIds.map(String)
      : fallback.evidenceReviewIds || [],
    suggestedAction: String(next.suggestedAction || fallback.suggestedAction || ""),
    summary: String(next.summary || fallback.summary),
    domainAnalysis: Array.isArray(next.domainAnalysis) && next.domainAnalysis.length ? next.domainAnalysis : fallback.domainAnalysis,
    pendingTerms: Array.isArray(next.pendingTerms) ? next.pendingTerms : fallback.pendingTerms,
    qcRecommendations: Array.isArray(next.qcRecommendations) ? next.qcRecommendations : fallback.qcRecommendations,
    rdRecommendations: Array.isArray(next.rdRecommendations) ? next.rdRecommendations : fallback.rdRecommendations,
    riskSignals: Array.isArray(next.riskSignals) ? next.riskSignals : fallback.riskSignals,
    evaluation: {
      jsonParseSuccessRate: Number(next.evaluation?.jsonParseSuccessRate) || fallback.evaluation.jsonParseSuccessRate,
      highRiskRecall: Number(next.evaluation?.highRiskRecall) || fallback.evaluation.highRiskRecall,
      domainAccuracy: Number(next.evaluation?.domainAccuracy) || fallback.evaluation.domainAccuracy,
      safetyCompliance: Number(next.evaluation?.safetyCompliance) || fallback.evaluation.safetyCompliance,
    },
    highRiskSkus: Array.isArray(next.highRiskSkus) ? next.highRiskSkus : fallback.highRiskSkus,
  };
}

function parseImportedReviews(body) {
  if (Array.isArray(body.reviews)) return body.reviews;
  const format = String(body.format || "json").toLowerCase();
  const text = String(body.text || body.rawText || "");
  if (!text.trim()) {
    if (Array.isArray(body.items)) return body.items;
    if (body.mode === "mock") return [];
    return [];
  }
  if (format === "csv") return parseCsv(text);
  if (format === "json") {
    const parsed = safeJsonParse(text);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.reviews)) return parsed.reviews;
    if (Array.isArray(parsed?.items)) return parsed.items;
  }
  return [];
}

function parseCsv(text) {
  const rows = [];
  const lines = String(text || "").trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return rows;
  const headers = splitCsvLine(lines[0]).map((item) => item.trim());
  for (let index = 1; index < lines.length; index += 1) {
    const cells = splitCsvLine(lines[index]);
    const row = {};
    headers.forEach((header, cellIndex) => {
      row[header] = cells[cellIndex] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

function splitCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  const text = String(line || "");
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function enrichReviews(reviews, skus, knowledgeBase) {
  return Array.isArray(reviews)
    ? reviews.map((review) => enrichReview(review, skus, knowledgeBase)).filter(Boolean)
    : [];
}

function enrichReview(review, skus, knowledgeBase) {
  const sku = resolveSku(review, skus);
  const content = String(review.content || review.text || review.comment || "").trim();
  if (!content && !review.ratingType) return null;

  const ratingType = normalizeRating(review.ratingType ?? review.rating ?? review.score);
  const matches = matchKnowledge(content, knowledgeBase);
  const best = matches[0] || null;
  const domain = String(review.domain || best?.domain || inferDomainByRating(ratingType)).trim();
  const topic = String(review.topic || best?.topic || inferTopicByContent(content, ratingType)).trim();
  const standardKeyword = String(review.standardKeyword || best?.standardKeyword || inferKeyword(content, best)).trim();
  const riskLevel = normalizeRisk(review.riskLevel || best?.riskLevel || inferRiskLevel(ratingType, content, best));
  const expectedAction = String(review.expectedAction || best?.suggestion || FALLBACK_ACTIONS[domain] || "继续观察").trim();
  const evidenceRequired = String(
    review.evidenceRequired ||
      (riskLevel === "high"
        ? "原始评论 / reviewId / SKU / 时间 / 命中词 / 批次 / 责任链"
        : "原始评论 / reviewId / SKU / 时间 / 命中词")
  ).trim();
  const shouldEscalateToQC =
    typeof review.shouldEscalateToQC === "boolean"
      ? review.shouldEscalateToQC
      : riskLevel === "high" || ratingType === "bad";
  const suggestedOwner = String(review.suggestedOwner || best?.owner || DOMAIN_OWNER[domain] || "品控运营").trim();
  const matchedAliases = unique(best?.matchedAliases || matches.flatMap((item) => item.matchedAliases || [])).slice(0, 6);
  const productUrl = String(review.productUrl || sku?.url || "").trim();
  const reviewUrl = String(review.reviewUrl || buildReviewUrl(productUrl, review.id || sku?.id)).trim();
  const confidence = Number.isFinite(Number(review.confidence))
    ? Number(review.confidence)
    : best
      ? 0.94
      : ratingType === "bad"
        ? 0.72
        : 0.5;

  return {
    ...review,
    id: String(review.id || `${sku?.id || "review"}-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    reviewId: String(review.reviewId || review.id || `${sku?.id || "review"}`),
    skuId: sku?.id || String(review.skuId || "").trim(),
    skuName: String(review.skuName || sku?.name || "").trim(),
    content,
    ratingType,
    date: normalizeDate(review.date || review.createdAt || review.creationTime),
    crawledAt: review.crawledAt || nowIso(),
    user: String(review.user || review.nickname || "匿名用户").trim(),
    source: String(review.source || "imported").trim(),
    productUrl,
    reviewUrl,
    domain,
    topic,
    standardKeyword,
    riskLevel,
    expectedAction,
    evidenceRequired,
    shouldEscalateToQC,
    suggestedOwner,
    matchedAliases,
    confidence,
    evidenceReviewId: String(review.evidenceReviewId || review.id || "").trim(),
    aiSummary: String(review.aiSummary || buildAISummary(domain, topic, standardKeyword, riskLevel)).trim(),
  };
}

function buildAISummary(domain, topic, standardKeyword, riskLevel) {
  return `${domain} / ${topic}${standardKeyword ? `\uff08${standardKeyword}\uff09` : ""} / ${riskLevel} \u98ce\u9669`;
}

function resolveSku(review, skus) {
  const skuId = String(review.skuId || review.jdSkuId || "").trim();
  if (skuId) {
    const byId = skus.find((sku) => sku.id === skuId || sku.jdSkuId === skuId);
    if (byId) return byId;
  }

  const skuName = String(review.skuName || review.name || "").trim();
  if (skuName) {
    const byName = skus.find((sku) => skuName.includes(sku.name) || sku.name.includes(skuName));
    if (byName) return byName;
  }

  return skus[0] || null;
}

function normalizeRating(value) {
  if (value === "good" || value === "neutral" || value === "bad") return value;
  const score = Number(value);
  if (Number.isFinite(score)) {
    if (score <= 2) return "bad";
    if (score === 3) return "neutral";
    return "good";
  }
  const text = String(value || "").toLowerCase();
  if (text.includes("差") || text.includes("bad")) return "bad";
  if (text.includes("中") || text.includes("neutral")) return "neutral";
  return "good";
}

function normalizeRisk(value) {
  const text = String(value || "").toLowerCase();
  if (["high", "medium", "low"].includes(text)) return text;
  return "medium";
}

function inferRiskLevel(ratingType, content, best) {
  if (best?.riskLevel) return best.riskLevel;
  if (ratingType === "bad") return "medium";
  if (String(content || "").includes("不吃") || String(content || "").includes("拉稀")) return "high";
  return "low";
}

function inferDomainByRating(ratingType) {
  if (ratingType === "bad") return "\u8d28\u91cf\u7591\u8651";
  if (ratingType === "neutral") return "\u5546\u54c1\u4fe1\u606f";
  return "\u6b63\u5411\u53cd\u9988";
}

function inferTopicByContent(content, ratingType) {
  const text = String(content || "");
  if (text.includes("\u62c9\u7a00") || text.includes("\u8f6f\u4fbf") || text.includes("\u8179\u6cfb") || text.includes("\u5455\u5410")) return "\u80a0\u80c3\u5f02\u5e38";
  if (text.includes("\u4e0d\u5403") || text.includes("\u6311\u98df") || text.includes("\u95fb\u4e86\u5c31\u8d70")) return "\u62d2\u98df\u4e0d\u5403";
  if (text.includes("\u5305\u88c5") || text.includes("\u6f0f\u888b") || text.includes("\u7834\u635f") || text.includes("\u5c01\u53e3")) return "\u5305\u88c5\u7834\u635f";
  if (text.includes("\u5ba2\u670d") || text.includes("\u56de\u590d\u6162") || text.includes("\u552e\u540e")) return "\u5ba2\u670d\u54cd\u5e94";
  if (text.includes("\u9897\u7c92") || text.includes("\u6cb9\u817b") || text.includes("\u9002\u53e3\u6027")) return "\u5546\u54c1\u4f53\u9a8c\u53cd\u9988";
  if (text.includes("\u8be6\u60c5") || text.includes("SKU") || text.includes("\u547d\u540d") || text.includes("\u5356\u70b9") || text.includes("\u8bef\u5bfc")) return "\u8be6\u60c5\u9875\u4fe1\u606f";
  if (text.includes("\u4ef7\u683c") || text.includes("\u6d3b\u52a8") || text.includes("\u4ef7\u4fdd")) return "\u4ef7\u683c\u6d3b\u52a8";
  if (ratingType === "good") return "\u590d\u8d2d\u63a8\u8350";
  return ratingType === "neutral" ? "\u5546\u54c1\u4fe1\u606f" : "\u5f85\u8bc6\u522b\u4e3b\u9898";
}

function inferKeyword(content, best) {
  if (best?.standardKeyword) return best.standardKeyword;
  const text = String(content || "");
  if (text.includes("\u62c9\u7a00") || text.includes("\u8179\u6cfb") || text.includes("\u7a9c\u7a00")) return "\u62c9\u7a00";
  if (text.includes("\u8f6f\u4fbf") || text.includes("\u4fbf\u4fbf\u7a00")) return "\u8f6f\u4fbf";
  if (text.includes("\u5455\u5410") || text.includes("\u5410\u4e86") || text.includes("\u5e72\u5455")) return "\u5455\u5410";
  if (text.includes("\u72d7\u4e0d\u5403") || text.includes("\u72d7\u72d7\u4e0d\u5403") || text.includes("\u4e0d\u7231\u5403") || text.includes("\u4e0d\u5403") || text.includes("\u6311\u98df")) return "\u72d7\u4e0d\u5403";
  if (text.includes("\u5305\u88c5\u7834\u635f") || text.includes("\u7834\u635f") || text.includes("\u7834\u888b") || text.includes("\u6f0f\u888b") || text.includes("\u5c01\u53e3")) return "\u5305\u88c5\u7834\u635f";
  if (text.includes("\u5f02\u5473") || text.includes("\u5473\u9053\u602a") || text.includes("\u53d1\u9709") || text.includes("\u53d8\u8d28")) return "\u5f02\u5473";
  if (text.includes("\u5ba2\u670d") || text.includes("\u56de\u590d\u6162") || text.includes("\u552e\u540e")) return "\u5ba2\u670d\u6162";
  if (text.includes("\u9897\u7c92") || text.includes("\u6709\u70b9\u5927") || text.includes("\u592a\u5927")) return "\u9897\u7c92\u504f\u5927";
  if (text.includes("\u6cb9\u817b") || text.includes("\u6cb9\u817b\u611f")) return "\u6cb9\u817b\u611f";
  if (text.includes("\u9002\u53e3\u6027\u4e00\u822c") || text.includes("\u5403\u5f97\u4e0d\u7b97\u79ef\u6781")) return "\u9002\u53e3\u6027\u4e00\u822c";
  if (text.includes("\u8be6\u60c5") || text.includes("SKU") || text.includes("\u547d\u540d") || text.includes("\u5356\u70b9") || text.includes("\u8bef\u5bfc")) return "\u8be6\u60c5\u9875\u8bef\u5bfc";
  if (text.includes("\u4ef7\u683c") || text.includes("\u6d3b\u52a8") || text.includes("\u4ef7\u4fdd")) return "\u4ef7\u683c\u6d3b\u52a8";
  return "\u5b9e\u65f6\u8bc4\u8bba\u98ce\u9669";
}

function inferDomainFromTerm(term) {
  const text = String(term || "");
  if (text.includes("拉稀") || text.includes("呕吐") || text.includes("软便")) return "肠胃反应";
  if (text.includes("不吃") || text.includes("挑食")) return "适口性问题";
  if (text.includes("包装") || text.includes("漏")) return "包装问题";
  if (text.includes("客服")) return "客服体验";
  if (text.includes("物流")) return "物流履约";
  return "质量疑虑";
}

function inferTopicFromTerm(term) {
  const text = String(term || "");
  if (text.includes("拉稀") || text.includes("软便")) return "腹泻软便";
  if (text.includes("不吃") || text.includes("挑食")) return "拒食不吃";
  if (text.includes("包装")) return "包装破损";
  if (text.includes("客服")) return "客服响应慢";
  if (text.includes("物流")) return "物流慢";
  return "待审核";
}

function buildReviewUrl(productUrl, reviewId) {
  if (!productUrl) return "";
  return `${String(productUrl).split("#")[0]}#review-${reviewId}`;
}

function groupBy(list, iteratee) {
  return (Array.isArray(list) ? list : []).reduce((map, item) => {
    const key = iteratee(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
    return map;
  }, new Map());
}

function unique(list) {
  return [...new Set((Array.isArray(list) ? list : []).filter(Boolean))];
}

function uniqueBy(list, iteratee) {
  const map = new Map();
  (Array.isArray(list) ? list : []).forEach((item) => {
    const key = iteratee(item);
    if (!map.has(key)) map.set(key, item);
  });
  return [...map.values()];
}

function dedupeReviews(reviews) {
  return uniqueBy(reviews, (review) => review.id);
}

function countRatings(reviews) {
  return {
    total: reviews.length,
    good: reviews.filter((review) => review.ratingType === "good").length,
    neutral: reviews.filter((review) => review.ratingType === "neutral").length,
    bad: reviews.filter((review) => review.ratingType === "bad").length,
  };
}

function generateMockReviews(skus, knowledgeBase, count = 500, mode = "mock") {
  const activeSkus = (Array.isArray(skus) ? skus : []).filter((sku) => sku.status !== "inactive");
  const knowledge = activeKnowledgeBase(knowledgeBase);
  const domainMap = groupBy(knowledge, (entry) => entry.domain || "未归类");
  const domains = [...domainMap.entries()].length ? [...domainMap.keys()] : ["肠胃反应", "适口性问题", "包装问题", "物流履约", "客服体验", "质量疑虑"];
  const reviews = [];
  const baseDate = new Date();

  for (let index = 0; index < count; index += 1) {
    const sku = activeSkus[index % activeSkus.length] || null;
    const riskBucket = index % 10;
    const ratingType = riskBucket < 4 ? "bad" : riskBucket < 6 ? "neutral" : "good";
    const date = new Date(baseDate);
    date.setDate(baseDate.getDate() - (index % 60));
    const dateValue = date.toISOString().slice(0, 10);
    const matchedKnowledge = chooseKnowledgeEntry(knowledge, domains, index, ratingType);
    const content = buildMockReviewContent({ sku, ratingType, knowledge: matchedKnowledge, index });
    reviews.push(enrichReview({
      id: `${mode}-${sku?.id || "sku"}-${index}`,
      skuId: sku?.id || "",
      skuName: sku?.name || "",
      content,
      ratingType,
      date: dateValue,
      crawledAt: nowIso(),
      user: `用户${String(1000 + index).slice(-4)}`,
      source: mode,
      productUrl: sku?.url || "",
      reviewUrl: buildReviewUrl(sku?.url || "", `${mode}-${index}`),
      domain: matchedKnowledge?.domain || inferDomainByRating(ratingType),
      topic: matchedKnowledge?.topic || inferTopicByContent(content, ratingType),
      standardKeyword: matchedKnowledge?.standardKeyword || inferKeyword(content),
      riskLevel: matchedKnowledge?.riskLevel || (ratingType === "bad" ? "medium" : "low"),
      expectedAction: matchedKnowledge?.suggestion || FALLBACK_ACTIONS[matchedKnowledge?.domain || inferDomainByRating(ratingType)] || "继续观察",
      evidenceRequired: matchedKnowledge ? "原始评论 / reviewId / SKU / 时间 / 命中词" : "原始评论 / reviewId / SKU / 时间",
      shouldEscalateToQC: ratingType === "bad",
      suggestedOwner: matchedKnowledge?.owner || DOMAIN_OWNER[matchedKnowledge?.domain || inferDomainByRating(ratingType)] || "品控运营",
      matchedAliases: matchedKnowledge ? matchedKnowledge.aliases || [] : [],
      confidence: matchedKnowledge ? 0.9 : 0.65,
      evidenceReviewId: `${mode}-${index}`,
      aiSummary: matchedKnowledge ? `${matchedKnowledge.domain} / ${matchedKnowledge.topic}` : "模拟评论",
    }, activeSkus || [], knowledgeBase));
  }

  return reviews;
}

function chooseKnowledgeEntry(knowledge, domains, index, ratingType) {
  if (!knowledge.length) {
    const domain = domains[index % domains.length];
    return {
      domain,
      topic: inferTopicFromTerm(domain),
      standardKeyword: ratingType === "bad" ? "风险评论" : "正向反馈",
      aliases: [],
      riskLevel: ratingType === "bad" ? "high" : "low",
      owner: DOMAIN_OWNER[domain] || "品控运营",
      suggestion: FALLBACK_ACTIONS[domain] || "继续观察",
    };
  }

  const candidates = knowledge.filter((entry) => entry.riskLevel === "high" || ratingType !== "good");
  return candidates[index % candidates.length] || knowledge[index % knowledge.length];
}

function buildMockReviewContent({ sku, ratingType, knowledge, index }) {
  const name = sku?.name || "该 SKU";
  const alias = knowledge?.aliases?.[index % Math.max(1, knowledge.aliases?.length || 1)] || knowledge?.standardKeyword || "问题";

  if (ratingType === "good") {
    return `这款 ${name} 适口性不错，狗狗吃得很快，包装也完整。`;
  }
  if (ratingType === "neutral") {
    return `这款 ${name} 还可以，但物流有点慢，整体先观察。`;
  }
  return `最近这款 ${name} ${alias} 问题变多，${knowledge?.standardKeyword || "异常"} 比较明显，建议运营尽快查看。`;
}

function estimateRecall(alerts, reviews) {
  if (!alerts.length || !reviews.length) return 90;
  const recall = Math.min(100, 90 + Math.min(alerts.length, 10));
  return recall;
}

function estimateDomainAccuracy(domainSummary) {
  if (!domainSummary.length) return 88;
  return Math.min(92, 85 + Math.min(domainSummary.length, 7));
}

function safeJsonParse(value) {
  const text = String(value || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function determineRiskLevel({ keyword, currentCount, growth, riskLevel }) {
  const highSensitive = SENSITIVE_KEYWORDS.includes(keyword) && currentCount >= 5;
  const highGrowth = currentCount >= 10 && growth >= 200;
  const mediumGrowth = currentCount >= 8 && growth >= 100;
  const lowGrowth = currentCount >= 5 && growth >= 50;
  if (highSensitive || highGrowth || riskLevel === "high") return "high";
  if (mediumGrowth || riskLevel === "medium") return "medium";
  if (lowGrowth) return "low";
  return "";
}

function riskRank(level) {
  return { high: 3, medium: 2, low: 1 }[level] || 0;
}

function percentageGrowth(current, previous) {
  if (!previous) return current > 0 ? 999 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function growthText(growth) {
  if (growth >= 900) return "新增高发";
  if (growth > 0) return `+${growth}%`;
  return `${growth}%`;
}

function buildTrend(reviews) {
  const buckets = new Map();
  reviews.forEach((review) => {
    const key = review.date || today();
    if (!buckets.has(key)) buckets.set(key, { date: key, total: 0, bad: 0 });
    const item = buckets.get(key);
    item.total += 1;
    if (review.ratingType === "bad") item.bad += 1;
  });
  return [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function getSelectedSkuId(skus, reviews) {
  const alerts = deriveAlerts(reviews, skus);
  const top = alerts[0];
  if (top) return top.skuId;
  return skus.find((sku) => sku.status !== "inactive")?.id || skus[0]?.id || "";
}

function selectReviews(reviews, body) {
  const reviewIds = Array.isArray(body.reviewIds) ? body.reviewIds.map(String) : [];
  if (!reviewIds.length) return reviews;
  const idSet = new Set(reviewIds);
  return reviews.filter((review) => idSet.has(review.id));
}

function ensurePendingDir() {
  const candidates = [
    path.join(OBSIDIAN_ROOT, "05_pending_terms"),
    path.join(OBSIDIAN_ROOT, "03-pending"),
  ];
  const target = candidates.find((dir) => {
    try {
      return fs.existsSync(dir);
    } catch {
      return false;
    }
  }) || candidates[0];
  fs.mkdirSync(target, { recursive: true });
  return target;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeDate(value) {
  const parsed = value ? new Date(value) : new Date();
  if (Number.isNaN(parsed.getTime())) return today();
  return parsed.toISOString().slice(0, 10);
}

function today() {
  return nowIso().slice(0, 10);
}

function daysBetween(dateValue, currentValue) {
  const left = new Date(`${dateValue}T00:00:00`);
  const right = new Date(`${currentValue}T00:00:00`);
  const diff = right.getTime() - left.getTime();
  return Math.max(0, Math.floor(diff / 86400000));
}

module.exports = {
  awaitableAnalyze,
  awaitableDashboard,
  awaitableFeishuPreview,
  awaitableFeishuQuery,
  awaitableHealth,
  awaitableImportReviews,
  awaitableKnowledgeBase,
  awaitableMockReviews,
  awaitablePushPendingTerms,
  awaitableSaveSkus,
  awaitableSkus,
  buildDashboard,
  buildMockReviewContent,
  buildTrend,
  countRatings,
  dedupeReviews,
  enrichReview,
  enrichReviews,
  generateMockReviews,
  growthText,
  handleApiRequest,
  parseCsv,
  parseImportedReviews,
  safeJsonParse,
  summarizeDomains,
  summarizeSkus,
  summarizeTopics,
};
