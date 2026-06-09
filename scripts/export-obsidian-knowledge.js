const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const keywordDir = path.join(root, "obsidian-vault", "02-keywords");
const outputPath = path.join(root, "data", "keyword-knowledge.json");

function parseFrontmatter(markdown) {
  const match = String(markdown).match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const lines = match[1].split(/\r?\n/);
  const data = {};
  let activeKey = "";

  for (const line of lines) {
    const listMatch = line.match(/^\s*-\s+(.*)$/);
    if (listMatch && activeKey) {
      if (!Array.isArray(data[activeKey])) data[activeKey] = [];
      data[activeKey].push(listMatch[1].trim());
      continue;
    }

    const pairMatch = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!pairMatch) continue;

    const [, key, rawValue] = pairMatch;
    activeKey = key;
    if (!rawValue) {
      data[key] = [];
      continue;
    }
    data[key] = rawValue === "true" ? true : rawValue === "false" ? false : rawValue.trim();
  }
  return data;
}

function extractSuggestion(markdown) {
  const match = String(markdown).match(/##\s*处置建议\s*([\s\S]*?)(\n##\s|$)/);
  return match ? match[1].trim().replace(/\r?\n+/g, " ") : "";
}

const entries = fs.readdirSync(keywordDir)
  .filter((file) => file.endsWith(".md"))
  .map((file) => {
    const markdown = fs.readFileSync(path.join(keywordDir, file), "utf8");
    const frontmatter = parseFrontmatter(markdown);
    if (!frontmatter) return null;
    return {
      ...frontmatter,
      aliases: Array.isArray(frontmatter.aliases) ? frontmatter.aliases : [],
      graphTags: Array.isArray(frontmatter.graphTags) ? frontmatter.graphTags : [],
      suggestion: frontmatter.suggestion || extractSuggestion(markdown),
      enabled: frontmatter.enabled !== false,
    };
  })
  .filter(Boolean)
  .sort((a, b) => String(a.id).localeCompare(String(b.id)));

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
console.log(`Exported ${entries.length} Obsidian keyword entries to ${path.relative(root, outputPath)}`);
