const assert = require("assert");

const { realtimeSync } = require("../backend/jd-realtime");
const {
  loadKnowledgeBase,
  loadPendingTermsJson,
  matchKnowledge,
} = require("../backend/keyword-knowledge");
const { handleApiRequest } = require("../backend/voc-core");
const storeData = require("../backend/store");

async function main() {
  const knowledgeBase = loadKnowledgeBase();
  assert(knowledgeBase.length >= 5, "Obsidian JSON/Markdown knowledge base should load entries");

  const diarrheaMatch = matchKnowledge("狗狗吃完窜稀并且软便", knowledgeBase);
  assert(diarrheaMatch.some((item) => item.standardKeyword === "拉稀"), "aliases should normalize to standard keyword 拉稀");

  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new Error("forced offline verification");
  };

  try {
    const result = await realtimeSync({
      skus: storeData.defaultSkus.slice(0, 2),
      pagesPerRating: 1,
      pageSize: 2,
      deepseekApiKey: "",
    });

    assert(result.ok, "realtime sync should fall back successfully when JD request fails");
    assert(result.mode === "jd-fallback", "offline verification should use jd-fallback mode");
    assert(result.counts.good > 0 && result.counts.neutral > 0 && result.counts.bad > 0, "fallback should include good/neutral/bad reviews");
    assert(result.reviews.every((review) => review.content && review.ratingType && review.date && review.productUrl), "reviews should include required fields");
    assert(result.deepseekAnalysis.riskTheme, "analysis should expose riskTheme");
    assert(result.deepseekAnalysis.riskLevel, "analysis should expose riskLevel");
    assert(Array.isArray(result.deepseekAnalysis.evidenceReviewIds), "analysis should expose evidenceReviewIds");
    assert(result.deepseekAnalysis.suggestedAction, "analysis should expose suggestedAction");
    assert(Array.isArray(result.deepseekAnalysis.pendingTerms), "analysis should expose pendingTerms");
  } finally {
    global.fetch = originalFetch;
  }

  const dashboard = await handleApiRequest({ method: "GET", pathname: "/api/dashboard", body: {}, query: {} });
  assert(dashboard.status === 200 && dashboard.body.highRiskSkus.length > 0, "dashboard should expose high-risk SKUs");
  assert(dashboard.body.evidenceChains.length > 0, "dashboard should expose evidence chains");
  assert(dashboard.body.rdSuggestions.length > 0, "dashboard should expose R&D/QC suggestions");

  const analysis = await handleApiRequest({ method: "POST", pathname: "/api/analyze", body: { useRemote: false }, query: {} });
  assert(analysis.body.riskTheme, "analysis should expose riskTheme");
  assert(analysis.body.riskLevel, "analysis should expose riskLevel");
  assert(Array.isArray(analysis.body.evidenceReviewIds), "analysis should expose evidenceReviewIds");
  assert(analysis.body.suggestedAction, "analysis should expose suggestedAction");
  assert(Array.isArray(analysis.body.pendingTerms), "analysis should expose pendingTerms");

  const config = await handleApiRequest({ method: "GET", pathname: "/api/crawl-config", body: {}, query: {} });
  assert(config.body.crawlConfig.frequencyMinutes >= 5, "crawl config should expose configurable frequency");

  const pendingTerms = loadPendingTermsJson();
  assert(Array.isArray(pendingTerms), "Obsidian pending_terms.json should be readable");

  console.log(JSON.stringify({
    ok: true,
    knowledgeCount: knowledgeBase.length,
    pendingTerms: pendingTerms.length,
    analysisRiskTheme: analysis.body.riskTheme,
    highRiskSkus: dashboard.body.highRiskSkus.length,
    evidenceChains: dashboard.body.evidenceChains.length,
    frequencyMinutes: config.body.crawlConfig.frequencyMinutes,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
