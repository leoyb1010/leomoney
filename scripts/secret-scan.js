#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'data']);
const SKIP_FILES = new Set(['package-lock.json', 'screenshot.png']);
const TEXT_EXTENSIONS = new Set([
  '.js', '.json', '.md', '.html', '.css', '.yml', '.yaml', '.txt', '.env', '.example',
]);

const PATTERNS = [
  { name: 'OpenAI-style API key', re: /\bsk-[A-Za-z0-9][A-Za-z0-9_-]{20,}\b/g },
  { name: 'DeepSeek-style API key', re: /\bsk-[a-f0-9]{32,}\b/gi },
  { name: 'Private key block', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g },
  { name: 'Assigned secret env var', re: /\b(?:LLM_API_KEY|OPENAI_API_KEY|DEEPSEEK_API_KEY|SEARCH_API_KEY)[^\S\r\n]*=[^\S\r\n]*["']?([^"'\s#\r\n]{12,})/g },
];

const ALLOWLIST = [
  'your-api-key',
  'sk-your-key',
  'placeholder',
  'example',
  'changeme',
];

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(fullPath, files);
    else files.push(fullPath);
  }
  return files;
}

function isTextFile(file) {
  if (SKIP_FILES.has(path.basename(file))) return false;
  return TEXT_EXTENSIONS.has(path.extname(file)) || path.basename(file).includes('.env');
}

function isAllowed(match) {
  const normalized = String(match).toLowerCase();
  return ALLOWLIST.some(token => normalized.includes(token));
}

function scanFile(file) {
  const content = fs.readFileSync(file, 'utf8');
  const findings = [];
  for (const pattern of PATTERNS) {
    pattern.re.lastIndex = 0;
    let match;
    while ((match = pattern.re.exec(content)) !== null) {
      const value = match[1] || match[0];
      if (isAllowed(value)) continue;
      const line = content.slice(0, match.index).split('\n').length;
      findings.push({ file, line, name: pattern.name });
    }
  }
  return findings;
}

const findings = walk(ROOT)
  .filter(isTextFile)
  .flatMap(scanFile);

if (findings.length > 0) {
  console.error('Secret scan failed:');
  for (const finding of findings) {
    console.error(`- ${path.relative(ROOT, finding.file)}:${finding.line} ${finding.name}`);
  }
  process.exit(1);
}

console.log('Secret scan passed: no high-confidence secrets found.');
