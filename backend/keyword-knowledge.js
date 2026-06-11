const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const VAULT_ROOT = path.join(ROOT, "obsidian-vault");
const LEGACY_EXPORT_PATH = path.join(ROOT, "data", "keyword-knowledge.json");
const DOMAIN_KNOWLEDGE_JSON = path.join(VAULT_ROOT, "01_domain_knowledge", "keywords.json");
const PENDING_TERMS_JSON = path.join(VAULT_ROOT, "02_pending_terms", "pending_terms.json");

const KNOWLEDGE_DIRS = [
  "01_domain_knowledge",
  "02-keywords",
];

const INVENTORY_DIRS = [
  "01_domain_knowledge",
  "02_pending_terms",
  "02_mock_reviews",
  "03_eval_sets",
  "04_bad_cases",
  "05_pending_terms",
  "06_prompts",
  "07_product_notes",
  // Legacy folders still used by the current vault.
  "02-keywords",
  "03-pending",
];

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function readJsonFile(filePath, fallback = []) {
  if (!fileExists(filePath)) return fallback;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.entries)) return parsed.entries;
    if (Array.isArray(parsed.keywords)) return parsed.keywords;
    if (Array.isArray(parsed.pendingTerms)) return parsed.pendingTerms;
    return fallback;
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

function readMarkdownFiles(dirPath) {
  if (!fileExists(dirPath)) return [];
  return fs.readdirSync(dirPath)
    .filter((file) => file.toLowerCase().endsWith(".md"))
    .map((file) => ({
      file,
      fullPath: path.join(dirPath, file),
      content: fs.readFileSync(path.join(dirPath, file), "utf8"),
    }));
}

function parseFrontmatter(markdown) {
  const match = String(markdown || "").match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};

  const data = {};
  let currentKey = "";
  const lines = match[1].split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line) continue;

    const listMatch = line.match(/^\s*-\s+(.*)$/);
    if (listMatch && currentKey) {
      if (!Array.isArray(data[currentKey])) data[currentKey] = [];
      data[currentKey].push(castValue(listMatch[1]));
      continue;
    }

    const pairMatch = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!pairMatch) continue;

    const [, key, rawValue] = pairMatch;
    currentKey = key;

    if (!rawValue) {
      data[key] = [];
      continue;
    }

    data[key] = castValue(rawValue);
  }

  return data;
}

function castValue(value) {
  const text = String(value || "").trim();
  if (text === "true") return true;
  if (text === "false") return false;
  if (!text) return "";
  if (text.startsWith("[") && text.endsWith("]")) {
    try {
      return JSON.parse(text);
    } catch {
      return text
        .slice(1, -1)
        .split(",")
        .map((item) => item.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    }
  }
  return text;
}

function toArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string" && value.includes(",")) {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.includes("、")) {
    return value.split("、").map((item) => item.trim()).filter(Boolean);
  }
  return value ? [String(value).trim()].filter(Boolean) : [];
}

function extractSection(markdown, title) {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`##\\s*${escaped}\\s*([\\s\\S]*?)(\\n##\\s|$)`);
  const match = String(markdown || "").match(regex);
  if (!match) return "";
  return match[1].trim().replace(/\r?\n+/g, " ");
}

function normalizeKnowledgeEntry(entry, fileName = "") {
  const standardKeyword = String(entry.standardKeyword || entry.keyword || entry.title || path.basename(fileName, ".md") || "").trim();
  const id = String(entry.id || `kb-${standardKeyword}`).trim();
  const domain = String(entry.domain || "未归类").trim();
  const topic = String(entry.topic || standardKeyword || "未命名主题").trim();
  const aliases = toArray(entry.aliases);
  const graphTags = toArray(entry.graphTags);
  const riskLevel = ["high", "medium", "low"].includes(String(entry.riskLevel).toLowerCase())
    ? String(entry.riskLevel).toLowerCase()
    : "medium";

  return {
    id,
    domain,
    topic,
    standardKeyword,
    aliases,
    riskLevel,
    owner: String(entry.owner || "").trim(),
    suggestion: String(entry.suggestion || "").trim(),
    enabled: entry.enabled !== false,
    graphTags,
    sourceFile: fileName,
    source: entry.source || (fileName ? "obsidian-markdown" : "obsidian-json"),
  };
}

function readKnowledgeFromDirectory(dirPath) {
  return readMarkdownFiles(dirPath)
    .map(({ file, content }) => {
      const frontmatter = parseFrontmatter(content);
      if (!Object.keys(frontmatter).length) return null;
      const suggestion = String(
        frontmatter.suggestion ||
        extractSection(content, "处置建议") ||
        extractSection(content, "典型处理") ||
        ""
      ).trim();
      const typicalExpressions = String(extractSection(content, "典型表达") || "").trim();
      const normalized = normalizeKnowledgeEntry(
        {
          ...frontmatter,
          suggestion: frontmatter.suggestion || suggestion,
          typicalExpressions,
        },
        file
      );
      return normalized.standardKeyword ? normalized : null;
    })
    .filter(Boolean);
}

function pushUnique(entries, seen, entry) {
  const normalized = normalizeKnowledgeEntry(entry);
  const key = normalized.id || normalized.standardKeyword;
  if (!normalized.standardKeyword || seen.has(key)) return;
  seen.add(key);
  entries.push(normalized);
}

function loadKnowledgeBase() {
  const entries = [];
  const seen = new Set();

  // Obsidian JSON is the MVP source of truth; Markdown notes remain compatible as human-readable notes.
  readJsonFile(DOMAIN_KNOWLEDGE_JSON).forEach((entry) => pushUnique(entries, seen, { ...entry, source: "obsidian-json" }));

  for (const dir of KNOWLEDGE_DIRS) {
    const fullDir = path.join(VAULT_ROOT, dir);
    for (const entry of readKnowledgeFromDirectory(fullDir)) {
      pushUnique(entries, seen, entry);
    }
  }

  if (!entries.length && fileExists(LEGACY_EXPORT_PATH)) {
    readJsonFile(LEGACY_EXPORT_PATH).forEach((entry) => pushUnique(entries, seen, { ...entry, source: "legacy-export" }));
  }

  return entries.sort((a, b) => a.domain.localeCompare(b.domain, "zh-Hans-CN") || a.standardKeyword.localeCompare(b.standardKeyword, "zh-Hans-CN"));
}

function normalizePendingTerm(entry) {
  const rawTerm = String(entry.rawTerm || entry.term || "").trim();
  if (!rawTerm) return null;
  return {
    id: String(entry.id || `pending-${rawTerm}`).trim(),
    rawTerm,
    suggestedKeyword: String(entry.suggestedKeyword || rawTerm).trim(),
    suggestedDomain: String(entry.suggestedDomain || "待判断").trim(),
    suggestedTopic: String(entry.suggestedTopic || "待判断").trim(),
    reason: String(entry.reason || "由评论自动抽取，需人工在 Obsidian 审核。").trim(),
    evidenceReviewIds: Array.isArray(entry.evidenceReviewIds) ? entry.evidenceReviewIds.map(String) : [],
    status: String(entry.status || "pending").trim(),
    createdAt: entry.createdAt || new Date().toISOString(),
    source: entry.source || "voc-system",
  };
}

function loadPendingTermsJson() {
  return readJsonFile(PENDING_TERMS_JSON)
    .map(normalizePendingTerm)
    .filter(Boolean);
}

function writePendingTermsJson(terms) {
  const merged = new Map();
  loadPendingTermsJson().forEach((item) => merged.set(item.rawTerm, item));
  (Array.isArray(terms) ? terms : [])
    .map(normalizePendingTerm)
    .filter(Boolean)
    .forEach((item) => merged.set(item.rawTerm, item));

  const payload = {
    source: "obsidian-vault",
    updatedAt: new Date().toISOString(),
    pendingTerms: [...merged.values()],
  };
  writeJsonFile(PENDING_TERMS_JSON, payload);
  return payload.pendingTerms;
}

function loadObsidianInventory() {
  return INVENTORY_DIRS.map((folder) => {
    const fullPath = path.join(VAULT_ROOT, folder);
    const exists = fileExists(fullPath);
    const files = exists ? fs.readdirSync(fullPath).filter((item) => item.toLowerCase().endsWith(".md") || item.toLowerCase().endsWith(".json")) : [];
    return {
      folder,
      path: path.relative(ROOT, fullPath),
      exists,
      fileCount: files.length,
      noteCount: files.filter((item) => item.toLowerCase().endsWith(".md")).length,
      jsonCount: files.filter((item) => item.toLowerCase().endsWith(".json")).length,
    };
  });
}

function activeKnowledgeBase(knowledgeBase = loadKnowledgeBase()) {
  return (knowledgeBase || []).filter((entry) => entry.enabled !== false);
}

function matchKnowledge(content, knowledgeBase = loadKnowledgeBase()) {
  const text = String(content || "");
  const matches = [];

  for (const entry of activeKnowledgeBase(knowledgeBase)) {
    const terms = [entry.standardKeyword].concat(entry.aliases || []).filter(Boolean);
    const matchedAliases = [...new Set(terms.filter((term) => text.includes(term)))];
    if (!matchedAliases.length) continue;

    matches.push({
      id: entry.id,
      domain: entry.domain,
      topic: entry.topic,
      standardKeyword: entry.standardKeyword,
      matchedAliases,
      riskLevel: entry.riskLevel || "medium",
      owner: entry.owner || "",
      suggestion: entry.suggestion || "",
      graphTags: entry.graphTags || [],
    });
  }

  return matches;
}

function extractKnowledgeKeywords(content, knowledgeBase = loadKnowledgeBase()) {
  return [...new Set(matchKnowledge(content, knowledgeBase).map((item) => item.standardKeyword))];
}

function groupKnowledgeByDomain(knowledgeBase = loadKnowledgeBase()) {
  const groups = new Map();
  activeKnowledgeBase(knowledgeBase).forEach((entry) => {
    const key = entry.domain || "未归类";
    if (!groups.has(key)) {
      groups.set(key, {
        domain: key,
        topics: [],
        count: 0,
        riskLevel: "low",
      });
    }
    const group = groups.get(key);
    group.count += 1;
    group.riskLevel = highestRisk(group.riskLevel, entry.riskLevel);
    group.topics.push({
      topic: entry.topic,
      standardKeyword: entry.standardKeyword,
      aliases: entry.aliases,
      owner: entry.owner,
      riskLevel: entry.riskLevel,
    });
  });

  return [...groups.values()].sort((a, b) => b.count - a.count);
}

function groupKnowledgeByTopic(knowledgeBase = loadKnowledgeBase()) {
  return activeKnowledgeBase(knowledgeBase).map((entry) => ({
    domain: entry.domain,
    topic: entry.topic,
    standardKeyword: entry.standardKeyword,
    aliases: entry.aliases,
    owner: entry.owner,
    riskLevel: entry.riskLevel,
    suggestion: entry.suggestion,
    graphTags: entry.graphTags,
  }));
}

function highestRisk(left, right) {
  const weights = { high: 3, medium: 2, low: 1 };
  return weights[right] > weights[left] ? right : left;
}

module.exports = {
  DOMAIN_KNOWLEDGE_JSON,
  PENDING_TERMS_JSON,
  VAULT_ROOT,
  activeKnowledgeBase,
  extractKnowledgeKeywords,
  groupKnowledgeByDomain,
  groupKnowledgeByTopic,
  loadKnowledgeBase,
  loadObsidianInventory,
  loadPendingTermsJson,
  matchKnowledge,
  normalizeKnowledgeEntry,
  normalizePendingTerm,
  writePendingTermsJson,
};
