const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const outDirs = [path.join(root, "dist"), path.join(root, "public")];
const files = ["index.html", "styles.css", "app.js", "README.md"];

for (const outDir of outDirs) {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  for (const file of files) {
    fs.copyFileSync(path.join(root, file), path.join(outDir, file));
  }
}

console.log(`Copied ${files.length} static files to ${outDirs.map((dir) => path.relative(root, dir)).join(" and ")}`);
