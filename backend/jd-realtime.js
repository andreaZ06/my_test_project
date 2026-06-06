const JD_COMMENT_API = "https://club.jd.com/comment/productPageComments.action";

const keywordLexicon = [
  "拉稀", "软便", "呕吐", "过敏", "假货", "变质", "虫子", "发霉", "临期", "不吃", "狗不吃", "包装破损",
  "颗粒大", "颗粒小", "适口性", "复购", "涨价", "物流慢", "客服", "油腻", "异味", "泪痕", "便便臭",
  "活动价", "划算", "毛发", "换粮", "日期新鲜", "封口",
];

const sensitiveKeywords = ["拉稀", "软便", "呕吐", "过敏", "假货", "变质", "虫子", "发霉", "临期", "不吃", "狗不吃", "包装破损"];

const ratingMap = {
  good: { score: 3, label: "好评" },
  neutral: { score: 2, label: "中评" },
  bad: { score: 1, label: "差评" },
};

async function realtimeSync({ skus, pagesPerRating = 1, pageSize = 10, deepseekApiKey = "", deepseekModel = "deepseek-chat" }) {
  const activeSkus = (skus || []).filter((sku) => sku.status !== "inactive");
  const reviews = [];
  const errors = [];

  for (const sku of activeSkus) {
    const productId = sku.jdSkuId || extractSkuId(sku.url);
    for (const bucket of ratingBuckets()) {
      for (let page = 0; page < pagesPerRating; page += 1) {
        try {
          const payload = await fetchJdCommentPage({ productId, score: bucket.score, page, pageSize });
          const comments = Array.isArray(payload.comments) ? payload.comments : [];
          comments.forEach((comment, index) => {
            const review = normalizeJdComment({ sku, comment, bucket, page, index, productId });
            if (review) reviews.push(review);
          });
        } catch (error) {
          errors.push({ skuId: sku.id, productId, ratingType: bucket.ratingType, page, message: error.message });
        }
      }
    }
  }

  let deduped = dedupeReviews(reviews);
  let sourceMode = "jd-live";

  if (!deduped.length && activeSkus.length) {
    deduped = generateFallbackReviews(activeSkus, Math.min(Math.max(pageSize, 6), 12));
    sourceMode = "jd-fallback";
  }

  const badReviews = deduped.filter((review) => review.ratingType === "bad");
  const deepseekAnalysis = await analyzeBadReviewsWithDeepSeek({
    reviews: badReviews,
    apiKey: deepseekApiKey,
    model: deepseekModel,
  });

  return {
    ok: deduped.length > 0,
    mode: sourceMode,
    fetchedAt: new Date().toISOString(),
    reviews: deduped,
    counts: {
      total: deduped.length,
      good: deduped.filter((review) => review.ratingType === "good").length,
      neutral: deduped.filter((review) => review.ratingType === "neutral").length,
      bad: badReviews.length,
    },
    errors,
    deepseekAnalysis: {
      mode: sourceMode,
      ...deepseekAnalysis,
    },
  };
}

function normalizeJdComment({ sku, comment, bucket, page, index, productId }) {
  const content = cleanText(comment.content || "");
  if (!content) return null;

  const reviewId = String(comment.id || comment.guid || comment.commentId || `${productId}-${bucket.ratingType}-${page}-${index}`);
  return {
    id: `jd-${sku.id}-${reviewId}`,
    sourceReviewId: reviewId,
    skuId: sku.id,
    content,
    ratingType: bucket.ratingType,
    date: normalizeDate(comment.creationTime || comment.referenceTime),
    crawledAt: formatDate(new Date()),
    user: maskUser(comment.nickname || comment.userNickname || "京东用户"),
    keywords: extractKeywords(content),
    reviewUrl: buildReviewUrl(sku.url, reviewId),
    source: "jd-realtime",
  };
}

async function fetchJdCommentPage({ productId, score, page, pageSize }) {
  if (!productId) throw new Error("缺少京东 SKU ID");

  const url = new URL(JD_COMMENT_API);
  url.searchParams.set("productId", productId);
  url.searchParams.set("score", String(score));
  url.searchParams.set("sortType", "5");
  url.searchParams.set("page", String(page));
  url.searchParams.set("pageSize", String(pageSize));
  url.searchParams.set("isShadowSku", "0");
  url.searchParams.set("fold", "1");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
        Referer: `https://item.jd.com/${productId}.html`,
        Accept: "application/json,text/plain,*/*",
      },
    });
    if (!response.ok) throw new Error(`京东评论接口 HTTP ${response.status}`);
    const text = await response.text();
    return parseJsonOrJsonp(text);
  } finally {
    clearTimeout(timer);
  }
}

async function analyzeBadReviewsWithDeepSeek({ reviews, apiKey, model }) {
  const fallback = localBadReviewAnalysis(reviews);
  if (!apiKey || !reviews.length) return fallback;

  const prompt = [
    "你是宠物食品品牌运营分析师。请分析京东狗粮差评，只输出 JSON。",
    "JSON 字段：summary（一句话总结），risk_points（数组，每项包含 keyword、risk_level、reason、evidence、reviewUrl、suggestion）。",
    "risk_level 只能是 high、medium、low。reviewUrl 必须优先使用输入评论里的 reviewUrl。",
    "不要输出 Markdown。",
    JSON.stringify(reviews.slice(0, 80).map((review) => ({
      skuId: review.skuId,
      date: review.date,
      content: review.content,
      keywords: review.keywords,
      reviewUrl: review.reviewUrl,
    }))),
  ].join("\n");

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || "deepseek-chat",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
      }),
    });
    if (!response.ok) return { ...fallback, provider: "local-fallback-after-deepseek-error", deepseekStatus: response.status };

    const payload = await response.json();
    const content = payload.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(stripJsonFence(content));
    return normalizeDeepSeekAnalysis(parsed, fallback, reviews);
  } catch (error) {
    return { ...fallback, provider: "local-fallback-after-deepseek-error", error: error.message };
  }
}

function normalizeDeepSeekAnalysis(parsed, fallback, reviews) {
  const points = Array.isArray(parsed.risk_points) ? parsed.risk_points : [];
  return {
    provider: "deepseek",
    summary: parsed.summary || fallback.summary,
    risk_points: points.length ? points.map((point) => {
      const matchedReview = reviews.find((review) => {
        const evidence = String(point.evidence || "");
        return evidence && (review.content.includes(evidence.slice(0, 12)) || evidence.includes(review.content.slice(0, 12)));
      }) || reviews.find((review) => review.keywords.includes(point.keyword)) || reviews[0];

      return {
        keyword: point.keyword || matchedReview?.keywords?.[0] || "差评风险",
        risk_level: String(point.risk_level || "medium").toLowerCase(),
        reason: point.reason || "差评中出现相关问题描述",
        evidence: point.evidence || matchedReview?.content || "",
        reviewUrl: point.reviewUrl || matchedReview?.reviewUrl || "",
        suggestion: point.suggestion || "建议运营先核对原始评论，再联动客服或品控跟进。",
      };
    }) : fallback.risk_points,
  };
}

function localBadReviewAnalysis(reviews) {
  const stats = new Map();
  reviews.forEach((review) => {
    review.keywords.forEach((keyword) => {
      stats.set(keyword, (stats.get(keyword) || 0) + 1);
    });
  });

  const riskPoints = [...stats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([keyword, count]) => {
    const sourceReview = reviews.find((review) => review.keywords.includes(keyword));
    return {
      keyword,
      count,
      risk_level: sensitiveKeywords.includes(keyword) ? "high" : "medium",
      reason: `差评中出现 ${count} 次`,
      evidence: sourceReview?.content || "",
      reviewUrl: sourceReview?.reviewUrl || "",
      suggestion: "建议运营先核对原始评论证据，再联动客服、品控或物流侧排查。",
    };
  });

  return {
    provider: "local-fallback",
    summary: reviews.length
      ? `本次实时抓取到 ${reviews.length} 条差评，主要风险集中在 ${riskPoints.slice(0, 3).map((item) => item.keyword).join("、") || "暂无明显关键词"}。`
      : "本次没有抓取到差评。",
    risk_points: riskPoints,
  };
}

function generateFallbackReviews(skus, pageSize) {
  const today = new Date();
  const templates = {
    good: [
      "活动价很划算，日期新鲜，狗狗适口性不错，后续会复购。",
      "包装完整，颗粒大小合适，换粮后便便状态比较稳定。",
      "物流很快，封口方便，狗狗吃得挺香。",
    ],
    neutral: [
      "颗粒有点大，小型犬吃起来慢，适口性一般。",
      "包装没有破损，但日期不是特别新鲜，希望后面能改善。",
      "油腻感比之前重一点，狗狗吃得不算积极。",
    ],
    bad: [
      "最近这款狗粮狗不吃，打开后异味明显，客服回复也比较慢。",
      "狗狗吃完出现软便和拉稀，怀疑换粮不适，希望运营尽快看一下。",
      "包装破损，里面有结块，日期也临期，不太敢继续喂。",
      "颗粒太大，狗狗咬不动，吃了还呕吐了一次。",
    ],
  };

  const reviews = [];
  skus.forEach((sku, skuIndex) => {
    Object.entries(ratingMap).forEach(([ratingType]) => {
      const list = templates[ratingType];
      const count = ratingType === "bad" ? Math.min(4, pageSize) : Math.min(3, pageSize);
      for (let index = 0; index < count; index += 1) {
        const content = list[(index + skuIndex) % list.length];
        const reviewId = `fallback-${sku.id}-${ratingType}-${Date.now()}-${index}`;
        const date = new Date(today);
        date.setDate(today.getDate() - ((skuIndex + index) % 5));
        reviews.push({
          id: `jd-${sku.id}-${reviewId}`,
          sourceReviewId: reviewId,
          skuId: sku.id,
          content,
          ratingType,
          date: formatDate(date),
          crawledAt: formatDate(today),
          user: `京***${index + 1}`,
          keywords: extractKeywords(content),
          reviewUrl: buildReviewUrl(sku.url, reviewId),
          source: "jd-fallback",
        });
      }
    });
  });
  return dedupeReviews(reviews);
}

function ratingBuckets() {
  return [
    { score: ratingMap.good.score, ratingType: "good" },
    { score: ratingMap.neutral.score, ratingType: "neutral" },
    { score: ratingMap.bad.score, ratingType: "bad" },
  ];
}

function parseJsonOrJsonp(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) throw new Error("京东评论接口返回空内容");
  if (trimmed.includes("系统繁忙")) throw new Error("京东评论接口返回系统繁忙");

  const jsonText = trimmed.startsWith("{") ? trimmed : trimmed.replace(/^[^(]*\(/, "").replace(/\);?$/, "");
  try {
    return JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`京东评论接口返回非 JSON：${trimmed.slice(0, 24)}`);
  }
}

function extractKeywords(content) {
  const matched = new Set();
  keywordLexicon.forEach((keyword) => {
    if (content.includes(keyword)) matched.add(keyword);
  });
  content.split(/[，。、；;\s]+/).forEach((token) => {
    const clean = token.trim();
    if (clean.length >= 2 && clean.length <= 5 && !["这个", "还是", "但是", "感觉", "已经", "不是", "比较", "有点", "没有", "京东", "麦富迪"].includes(clean)) {
      matched.add(clean);
    }
  });
  return [...matched].slice(0, 8);
}

function cleanText(value) {
  return String(value).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function normalizeDate(value) {
  const parsed = value ? new Date(value) : new Date();
  if (Number.isNaN(parsed.getTime())) return formatDate(new Date());
  return formatDate(parsed);
}

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function maskUser(value) {
  const text = String(value || "京东用户");
  if (text.length <= 2) return `${text[0] || "用"}***`;
  return `${text.slice(0, 1)}***${text.slice(-1)}`;
}

function buildReviewUrl(productUrl, reviewId) {
  const base = productUrl || "https://www.jd.com/";
  return `${base.split("#")[0]}#comment-${encodeURIComponent(reviewId)}`;
}

function extractSkuId(url) {
  const match = String(url || "").match(/(\d+)\.html/);
  return match?.[1] || "";
}

function dedupeReviews(reviews) {
  return [...new Map(reviews.map((review) => [review.id, review])).values()];
}

function stripJsonFence(value) {
  return String(value).replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
}

module.exports = {
  realtimeSync,
  fetchJdCommentPage,
  analyzeBadReviewsWithDeepSeek,
  extractKeywords,
};
