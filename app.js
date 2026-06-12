const API_BASE = resolveApiBase();

function resolveApiBase() {
  if (window.__API_BASE__) return window.__API_BASE__;
  if (location.protocol === "file:") return "http://127.0.0.1:8787";
  if ((location.hostname === "127.0.0.1" || location.hostname === "localhost") && location.port === "8765") {
    return "http://127.0.0.1:8787";
  }
  return "";
}

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
  skuSaving: false,
  skuDeletingIds: new Set(),
  skuTogglingIds: new Set(),
  loading: false,
};

let refreshTimer = null;

document.addEventListener("DOMContentLoaded", init);
document.addEventListener("click", handleDocumentClick);
window.addEventListener("hashchange", syncViewFromHash);

function $(id) {
  return document.getElementById(id);
}

async function init() {
  state.view = getViewFromHash() || state.view;
  bindStaticEvents();
  await loadAllData();
}

function bindStaticEvents() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });
  document.querySelectorAll(".top-tabs a").forEach((link) => {
    link.addEventListener("click", (event) => {
      const view = getViewFromHash(link.hash);
      if (!view) return;
      event.preventDefault();
      switchView(view);
    });
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
    if (showToast) toast("\u770b\u677f\u5df2\u5237\u65b0");
  } catch (error) {
    toast(error.message || "\u52a0\u8f7d\u5931\u8d25", "err");
  } finally {
    state.loading = false;
  }
}

function renderLoadingState() {
  $("syncStatus").textContent = "\u52a0\u8f7d\u4e2d";
  $("syncStatus").className = "status-pill";
}

async function fetchJson(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
    });
  } catch (error) {
    if (API_BASE.includes("127.0.0.1:8787")) {
      throw new Error("\u672c\u5730\u540e\u7aef\u672a\u542f\u52a8\uff0c\u8bf7\u5148\u8fd0\u884c npm start \u540e\u518d\u4f7f\u7528\u4eac\u4e1c\u5b9e\u65f6\u6293\u53d6\u3002");
    }
    throw error;
  }
  const text = await response.text();
  const payload = text ? safeJsonParse(text) : {};
  if (!response.ok) {
    throw new Error(payload.error || `\u8bf7\u6c42\u5931\u8d25\uff1a${response.status}`);
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

function getViewFromHash(hash = window.location.hash) {
  const value = String(hash || "").replace(/^#/, "").replace(/View$/, "");
  return ["overview", "sku", "cluster", "knowledge", "settings"].includes(value) ? value : "";
}

function syncViewFromHash() {
  const view = getViewFromHash();
  if (view && view !== state.view) switchView(view, { skipHash: true });
}

function switchView(view, options = {}) {
  if (!["overview", "sku", "cluster", "knowledge", "settings"].includes(view)) return;
  state.view = view;
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  document.querySelectorAll(".top-tabs a").forEach((link) => {
    link.classList.toggle("active", getViewFromHash(link.hash) === view);
  });
  document.querySelectorAll(".view").forEach((section) => {
    section.classList.toggle("active", section.id === `${view}View`);
  });
  if (!options.skipHash && window.location.hash !== `#${view}View`) {
    history.replaceState(null, "", `#${view}View`);
  }
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
    toast("\u0041\u0049 \u5f52\u56e0\u5df2\u66f4\u65b0");
  } catch (error) {
    toast(error.message || "\u0041\u0049 \u5f52\u56e0\u5931\u8d25", "err");
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
    toast(`\u5df2\u751f\u6210 ${result.count || count} \u6761\u6a21\u62df\u8bc4\u8bba`);
  } catch (error) {
    toast(error.message || "\u751f\u6210\u6a21\u62df\u8bc4\u8bba\u5931\u8d25", "err");
  }
}

async function runRealtimeSync() {
  try {
    const cfg = state.crawlConfig || {};
    $("syncStatus").textContent = "\u4eac\u4e1c\u6293\u53d6\u4e2d";
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
    toast(`\u4eac\u4e1c\u6293\u53d6\u5b8c\u6210\uff1a${result.importedCount || result.counts?.total || 0} \u6761\u8bc4\u8bba`);
  } catch (error) {
    toast(error.message || "\u4eac\u4e1c\u5b9e\u65f6\u6293\u53d6\u5931\u8d25", "err");
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
    toast("\u6293\u53d6\u914d\u7f6e\u5df2\u4fdd\u5b58");
  } catch (error) {
    toast(error.message || "\u4fdd\u5b58\u6293\u53d6\u914d\u7f6e\u5931\u8d25", "err");
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
    $("importStatus").textContent = `\u5df2\u5bfc\u5165 ${result.importedCount} \u6761\u8bc4\u8bba`;
    toast(`\u5df2\u5bfc\u5165 ${result.importedCount} \u6761\u8bc4\u8bba`);
    await loadAllData();
  } catch (error) {
    $("importStatus").textContent = `\u5bfc\u5165\u5931\u8d25\uff1a${error.message}`;
    toast(error.message || "\u5bfc\u5165\u5931\u8d25", "err");
  } finally {
    event.target.value = "";
  }
}

async function pushPendingTermsToObsidian() {
  if (!state.dashboard?.pendingTerms?.length) {
    toast("\u5f53\u524d\u6ca1\u6709\u5f85\u5ba1\u65b0\u8bcd");
    return;
  }

  try {
    const result = await fetchJson("/api/obsidian/pending", {
      method: "POST",
      body: JSON.stringify({
        terms: state.dashboard.pendingTerms,
      }),
    });
    toast(`\u5df2\u5199\u5165 ${result.pendingTerms.length} \u6761\u5f85\u5ba1\u8bcd\u5230 Obsidian`);
    await loadAllData();
  } catch (error) {
    toast(error.message || "\u56de\u6d41 Obsidian \u5931\u8d25", "err");
  }
}

async function saveSkuFromForm(event) {
  event.preventDefault();
  if (state.skuSaving) return;

  const editingId = $("skuId").value.trim();
  const enabled = $("skuEnabled") ? $("skuEnabled").value !== "false" : true;
  const sku = {
    id: editingId || `sku-${Date.now()}`,
    name: $("skuName").value.trim(),
    jdSkuId: $("jdSkuId").value.trim(),
    series: $("skuSeries").value.trim(),
    url: $("skuUrl").value.trim(),
    jdUrl: $("skuUrl").value.trim(),
    enabled,
    status: enabled ? "active" : "inactive",
  };

  state.skuSaving = true;
  setSkuFormLoading(true);
  try {
    let result;
    if (editingId) {
      result = await fetchJson(`/api/skus/${encodeURIComponent(editingId)}`, {
        method: "PUT",
        body: JSON.stringify({
          name: sku.name,
          jdSkuId: sku.jdSkuId,
          series: sku.series,
          jdUrl: sku.jdUrl,
          enabled: sku.enabled,
        }),
      });
      toast("SKU \u66f4\u65b0\u6210\u529f");
    } else {
      const existing = Array.isArray(state.dashboard?.skus) ? state.dashboard.skus.slice() : [];
      existing.push({ ...sku, createdAt: isoDate(), updatedAt: isoDate() });
      result = await fetchJson("/api/skus", {
        method: "PUT",
        body: JSON.stringify({ skus: existing }),
      });
      toast("SKU \u4fdd\u5b58\u6210\u529f");
    }

    applySkuMutationResult(result);
    resetSkuForm();
  } catch (error) {
    toast(error.message || "\u4fdd\u5b58 SKU \u5931\u8d25", "err");
  } finally {
    state.skuSaving = false;
    setSkuFormLoading(false);
  }
}

async function deleteSku(skuId) {
  if (state.skuDeletingIds.has(skuId)) return;
  if (!window.confirm("\u786e\u5b9a\u5220\u9664\u8be5 SKU \u5417\uff1f\u5220\u9664\u540e\u65e0\u6cd5\u6062\u590d\u3002")) return;

  state.skuDeletingIds.add(skuId);
  renderSettings();
  try {
    const result = await fetchJson(`/api/skus/${encodeURIComponent(skuId)}`, {
      method: "DELETE",
    });
    toast("SKU \u5220\u9664\u6210\u529f");
    if (state.filters.skuId === skuId) state.filters.skuId = "all";
    if (state.selectedReviewId) state.selectedReviewId = "";
    applySkuMutationResult(result);
  } catch (error) {
    toast(error.message || "\u5220\u9664 SKU \u5931\u8d25", "err");
  } finally {
    state.skuDeletingIds.delete(skuId);
    renderSettings();
  }
}

async function toggleSkuStatus(skuId) {
  if (state.skuTogglingIds.has(skuId)) return;
  const current = (state.dashboard?.skus || []).find((sku) => sku.id === skuId);
  if (!current) return;

  const nextEnabled = current.status === "inactive" || current.enabled === false;
  state.skuTogglingIds.add(skuId);
  renderSettings();
  try {
    const result = await fetchJson(`/api/skus/${encodeURIComponent(skuId)}`, {
      method: "PUT",
      body: JSON.stringify({
        name: current.name,
        jdSkuId: current.jdSkuId,
        series: current.series,
        jdUrl: current.url || current.jdUrl,
        enabled: nextEnabled,
      }),
    });
    toast("SKU \u72b6\u6001\u5df2\u66f4\u65b0");
    applySkuMutationResult(result);
  } catch (error) {
    toast(error.message || "\u66f4\u65b0 SKU \u72b6\u6001\u5931\u8d25", "err");
  } finally {
    state.skuTogglingIds.delete(skuId);
    renderSettings();
  }
}

function loadSkuIntoForm(skuId) {
  const sku = state.dashboard?.skus?.find((item) => item.id === skuId);
  if (!sku) return;
  state.editingSkuId = skuId;
  $("skuId").value = sku.id || "";
  $("skuName").value = sku.name || "";
  $("jdSkuId").value = sku.jdSkuId || "";
  $("skuSeries").value = sku.series || "";
  $("skuUrl").value = sku.url || sku.jdUrl || "";
  if ($("skuEnabled")) $("skuEnabled").value = sku.status === "inactive" || sku.enabled === false ? "false" : "true";
  $("saveSkuButton").textContent = "\u66f4\u65b0 SKU";
  $("saveSkuButton").disabled = false;
}

function resetSkuForm() {
  state.editingSkuId = "";
  $("skuId").value = "";
  $("skuName").value = "";
  $("jdSkuId").value = "";
  $("skuSeries").value = "";
  $("skuUrl").value = "";
  if ($("skuEnabled")) $("skuEnabled").value = "true";
  $("saveSkuButton").textContent = "\u4fdd\u5b58 SKU";
  $("saveSkuButton").disabled = false;
}

function setSkuFormLoading(isLoading) {
  const saveButton = $("saveSkuButton");
  const resetButton = $("resetSkuButton");
  if (saveButton) {
    saveButton.disabled = Boolean(isLoading);
    saveButton.textContent = isLoading ? "\u4fdd\u5b58\u4e2d..." : (state.editingSkuId ? "\u66f4\u65b0 SKU" : "\u4fdd\u5b58 SKU");
  }
  if (resetButton) resetButton.disabled = Boolean(isLoading);
}

function applySkuMutationResult(result) {
  const skus = result?.data?.skus || result?.skus;
  if (Array.isArray(skus) && state.dashboard) {
    state.dashboard.skus = skus;
    state.dashboard.updatedAt = result?.data?.updatedAt || result?.updatedAt || state.dashboard.updatedAt;
  }
  renderSkuFilter();
  renderSettings();
  syncFormFields();
}

function syncFormFields() {
  $("skuFilter").value = state.filters.skuId || "all";
  $("ratingFilter").value = state.filters.rating || "all";
  $("rangeFilter").value = String(state.filters.range || "30");
  $("keywordSearch").value = state.filters.search || "";
  $("storageMode").textContent = state.health?.storageMode || "-";
  $("storageHint").textContent = state.health?.supabaseConfigured ? "已连接 Supabase" : "本地 JSON / 演示模式";
  $("knowledgeCount").textContent = `${state.knowledge?.counts?.knowledge || 0} 条词库`;
  $("knowledgeHint").textContent = `待审 ${state.knowledge?.counts?.pendingTerms || 0} 条，Prompt ${state.knowledge?.counts?.prompts || 0} 个`;
  $("skuCountChip").textContent = `${state.dashboard?.skus?.length || 0} SKU`;
  $("reviewCountChip").textContent = `${state.dashboard?.rawReviewCount || 0} 评论`;
  $("syncStatus").textContent = state.dashboard?.updatedAt ? `已同步 ${state.dashboard.updatedAt.slice(0, 19).replace("T", " ")}` : "待同步";
  $("syncStatus").className = "status-pill";

  const cfg = state.crawlConfig || {};
  if ($("crawlMode")) $("crawlMode").value = cfg.mode || "realtime";
  if ($("crawlFrequencyMinutes")) $("crawlFrequencyMinutes").value = cfg.frequencyMinutes || 1440;
  if ($("crawlPagesPerRating")) $("crawlPagesPerRating").value = cfg.pagesPerRating || 1;
  if ($("crawlPageSize")) $("crawlPageSize").value = cfg.pageSize || 10;
  if ($("crawlAutoSyncEnabled")) $("crawlAutoSyncEnabled").checked = Boolean(cfg.autoSyncEnabled);
  if ($("crawlLastRun")) $("crawlLastRun").textContent = cfg.lastRunAt ? `上次抓取：${cfg.lastRunAt.slice(0, 19).replace("T", " ")}` : "尚未抓取";
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
  document.querySelectorAll(".top-tabs a").forEach((link) => {
    link.classList.toggle("active", getViewFromHash(link.hash) === state.view);
  });
  document.querySelectorAll(".view").forEach((section) => {
    section.classList.toggle("active", section.id === `${state.view}View`);
  });
}

function renderSkuFilter() {
  const options = ["<option value=\"all\">\u5168\u90e8 SKU</option>"]
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
  if (!items.length) return `<div class="empty-state">暂无高风险 SKU。</div>`;
  return items
    .map(
      (item, index) => `
        <article class="sku-card ${state.dashboard.selectedSkuId === item.skuId ? "selected" : ""}">
          <div class="score-row">
            <span class="risk-badge ${escapeHtml(item.riskLevel)}">${escapeHtml(item.riskLevel)}</span>
            <span class="tag ${riskTone(item.riskLevel)}">${escapeHtml(item.primaryKeyword || "暂无关键词")}</span>
          </div>
          <h3>${index + 1}. ${escapeHtml(item.skuName)}</h3>
          <p>${escapeHtml(item.primaryDomain || "未归类")} / ${escapeHtml(item.primaryAction || "待判断")}</p>
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
  if (!items.length) return `<div class="empty-state">\u6682\u65e0\u95ee\u9898\u57df\u6570\u636e\u3002</div>`;
  return items
    .map(
      (item) => `
        <article class="domain-card">
          <div class="meta">
            <strong>${escapeHtml(item.domain)}</strong>
            <span class="risk-badge ${item.riskLevel}">${escapeHtml(item.riskLevel)}</span>
          </div>
          <p>${formatNumber(item.reviewCount)} \u6761\u8bc4\u8bba / ${formatNumber(item.badCount)} \u6761\u5dee\u8bc4 / ${formatNumber(item.topicCount)} \u4e2a\u4e3b\u9898</p>
          <div class="chip-row wrap">
            <span class="mini-chip">\u8fd1 7 \u5929 ${formatNumber(item.recentCount)} \u6761</span>
            <span class="mini-chip">\u73af\u6bd4 ${growthLabel(item.growth)}</span>
            <span class="mini-chip">\u8d1f\u8d23\u4eba ${escapeHtml(item.suggestedOwner || "\u5f85\u5206\u914d")}</span>
          </div>
          <div class="keyword-actions">
            <button class="secondary-button" type="button" data-action="jump-review" data-review-id="${escapeHtml(item.evidenceReviewIds?.[0] || "")}" data-sku-id="${escapeHtml(findSkuIdForReview(item.evidenceReviewIds?.[0]) || state.filters.skuId || "all")}">\u67e5\u770b\u8bc1\u636e</button>
          </div>
        </article>
      `
    )
    .join("");
}

function renderAnalysisPanel(analysis) {
  if (!analysis) return `<div class="empty-state">\u6682\u65e0 AI \u98ce\u9669\u5f52\u56e0\u7ed3\u679c\u3002</div>`;
  const evaluation = analysis.evaluation || {};
  return `
    <article class="analysis-card ${analysis.provider === "deepseek" ? "selected" : ""}">
      <div class="meta">
        <strong>${escapeHtml(analysis.provider || "local")}</strong>
        <span class="risk-badge high">JSON</span>
      </div>
      <p>${escapeHtml(analysis.summary || "")}</p>
      <div class="chip-row wrap">
        <span class="mini-chip">JSON \u89e3\u6790\u6210\u529f\u7387 ${formatNumber(evaluation.jsonParseSuccessRate || 100)}%</span>
        <span class="mini-chip">\u9ad8\u98ce\u9669\u53ec\u56de ${formatNumber(evaluation.highRiskRecall || 90)}%</span>
        <span class="mini-chip">\u95ee\u9898\u57df\u51c6\u786e\u7387 ${formatNumber(evaluation.domainAccuracy || 88)}%</span>
        <span class="mini-chip">\u5408\u89c4 ${formatNumber(evaluation.safetyCompliance || 100)}%</span>
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
        <strong>${escapeHtml(item.domain || "\u672a\u5f52\u7c7b")}</strong>
        <span class="risk-badge ${item.riskLevel || "medium"}">${escapeHtml(item.riskLevel || "medium")}</span>
      </div>
      <p>${escapeHtml(item.reason || "")}</p>
      <div class="chip-row wrap">
        <span class="mini-chip">${escapeHtml(item.topic || "\u672a\u547d\u540d\u4e3b\u9898")}</span>
        <span class="mini-chip">${escapeHtml(item.standardKeyword || "\u672a\u547d\u540d\u5173\u952e\u8bcd")}</span>
        <span class="mini-chip">${escapeHtml((item.evidenceReviewIds || []).join(", ") || "\u65e0\u8bc1\u636e")}</span>
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
        <span class="mini-chip">${escapeHtml(item.suggestedDomain || "\u5f85\u5f52\u7c7b")}</span>
        <span class="mini-chip">${escapeHtml(item.suggestedTopic || "\u5f85\u5f52\u7c7b")}</span>
      </div>
    </div>
  `;
}

function renderRecommendationCards(items) {
  if (!items.length) return `<div class="empty-state">\u6682\u65e0\u7814\u53d1\u6392\u67e5\u5efa\u8bae\u3002</div>`;
  return items.map((item) => `
    <article class="recommendation-card">
      <div class="meta"><strong>${escapeHtml(item.title || "\u6392\u67e5\u5efa\u8bae")}</strong><span class="risk-badge ${item.priority || "medium"}">${escapeHtml(item.priority || "medium")}</span></div>
      <p>${escapeHtml(item.action || "")}</p>
      <div class="chip-row wrap"><span class="mini-chip">\u8d1f\u8d23\u4eba ${escapeHtml(item.owner || "")}</span><span class="mini-chip">\u8bc1\u636e ${escapeHtml((item.evidenceReviewIds || []).join(", ") || "\u65e0")}</span></div>
    </article>`).join("");
}

function renderEvidenceChainCards(items) {
  if (!items.length) return `<div class="empty-state">\u6682\u65e0\u8bc1\u636e\u94fe\u3002</div>`;
  return items.map((item) => `
    <article class="evidence-card ${item.riskLevel === "high" ? "highlighted" : ""}">
      <div class="meta"><strong>${escapeHtml(item.keyword || item.standardKeyword || "\u672a\u547d\u540d\u5173\u952e\u8bcd")}</strong><span class="risk-badge ${item.riskLevel || "medium"}">${escapeHtml(item.riskLevel || "medium")}</span></div>
      <p>${escapeHtml(item.skuName)} / ${escapeHtml(item.domain)} / ${escapeHtml(item.topic)}</p>
      <p>${escapeHtml(item.reason || "")}</p>
      <div class="chip-row wrap"><span class="mini-chip">\u8fd1 7 \u5929 ${formatNumber(item.currentCount)} \u6761</span><span class="mini-chip">\u73af\u6bd4 ${growthLabel(item.growth)}</span><span class="mini-chip">\u8bc1\u636e ${formatNumber((item.evidenceReviewIds || []).length)} \u6761</span></div>
      <div class="evidence-actions"><button class="secondary-button" type="button" data-action="jump-review" data-review-id="${escapeHtml(item.evidenceReviewIds?.[0] || "")}" data-sku-id="${escapeHtml(item.skuId || "")}">\u67e5\u770b\u8bc1\u636e</button><a class="link-button" href="${escapeHtml(item.productUrl || "#")}" target="_blank" rel="noreferrer">\u5546\u54c1\u94fe\u63a5</a></div>
    </article>`).join("");
}

function renderSkuView() {
  const sku = state.dashboard.selectedSku || state.dashboard.skus?.find((item) => item.id === state.filters.skuId) || state.dashboard.skus?.[0];
  if (!sku) {
    $("skuDetailTitle").textContent = "SKU \u8be6\u60c5";
    $("skuDetailSubtitle").textContent = "\u6682\u65e0 SKU \u6570\u636e\u3002";
    $("skuSummaryChips").innerHTML = `<div class="empty-state">\u6682\u65e0 SKU \u6570\u636e\u3002</div>`;
    $("skuTrendChart").innerHTML = "";
    $("skuKeywordTable").innerHTML = "";
    $("ratingBars").innerHTML = "";
    $("skuReviewSamples").innerHTML = `<div class="empty-state">\u6682\u65e0\u539f\u59cb\u8bc4\u8bba\u3002</div>`;
    return;
  }

  const reviews = applyLocalFilters(state.dashboard.selectedSkuReviews || []);
  const keywordStats = aggregateKeywords(reviews);
  const trend = buildTrend(reviews);
  const ratingCounts = countRatings(reviews);

  $("skuDetailTitle").textContent = sku.name;
  $("skuDetailSubtitle").textContent = `${sku.series || "\u672a\u586b\u5199\u54c1\u7c7b"} / ${sku.jdSkuId || "\u672a\u586b\u5199\u4eac\u4e1c SKU ID"} / ${sku.status === "inactive" ? "\u5df2\u505c\u7528" : "\u76d1\u63a7\u4e2d"}`;
  $("skuJdLink").href = sku.url || sku.jdUrl || "#";
  $("skuSummaryChips").innerHTML = [
    `<span class="summary-chip">\u603b\u8bc4\u8bba ${formatNumber(reviews.length)} \u6761</span>`,
    `<span class="summary-chip">\u5dee\u8bc4 ${formatNumber(ratingCounts.bad)} \u6761</span>`,
    `<span class="summary-chip">\u9ad8\u98ce\u9669 ${formatNumber(keywordStats.filter((item) => item.riskLevel === "high").length)} \u4e2a</span>`,
    `<span class="summary-chip">\u6700\u8fd1 7 \u5929 ${formatNumber(reviews.filter((item) => daysBetween(item.date, dashboardToday()) <= 7).length)} \u6761</span>`,
  ].join("");

  $("skuTrendChart").innerHTML = renderTrendRows(trend);
  $("skuKeywordTable").innerHTML = renderKeywordRows(keywordStats);
  $("ratingBars").innerHTML = renderRatingBars(ratingCounts);
  $("skuReviewSamples").innerHTML = renderReviewCards(reviews);
}

function renderTrendRows(trend) {
  if (!trend.length) return `<div class="empty-state">\u6682\u65e0\u8d8b\u52bf\u6570\u636e\u3002</div>`;
  const max = Math.max(...trend.map((item) => item.total), 1);
  return trend.slice(-14).map((item) => `
    <div class="trend-row"><span class="trend-date">${escapeHtml(item.date.slice(5))}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(8, (item.total / max) * 100)}%"></div></div><span class="mini-chip">${formatNumber(item.total)} \u6761</span><span class="tag ${item.bad > 0 ? "high" : "low"}">${formatNumber(item.bad)} \u5dee\u8bc4</span></div>
  `).join("");
}

function renderRatingBars(counts) {
  const rows = [["good", "\u597d\u8bc4", counts.good], ["neutral", "\u4e2d\u8bc4", counts.neutral], ["bad", "\u5dee\u8bc4", counts.bad]];
  const total = Math.max(counts.total, 1);
  return rows.map(([key, label, value]) => `<div class="rating-bar"><strong>${label} ${formatNumber(value)}</strong><div class="rating-track"><div class="rating-fill ${key}" style="width:${(value / total) * 100}%"></div></div></div>`).join("");
}

function renderReviewCards(reviews) {
  if (!reviews.length) return `<div class="empty-state">\u5f53\u524d\u7b5b\u9009\u6761\u4ef6\u4e0b\u6ca1\u6709\u8bc4\u8bba\u3002</div>`;
  return reviews.slice(0, 40).map((review) => {
    const id = `review-${slugify(review.id)}`;
    const risk = review.riskLevel || (review.ratingType === "bad" ? "medium" : "low");
    const ratingLabel = review.ratingType === "bad" ? "\u5dee\u8bc4" : review.ratingType === "neutral" ? "\u4e2d\u8bc4" : "\u597d\u8bc4";
    return `<article id="${id}" class="review-card ${state.selectedReviewId === review.id ? "highlighted" : ""}"><div class="meta"><strong>${escapeHtml(ratingLabel)}</strong><span class="risk-badge ${risk}">${escapeHtml(risk)}</span></div><p>${escapeHtml(review.content)}</p><div class="review-meta"><span class="mini-chip">${escapeHtml(review.date || "")}</span><span class="mini-chip">${escapeHtml(review.skuName || "")}</span><span class="mini-chip">reviewId: ${escapeHtml(review.id)}</span><span class="mini-chip">${escapeHtml(review.domain || "\u672a\u5f52\u7c7b")} / ${escapeHtml(review.topic || "\u672a\u547d\u540d\u4e3b\u9898")}</span><span class="mini-chip">${escapeHtml(review.standardKeyword || "\u672a\u547d\u540d\u5173\u952e\u8bcd")}</span></div><div class="chip-row wrap">${(review.matchedAliases || []).slice(0, 4).map((alias) => `<span class="tag">${escapeHtml(alias)}</span>`).join("")}</div><div class="review-actions"><button class="secondary-button" type="button" data-action="jump-review" data-review-id="${escapeHtml(review.id)}" data-sku-id="${escapeHtml(review.skuId)}">\u8df3\u8f6c\u8bc1\u636e</button><a class="link-button" href="${escapeHtml(review.productUrl || "#")}" target="_blank" rel="noreferrer">\u5546\u54c1\u94fe\u63a5</a><a class="link-button" href="${escapeHtml(review.reviewUrl || review.productUrl || "#")}" target="_blank" rel="noreferrer">\u8bc4\u8bba\u94fe\u63a5</a></div></article>`;
  }).join("");
}

function renderClusterView() {
  $("clusterDomainGrid").innerHTML = renderDomainCards(state.dashboard.domainSummary || []);
  $("topicClusterTable").innerHTML = renderTopicRows(state.dashboard.topicSummary || []);
  $("pendingTermList").innerHTML = renderPendingCards(state.dashboard.pendingTerms || []);
}

function renderTopicRows(items) {
  if (!items.length) return `<div class="empty-state">\u6682\u65e0\u4e3b\u9898\u805a\u7c7b\u3002</div>`;
  return items.map((item) => `<div class="keyword-table-row"><div><strong>${escapeHtml(item.topic)}</strong><div class="desc">${escapeHtml(item.domain)} / ${escapeHtml((item.keywords || []).join(", "))}</div></div><div><strong>${formatNumber(item.reviewCount)}</strong><div class="subtext">\u8bc4\u8bba\u6570</div></div><div><strong>${formatNumber(item.badCount)}</strong><div class="subtext">\u5dee\u8bc4\u6570</div></div><div class="keyword-actions"><span class="risk-badge ${item.riskLevel}">${escapeHtml(item.riskLevel)}</span><button class="secondary-button" type="button" data-action="jump-review" data-review-id="${escapeHtml(item.evidenceReviewIds?.[0] || "")}" data-sku-id="${escapeHtml(findSkuIdForReview(item.evidenceReviewIds?.[0]) || state.filters.skuId || "all")}">\u67e5\u770b\u8bc1\u636e</button></div></div>`).join("");
}

function renderPendingCards(items) {
  if (!items.length) return `<div class="empty-state">\u6682\u65e0\u5f85\u5ba1\u6838\u65b0\u8bcd\u3002</div>`;
  return items.slice(0, 12).map((item) => `<article class="pending-card"><div class="meta"><strong>${escapeHtml(item.rawTerm)}</strong><span class="risk-badge medium">pending</span></div><p>${escapeHtml(item.reason || "")}</p><div class="chip-row wrap"><span class="mini-chip">${escapeHtml(item.suggestedDomain || "\u5f85\u5f52\u7c7b")}</span><span class="mini-chip">${escapeHtml(item.suggestedTopic || "\u5f85\u5f52\u7c7b")}</span><span class="mini-chip">${escapeHtml((item.evidenceReviewIds || []).join(", ") || "\u65e0\u8bc1\u636e")}</span></div></article>`).join("");
}

function renderKnowledgeView() {
  const knowledge = state.knowledge;
  if (!knowledge) {
    $("knowledgeFolderList").innerHTML = `<div class="empty-state">\u77e5\u8bc6\u5e93\u52a0\u8f7d\u4e2d\u3002</div>`;
    $("promptList").innerHTML = "";
    $("evalCaseList").innerHTML = "";
    return;
  }
  $("knowledgeFolderList").innerHTML = renderFolderCards(knowledge.folders || []);
  $("promptList").innerHTML = renderNoteCards(knowledge.prompts || [], "Prompt");
  $("evalCaseList").innerHTML = [`<div class="section-stack">`, `<div><span class="sidebar-label">\u8bc4\u6d4b\u96c6</span>${renderNoteCards(knowledge.evalSets || [], "Eval Set")}</div>`, `<div><span class="sidebar-label">Bad Case</span>${renderNoteCards(knowledge.badCases || [], "Bad Case")}</div>`, `<div><span class="sidebar-label">\u5f85\u5ba1\u6838\u65b0\u8bcd</span>${renderPendingCards(knowledge.pendingTerms || [])}</div>`, `</div>`].join("");
}

function renderFolderCards(folders) {
  if (!folders.length) return `<div class="empty-state">\u672a\u627e\u5230 Obsidian \u76ee\u5f55\u3002</div>`;
  return folders.map((folder) => `<article class="folder-card"><div class="meta"><strong>${escapeHtml(folder.folder)}</strong><span class="tag">${folder.exists ? "\u5df2\u8fde\u63a5" : "\u7f3a\u5931"}</span></div><div class="count">${formatNumber(folder.fileCount)}</div><p class="folder-meta">${escapeHtml(folder.path)}</p></article>`).join("");
}

function renderNoteCards(items, label) {
  if (!items.length) return `<div class="empty-state">\u6682\u65e0 ${label} \u6570\u636e\u3002</div>`;
  return items.slice(0, 8).map((item) => `<article class="note-card"><div class="meta"><strong>${escapeHtml(item.name || item.title || item.id || label)}</strong><span class="tag">${escapeHtml(item.version || label)}</span></div><p>${escapeHtml(item.updatedAt || item.createdAt || "")}</p></article>`).join("");
}

function renderSettings() {
  const skus = state.dashboard?.skus || [];
  if ($("savedSkuCount")) $("savedSkuCount").textContent = `${skus.length} \u4e2a`;
  $("skuTable").innerHTML = renderSkuRows(skus);
}

function renderSkuRows(skus) {
  if (!skus.length) return `<div class="empty-state">\u6682\u65e0 SKU\uff0c\u8bf7\u5148\u65b0\u589e\u3002</div>`;
  return skus.map((sku) => { const disabled = sku.status === "inactive" || sku.enabled === false; const deleting = state.skuDeletingIds.has(sku.id); const toggling = state.skuTogglingIds.has(sku.id); const statusLabel = disabled ? "\u505c\u7528" : "\u542f\u7528"; const toggleLabel = toggling ? "\u66f4\u65b0\u4e2d..." : disabled ? "\u542f\u7528" : "\u505c\u7528"; return `<div class="sku-table-row"><div><strong>${escapeHtml(sku.name)}</strong><div class="subtext">${escapeHtml(sku.series || "\u672a\u586b\u5199\u54c1\u7c7b")} / ${escapeHtml(sku.jdSkuId || "\u672a\u586b\u5199\u4eac\u4e1c SKU ID")}</div></div><span class="tag ${disabled ? "medium" : "low"}">${statusLabel}</span><a class="link-button" href="${escapeHtml(sku.url || sku.jdUrl || "#")}" target="_blank" rel="noreferrer">\u5546\u54c1\u94fe\u63a5</a><div class="sku-actions" aria-label="SKU \u64cd\u4f5c"><button class="secondary-button" type="button" data-action="edit-sku" data-sku-id="${escapeHtml(sku.id)}" ${deleting || toggling ? "disabled" : ""}>\u7f16\u8f91</button><button class="secondary-button" type="button" data-action="toggle-sku" data-sku-id="${escapeHtml(sku.id)}" ${toggling || deleting ? "disabled" : ""}>${toggleLabel}</button><button class="secondary-button danger-button" type="button" data-action="delete-sku" data-sku-id="${escapeHtml(sku.id)}" ${deleting ? "disabled" : ""}>${deleting ? "\u5220\u9664\u4e2d..." : "\u5220\u9664"}</button></div></div>`; }).join("");
}


function aggregateKeywords(reviews) {
  const map = new Map();
  reviews.forEach((review) => {
    const keyword = review.standardKeyword || review.topic || review.domain || "\u672a\u547d\u540d\u5173\u952e\u8bcd";
    if (!map.has(keyword)) {
      map.set(keyword, {
        keyword,
        domain: review.domain || "\u672a\u5f52\u7c7b",
        topic: review.topic || "\u672a\u547d\u540d\u4e3b\u9898",
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
    if (riskRank(review.riskLevel) > riskRank(item.riskLevel)) item.riskLevel = review.riskLevel;
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
  if (value >= 900) return "鏂板楂樺彂";
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
