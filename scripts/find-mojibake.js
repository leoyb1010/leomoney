const fs = require('fs');
const path = require('path');

const root = process.cwd();
const patterns = [/鈥/g, /馃/g, /锛/g, /涓/g, /鐨/g, /鍙/g, /鏃/g];
const extensions = new Set(['.js', '.html', '.css', '.md', '.json']);

function walk(dir, hits) {
  for (const item of fs.readdirSync(dir)) {
    const filePath = path.join(dir, item);
    if (
      filePath.includes(`${path.sep}node_modules${path.sep}`) ||
      filePath.includes(`${path.sep}.git${path.sep}`) ||
      filePath.includes(`${path.sep}data${path.sep}`)
    ) continue;
    if (filePath.endsWith(path.join('scripts', 'find-mojibake.js'))) continue;
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      walk(filePath, hits);
      continue;
    }
    if (!extensions.has(path.extname(filePath))) continue;
    const text = fs.readFileSync(filePath, 'utf8');
    const count = patterns.reduce((sum, pattern) => sum + (text.match(pattern) || []).length, 0);
    if (count > 0) hits.push({ filePath, count });
  }
}

const hits = [];
walk(root, hits);
hits.sort((a, b) => b.count - a.count);
for (const hit of hits) {
  console.log(`${hit.count}\t${path.relative(root, hit.filePath)}`);
}
if (hits.length) {
  process.exitCode = 1;
}
