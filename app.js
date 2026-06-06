const TODAY = new Date();

const storageKeys = {
  skus: "maifudi.dog.skus.v2",
  rules: "maifudi.dog.rules.v2",
  sensitive: "maifudi.dog.sensitive.v2",
  alertStatus: "maifudi.dog.alert.status.v2",
};

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
  skus: loadJson(storageKeys.skus, defaultSkus),
  rules: loadJson(storageKeys.rules, defaultRules),
  sensitive: loadJson(storageKeys.sensitive, defaultSensitive),
  alertStatus: loadJson(storageKeys.alertStatus, {}),
  reviews: [],
  alerts: [],
  deepseekAnalysis: null,
  selectedKeyword: "拉稀",
  evidenceJump: null,
  failNextSync: false,
};

document.addEventListener("DOMContentLoaded", async () => {
  bindEvents();
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
    const response = await fetch("/api/reviews/realtime-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        skus: state.skus.filter((sku) => sku.status === "active"),
        pagesPerRating: 1,
        pageSize: 10,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "实时抓取失败");

    if (Array.isArray(result.reviews) && result.reviews.length) {
      state.reviews = dedupeReviews(state.reviews.concat(result.reviews));
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
    const link = review.reviewUrl || `${sku?.url || "#"}#comment`;
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
  hint.textContent = analysis.provider === "deepseek" ? "DeepSeek 已解析" : "本地规则兜底解析";
  panel.innerHTML = `
    <article class="analysis-summary">
      <strong>${escapeHtml(analysis.summary || "暂无总结")}</strong>
      <span class="chip">${escapeHtml(analysis.provider || "unknown")}</span>
    </article>
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
            <span class="chip">${escapeHtml(point.suggestion || "建议先核对评论证据")}</span>
            ${point.reviewUrl ? `<a class="link-button" href="${escapeAttr(point.reviewUrl)}" target="_blank" rel="noreferrer">打开差评链接</a>` : ""}
          </div>
        </article>
      `).join("") : '<div class="empty-state">本次没有形成明确风险点。</div>'}
    </div>
  `;
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
          <p>${escapeHtml(alert.keyword)} 近 7 天出现 ${alert.currentCount} 次，较前 7 天 ${formatGrowth(alert.growth)}。</p>
        </div>
        <span class="level-chip ${alert.level}">${levelLabel(alert.level)}</span>
      </div>
      <div class="alert-meta">
        <span class="status-chip ${alert.status}">${alert.status === "read" ? "已查看" : "未查看"}</span>
        <span class="chip">触发：${alert.reason}</span>
        <span class="chip">${alert.createdAt}</span>
        <button class="secondary-button" type="button" onclick="selectKeyword('${escapeAttr(alert.keyword)}', '${escapeAttr(alert.id)}')">查看证据</button>
        <button class="secondary-button" type="button" onclick="markAlertRead('${escapeAttr(alert.id)}')">标记已查看</button>
      </div>
    </article>
  `).join("");
}

function renderSettings() {
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

function saveSku(event) {
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
  if (existing) {
    Object.assign(existing, sku);
  } else {
    state.skus.push(sku);
  }
  saveJson(storageKeys.skus, state.skus);
  resetSkuForm();
  runDailySync(false);
  toast("SKU 配置已保存。");
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

function toggleSku(id) {
  const sku = findSku(id);
  sku.status = sku.status === "active" ? "inactive" : "active";
  sku.updatedAt = formatDate(TODAY);
  saveJson(storageKeys.skus, state.skus);
  runDailySync(false);
}

function deleteSku(id) {
  state.skus = state.skus.filter((sku) => sku.id !== id);
  saveJson(storageKeys.skus, state.skus);
  runDailySync(false);
  toast("SKU 已删除。");
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
        rows.push({
          id: `${sku.id}-${date}-${i}`,
          skuId: sku.id,
          content,
          ratingType,
          date,
          crawledAt: formatDate(TODAY),
          user: `用户${String((skuIndex + 1) * 1000 + dayIndex * 17 + i).slice(-4)}`,
          tags: [],
          keywords: extractKeywords(content),
        });
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
    const stats = keywordStats(currentReviews, sku.id);
    stats.forEach((item) => {
      const isSensitive = state.sensitive.includes(item.keyword);
      const level = riskLevel(item, isSensitive);
      if (!level) return;
      const id = `${sku.id}-${item.keyword}`;
      const sampleReview = currentReviews.find((review) => review.ratingType === "bad" && review.keywords.includes(item.keyword))
        || currentReviews.find((review) => review.keywords.includes(item.keyword));
      alerts.push({
        id,
        skuId: sku.id,
        skuName: sku.name,
        keyword: item.keyword,
        level,
        currentCount: item.count,
        previousCount: item.previous,
        growth: item.growth,
        reason: isSensitive ? "命中高敏词 + 样本量达标" : "词频环比异常上涨",
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
    if (keyword && !review.content.includes(keyword) && !review.keywords.includes(keyword)) return false;
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
  keywordLexicon.concat(state.sensitive).forEach((keyword) => {
    if (content.includes(keyword)) matched.add(keyword);
  });
  content.split(/[，。、；：\s]+/).forEach((token) => {
    const clean = token.trim();
    if (clean.length >= 2 && clean.length <= 5 && !stopWords.has(clean)) matched.add(clean);
  });
  return [...matched].slice(0, 8);
}

function getSelectedSku() {
  const selected = $("skuFilter").value;
  if (selected && selected !== "all") return findSku(selected);
  return state.skus.find((sku) => sku.status === "active") || state.skus[0];
}

function findSku(id) {
  return state.skus.find((sku) => sku.id === id);
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
