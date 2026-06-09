const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const KNOWLEDGE_PATH = path.join(ROOT, "data", "keyword-knowledge.json");

function loadKnowledgeBase() {
  try {
    const parsed = JSON.parse(fs.readFileSync(KNOWLEDGE_PATH, "utf8"));
    return Array.isArray(parsed) ? parsed : parsed.entries || [];
  } catch {
    return [];
  }
}

function activeKnowledgeBase(knowledgeBase = loadKnowledgeBase()) {
  return (knowledgeBase || []).filter((entry) => entry.enabled !== false);
}

function matchKnowledge(content, knowledgeBase = loadKnowledgeBase()) {
  const text = String(content || "");
  const matches = [];
  for (const entry of activeKnowledgeBase(knowledgeBase)) {
    const terms = [entry.standardKeyword].concat(entry.aliases || []);
    const matchedAliases = terms.filter((term) => term && text.includes(term));
    if (matchedAliases.length) {
      matches.push({
        id: entry.id,
        domain: entry.domain,
        topic: entry.topic,
        standardKeyword: entry.standardKeyword,
        matchedAliases: [...new Set(matchedAliases)],
        riskLevel: entry.riskLevel || "medium",
        owner: entry.owner || "",
        suggestion: entry.suggestion || "",
      });
    }
  }
  return matches;
}

function extractKnowledgeKeywords(content, knowledgeBase = loadKnowledgeBase()) {
  return [...new Set(matchKnowledge(content, knowledgeBase).map((item) => item.standardKeyword))];
}

module.exports = {
  loadKnowledgeBase,
  activeKnowledgeBase,
  matchKnowledge,
  extractKnowledgeKeywords,
  KNOWLEDGE_PATH,
};
