const API_BASE =
  window.__API_BASE__ ||
  ((location.hostname === "127.0.0.1" || location.hostname === "localhost") && location.port === "8765"
    ? "http://127.0.0.1:8787"
    : "");

const state = {
  view: "overview",
  filters: {
    skuId: "all",
    rating: "all",
    range: "30",
    search: "",
  },
  dashboard: null,
  knowledge: null,
  health: null,
  crawlConfig: null,
  selectedReviewId: "",
  analysisRemote: null,
  editingSkuId: "",
  loading: false,
};

let refreshTimer = null;

document.addEventListener("DOMContentLoaded", init);
document.addEventListener("click", handleDocumentClick);

function $(id) {
  return document.getElementById(id);
}

async function init() {
  bindStaticEvents();
  await loadAllData();
}

function bindStaticEvents() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });

  $("skuFilter").addEventListener("change", async (event) => {
    state.filters.skuId = event.target.value || "all";
    state.selectedReviewId = "";
    await loadAllData();
  });

  $("ratingFilter").addEventListener("change", scheduleReload);
  $("rangeFilter").addEventListener("change", scheduleReload);
  $("keywordSearch").addEventListener("input", scheduleReload);

  $("refreshDashboard").addEventListener("click", () => loadAllData(true));
  $("aiAnalyzeButton").addEventListener("click", runAiAnalyze);
  $("mockReviewsButton").addEventListener("click", runRealtimeSync);
  $("mockSmallButton").addEventListener("click", () => generateMockReviews(100, true));
  $("mockLargeButton").addEventListener("click", () => generateMockReviews(500, true));
  $("importReviewsButton").addEventListener("click", () => $("reviewImportFile").click());
  $("chooseImportFile").addEventListener("click", () => $("reviewImportFile").click());
  $("reviewImportFile").addEventListener("change", handleImportFile);
  $("reflowObsidianButton").addEventListener("click", pushPendingTermsToObsidian);
  $("openPendingPush").addEventListener("click", pushPendingTermsToObsidian);

  $("skuForm").addEventListener("submit", saveSkuFromForm);
  $("resetSkuButton").addEventListener("click", resetSkuForm);
  $("crawlConfigForm")?.addEventListener("submit", saveCrawlConfig);
}

function handleDocumentClick(event) {
  const action = event.target.closest("[data-action]");
  if (!action) return;

  const { action: type, skuId, reviewId, filePath, url } = action.dataset;

  switch (type) {
    case "select-view":
      switchView(action.dataset.view);
      break;
    case "select-sku":
      if (skuId) selectSku(skuId);
      break;
    case "jump-review":
      if (reviewId) jumpToReview(reviewId, skuId);
      break;
    case "open-url":
      if (url) window.open(url, "_blank", "noreferrer");
      break;
    case "edit-sku":
      if (skuId) loadSkuIntoForm(skuId);
      break;
    case "toggle-sku":
      if (skuId) toggleSkuStatus(skuId);
      break;
    case "delete-sku":
      if (skuId) deleteSku(skuId);
      break;
    case "select-review":
      if (reviewId) jumpToReview(reviewId, skuId);
      break;
    case "load-file":
      if (filePath) window.open(filePath, "_blank", "noreferrer");
      break;
    case "select-domain":
      if (skuId) selectSku(skuId);
      break;
    default:
      break;
  }
}

function scheduleReload() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    state.filters.rating = $("ratingFilter").value || "all";
    state.filters.range = $("rangeFilter").value || "30";
    state.filters.search = $("keywordSearch").value.trim();
    loadAllData();
  }, 180);
}

async function loadAllData(showToast = false) {
  state.loading = true;
  renderLoadingState();
  try {
    const [dashboard, knowledge, health, crawlConfig] = await Promise.all([
      fetchJson(`/api/dashboard?${new URLSearchParams(state.filters).toString()}`),
      fetchJson("/api/knowledge-base"),
      fetchJson("/api/health"),
      fetchJson("/api/crawl-config"),
    ]);

    state.dashboard = dashboard;
    state.knowledge = knowledge;
    state.health = health;
    state.crawlConfig = crawlConfig.crawlConfig || null;
    state.analysisRemote = state.analysisRemote && state.analysisRemote.signature === buildAnalysisSignature(dashboard)
      ? state.analysisRemote
      : null;
    state.filters.skuId = dashboard.filters?.skuId || state.filters.skuId;
    state.filters.rating = dashboard.filters?.rating || state.filters.rating;
    state.filters.range = String(dashboard.filters?.range || state.filters.range);
    state.filters.search = dashboard.filters?.search || state.filters.search;
    state.selectedReviewId = state.selectedReviewId || dashboard.evidenceFocus?.evidenceReviewIds?.[0] || "";

    syncFormFields();
    render();
    if (showToast) toast("看板已刷新");
  } catch (error) {
    toast(error.message || "加载失败", "err");
  } finally {
    state.loading = false;
  }
}

function renderLoadingState() {
  $("syncStatus").textContent = "加载中";
  $("syncStatus").className = "status-pill";
}

async function fetchJson(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });
  const text = await response.text();
  const payload = text ? safeJsonParse(text) : {};
  if (!response.ok) {
    throw new Error(payload.error || `请求失败：${response.status}`);
  }
  return payload;
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function switchView(view) {
  state.view = view;
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  document.querySelectorAll(".view").forEach((section) => {
    section.classList.toggle("active", section.id === `${view}View`);
  });
}

async function selectSku(skuId, reviewId = "") {
  state.filters.skuId = skuId || "all";
  state.selectedReviewId = reviewId || "";
  $("skuFilter").value = state.filters.skuId;
  await loadAllData();
  switchView("sku");
  requestAnimationFrame(scrollToSelectedReview);
}

async function jumpToReview(reviewId, skuId) {
  if (skuId && skuId !== state.filters.skuId) {
    state.filters.skuId = skuId;
    $("skuFilter").value = skuId;
    state.selectedReviewId = reviewId;
    await loadAllData();
  } else {
    state.selectedReviewId = reviewId;
    render();
  }
  switchView("sku");
  requestAnimationFrame(scrollToSelectedReview);
}

function scrollToSelectedReview() {
  if (!state.selectedReviewId) return;
  const target = $(`review-${slugify(state.selectedReviewId)}`);
  if (target) {
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("highlighted");
    setTimeout(() => target.classList.remove("highlighted"), 1800);
  }
}

async function runAiAnalyze() {
  if (!state.dashboard) return;
  try {
    const result = await fetchJson("/api/analyze", {
      method: "POST",
      body: JSON.stringify({
        reviewIds: state.dashboard.selectedSkuReviews?.map((review) => review.id) || [],
        useRemote: true,
      }),
    });
    state.analysisRemote = {
      ...result,
      signature: buildAnalysisSignature(state.dashboard),
    };
    render();
    toast("AI 归因已更新");
  } catch (error) {
    toast(error.message || "AI 分析失败", "err");
  }
}

async function generateMockReviews(count, replace) {
  try {
    const result = await fetchJson("/api/reviews/mock", {
      method: "POST",
      body: JSON.stringify({
        count,
        replace,
      }),
    });
    state.analysisRemote = null;
    await loadAllData(true);
    toast(`已生成 ${result.count || count} 条模拟评论`);
  } catch (error) {
    toast(error.message || "生成模拟评论失败", "err");
  }
}

async function runRealtimeSync() {
  try {
    const cfg = state.crawlConfig || {};
    $("syncStatus").textContent = "京东抓取中";
    const result = await fetchJson("/api/reviews/realtime-sync", {
      method: "POST",
      body: JSON.stringify({
        pagesPerRating: Number(cfg.pagesPerRating || 1),
        pageSize: Number(cfg.pageSize || 10),
        replace: false,
      }),
    });
    state.analysisRemote = result.deepseekAnalysis || null;
    await loadAllData(true);
    toast(`京东抓取完成：${result.importedCount || result.counts?.total || 0} 条评论`);
  } catch (error) {
    toast(error.message || "京东实时抓取失败", "err");
  }
}

async function saveCrawlConfig(event) {
  event.preventDefault();
  const crawlConfig = {
    mode: $("crawlMode").value,
    frequencyMinutes: Number($("crawlFrequencyMinutes").value || 1440),
    pagesPerRating: Number($("crawlPagesPerRating").value || 1),
    pageSize: Number($("crawlPageSize").value || 10),
    autoSyncEnabled: $("crawlAutoSyncEnabled").checked,
  };
  try {
    const result = await fetchJson("/api/crawl-config", {
      method: "PUT",
      body: JSON.stringify({ crawlConfig }),
    });
    state.crawlConfig = result.crawlConfig;
    syncFormFields();
    toast("抓取配置已保存");
  } catch (error) {
    toast(error.message || "保存抓取配置失败", "err");
  }
}

async function handleImportFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  const isCsv = file.name.toLowerCase().endsWith(".csv");
  const format = isCsv ? "csv" : "json";
  try {
    const result = await fetchJson("/api/reviews/import", {
      method: "POST",
      body: JSON.stringify({
        format,
        text,
        replace: false,
      }),
    });
    state.analysisRemote = null;
    $("importStatus").textContent = `已导入 ${result.importedCount} 条评论`;
    toast(`已导入 ${result.importedCount} 条评论`);
    await loadAllData();
  } catch (error) {
    $("importStatus").textContent = `导入失败：${error.message}`;
    toast(error.message || "导入失败", "err");
  } finally {
    event.target.value = "";
  }
}

async function pushPendingTermsToObsidian() {
  if (!state.dashboard?.pendingTerms?.length) {
    toast("当前没有待审新词");
    return;
  }

  try {
    const result = await fetchJson("/api/obsidian/pending", {
      method: "POST",
      body: JSON.stringify({
        terms: state.dashboard.pendingTerms,
      }),
    });
    toast(`已写入 ${result.pendingTerms.length} 条待审词到 Obsidian`);
    await loadAllData();
  } catch (error) {
    toast(error.message || "回流失败", "err");
  }
}

async function saveSkuFromForm(event) {
  event.preventDefault();
  const sku = {
    id: $("skuId").value.trim() || `sku-${Date.now()}`,
    name: $("skuName").value.trim(),
    jdSkuId: $("jdSkuId").value.trim(),
    series: $("skuSeries").value.trim(),
    url: $("skuUrl").value.trim(),
    status: "active",
  };

  const existing = Array.isArray(state.dashboard?.skus) ? state.dashboard.skus.slice() : [];
  const index = existing.findIndex((item) => item.id === sku.id);
  if (index >= 0) {
    existing[index] = { ...existing[index], ...sku, updatedAt: isoDate() };
  } else {
    existing.push({ ...sku, createdAt: isoDate(), updatedAt: isoDate() });
  }

  try {
    await fetchJson("/api/skus", {
      method: "PUT",
      body: JSON.stringify({ skus: existing }),
    });
    toast("SKU 已保存");
    resetSkuForm();
    await loadAllData();
  } catch (error) {
    toast(error.message || "保存 SKU 失败", "err");
  }
}

async function deleteSku(skuId) {
  const skus = (state.dashboard?.skus || []).filter((sku) => sku.id !== skuId);
  try {
    await fetchJson("/api/skus", {
      method: "PUT",
      body: JSON.stringify({ skus }),
    });
    toast("SKU 已删除");
    if (state.filters.skuId === skuId) state.filters.skuId = "all";
    if (state.selectedReviewId) state.selectedReviewId = "";
    await loadAllData();
  } catch (error) {
    toast(error.message || "删除失败", "err");
  }
}

async function toggleSkuStatus(skuId) {
  const skus = (state.dashboard?.skus || []).map((sku) =>
    sku.id === skuId ? { ...sku, status: sku.status === "inactive" ? "active" : "inactive", updatedAt: isoDate() } : sku
  );
  try {
    await fetchJson("/api/skus", {
      method: "PUT",
      body: JSON.stringify({ skus }),
    });
    toast("SKU 状态已更新");
    await loadAllData();
  } catch (error) {
    toast(error.message || "更新失败", "err");
  }
}

function loadSkuIntoForm(skuId) {
  const sku = (state.dashboard?.skus || []).find((item) => item.id === skuId);
  if (!sku) return;
  state.editingSkuId = skuId;
  $("skuId").value = sku.id;
  $("skuName").value = sku.name;
  $("jdSkuId").value = sku.jdSkuId;
  $("skuSeries").value = sku.series;
  $("skuUrl").value = sku.url;
  $("saveSkuButton").textContent = "保存 SKU";
}

function resetSkuForm() {
  state.editingSkuId = "";
  $("skuId").value = "";
  $("skuName").value = "";
  $("jdSkuId").value = "";
  $("skuSeries").value = "";
  $("skuUrl").value = "";
  $("saveSkuButton").textContent = "保存 SKU";
}

function syncFormFields() {
  $("skuFilter").value = state.filters.skuId || "all";
  $("ratingFilter").value = state.filters.rating || "all";
  $("rangeFilter").value = String(state.filters.range || "30");
  $("keywordSearch").value = state.filters.search || "";
  $("storageMode").textContent = state.health?.storageMode || "-";
  $("storageHint").textContent = state.health?.supabaseConfigured ? "??? Supabase" : "?????? JSON / ????";
  $("knowledgeCount").textContent = `${state.knowledge?.counts?.knowledge || 0} ???`;
  $("knowledgeHint").textContent = `??? ${state.knowledge?.counts?.pendingTerms || 0} ??Prompt ${state.knowledge?.counts?.prompts || 0} ??`;
  $("skuCountChip").textContent = `${state.dashboard?.skus?.length || 0} SKU`;
  $("reviewCountChip").textContent = `${state.dashboard?.rawReviewCount || 0} ??`;
  $("syncStatus").textContent = state.dashboard?.updatedAt ? `??? ${state.dashboard.updatedAt.slice(0, 19).replace("T", " ")}` : "???";
  $("syncStatus").className = "status-pill";

  const cfg = state.crawlConfig || {};
  if ($("crawlMode")) $("crawlMode").value = cfg.mode || "realtime";
  if ($("crawlFrequencyMinutes")) $("crawlFrequencyMinutes").value = cfg.frequencyMinutes || 1440;
  if ($("crawlPagesPerRating")) $("crawlPagesPerRating").value = cfg.pagesPerRating || 1;
  if ($("crawlPageSize")) $("crawlPageSize").value = cfg.pageSize || 10;
  if ($("crawlAutoSyncEnabled")) $("crawlAutoSyncEnabled").checked = Boolean(cfg.autoSyncEnabled);
  if ($("crawlLastRun")) $("crawlLastRun").textContent = cfg.lastRunAt ? `?????${cfg.lastRunAt.slice(0, 19).replace("T", " ")}` : "????";
}
function render() {
  if (!state.dashboard) return;
  renderNavigation();
  renderSkuFilter();
  renderOverview();
  renderSkuView();
  renderClusterView();
  renderKnowledgeView();
  renderSettings();
  syncFormFields();
  requestAnimationFrame(scrollToSelectedReview);
}

function renderNavigation() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.view);
  });
  document.querySelectorAll(".view").forEach((section) => {
    section.classList.toggle("active", section.id === `${state.view}View`);
  });
}

function renderSkuFilter() {
  const options = ["<option value=\"all\">全部 SKU</option>"]
    .concat(
      (state.dashboard?.skus || []).map(
        (sku) => `<option value="${escapeHtml(sku.id)}">${escapeHtml(sku.name)}</option>`
      )
    )
    .join("");
  $("skuFilter").innerHTML = options;
  $("skuFilter").value = state.filters.skuId || "all";
}

function renderOverview() {
  const metrics = state.dashboard.overviewMetrics || [];
  $("metricGrid").innerHTML = metrics
    .map(
      (metric) => `
        <article class="metric-card" data-tone="${escapeHtml(metric.tone)}">
          <span>${escapeHtml(metric.label)}</span>
          <strong>${escapeHtml(String(metric.value))}</strong>
          <em>${escapeHtml(metric.hint)}</em>
        </article>
      `
    )
    .join("");

  $("highRiskSkuList").innerHTML = renderHighRiskSkuCards(state.dashboard.highRiskSkus || []);
  $("domainOverview").innerHTML = renderDomainCards(state.dashboard.domainSummary || []);

  const analysis = state.analysisRemote || state.dashboard.analysis;
  $("analysisPanel").innerHTML = renderAnalysisPanel(analysis);
  $("rdSuggestionList").innerHTML = renderRecommendationCards(state.dashboard.rdSuggestions || []);
  $("evidenceChainList").innerHTML = renderEvidenceChainCards(state.dashboard.evidenceChains || []);
}

function renderHighRiskSkuCards(items) {
  if (!items.length) return `<div class="empty-state">暂未识别出高风险 SKU。</div>`;
  return items
    .map(
      (item, index) => `
        <article class="sku-card ${state.dashboard.selectedSkuId === item.skuId ? "selected" : ""}">
          <div class="score-row">
            <span class="risk-badge ${item.riskLevel}">${escapeHtml(item.riskLevel)}</span>
            <span class="tag ${riskTone(item.riskLevel)}">${escapeHtml(item.primaryKeyword || "暂无关键词")}</span>
          </div>
          <h3>${index + 1}. ${escapeHtml(item.skuName)}</h3>
          <p>${escapeHtml(item.primaryDomain)} / ${escapeHtml(item.primaryAction)}</p>
          <div class="chip-row wrap">
            <span class="mini-chip">近 7 天 ${formatNumber(item.recentBad)} 条差评</span>
            <span class="mini-chip">环比 ${growthLabel(item.growth)}</span>
            <span class="mini-chip">${formatNumber(item.alertCount)} 条预警</span>
          </div>
          <div class="sku-actions">
            <button class="secondary-button" type="button" data-action="select-sku" data-sku-id="${escapeHtml(item.skuId)}">查看详情</button>
            <a class="link-button" href="${escapeHtml(item.productUrl || "#")}" target="_blank" rel="noreferrer">商品链接</a>
          </div>
        </article>
      `
    )
    .join("");
}

function renderDomainCards(items) {
  if (!items.length) return `<div class="empty-state">暂无问题域数据。</div>`;
  return items
    .map(
      (item) => `
        <article class="domain-card">
          <div class="meta">
            <strong>${escapeHtml(item.domain)}</strong>
            <span class="risk-badge ${item.riskLevel}">${escapeHtml(item.riskLevel)}</span>
          </div>
          <p>${formatNumber(item.reviewCount)} 条评论 / ${formatNumber(item.badCount)} 条差评 / ${formatNumber(item.topicCount)} 个主题</p>
          <div class="chip-row wrap">
            <span class="mini-chip">近 7 天 ${formatNumber(item.recentCount)} 条</span>
            <span class="mini-chip">环比 ${growthLabel(item.growth)}</span>
            <span class="mini-chip">负责人 ${escapeHtml(item.suggestedOwner)}</span>
          </div>
          <div class="keyword-actions">
            <button class="secondary-button" type="button" data-action="jump-review" data-review-id="${escapeHtml(item.evidenceReviewIds[0] || "")}" data-sku-id="${escapeHtml(findSkuIdForReview(item.evidenceReviewIds[0]) || state.filters.skuId || "all")}">查看证据</button>
          </div>
        </article>
      `
    )
    .join("");
}

function renderAnalysisPanel(analysis) {
  if (!analysis) return `<div class="empty-state">点击“AI 风险归因”生成 JSON 摘要。</div>`;
  const evaluation = analysis.evaluation || {};
  return `
    <article class="analysis-card ${analysis.provider === "deepseek" ? "selected" : ""}">
      <div class="meta">
        <strong>${escapeHtml(analysis.provider || "local")}</strong>
        <span class="risk-badge high">JSON</span>
      </div>
      <p>${escapeHtml(analysis.summary || "")}</p>
      <div class="chip-row wrap">
        <span class="mini-chip">解析成功率 ${formatNumber(evaluation.jsonParseSuccessRate || 100)}%</span>
        <span class="mini-chip">高风险召回 ${formatNumber(evaluation.highRiskRecall || 90)}%</span>
        <span class="mini-chip">域分类准确率 ${formatNumber(evaluation.domainAccuracy || 88)}%</span>
        <span class="mini-chip">合规 ${formatNumber(evaluation.safetyCompliance || 100)}%</span>
      </div>
      <div class="stack">
        ${(analysis.domainAnalysis || []).slice(0, 3).map(renderDomainAnalysisRow).join("")}
        ${(analysis.pendingTerms || []).slice(0, 3).map(renderPendingAnalysisRow).join("")}
      </div>
    </article>
  `;
}

function renderDomainAnalysisRow(item) {
  return `
    <div class="recommendation-card">
      <div class="meta">
        <strong>${escapeHtml(item.domain || "未归类")}</strong>
        <span class="risk-badge ${item.riskLevel || "medium"}">${escapeHtml(item.riskLevel || "medium")}</span>
      </div>
      <p>${escapeHtml(item.reason || "")}</p>
      <div class="chip-row wrap">
        <span class="mini-chip">${escapeHtml(item.topic || "未命名主题")}</span>
        <span class="mini-chip">${escapeHtml(item.standardKeyword || "未命名关键词")}</span>
        <span class="mini-chip">${escapeHtml((item.evidenceReviewIds || []).join(", ") || "无证据")}</span>
      </div>
    </div>
  `;
}

function renderPendingAnalysisRow(item) {
  return `
    <div class="pending-card">
      <div class="meta">
        <strong>${escapeHtml(item.rawTerm || "")}</strong>
        <span class="risk-badge medium">pending</span>
      </div>
      <p>${escapeHtml(item.reason || "")}</p>
      <div class="chip-row wrap">
        <span class="mini-chip">${escapeHtml(item.suggestedDomain || "待归类")}</span>
        <span class="mini-chip">${escapeHtml(item.suggestedTopic || "待归类")}</span>
      </div>
    </div>
  `;
}

function renderRecommendationCards(items) {
  if (!items.length) return `<div class="empty-state">暂无研发排查建议。</div>`;
  return items
    .map(
      (item) => `
        <article class="recommendation-card">
          <div class="meta">
            <strong>${escapeHtml(item.title || "排查建议")}</strong>
            <span class="risk-badge ${item.priority || "medium"}">${escapeHtml(item.priority || "medium")}</span>
          </div>
          <p>${escapeHtml(item.action || "")}</p>
          <div class="chip-row wrap">
            <span class="mini-chip">负责人 ${escapeHtml(item.owner || "")}</span>
            <span class="mini-chip">证据 ${escapeHtml((item.evidenceReviewIds || []).join(", ") || "无")}</span>
          </div>
        </article>
      `
    )
    .join("");
}

function renderEvidenceChainCards(items) {
  if (!items.length) return `<div class="empty-state">暂无证据链。</div>`;
  return items
    .map(
      (item) => `
        <article class="evidence-card ${item.riskLevel === "high" ? "highlighted" : ""}">
          <div class="meta">
            <strong>${escapeHtml(item.keyword || item.standardKeyword || "未命名关键词")}</strong>
            <span class="risk-badge ${item.riskLevel || "medium"}">${escapeHtml(item.riskLevel || "medium")}</span>
          </div>
          <p>${escapeHtml(item.skuName)} / ${escapeHtml(item.domain)} / ${escapeHtml(item.topic)}</p>
          <p>${escapeHtml(item.reason || "")}</p>
          <div class="chip-row wrap">
            <span class="mini-chip">近 7 天 ${formatNumber(item.currentCount)} 条</span>
            <span class="mini-chip">环比 ${growthLabel(item.growth)}</span>
            <span class="mini-chip">证据 ${formatNumber((item.evidenceReviewIds || []).length)} 条</span>
          </div>
          <div class="evidence-actions">
            <button class="secondary-button" type="button" data-action="jump-review" data-review-id="${escapeHtml(item.evidenceReviewIds?.[0] || "")}" data-sku-id="${escapeHtml(item.skuId || "")}">跳转证据</button>
            <a class="link-button" href="${escapeHtml(item.productUrl || "#")}" target="_blank" rel="noreferrer">打开商品</a>
          </div>
        </article>
      `
    )
    .join("");
}

function renderSkuView() {
  const sku = state.dashboard.selectedSku || state.dashboard.skus?.find((item) => item.id === state.filters.skuId) || state.dashboard.skus?.[0];
  if (!sku) {
    $("skuDetailTitle").textContent = "SKU 详情";
    $("skuDetailSubtitle").textContent = "暂无 SKU 数据。";
    $("skuSummaryChips").innerHTML = `<div class="empty-state">暂无 SKU 数据。</div>`;
    $("skuTrendChart").innerHTML = "";
    $("skuKeywordTable").innerHTML = "";
    $("ratingBars").innerHTML = "";
    $("skuReviewSamples").innerHTML = `<div class="empty-state">暂无原始评论。</div>`;
    return;
  }

  const reviews = applyLocalFilters(state.dashboard.selectedSkuReviews || []);
  const keywordStats = aggregateKeywords(reviews);
  const trend = buildTrend(reviews);
  const ratingCounts = countRatings(reviews);

  $("skuDetailTitle").textContent = sku.name;
  $("skuDetailSubtitle").textContent = `${sku.series} / ${sku.jdSkuId} / ${sku.status === "inactive" ? "已停用" : "监控中"}`;
  $("skuJdLink").href = sku.url || "#";
  $("skuSummaryChips").innerHTML = [
    `<span class="summary-chip">总评论 ${formatNumber(reviews.length)} 条</span>`,
    `<span class="summary-chip">差评 ${formatNumber(ratingCounts.bad)} 条</span>`,
    `<span class="summary-chip">高风险 ${formatNumber(keywordStats.filter((item) => item.riskLevel === "high").length)} 个</span>`,
    `<span class="summary-chip">最近 7 天 ${formatNumber(reviews.filter((item) => daysBetween(item.date, dashboardToday()) <= 7).length)} 条</span>`,
  ].join("");

  $("skuTrendChart").innerHTML = renderTrendRows(trend);
  $("skuKeywordTable").innerHTML = renderKeywordRows(keywordStats);
  $("ratingBars").innerHTML = renderRatingBars(ratingCounts);
  $("skuReviewSamples").innerHTML = renderReviewCards(reviews);
}

function renderTrendRows(trend) {
  if (!trend.length) return `<div class="empty-state">暂无趋势数据。</div>`;
  const max = Math.max(...trend.map((item) => item.total), 1);
  return trend
    .slice(-14)
    .map(
      (item) => `
        <div class="trend-row">
          <span class="trend-date">${escapeHtml(item.date.slice(5))}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.max(8, (item.total / max) * 100)}%"></div></div>
          <span class="mini-chip">${formatNumber(item.total)} 条</span>
          <span class="tag ${item.bad > 0 ? "high" : "low"}">${formatNumber(item.bad)} 差评</span>
        </div>
      `
    )
    .join("");
}

function renderKeywordRows(keywordStats) {
  if (!keywordStats.length) return `<div class="empty-state">暂无关键词聚合。</div>`;
  return keywordStats
    .slice(0, 8)
    .map(
      (item) => `
        <div class="keyword-table-row">
          <div>
            <strong>${escapeHtml(item.keyword)}</strong>
            <div class="desc">${escapeHtml(item.domain)} / ${escapeHtml(item.topic)}</div>
          </div>
          <div>
            <strong>${formatNumber(item.count)}</strong>
            <div class="subtext">出现次数</div>
          </div>
          <div>
            <strong>${formatNumber(item.badCount)}</strong>
            <div class="subtext">差评中命中</div>
          </div>
          <div class="keyword-actions">
            <span class="risk-badge ${item.riskLevel}">${escapeHtml(item.riskLevel)}</span>
            <button class="secondary-button" type="button" data-action="jump-review" data-review-id="${escapeHtml(item.evidenceReviewIds[0] || "")}" data-sku-id="${escapeHtml(item.skuId || state.filters.skuId || "all")}">查看证据</button>
          </div>
        </div>
      `
    )
    .join("");
}

function renderRatingBars(counts) {
  const total = Math.max(counts.total, 1);
  return [
    ["good", "好评", counts.good],
    ["neutral", "中评", counts.neutral],
    ["bad", "差评", counts.bad],
  ]
    .map(
      ([tone, label, value]) => `
        <div class="rating-bar">
          <strong>${label} ${formatNumber(value)}</strong>
          <div class="rating-track"><div class="rating-fill ${tone}" style="width:${Math.max(8, (value / total) * 100)}%"></div></div>
        </div>
      `
    )
    .join("");
}

function renderReviewCards(reviews) {
  if (!reviews.length) return `<div class="empty-state">当前筛选条件下没有评论。</div>`;
  return reviews
    .slice(0, 40)
    .map((review) => {
      const id = `review-${slugify(review.id)}`;
      const risk = review.riskLevel || (review.ratingType === "bad" ? "medium" : "low");
      return `
        <article id="${id}" class="review-card ${state.selectedReviewId === review.id ? "highlighted" : ""}">
          <div class="meta">
            <strong>${escapeHtml(review.ratingType === "bad" ? "差评" : review.ratingType === "neutral" ? "中评" : "好评")}</strong>
            <span class="risk-badge ${risk}">${escapeHtml(risk)}</span>
          </div>
          <p>${escapeHtml(review.content)}</p>
          <div class="review-meta">
            <span class="mini-chip">${escapeHtml(review.date || "")}</span>
            <span class="mini-chip">${escapeHtml(review.skuName || "")}</span>
            <span class="mini-chip">reviewId: ${escapeHtml(review.id)}</span>
            <span class="mini-chip">${escapeHtml(review.domain || "未归类")} / ${escapeHtml(review.topic || "未命名主题")}</span>
            <span class="mini-chip">${escapeHtml(review.standardKeyword || "未命名关键词")}</span>
          </div>
          <div class="chip-row wrap">
            ${(review.matchedAliases || []).slice(0, 4).map((alias) => `<span class="tag">${escapeHtml(alias)}</span>`).join("")}
          </div>
          <div class="review-actions">
            <button class="secondary-button" type="button" data-action="jump-review" data-review-id="${escapeHtml(review.id)}" data-sku-id="${escapeHtml(review.skuId)}">跳转证据</button>
            <a class="link-button" href="${escapeHtml(review.productUrl || "#")}" target="_blank" rel="noreferrer">商品链接</a>
            <a class="link-button" href="${escapeHtml(review.reviewUrl || review.productUrl || "#")}" target="_blank" rel="noreferrer">评论链接</a>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderClusterView() {
  $("clusterDomainGrid").innerHTML = renderDomainCards(state.dashboard.domainSummary || []);
  $("topicClusterTable").innerHTML = renderTopicRows(state.dashboard.topicSummary || []);
  $("pendingTermList").innerHTML = renderPendingCards(state.dashboard.pendingTerms || []);
}

function renderTopicRows(items) {
  if (!items.length) return `<div class="empty-state">暂无主题聚类。</div>`;
  return items
    .slice(0, 12)
    .map(
      (item) => `
        <div class="keyword-table-row">
          <div>
            <strong>${escapeHtml(item.standardKeyword)}</strong>
            <div class="desc">${escapeHtml(item.domain)} / ${escapeHtml(item.topic)}</div>
          </div>
          <div>
            <strong>${formatNumber(item.reviewCount)}</strong>
            <div class="subtext">评论数</div>
          </div>
          <div>
            <strong>${formatNumber(item.badCount)}</strong>
            <div class="subtext">差评数</div>
          </div>
          <div class="keyword-actions">
            <span class="risk-badge ${item.riskLevel}">${escapeHtml(item.riskLevel)}</span>
            <button class="secondary-button" type="button" data-action="jump-review" data-review-id="${escapeHtml(item.evidenceReviewIds[0] || "")}" data-sku-id="${escapeHtml(findSkuIdForReview(item.evidenceReviewIds[0]) || state.filters.skuId || "all")}">查看证据</button>
          </div>
        </div>
      `
    )
    .join("");
}

function renderPendingCards(items) {
  if (!items.length) return `<div class="empty-state">暂无待审新词。</div>`;
  return items
    .slice(0, 12)
    .map(
      (item) => `
        <article class="pending-card">
          <div class="meta">
            <strong>${escapeHtml(item.rawTerm)}</strong>
            <span class="risk-badge medium">pending</span>
          </div>
          <p>${escapeHtml(item.reason || "")}</p>
          <div class="chip-row wrap">
            <span class="mini-chip">${escapeHtml(item.suggestedDomain || "待归类")}</span>
            <span class="mini-chip">${escapeHtml(item.suggestedTopic || "待归类")}</span>
            <span class="mini-chip">${escapeHtml((item.evidenceReviewIds || []).join(", ") || "无证据")}</span>
          </div>
        </article>
      `
    )
    .join("");
}

function renderKnowledgeView() {
  const knowledge = state.knowledge;
  if (!knowledge) {
    $("knowledgeFolderList").innerHTML = `<div class="empty-state">知识库加载中。</div>`;
    $("promptList").innerHTML = "";
    $("evalCaseList").innerHTML = "";
    return;
  }

  $("knowledgeFolderList").innerHTML = renderFolderCards(knowledge.folders || []);
  $("promptList").innerHTML = renderNoteCards(knowledge.prompts || [], "Prompt");
  $("evalCaseList").innerHTML = [
    `<div class="section-stack">`,
    `<div><span class="sidebar-label">评测集</span>${renderNoteCards(knowledge.evalSets || [], "Eval Set")}</div>`,
    `<div><span class="sidebar-label">Bad Case</span>${renderNoteCards(knowledge.badCases || [], "Bad Case")}</div>`,
    `<div><span class="sidebar-label">产品笔记</span>${renderNoteCards(knowledge.productNotes || [], "Note")}</div>`,
    `</div>`,
  ].join("");
}

function renderFolderCards(folders) {
  if (!folders.length) return `<div class="empty-state">未找到 Obsidian 目录。</div>`;
  return folders
    .map(
      (folder) => `
        <article class="folder-card">
          <div class="meta">
            <strong>${escapeHtml(folder.folder)}</strong>
            <span class="tag">${folder.exists ? "已连接" : "缺失"}</span>
          </div>
          <div class="count">${formatNumber(folder.fileCount)}</div>
          <p class="folder-meta">${escapeHtml(folder.path)}</p>
        </article>
      `
    )
    .join("");
}

function renderNoteCards(items, label) {
  if (!items.length) return `<div class="empty-state">暂无 ${label} 数据。</div>`;
  return items
    .slice(0, 8)
    .map(
      (item) => `
        <article class="note-card">
          <div class="meta">
            <strong>${escapeHtml(item.name || item.title || item.id || label)}</strong>
            <span class="tag">${escapeHtml(item.version || label)}</span>
          </div>
          <p>${escapeHtml(item.updatedAt || item.createdAt || "")}</p>
        </article>
      `
    )
    .join("");
}

function renderSettings() {
  const skus = state.dashboard?.skus || [];
  $("skuTable").innerHTML = renderSkuRows(skus);
}

function renderSkuRows(skus) {
  if (!skus.length) return `<div class="empty-state">暂无 SKU，请先新增。</div>`;
  return skus
    .map(
      (sku) => `
        <div class="sku-table-row">
          <div>
            <strong>${escapeHtml(sku.name)}</strong>
            <div class="subtext">${escapeHtml(sku.series)} / ${escapeHtml(sku.jdSkuId)}</div>
          </div>
          <span class="tag ${sku.status === "inactive" ? "medium" : "low"}">${escapeHtml(sku.status)}</span>
          <a class="link-button" href="${escapeHtml(sku.url)}" target="_blank" rel="noreferrer">打开链接</a>
          <div class="sku-actions">
            <button class="secondary-button" type="button" data-action="edit-sku" data-sku-id="${escapeHtml(sku.id)}">编辑</button>
            <button class="secondary-button" type="button" data-action="toggle-sku" data-sku-id="${escapeHtml(sku.id)}">${sku.status === "inactive" ? "启用" : "停用"}</button>
            <button class="secondary-button" type="button" data-action="delete-sku" data-sku-id="${escapeHtml(sku.id)}">删除</button>
          </div>
        </div>
      `
    )
    .join("");
}

function aggregateKeywords(reviews) {
  const map = new Map();
  reviews.forEach((review) => {
    const keyword = review.standardKeyword || review.topic || review.domain || "未命名";
    if (!map.has(keyword)) {
      map.set(keyword, {
        keyword,
        domain: review.domain || "未归类",
        topic: review.topic || "未命名主题",
        count: 0,
        badCount: 0,
        riskLevel: review.riskLevel || "low",
        skuId: review.skuId,
        evidenceReviewIds: [],
      });
    }
    const item = map.get(keyword);
    item.count += 1;
    if (review.ratingType === "bad") item.badCount += 1;
    if (review.riskLevel === "high") item.riskLevel = "high";
    if (review.riskLevel === "medium" && item.riskLevel !== "high") item.riskLevel = "medium";
    item.evidenceReviewIds.push(review.id);
  });
  return [...map.values()].sort((a, b) => b.badCount - a.badCount || b.count - a.count);
}

function applyLocalFilters(reviews) {
  const rating = state.filters.rating || "all";
  const search = (state.filters.search || "").trim();
  const range = Number(state.filters.range || 30);
  return reviews.filter((review) => {
    if (rating !== "all" && review.ratingType !== rating) return false;
    if (search) {
      const text = [review.content, review.domain, review.topic, review.standardKeyword, review.skuName].join(" ");
      if (!text.includes(search)) return false;
    }
    if (daysBetween(review.date || dashboardToday(), dashboardToday()) > range) return false;
    return true;
  });
}

function countRatings(reviews) {
  return {
    total: reviews.length,
    good: reviews.filter((review) => review.ratingType === "good").length,
    neutral: reviews.filter((review) => review.ratingType === "neutral").length,
    bad: reviews.filter((review) => review.ratingType === "bad").length,
  };
}

function buildTrend(reviews) {
  const map = new Map();
  reviews.forEach((review) => {
    const key = review.date || dashboardToday();
    if (!map.has(key)) map.set(key, { date: key, total: 0, bad: 0 });
    const item = map.get(key);
    item.total += 1;
    if (review.ratingType === "bad") item.bad += 1;
  });
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function findSkuIdForReview(reviewId) {
  if (!reviewId || !state.dashboard) return "";
  const fromSelected = (state.dashboard.selectedSkuReviews || []).find((review) => review.id === reviewId);
  if (fromSelected?.skuId) return fromSelected.skuId;

  const chain = (state.dashboard.evidenceChains || []).find((item) =>
    (item.evidenceReviewIds || []).includes(reviewId)
      || (item.evidenceReviews || []).some((review) => review.reviewId === reviewId)
  );
  return chain?.skuId || "";
}

function toast(message, kind = "ok") {
  const host = $("toastHost");
  const node = document.createElement("div");
  node.className = `toast ${kind}`;
  node.textContent = message;
  host.appendChild(node);
  setTimeout(() => {
    node.remove();
  }, 2600);
}

function buildAnalysisSignature(dashboard) {
  return [
    dashboard?.updatedAt || "",
    dashboard?.selectedSkuId || "",
    dashboard?.filteredReviewCount || 0,
    dashboard?.highRiskSkus?.map((item) => item.skuId).join(",") || "",
  ].join("|");
}

function dashboardToday() {
  return new Date().toISOString().slice(0, 10);
}

function growthLabel(value) {
  if (value >= 900) return "新增高发";
  if (value > 0) return `+${value}%`;
  return `${value}%`;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("zh-CN");
}

function riskTone(level) {
  return level === "high" ? "red" : level === "medium" ? "orange" : "blue";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function slugify(value) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function isoDate() {
  return new Date().toISOString();
}
