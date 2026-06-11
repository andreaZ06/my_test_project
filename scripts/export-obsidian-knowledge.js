const fs = require("fs");
const path = require("path");
const { loadKnowledgeBase, loadObsidianInventory } = require("../backend/keyword-knowledge");

const root = path.resolve(__dirname, "..");
const outputPath = path.join(root, "data", "keyword-knowledge.json");

const payload = {
  exportedAt: new Date().toISOString(),
  source: "obsidian-vault",
  inventory: loadObsidianInventory(),
  entries: loadKnowledgeBase(),
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

console.log(`Exported ${payload.entries.length} Obsidian knowledge entries to ${path.relative(root, outputPath)}`);
