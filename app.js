const TODAY = new Date();

const storageKeys = {
  rules: "maifudi.dog.rules.v2",
  sensitive: "maifudi.dog.sensitive.v2",
  alertStatus: "maifudi.dog.alert.status.v2",
};

const API_BASE = window.__API_BASE__ || ((location.hostname === "127.0.0.1" || location.hostname === "localhost") && location.port === "8765" ? "http://127.0.0.1:8787" : "");

const fallbackKnowledgeBase = [
  { id: "kb-gi-diarrhea", domain: "肠胃反应", topic: "腹泻软便", standardKeyword: "拉稀", aliases: ["腹泻", "窜稀", "便便稀", "拉肚子", "吃完拉肚子", "软便"], riskLevel: "high", owner: "品控/商品运营", suggestion: "核对 SKU、批次、换粮周期，并查看是否集中爆发。", enabled: true },
  { id: "kb-palatability-reject", domain: "适口性问题", topic: "拒食不吃", standardKeyword: "狗不吃", aliases: ["不吃", "不爱吃", "闻了就走", "一口不碰", "没兴趣", "挑食不吃", "吃得少"], riskLevel: "high", owner: "商品运营", suggestion: "核对 SKU 配方、适口性反馈和是否集中在换粮用户。", enabled: true },
  { id: "kb-package-broken", domain: "包装问题", topic: "包装破损", standardKeyword: "包装破损", aliases: ["破袋", "漏袋", "外箱破", "包装压坏", "封口坏", "封口差"], riskLevel: "medium", owner: "仓配/供应链", suggestion: "联动仓配排查包材、装箱和物流环节。", enabled: true },
  { id: "kb-quality-smell", domain: "质量疑虑", topic: "异味变质", standardKeyword: "异味", aliases: ["味道怪", "臭味", "油味重", "发霉", "变质", "结块", "虫子"], riskLevel: "high", owner: "品控", suggestion: "优先核对批次、仓储温湿度、临期和开袋状态。", enabled: true },
  { id: "kb-service-slow", domain: "客服体验", topic: "客服响应慢", standardKeyword: "客服慢", aliases: ["客服", "回复慢", "没人处理", "售后慢", "客服不理"], riskLevel: "medium", owner: "客服运营", suggestion: "核对客服响应 SLA，沉淀高频问题话术。", enabled: true },
];

const defaultSkus = [
  { id: "sku-beef-10kg", name: "麦富迪 牛肉双拼全价狗粮 10kg", jdSkuId: "100883991228", series: "成犬双拼粮", url: "https://item.jd.com/100883991228.html", status: "active", createdAt: "2026-06-01", updatedAt: "2026-06-01" },
  { id: "sku-chicken-5kg", name: "麦富迪 鸡肉冻干双拼狗粮 5kg", jdSkuId: "100052398765", series: "冻干双拼粮", url: "https://item.jd.com/100052398765.html", status: "active", createdAt: "2026-06-01", updatedAt: "2026-06-01" },
  { id: "sku-puppy-2kg", name: "麦富迪 幼犬羊奶益生菌狗粮 2kg", jdSkuId: "100091662104", series: "幼犬粮", url: "https://item.jd.com/100091662104.html", status: "active", createdAt: "2026-06-01", updatedAt: "2026-06-01" },
  { id: "sku-salmon-6kg", name: "麦富迪 三文鱼低敏全价狗粮 6kg", jdSkuId: "100071885006", series: "低敏配方粮", url: "https://item.jd.com/100071885006.html", status: "active", createdAt: "2026-06-01", updatedAt: "2026-06-01" },
  { id: "sku-small-3kg", name: "麦富迪 小型犬鲜肉狗粮 3kg", jdSkuId: "100064128879", series: "小型犬粮", url: "https://item.jd.com/100064128879.html", status: "active", createdAt: "2026-06-01", updatedAt: "2026-06-01" },
];

const defaultRules = {
  lowGrowth: 50,
  mediumGrowth: 100,
  highGrowth: 200,
  minCount: 5,
  feishuWebhook: "",
};

const defaultSensitive = ["拉稀", "软便", "呕吐", "过敏", "假货", "变质", "虫子", "发霉", "临期", "不吃", "狗不吃", "包装破损"];
const stopWords = new Set(["这个", "还是", "但是", "感觉", "已经", "不是", "比较", "有点", "没有", "京东", "麦富迪"]);
const keywordLexicon = ["拉稀", "软便", "呕吐", "过敏", "假货", "变质", "虫子", "发霉", "临期", "不吃", "狗不吃", "包装破损", "颗粒大", "颗粒小", "适口性", "复购", "涨价", "物流慢", "客服", "油腻", "异味", "泪痕", "便便臭", "活动价", "划算", "毛发", "换粮", "日期新鲜", "封口"];

const state = {
  skus: defaultSkus.slice(),
  skusSource: "fallback",
  storageHealth: {
    ok: null,
    storageMode: "unknown",
    supabaseConfigured: false,
    updatedAt: "",
    skuCount: 0,
    error: "",
  },
  rules: loadJson(storageKeys.rules, defaultRules),
  sensitive: loadJson(storageKeys.sensitive, defaultSensitive),
  alertStatus: loadJson(storageKeys.alertStatus, {}),
  reviews: [],
  alerts: [],
  knowledgeBase: fallbackKnowledgeBase,
  knowledgeSource: "fallback",
  deepseekAnalysis: null,
  selectedKeyword: "拉稀",
  evidenceJump: null,
  failNextSync: false,
};

document.addEventListener("DOMContentLoaded", async () => {
  bindEvents();
  await loadSkusFromBackend();
  await loadStorageHealth();
  await loadKnowledgeBase();
  syncRuleForm();
  await runDailySync(false);
});

const reviewApiAdapter = {
  async fetchDailyReviews(skus) {
    await wait(240);
    if (state.failNextSync) {
      state.failNextSync = false;
      throw new Error("京东评论适配器超时，已保留上一版历史数据");
    }
    return buildHistoricalReviews(skus.filter((sku) => sku.status === "active"));
  },
};

function bindEvents() {
  document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
  ["skuFilter", "ratingFilter", "rangeFilter", "keywordSearch", "alertLevelFilter", "alertStatusFilter"].forEach((id) => $(id)?.addEventListener("input", render));
  $("syncButton").addEventListener("click", () => runDailySync(true));
  $("realtimeSyncButton")?.addEventListener("click", runRealtimeSync);
  $("skuForm").addEventListener("submit", saveSku);
  $("resetSkuForm").addEventListener("click", resetSkuForm);
  $("ruleForm").addEventListener("submit", saveRules);
  $("sensitiveForm").addEventListener("submit", addSensitiveWord);
  $("openFeishu").addEventListener("click", openFeishuDrawer);
  $("closeFeishu").addEventListener("click", closeFeishuDrawer);
  $("closeFeishuButton").addEventListener("click", closeFeishuDrawer);
  $("feishuQueryForm").addEventListener("submit", runFeishuQuery);
  document.querySelectorAll(".command-examples button").forEach((button) => {
    button.addEventListener("click", () => {
      $("feishuQuery").value = button.dataset.command;
      renderFeishuResult(button.dataset.command);
    });
  });
}

async function loadSkusFromBackend() {
  try {
    const response = await fetch(apiUrl("/api/skus"));
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "加载 SKU 配置失败");
    const skus = normalizeSkus(payload.skus);
    state.skus = skus.length ? skus : defaultSkus.slice();
    state.skusSource = skus.length ? "backend" : "fallback";
  } catch (error) {
    state.skus = defaultSkus.slice();
    state.skusSource = "fallback";
    toast(error.message);
  }
  render();
}

async function loadStorageHealth() {
  try {
    const response = await fetch(apiUrl("/api/health"), { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "加载存储状态失败");
    state.storageHealth = {
      ok: Boolean(payload.ok),
      storageMode: payload.storageMode || "unknown",
      supabaseConfigured: Boolean(payload.supabaseConfigured),
      updatedAt: payload.updatedAt || "",
      skuCount: Number(payload.skuCount || 0),
      error: "",
    };
  } catch (error) {
    state.storageHealth = {
      ok: false,
      storageMode: "unknown",
      supabaseConfigured: false,
      updatedAt: "",
      skuCount: 0,
      error: error.message || "加载存储状态失败",
    };
  }
  render();
}

async function runDailySync(showToast) {
  setSyncStatus("同步中", "");
  const previous = state.reviews;
  try {
    const payload = await reviewApiAdapter.fetchDailyReviews(state.skus);
    state.reviews = dedupeReviews(payload);
    state.alerts = buildAlerts();
    setSyncStatus(`成功 ${formatDate(TODAY)}`, "ok");
    if (showToast) toast("今日评论同步完成，词频和预警已刷新。");
  } catch (error) {
    state.reviews = previous;
    state.alerts = buildAlerts();
    setSyncStatus("失败，保留历史数据", "fail");
    toast(error.message);
  }
  render();
}

async function runRealtimeSync() {
  const button = $("realtimeSyncButton");
  const previousText = button.textContent;
  button.disabled = true;
  button.textContent = "抓取中...";
  setSyncStatus("实时抓取中", "");

  try {
    const response = await fetch(apiUrl("/api/reviews/realtime-sync"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pagesPerRating: 1, pageSize: 10 }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "实时抓取失败");

    if (Array.isArray(result.reviews) && result.reviews.length) {
      state.reviews = dedupeReviews(state.reviews.concat(result.reviews.map(enrichReviewKnowledge)));
    }
    state.deepseekAnalysis = result.deepseekAnalysis || null;
    state.alerts = buildAlerts();
    setSyncStatus(`实时抓取 ${result.counts?.total || 0} 条`, result.ok ? "ok" : "fail");
    toast(`已抓取京东评论：好评 ${result.counts?.good || 0} / 中评 ${result.counts?.neutral || 0} / 差评 ${result.counts?.bad || 0}`);
  } catch (error) {
    setSyncStatus("实时抓取失败", "fail");
    toast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = previousText;
    render();
  }
}

function render() {
  renderSkuOptions();
  renderMetrics();
  renderReviewTrend();
  renderKeywordPanels();
  renderRiskSkuRank();
  renderDomainOverview();
  renderClusterView();
  renderAlerts();
  renderSkuDetail();
  renderKeywordDetail();
  renderDeepSeekAnalysis();
  renderSettings();
}

function renderSkuOptions() {
  const selected = $("skuFilter").value || "all";
  $("skuFilter").innerHTML = ['<option value="all">全部 SKU</option>']
    .concat(state.skus.map((sku) => `<option value="${sku.id}">${escapeHtml(sku.name)}</option>`))
    .join("");
  $("skuFilter").value = state.skus.some((sku) => sku.id === selected) ? selected : "all";
}

function renderMetrics() {
  const reviews = getFilteredReviews();
  const activeSkus = state.skus.filter((sku) => sku.status === "active").length;
  const bad = reviews.filter((review) => review.ratingType === "bad").length;
  const neutral = reviews.filter((review) => review.ratingType === "neutral").length;
  const alerts = getFilteredAlerts();
  const highAlerts = alerts.filter((alert) => alert.level === "high").length;
  $("metricGrid").innerHTML = [
    ["监控 SKU", activeSkus, "支持后续新增扩展"],
    ["周期评论量", reviews.length, "按当前筛选统计"],
    ["中差评率", `${percent(bad + neutral, reviews.length)}%`, `${bad + neutral} 条中差评`],
    ["风险关键词", alerts.length, "环比异常上涨"],
    ["高风险", highAlerts, "需优先查看证据"],
  ].map(([label, value, note]) => `<article class="metric-card"><span>${label}</span><strong>${value}</strong><em>${note}</em></article>`).join("");
}

function renderReviewTrend() {
  const range = Number($("rangeFilter").value);
  const rows = getDates(range).map((date) => {
    const dayReviews = getFilteredReviews({ dateOnly: date });
    return {
      date,
      total: dayReviews.length,
      bad: dayReviews.filter((review) => review.ratingType === "bad").length,
    };
  });
  const max = Math.max(...rows.map((row) => row.total), 1);
  $("reviewTrend").innerHTML = rows.map((row) => `
    <div class="trend-row">
      <span class="trend-date">${row.date.slice(5)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${(row.total / max) * 100}%"></div></div>
      <span class="chip">${row.total} 条</span>
      <span class="${row.bad > 4 ? "warning-chip" : "chip"}">${row.bad} 差评</span>
    </div>
  `).join("");
}

function renderKeywordPanels() {
  const reviews = getFilteredReviews();
  const allStats = keywordStats(reviews).slice(0, 8);
  const badStats = keywordStats(reviews.filter((review) => review.ratingType === "bad")).slice(0, 8);
  $("overallKeywords").classList.remove("bubble-map");
  $("overallKeywords").innerHTML = renderKeywordList(allStats);
  $("badKeywords").innerHTML = renderKeywordList(badStats);
  $("keywordPicker").innerHTML = renderKeywordList(keywordStats(getFilteredReviews()).slice(0, 12));
}

function renderKeywordList(stats) {
  if (!stats.length) return '<div class="empty-state">暂无关键词数据</div>';
  return stats.map((item) => `
    <article class="keyword-item">
      <button type="button" onclick="selectKeyword('${escapeAttr(item.keyword)}')">${escapeHtml(item.keyword)}</button>
      <span class="${item.growth >= state.rules.mediumGrowth ? "warning-chip" : "chip"}">${formatGrowth(item.growth)}</span>
      <div class="keyword-meta">
        <span>${item.count} 次</span>
        <span>${item.reviewCount} 条评论</span>
        <span>差评 ${item.badCount} 次</span>
      </div>
    </article>
  `).join("");
}

function renderRiskSkuRank() {
  const rows = state.skus.filter((sku) => sku.status === "active").map((sku) => {
    const reviews = getReviewsBySku(sku.id, Number($("rangeFilter").value));
    const badRate = percent(reviews.filter((review) => review.ratingType === "bad").length, reviews.length);
    const high = state.alerts.filter((alert) => alert.skuId === sku.id && alert.level === "high").length;
    return { sku, badRate, high, alerts: state.alerts.filter((alert) => alert.skuId === sku.id).length };
  }).sort((a, b) => b.high - a.high || b.badRate - a.badRate);
  $("riskSkuRank").innerHTML = rows.map((row) => `
    <article class="rank-item">
      <strong>${escapeHtml(shortSkuName(row.sku.name))}</strong>
      <span class="${row.high ? "warning-chip" : "chip"}">${row.high} 高危</span>
      <div class="keyword-meta">
        <span>预警 ${row.alerts} 条</span>
        <span>差评率 ${row.badRate}%</span>
      </div>
    </article>
  `).join("");
}

function renderDomainOverview() {
  const html = renderDomainCards(domainStats(getFilteredReviews()).slice(0, 6));
  if ($("domainOverview")) $("domainOverview").innerHTML = html;
}

function renderClusterView() {
  if ($("clusterDomainGrid")) $("clusterDomainGrid").innerHTML = renderDomainCards(domainStats(getFilteredReviews()));
  if ($("topicClusterTable")) $("topicClusterTable").innerHTML = renderTopicRows(topicStats(getFilteredReviews()));
  if ($("pendingTermList")) $("pendingTermList").innerHTML = renderPendingTerms();
}

function renderDomainCards(rows) {
  if (!rows.length) return '<div class="empty-state">暂无问题域聚类数据</div>';
  return rows.map((row) => `
    <article class="domain-card ${row.riskLevel}">
      <div class="panel-heading">
        <div>
          <strong>${escapeHtml(row.domain)}</strong>
          <p>${row.topicCount} 个主题 · ${row.keywordCount} 个标准词</p>
        </div>
        <span class="level-chip ${row.riskLevel}">${levelLabel(row.riskLevel)}</span>
      </div>
      <div class="keyword-meta">
        <span>评论 ${row.reviewCount} 条</span>
        <span>差评 ${row.badCount} 条</span>
        <span>环比 ${formatGrowth(row.growth)}</span>
      </div>
    </article>
  `).join("");
}

function renderTopicRows(rows) {
  if (!rows.length) return '<div class="empty-state">暂无主题聚类数据</div>';
  return rows.map((row) => {
    const sample = row.sampleReviewId ? `<button class="secondary-button" type="button" onclick="selectKeyword('${escapeAttr(row.standardKeyword)}')">查看证据</button>` : "";
    return `
      <article class="topic-row ${row.riskLevel}">
        <div>
          <strong>${escapeHtml(row.domain)} / ${escapeHtml(row.topic)}</strong>
          <p>${escapeHtml(row.standardKeyword)} · 命中：${escapeHtml(row.matchedAliases.join("、") || row.standardKeyword)}</p>
          <div class="keyword-meta">
            <span>评论 ${row.reviewCount} 条</span>
            <span>差评 ${row.badCount} 条</span>
            <span>负责人：${escapeHtml(row.owner || "未配置")}</span>
          </div>
        </div>
        <div class="topic-action">
          <span class="level-chip ${row.riskLevel}">${levelLabel(row.riskLevel)}</span>
          ${sample}
        </div>
      </article>
    `;
  }).join("");
}

function renderPendingTerms() {
  const terms = pendingTerms();
  if (!terms.length) return '<div class="empty-state">暂无待审核新词</div>';
  return terms.map((term) => `
    <article class="keyword-item">
      <strong>${escapeHtml(term.rawTerm || term.term || "未知新词")}</strong>
      <span class="chip">待 Obsidian 确认</span>
      <div class="keyword-meta">
        <span>建议标准词：${escapeHtml(term.suggestedKeyword || "-")}</span>
        <span>${escapeHtml(term.suggestedDomain || "-")} / ${escapeHtml(term.suggestedTopic || "-")}</span>
        <span>${escapeHtml(term.reason || "DeepSeek 建议")}</span>
      </div>
    </article>
  `).join("");
}

function renderSkuDetail() {
  const sku = getSelectedSku();
  if (!sku) {
    $("skuDetailCards").innerHTML = '<div class="empty-state">暂无 SKU</div>';
    return;
  }
  const reviews = getReviewsBySku(sku.id, Number($("rangeFilter").value), $("ratingFilter").value);
  const bad = reviews.filter((review) => review.ratingType === "bad").length;
  const neutral = reviews.filter((review) => review.ratingType === "neutral").length;
  const stats = keywordStats(reviews).slice(0, 10);
  $("skuDetailTitle").textContent = sku.name;
  $("skuDetailHint").textContent = `${sku.series} · JD ${sku.jdSkuId}`;
  $("skuJdLink").href = `${sku.url}#comment`;
  $("skuDetailCards").innerHTML = [
    ["周期评论", reviews.length],
    ["好评率", `${percent(reviews.filter((review) => review.ratingType === "good").length, reviews.length)}%`],
    ["中差评", `${neutral + bad} 条`],
    ["风险预警", state.alerts.filter((alert) => alert.skuId === sku.id).length],
  ].map(([label, value]) => `<article class="detail-card"><span>${label}</span><strong>${value}</strong></article>`).join("");
  $("skuKeywordTable").innerHTML = renderKeywordRows(stats);
  renderRatingBars(reviews);
  $("skuReviewSamples").innerHTML = renderReviews(reviews.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10));
}

function renderKeywordRows(stats) {
  if (!stats.length) return '<div class="empty-state">暂无关键词数据</div>';
  return stats.map((item) => `
    <article class="keyword-row">
      <strong>${escapeHtml(item.keyword)}</strong>
      <span class="${item.growth >= state.rules.mediumGrowth ? "warning-chip" : "chip"}">${formatGrowth(item.growth)}</span>
      <div class="keyword-meta">
        <span>出现 ${item.count} 次</span>
        <span>覆盖 ${item.reviewCount} 条评论</span>
        <span>差评 ${item.badCount} 次</span>
      </div>
    </article>
  `).join("");
}

function renderRatingBars(reviews) {
  const total = Math.max(reviews.length, 1);
  const rows = [
    ["好评", "good", reviews.filter((review) => review.ratingType === "good").length],
    ["中评", "neutral", reviews.filter((review) => review.ratingType === "neutral").length],
    ["差评", "bad", reviews.filter((review) => review.ratingType === "bad").length],
  ];
  $("ratingBars").innerHTML = rows.map(([label, type, count]) => `
    <div class="rating-row">
      <strong>${label}</strong>
      <div class="bar-track"><div class="bar-fill ${type === "bad" ? "bad" : ""}" style="width:${(count / total) * 100}%"></div></div>
      <span class="${type === "bad" ? "warning-chip" : "chip"}">${count}</span>
    </div>
  `).join("");
}

function renderKeywordDetail() {
  const keyword = state.selectedKeyword || keywordStats(getFilteredReviews())[0]?.keyword || "拉稀";
  state.selectedKeyword = keyword;
  const reviews = getFilteredReviews().filter((review) => review.keywords.includes(keyword));
  const stats = statForKeyword(keyword, getSelectedSku()?.id || "all");
  const jumpAlert = state.evidenceJump?.keyword === keyword ? state.alerts.find((alert) => alert.id === state.evidenceJump.alertId) : null;
  const targetReviewId = jumpAlert?.sampleReviewId || reviews[0]?.id || "";
  $("keywordTitle").textContent = `关键词：${keyword}`;
  $("keywordDetailCards").innerHTML = [
    ["近 7 天词频", stats.current],
    ["前 7 天词频", stats.previous],
    ["环比变化", formatGrowth(stats.growth)],
    ["关联评论", reviews.length],
  ].map(([label, value]) => `<article class="detail-card"><span>${label}</span><strong>${value}</strong></article>`).join("");
  $("keywordSkuTable").innerHTML = renderKeywordSkuRows(keyword);
  $("keywordEvidenceHint").textContent = `${reviews.length} 条评论 · 按时间倒序`;
  renderJumpContext(jumpAlert, targetReviewId);
  $("keywordEvidence").innerHTML = renderReviews(reviews.slice().sort((a, b) => b.date.localeCompare(a.date)), keyword, targetReviewId);
}

function renderJumpContext(alert, targetReviewId) {
  const box = $("keywordJumpContext");
  if (!alert) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  box.hidden = false;
  box.innerHTML = `
    <strong>已从「${levelLabel(alert.level)}预警」跳转到证据链</strong>
    <p>系统已定位触发预警的原始评论，并用高亮描边标出重点证据。运营可先核对评论原文、命中关键词、SKU 与时间，再决定是否继续跟进。</p>
    <div class="alert-meta">
      <span class="level-chip ${alert.level}">${levelLabel(alert.level)}</span>
      <span class="chip">${escapeHtml(alert.skuName)}</span>
      <span class="chip">关键词：${escapeHtml(alert.keyword)}</span>
      <span class="chip">近 7 天 ${alert.currentCount} 次</span>
      <button class="secondary-button" type="button" onclick="scrollToEvidence('${escapeAttr(targetReviewId)}')">跳到高亮证据</button>
    </div>
  `;
}

function renderKeywordSkuRows(keyword) {
  const rows = state.skus.filter((sku) => sku.status === "active").map((sku) => {
    const stat = statForKeyword(keyword, sku.id);
    return { sku, ...stat };
  }).filter((row) => row.current || row.previous).sort((a, b) => b.current - a.current);
  if (!rows.length) return '<div class="empty-state">暂无跨 SKU 数据</div>';
  return rows.map((row) => `
    <article class="keyword-row">
      <strong>${escapeHtml(shortSkuName(row.sku.name))}</strong>
      <span class="${row.growth >= state.rules.mediumGrowth ? "warning-chip" : "chip"}">${formatGrowth(row.growth)}</span>
      <div class="keyword-meta">
        <span>近 7 天 ${row.current} 次</span>
        <span>前 7 天 ${row.previous} 次</span>
      </div>
    </article>
  `).join("");
}

function renderReviews(reviews, highlightKeyword = "", targetReviewId = "") {
  if (!reviews.length) return '<div class="empty-state">暂无匹配评论</div>';
  return reviews.map((review) => {
    const sku = findSku(review.skuId);
    const content = highlightKeyword ? highlight(review.content, highlightKeyword) : escapeHtml(review.content);
    const isTarget = targetReviewId && review.id === targetReviewId;
    const link = externalReviewUrl(review, sku);
    return `
      <article class="review-item ${isTarget ? "evidence-focus" : ""}" id="review-${escapeAttr(review.id)}">
        <p>${content}</p>
        <div class="review-meta">
          <span class="${review.ratingType === "bad" ? "warning-chip" : review.ratingType === "good" ? "good-chip" : "chip"}">${ratingLabel(review.ratingType)}</span>
          <span class="chip">${review.date}</span>
          <span class="chip">${escapeHtml(shortSkuName(sku?.name || "未知 SKU"))}</span>
          <span class="chip">命中：${review.keywords.map(escapeHtml).join("、")}</span>
          <a class="link-button" href="${escapeAttr(link)}" target="_blank" rel="noreferrer">${review.ratingType === "bad" ? "差评链接" : "商品链接"}</a>
        </div>
      </article>
    `;
  }).join("");
}

function renderDeepSeekAnalysis() {
  const panel = $("deepseekAnalysis");
  const hint = $("deepseekAnalysisHint");
  if (!panel || !hint) return;
  const analysis = state.deepseekAnalysis;
  if (!analysis) {
    hint.textContent = "等待实时抓取后生成";
    panel.innerHTML = '<div class="empty-state">点击“实时抓取京东评论”后，这里会展示 DeepSeek 对差评的解析结果。</div>';
    return;
  }

  const points = Array.isArray(analysis.risk_points) ? analysis.risk_points : [];
  const domains = Array.isArray(analysis.domainAnalysis) ? analysis.domainAnalysis : [];
  hint.textContent = analysis.provider === "deepseek" ? "DeepSeek 已解析" : "本地规则兜底解析";
  panel.innerHTML = `
    <article class="analysis-summary">
      <strong>${escapeHtml(analysis.summary || "暂无总结")}</strong>
      <span class="chip">${escapeHtml(analysis.provider || "unknown")}</span>
    </article>
    ${domains.length ? `<div class="domain-grid compact-domain-grid">${renderDomainAnalysisCards(domains)}</div>` : ""}
    <div class="analysis-grid">
      ${points.length ? points.map((point) => `
        <article class="analysis-card">
          <div class="panel-heading">
            <div>
              <strong>${escapeHtml(point.keyword || "风险点")}</strong>
              <p>${escapeHtml(point.reason || "")}</p>
            </div>
            <span class="level-chip ${(point.risk_level || "medium").toLowerCase()}">${escapeHtml(point.risk_level || "medium")}</span>
          </div>
          <p>${escapeHtml(point.evidence || "暂无证据片段")}</p>
          <div class="alert-meta">
            ${point.skuName ? `<span class="chip">${escapeHtml(shortSkuName(point.skuName))}</span>` : ""}
            <span class="chip">${escapeHtml(point.suggestion || "建议先核对评论证据")}</span>
            ${externalReviewUrl(point, findSku(point.skuId)) ? `<a class="link-button" href="${escapeAttr(externalReviewUrl(point, findSku(point.skuId)))}" target="_blank" rel="noreferrer">打开商品评论区</a>` : ""}
          </div>
        </article>
      `).join("") : '<div class="empty-state">本次没有形成明确风险点。</div>'}
    </div>
  `;
}

function renderDomainAnalysisCards(domains) {
  return domains.map((item) => `
    <article class="domain-card ${item.riskLevel || "medium"}">
      <strong>${escapeHtml(item.domain || "业务问题域")}</strong>
      <p>${escapeHtml(item.topic || "待判断")} · ${escapeHtml(item.reason || "")}</p>
      <span class="level-chip ${item.riskLevel || "medium"}">${levelLabel(item.riskLevel || "medium")}</span>
    </article>
  `).join("");
}

function renderAlerts() {
  const latest = getFilteredAlerts().slice(0, 5);
  $("latestAlertCount").textContent = `${latest.length} 条`;
  $("latestAlerts").innerHTML = renderAlertItems(latest);
  $("alertCenterList").innerHTML = renderAlertItems(getFilteredAlerts());
}

function renderAlertItems(alerts) {
  if (!alerts.length) return '<div class="empty-state">当前没有匹配预警</div>';
  return alerts.map((alert) => `
    <article class="alert-item ${alert.level}">
      <div class="panel-heading">
        <div>
          <strong>${escapeHtml(alert.skuName)}</strong>
          <p>${escapeHtml(alert.domain || "关键词")} / ${escapeHtml(alert.topic || alert.keyword)} 近 7 天出现 ${alert.currentCount} 次，较前 7 天 ${formatGrowth(alert.growth)}。</p>
        </div>
        <span class="level-chip ${alert.level}">${levelLabel(alert.level)}</span>
      </div>
      <div class="alert-meta">
        <span class="status-chip ${alert.status}">${alert.status === "read" ? "已查看" : "未查看"}</span>
        <span class="chip">触发：${alert.reason}</span>
        ${alert.owner ? `<span class="chip">负责人：${escapeHtml(alert.owner)}</span>` : ""}
        <span class="chip">${alert.createdAt}</span>
        <button class="secondary-button" type="button" onclick="selectKeyword('${escapeAttr(alert.keyword)}', '${escapeAttr(alert.id)}')">查看证据</button>
        <button class="secondary-button" type="button" onclick="markAlertRead('${escapeAttr(alert.id)}')">标记已查看</button>
      </div>
    </article>
  `).join("");
}

function renderSettings() {
  renderStorageStatus();
  $("skuConfigList").innerHTML = state.skus.map((sku) => `
    <article class="sku-config-row">
      <div>
        <strong>${escapeHtml(sku.name)}</strong>
        <div class="sku-meta">
          <span class="chip">JD ${escapeHtml(sku.jdSkuId)}</span>
          <span class="chip">${escapeHtml(sku.series)}</span>
          <span class="${sku.status === "active" ? "good-chip" : "chip"}">${sku.status === "active" ? "监控中" : "已停用"}</span>
        </div>
      </div>
      <div class="row-actions">
        <button type="button" onclick="editSku('${sku.id}')">编辑</button>
        <button type="button" onclick="toggleSku('${sku.id}')">${sku.status === "active" ? "停用" : "启用"}</button>
        <button class="danger-action" type="button" onclick="deleteSku('${sku.id}')">删除</button>
      </div>
    </article>
  `).join("");
  $("sensitiveList").innerHTML = state.sensitive.map((word) => `
    <span class="tag-pill">${escapeHtml(word)} <button type="button" title="删除" onclick="removeSensitive('${escapeAttr(word)}')">×</button></span>
  `).join("");
  renderKnowledgeSettings();
}

function renderStorageStatus() {
  if (!$("skuStorageStatus")) return;
  const health = state.storageHealth || {};
  if (health.ok === null) {
    $("skuStorageStatus").textContent = "正在检查存储状态...";
    $("skuStorageStatus").className = "status-note";
    return;
  }
  if (health.ok && health.storageMode === "supabase") {
    $("skuStorageStatus").textContent = `已连接 Supabase，当前 ${health.skuCount} 个 SKU`;
    $("skuStorageStatus").className = "status-note good";
    return;
  }
  if (health.ok && health.storageMode === "local") {
    $("skuStorageStatus").textContent = "当前使用本地临时存储，刷新后可能回退";
    $("skuStorageStatus").className = "status-note warn";
    return;
  }
  $("skuStorageStatus").textContent = health.error || "存储状态未知";
  $("skuStorageStatus").className = "status-note warn";
}

function renderKnowledgeSettings() {
  const active = activeKnowledgeBase();
  if ($("knowledgeSyncStatus")) $("knowledgeSyncStatus").textContent = state.knowledgeSource === "json" ? "已读取 Obsidian 导出词库" : "使用前端兜底词库";
  if ($("knowledgeEntryCount")) $("knowledgeEntryCount").textContent = `${active.length} 条启用`;
  if (!$("knowledgeList")) return;
  $("knowledgeList").innerHTML = active.map((entry) => `
    <article class="knowledge-row">
      <div>
        <strong>${escapeHtml(entry.domain)} / ${escapeHtml(entry.topic)}</strong>
        <p>${escapeHtml(entry.standardKeyword)} · ${escapeHtml((entry.aliases || []).join("、"))}</p>
        <div class="keyword-meta">
          <span class="level-chip ${entry.riskLevel || "medium"}">${levelLabel(entry.riskLevel || "medium")}</span>
          <span>负责人：${escapeHtml(entry.owner || "未配置")}</span>
          <span>Graph：${escapeHtml((entry.graphTags || []).join("、") || "-")}</span>
        </div>
      </div>
      <span class="chip">Obsidian</span>
    </article>
  `).join("");
}

function syncRuleForm() {
  $("lowGrowth").value = state.rules.lowGrowth;
  $("mediumGrowth").value = state.rules.mediumGrowth;
  $("highGrowth").value = state.rules.highGrowth;
  $("minCount").value = state.rules.minCount;
  $("feishuWebhook").value = state.rules.feishuWebhook;
  $("feishuStatus").textContent = state.rules.feishuWebhook ? "已配置 Webhook" : "已接入模拟通道";
}

function saveRules(event) {
  event.preventDefault();
  state.rules = {
    lowGrowth: Number($("lowGrowth").value),
    mediumGrowth: Number($("mediumGrowth").value),
    highGrowth: Number($("highGrowth").value),
    minCount: Number($("minCount").value),
    feishuWebhook: $("feishuWebhook").value.trim(),
  };
  saveJson(storageKeys.rules, state.rules);
  state.alerts = buildAlerts();
  syncRuleForm();
  render();
  toast("预警规则已保存。");
}

async function saveSku(event) {
  event.preventDefault();
  const id = $("editingSkuId").value || `sku-custom-${Date.now()}`;
  const existing = findSku(id);
  const sku = {
    id,
    name: $("skuName").value.trim(),
    jdSkuId: $("jdSkuId").value.trim(),
    series: $("skuSeries").value.trim(),
    url: $("jdUrl").value.trim(),
    status: existing?.status || "active",
    createdAt: existing?.createdAt || formatDate(TODAY),
    updatedAt: formatDate(TODAY),
  };
  const nextSkus = existing ? state.skus.map((item) => (item.id === id ? { ...item, ...sku } : item)) : state.skus.concat(sku);
  try {
    await persistSkus(nextSkus);
    resetSkuForm();
    await runDailySync(false);
    toast("SKU 配置已保存");
  } catch (error) {
    toast(error.message);
  }
}

function resetSkuForm() {
  $("editingSkuId").value = "";
  $("skuForm").reset();
}

function editSku(id) {
  const sku = findSku(id);
  if (!sku) return;
  $("editingSkuId").value = sku.id;
  $("skuName").value = sku.name;
  $("jdSkuId").value = sku.jdSkuId;
  $("skuSeries").value = sku.series;
  $("jdUrl").value = sku.url;
  switchView("settings");
}

async function toggleSku(id) {
  const sku = findSku(id);
  if (!sku) return;
  const nextSkus = state.skus.map((item) => (item.id === id ? { ...item, status: item.status === "active" ? "inactive" : "active", updatedAt: formatDate(TODAY) } : item));
  try {
    await persistSkus(nextSkus);
    await runDailySync(false);
  } catch (error) {
    toast(error.message);
  }
}

async function deleteSku(id) {
  const nextSkus = state.skus.filter((sku) => sku.id !== id);
  try {
    await persistSkus(nextSkus);
    await runDailySync(false);
    toast("SKU 已删除");
  } catch (error) {
    toast(error.message);
  }
}

function addSensitiveWord(event) {
  event.preventDefault();
  const word = $("sensitiveInput").value.trim();
  if (!word || state.sensitive.includes(word)) return;
  state.sensitive.push(word);
  saveJson(storageKeys.sensitive, state.sensitive);
  $("sensitiveInput").value = "";
  state.alerts = buildAlerts();
  render();
}

function removeSensitive(word) {
  state.sensitive = state.sensitive.filter((item) => item !== word);
  saveJson(storageKeys.sensitive, state.sensitive);
  state.alerts = buildAlerts();
  render();
}

function markAlertRead(alertId) {
  state.alertStatus[alertId] = "read";
  saveJson(storageKeys.alertStatus, state.alertStatus);
  state.alerts = buildAlerts();
  render();
}

function selectKeyword(keyword, alertId = "") {
  state.selectedKeyword = keyword;
  state.evidenceJump = alertId ? { keyword, alertId } : null;
  $("keywordSearch").value = keyword;
  switchView("keyword");
  render();
  if (alertId) {
    const alert = state.alerts.find((item) => item.id === alertId);
    window.setTimeout(() => scrollToEvidence(alert?.sampleReviewId), 80);
  }
}

function scrollToEvidence(reviewId) {
  if (!reviewId) return;
  const target = document.getElementById(`review-${reviewId}`);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.classList.remove("pulse-evidence");
  window.setTimeout(() => target.classList.add("pulse-evidence"), 40);
}

function switchView(view) {
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  document.querySelectorAll(".view").forEach((panel) => panel.classList.toggle("active", panel.id === `${view}View`));
}

function openFeishuDrawer() {
  $("feishuDrawer").classList.add("open");
  renderFeishuResult("查询 今日预警");
}

function closeFeishuDrawer() {
  $("feishuDrawer").classList.remove("open");
}

function runFeishuQuery(event) {
  event.preventDefault();
  renderFeishuResult($("feishuQuery").value);
}

function renderFeishuResult(command) {
  const text = normalize(command);
  let result = "";
  if (text.includes("今日预警")) {
    result = feishuAlertSummary(getFilteredAlerts().slice(0, 5));
  } else if (text.includes("高风险")) {
    result = feishuAlertSummary(state.alerts.filter((alert) => alert.level === "high").slice(0, 8));
  } else {
    const matchedSku = state.skus.find((sku) => text.includes(normalize(shortSkuName(sku.name))) || text.includes(normalize(sku.name)));
    const reviews = matchedSku ? getReviewsBySku(matchedSku.id, 7, text.includes("差评") ? "bad" : "all") : getFilteredReviews({ range: 7 });
    const stats = keywordStats(reviews).slice(0, 6);
    result = `飞书机器人返回：\\n查询范围：${matchedSku ? matchedSku.name : "麦富迪全部监控 SKU"}\\n时间：近 7 天\\n\\n关键词 TOP：\\n${stats.map((item, index) => `${index + 1}. ${item.keyword}：${item.count} 次，环比 ${formatGrowth(item.growth)}`).join("\\n")}\\n\\n跳转看板：./index.html`;
  }
  $("feishuResult").textContent = result || "没有匹配结果。";
}

function feishuAlertSummary(alerts) {
  if (!alerts.length) return "飞书机器人返回：当前没有匹配预警。\\n\\n跳转看板：./index.html";
  return `飞书机器人返回：\\n${alerts.map((alert, index) => `${index + 1}. [${levelLabel(alert.level)}] ${alert.skuName}\\n关键词：${alert.keyword}\\n近 7 天：${alert.currentCount} 次，环比 ${formatGrowth(alert.growth)}\\n典型评论：${alert.sample}\\n跳转：./index.html#${alert.id}`).join("\\n\\n")}`;
}

function buildHistoricalReviews(skus) {
  const rows = [];
  skus.forEach((sku, skuIndex) => {
    getDates(30).forEach((date, dayIndex) => {
      const dailyTotal = 8 + ((skuIndex * 5 + dayIndex * 3) % 7);
      for (let i = 0; i < dailyTotal; i += 1) {
        const ratingType = pickRatingType(skuIndex, dayIndex, i);
        const content = buildReviewContent(sku, skuIndex, dayIndex, i, ratingType);
        rows.push(enrichReviewKnowledge({
          id: `${sku.id}-${date}-${i}`,
          skuId: sku.id,
          content,
          ratingType,
          date,
          crawledAt: formatDate(TODAY),
          user: `用户${String((skuIndex + 1) * 1000 + dayIndex * 17 + i).slice(-4)}`,
          tags: [],
          keywords: extractKeywords(content),
        }));
      }
    });
  });
  return rows;
}

function buildReviewContent(sku, skuIndex, dayIndex, itemIndex, ratingType) {
  const recent = dayIndex >= 23;
  const baseGood = [
    `家里狗狗适口性不错，${sku.series}活动价入手比较划算，日期新鲜。`,
    `已经复购几次了，毛发状态稳定，封口也方便。`,
    `颗粒大小合适，换粮过渡比较顺，狗狗吃得快。`,
  ];
  const baseNeutral = [
    `物流慢了一天，包装有点压痕，狗粮本身还可以。`,
    `颗粒大了一点，小狗吃起来慢，客服回复还算及时。`,
    `活动价还行，但最近感觉涨价明显。`,
  ];
  const baseBad = [
    `这袋打开有异味，狗狗不吃，担心是不是临期。`,
    `换粮后出现软便，便便臭，后面不敢继续喂。`,
    `外箱包装破损，封口也松，客服处理比较慢。`,
  ];
  const riskBursts = [
    ["拉稀", "软便", "便便臭"],
    ["不吃", "狗不吃", "异味"],
    ["呕吐", "过敏", "换粮"],
    ["包装破损", "临期", "客服"],
    ["油腻", "泪痕", "颗粒大"],
  ];
  if (ratingType === "good") return baseGood[(skuIndex + dayIndex + itemIndex) % baseGood.length];
  if (ratingType === "neutral") return baseNeutral[(skuIndex + itemIndex) % baseNeutral.length];
  const burst = riskBursts[skuIndex % riskBursts.length];
  if (recent && (itemIndex + skuIndex) % 2 === 0) {
    return `最近这款${shortSkuName(sku.name)}问题变多，${burst.join("、")}，希望运营尽快看一下。`;
  }
  return baseBad[(dayIndex + itemIndex) % baseBad.length];
}

function pickRatingType(skuIndex, dayIndex, itemIndex) {
  const recent = dayIndex >= 23;
  const badModulo = recent && [0, 1, 3].includes(skuIndex) ? 4 : 7;
  if ((itemIndex + dayIndex + skuIndex) % badModulo === 0) return "bad";
  if ((itemIndex + skuIndex) % 5 === 0) return "neutral";
  return "good";
}

function buildAlerts() {
  const alerts = [];
  state.skus.filter((sku) => sku.status === "active").forEach((sku) => {
    const currentReviews = getReviewsBySku(sku.id, 7);
    const stats = topicStats(currentReviews, sku.id);
    stats.forEach((item) => {
      const isSensitive = item.riskLevel === "high" || state.sensitive.includes(item.standardKeyword);
      const level = riskLevel(item, isSensitive);
      if (!level) return;
      const id = `${sku.id}-${item.domain}-${item.topic}`;
      const sampleReview = currentReviews.find((review) => review.ratingType === "bad" && reviewHasTopic(review, item.topic))
        || currentReviews.find((review) => reviewHasTopic(review, item.topic));
      alerts.push({
        id,
        skuId: sku.id,
        skuName: sku.name,
        keyword: item.standardKeyword,
        domain: item.domain,
        topic: item.topic,
        level,
        currentCount: item.count,
        previousCount: item.previous,
        growth: item.growth,
        reason: isSensitive ? "命中高风险主题 + 样本量达标" : "主题环比异常上涨",
        owner: item.owner,
        suggestion: item.suggestion,
        status: state.alertStatus[id] || "unread",
        createdAt: formatDate(TODAY),
        sample: sampleReview?.content || "",
        sampleReviewId: sampleReview?.id || "",
      });
    });
  });
  return alerts.sort((a, b) => levelWeight(b.level) - levelWeight(a.level) || b.growth - a.growth);
}

function riskLevel(item, isSensitive) {
  if (item.count < state.rules.minCount) return "";
  if (isSensitive && item.count >= state.rules.minCount) return "high";
  if (item.count >= 10 && item.growth >= state.rules.highGrowth) return "high";
  if (item.count >= 8 && item.growth >= state.rules.mediumGrowth) return "medium";
  if (item.count >= state.rules.minCount && item.growth >= state.rules.lowGrowth) return "low";
  return "";
}

function domainStats(reviews) {
  const map = new Map();
  reviews.forEach((review) => {
    getReviewKnowledgeMatches(review).forEach((match) => {
      const current = map.get(match.domain) || { domain: match.domain, reviewIds: new Set(), badCount: 0, topics: new Set(), keywords: new Set(), riskLevel: "low" };
      current.reviewIds.add(review.id);
      current.topics.add(match.topic);
      current.keywords.add(match.standardKeyword);
      if (review.ratingType === "bad") current.badCount += 1;
      current.riskLevel = higherRisk(current.riskLevel, match.riskLevel);
      map.set(match.domain, current);
    });
  });
  return [...map.values()].map((item) => {
    const stat = statForDomain(item.domain);
    return {
      domain: item.domain,
      reviewCount: item.reviewIds.size,
      badCount: item.badCount,
      topicCount: item.topics.size,
      keywordCount: item.keywords.size,
      riskLevel: item.riskLevel,
      previous: stat.previous,
      growth: stat.growth,
    };
  }).sort((a, b) => levelWeight(b.riskLevel) - levelWeight(a.riskLevel) || b.badCount - a.badCount || b.reviewCount - a.reviewCount);
}

function topicStats(reviews, skuId = getSelectedSku()?.id || "all") {
  const map = new Map();
  reviews.forEach((review) => {
    getReviewKnowledgeMatches(review).forEach((match) => {
      const key = `${match.domain}|${match.topic}`;
      const current = map.get(key) || {
        domain: match.domain,
        topic: match.topic,
        standardKeyword: match.standardKeyword,
        matchedAliases: new Set(),
        reviewIds: new Set(),
        badCount: 0,
        riskLevel: match.riskLevel || "medium",
        owner: match.owner || "",
        suggestion: match.suggestion || "",
        sampleReviewId: "",
      };
      current.reviewIds.add(review.id);
      (match.matchedAliases || []).forEach((alias) => current.matchedAliases.add(alias));
      if (review.ratingType === "bad") current.badCount += 1;
      if (!current.sampleReviewId || review.ratingType === "bad") current.sampleReviewId = review.id;
      current.riskLevel = higherRisk(current.riskLevel, match.riskLevel);
      map.set(key, current);
    });
  });
  return [...map.values()].map((item) => {
    const stat = statForTopic(item.topic, skuId);
    return {
      ...item,
      count: item.reviewIds.size,
      reviewCount: item.reviewIds.size,
      matchedAliases: [...item.matchedAliases],
      previous: stat.previous,
      growth: stat.growth,
    };
  }).sort((a, b) => levelWeight(b.riskLevel) - levelWeight(a.riskLevel) || b.badCount - a.badCount || b.count - a.count);
}

function keywordStats(reviews, skuId = getSelectedSku()?.id || "all") {
  const map = new Map();
  reviews.forEach((review) => {
    review.keywords.forEach((keyword) => {
      const current = map.get(keyword) || { keyword, count: 0, reviewIds: new Set(), badCount: 0 };
      current.count += 1;
      current.reviewIds.add(review.id);
      if (review.ratingType === "bad") current.badCount += 1;
      map.set(keyword, current);
    });
  });
  return [...map.values()].map((item) => {
    const stat = statForKeyword(item.keyword, skuId);
    return { ...item, reviewCount: item.reviewIds.size, previous: stat.previous, growth: stat.growth };
  }).sort((a, b) => b.count - a.count || b.growth - a.growth);
}

function statForKeyword(keyword, skuId = "all") {
  const currentDates = new Set(getDates(7));
  const prevDates = new Set(getDates(14).slice(0, 7));
  const reviews = state.reviews.filter((review) => (skuId === "all" || review.skuId === skuId) && review.keywords.includes(keyword));
  const current = reviews.filter((review) => currentDates.has(review.date)).length;
  const previous = reviews.filter((review) => prevDates.has(review.date)).length;
  return { current, previous, growth: growthRate(current, previous) };
}

function statForTopic(topic, skuId = "all") {
  const currentDates = new Set(getDates(7));
  const prevDates = new Set(getDates(14).slice(0, 7));
  const reviews = state.reviews.filter((review) => (skuId === "all" || review.skuId === skuId) && reviewHasTopic(review, topic));
  const current = reviews.filter((review) => currentDates.has(review.date)).length;
  const previous = reviews.filter((review) => prevDates.has(review.date)).length;
  return { current, previous, growth: growthRate(current, previous) };
}

function statForDomain(domain) {
  const currentDates = new Set(getDates(7));
  const prevDates = new Set(getDates(14).slice(0, 7));
  const reviews = state.reviews.filter((review) => getReviewKnowledgeMatches(review).some((match) => match.domain === domain));
  const current = reviews.filter((review) => currentDates.has(review.date)).length;
  const previous = reviews.filter((review) => prevDates.has(review.date)).length;
  return { current, previous, growth: growthRate(current, previous) };
}

function getFilteredReviews(options = {}) {
  const skuId = options.skuId || $("skuFilter").value || "all";
  const rating = options.rating || $("ratingFilter").value || "all";
  const range = Number(options.range || $("rangeFilter").value || 7);
  const dates = options.dateOnly ? new Set([options.dateOnly]) : new Set(getDates(range));
  const keyword = ($("keywordSearch")?.value || "").trim();
  return state.reviews.filter((review) => {
    if (skuId !== "all" && review.skuId !== skuId) return false;
    if (rating !== "all" && review.ratingType !== rating) return false;
    if (!dates.has(review.date)) return false;
    if (keyword && !review.content.includes(keyword) && !review.keywords.includes(keyword) && !getReviewKnowledgeMatches(review).some((match) => [match.domain, match.topic, match.standardKeyword].includes(keyword))) return false;
    return true;
  });
}

function getReviewsBySku(skuId, range = 7, rating = "all") {
  const dates = new Set(getDates(range));
  return state.reviews.filter((review) => review.skuId === skuId && dates.has(review.date) && (rating === "all" || review.ratingType === rating));
}

function getFilteredAlerts() {
  const skuId = $("skuFilter").value || "all";
  const level = $("alertLevelFilter")?.value || "all";
  const status = $("alertStatusFilter")?.value || "all";
  return state.alerts.filter((alert) => {
    if (skuId !== "all" && alert.skuId !== skuId) return false;
    if (level !== "all" && alert.level !== level) return false;
    if (status !== "all" && alert.status !== status) return false;
    return true;
  });
}

function extractKeywords(content) {
  const matched = new Set();
  matchKnowledge(content).forEach((item) => matched.add(item.standardKeyword));
  keywordLexicon.concat(state.sensitive).forEach((keyword) => {
    if (content.includes(keyword)) matched.add(keyword);
  });
  content.split(/[，。、；：\s]+/).forEach((token) => {
    const clean = token.trim();
    if (clean.length >= 2 && clean.length <= 5 && !stopWords.has(clean)) matched.add(clean);
  });
  return [...matched].slice(0, 8);
}

async function loadKnowledgeBase() {
  try {
    const response = await fetch("./data/keyword-knowledge.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`knowledge ${response.status}`);
    const payload = await response.json();
    const entries = Array.isArray(payload) ? payload : payload.entries || [];
    state.knowledgeBase = entries.length ? entries : fallbackKnowledgeBase;
    state.knowledgeSource = entries.length ? "json" : "fallback";
  } catch {
    state.knowledgeBase = fallbackKnowledgeBase;
    state.knowledgeSource = "fallback";
  }
}

function activeKnowledgeBase() {
  return (state.knowledgeBase || []).filter((entry) => entry.enabled !== false);
}

function matchKnowledge(content) {
  const text = String(content || "");
  const matches = [];
  activeKnowledgeBase().forEach((entry) => {
    const terms = [entry.standardKeyword].concat(entry.aliases || []);
    const matchedAliases = [...new Set(terms.filter((term) => term && text.includes(term)))];
    if (!matchedAliases.length) return;
    matches.push({
      id: entry.id,
      domain: entry.domain,
      topic: entry.topic,
      standardKeyword: entry.standardKeyword,
      matchedAliases,
      riskLevel: entry.riskLevel || "medium",
      owner: entry.owner || "",
      suggestion: entry.suggestion || "",
    });
  });
  return matches;
}

function enrichReviewKnowledge(review) {
  const knowledgeMatches = Array.isArray(review.knowledgeMatches) && review.knowledgeMatches.length
    ? review.knowledgeMatches
    : matchKnowledge(review.content);
  const normalizedKeywords = new Set(review.keywords || []);
  knowledgeMatches.forEach((match) => normalizedKeywords.add(match.standardKeyword));
  return { ...review, knowledgeMatches, keywords: [...normalizedKeywords].slice(0, 10) };
}

function getReviewKnowledgeMatches(review) {
  if (Array.isArray(review.knowledgeMatches) && review.knowledgeMatches.length) return review.knowledgeMatches;
  return matchKnowledge(review.content);
}

function reviewHasTopic(review, topic) {
  return getReviewKnowledgeMatches(review).some((match) => match.topic === topic);
}

function pendingTerms() {
  const fromDeepSeek = Array.isArray(state.deepseekAnalysis?.pendingTerms) ? state.deepseekAnalysis.pendingTerms : [];
  const known = new Set(activeKnowledgeBase().flatMap((entry) => [entry.standardKeyword].concat(entry.aliases || [])));
  const fromReviews = keywordStats(getFilteredReviews({ rating: "bad" }))
    .filter((item) => !known.has(item.keyword) && item.badCount >= 2)
    .slice(0, 4)
    .map((item) => ({
      rawTerm: item.keyword,
      suggestedKeyword: item.keyword,
      suggestedDomain: "待判断",
      suggestedTopic: "待判断",
      reason: `差评中出现 ${item.badCount} 次，建议到 Obsidian 审核。`,
    }));
  return fromDeepSeek.concat(fromReviews).slice(0, 8);
}

function getSelectedSku() {
  const selected = $("skuFilter").value;
  if (selected && selected !== "all") return findSku(selected);
  return state.skus.find((sku) => sku.status === "active") || state.skus[0];
}

function findSku(id) {
  return state.skus.find((sku) => sku.id === id);
}

function externalReviewUrl(item, sku) {
  const raw = String(item?.reviewUrl || item?.productUrl || sku?.url || "").trim();
  if (!raw || raw === "#") return "";
  const base = raw.split("#")[0];
  if (!base) return "";
  if (raw.includes("fallback-") || raw.includes("#comment-")) return `${base}#comment`;
  return raw.includes("#comment") ? raw : `${base}#comment`;
}

function getDates(days) {
  return Array.from({ length: days }, (_, index) => shiftDate(TODAY, index - days + 1));
}

function shiftDate(date, delta) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + delta);
  return formatDate(copy);
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dedupeReviews(reviews) {
  return [...new Map(reviews.map((review) => [review.id, review])).values()];
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

function percent(value, total) {
  if (!total) return 0;
  return Math.round((value / total) * 1000) / 10;
}

function levelLabel(level) {
  return { high: "高风险", medium: "中风险", low: "低风险" }[level] || level;
}

function levelWeight(level) {
  return { high: 3, medium: 2, low: 1 }[level] || 0;
}

function higherRisk(a, b) {
  return levelWeight(b) > levelWeight(a) ? b : a;
}

function ratingLabel(type) {
  return { good: "好评", neutral: "中评", bad: "差评" }[type] || type;
}

function shortSkuName(name) {
  return name.replace("麦富迪 ", "").replace("麦富迪", "");
}

function normalize(value) {
  return String(value || "").replace(/\s+/g, "").toLowerCase();
}

function setSyncStatus(text, className) {
  $("syncStatus").textContent = text;
  $("syncStatus").className = `sync-pill ${className || ""}`;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : structuredClone(fallback);
  } catch {
    return structuredClone(fallback);
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

async function persistSkus(nextSkus) {
  const normalized = normalizeSkus(nextSkus);
  const response = await fetch(apiUrl("/api/skus"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ skus: normalized }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "保存 SKU 失败");
  state.skus = normalizeSkus(payload.skus);
  state.skusSource = "backend";
  return state.skus;
}

function normalizeSkus(skus) {
  return (Array.isArray(skus) ? skus : []).map((sku) => ({
    id: String(sku.id || "").trim(),
    name: String(sku.name || "").trim(),
    jdSkuId: String(sku.jdSkuId || "").trim(),
    series: String(sku.series || "").trim(),
    url: String(sku.url || "").trim(),
    status: sku.status === "inactive" ? "inactive" : "active",
    createdAt: sku.createdAt || formatDate(TODAY),
    updatedAt: sku.updatedAt || formatDate(TODAY),
  })).filter((sku) => sku.id && sku.name && sku.jdSkuId && sku.series && sku.url);
}

function apiUrl(path) {
  return `${API_BASE}${path}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/\\/g, "\\\\");
}

function highlight(content, keyword) {
  return escapeHtml(content).replaceAll(escapeHtml(keyword), `<mark>${escapeHtml(keyword)}</mark>`);
}

function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("show");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => $("toast").classList.remove("show"), 2600);
}

function $(id) {
  return document.getElementById(id);
}

window.editSku = editSku;
window.toggleSku = toggleSku;
window.deleteSku = deleteSku;
window.removeSensitive = removeSensitive;
window.markAlertRead = markAlertRead;
window.selectKeyword = selectKeyword;
window.scrollToEvidence = scrollToEvidence;
