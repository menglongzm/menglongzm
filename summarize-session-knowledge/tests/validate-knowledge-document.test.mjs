import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateDocument, computeStatus } from '../scripts/validate-knowledge-document.mjs';

const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'knowledge-validator-'));
const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(here, 'fixtures');

function writeFixture(name, source) {
  const filePath = path.join(testDirectory, name);
  fs.writeFileSync(filePath, source, 'utf8');
  return filePath;
}

function codes(report, severity = 'error') {
  return report.issues.filter((item) => item.severity === severity).map((item) => item.code);
}

function stripFencedBlocks(source) {
  let fence = null;
  return source.split(/\r?\n/).filter((line) => {
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (marker && !fence) {
      fence = marker[1][0];
      return false;
    }
    if (marker && fence === marker[1][0]) {
      fence = null;
      return false;
    }
    return fence === null;
  }).join('\n');
}

// ── Documentation reference checks ──────────────────────────────────

test('documentation references resolve outside example fences', () => {
  const root = path.resolve(here, '..');
  const documents = [
    'SKILL.md',
    'references/content-selection-protocol.md',
    'references/knowledge-document-template.md',
    'references/visualization-protocol.md'
  ];
  const missing = [];

  documents.forEach((relativePath) => {
    const filePath = path.join(root, relativePath);
    const source = stripFencedBlocks(fs.readFileSync(filePath, 'utf8'));
    for (const match of source.matchAll(/\[[^\]]+\]\(([^)#]+)(?:#[^)]+)?\)/g)) {
      const target = match[1];
      if (/^(?:https?:|mailto:)/.test(target)) continue;
      if (!fs.existsSync(path.resolve(path.dirname(filePath), target))) {
        missing.push(`${relativePath} -> ${target}`);
      }
    }
  });

  assert.deepEqual(missing, []);
});

// ── Clean document acceptance ──────────────────────────────────────

test('accepts a clean Markdown learning note', () => {
  const filePath = writeFixture('clean.md', `# Stream 学习梳理

## 一句话定位

Stream 用于声明数据处理流水线。

## 示例

\`\`\`java
var result = values.stream().filter(value -> value > 0).toList();
\`\`\`
`);

  const report = validateDocument(filePath);
  assert.deepEqual(codes(report), []);
});

// ── Structure and meta-text ────────────────────────────────────────

test('reports Markdown structure and conversation meta-text as error', () => {
  const filePath = writeFixture('contaminated.md', `# 标题一
# 标题二

The user wants me to summarize this.

Stream 是数据处理流水线。

### 跳级标题

\`\`\`text
not closed
`);

  const report = validateDocument(filePath);
  assert.ok(codes(report).includes('MD001'));
  assert.ok(codes(report).includes('MD003'));
  assert.ok(codes(report).includes('MD004'));
  assert.ok(codes(report).includes('CONTENT001'));
});

// ── HTML asset and structure ────────────────────────────────────────

test('accepts the reusable HTML asset', () => {
  const assetPath = path.resolve(here, '../assets/knowledge-document.html');
  const report = validateDocument(assetPath);
  assert.deepEqual(codes(report), []);
});

test('reports missing HTML structure and code language', () => {
  const filePath = writeFixture('missing-structure.html', `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>测试</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism.css">
  <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-core.min.js"></script>
</head>
<body>
  <main><h1 id="title">测试</h1><pre><code>const answer = 42;</code></pre></main>
</body>
</html>`);

  const report = validateDocument(filePath);
  assert.ok(codes(report).includes('HTML005'));
  assert.ok(codes(report).includes('HTML006'));
  assert.ok(codes(report).includes('HTML014'));
});

test('does not require Prism or svg-pan-zoom for a Mermaid-only document', () => {
  const filePath = writeFixture('mermaid-only.html', `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>状态图</title>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@11.12.0/dist/mermaid.min.js"></script>
</head>
<body>
  <aside class="sidebar"><nav class="toc"><a href="#state">状态</a></nav></aside>
  <main class="content"><h1 id="state">状态</h1><div class="mermaid" id="state-map">stateDiagram-v2</div></main>
  <script>
    var mermaidSources = new Map([['state-map', 'stateDiagram-v2']]);
    mermaid.initialize({ securityLevel: 'strict' });
    async function render() { await mermaid.run({ nodes: document.querySelectorAll('.mermaid') }); }
  </script>
</body>
</html>`);

  const report = validateDocument(filePath);
  assert.deepEqual(codes(report, 'warning'), []);
});

test('reports missing pan and zoom lifecycle for a complex diagram', () => {
  const filePath = writeFixture('broken-complex.html', `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>复杂图</title>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@11.12.0/dist/mermaid.min.js"></script>
</head>
<body>
  <aside class="sidebar"><nav class="toc"><a href="#map">关系图</a></nav></aside>
  <main class="content">
    <h1 id="map">关系图</h1>
    <div class="pan-zoom-container"><div class="mermaid">flowchart LR; A--&gt;B</div></div>
  </main>
  <script>
    var mermaidSources = new Map();
    mermaid.initialize({ securityLevel: 'strict' });
    async function render() { await mermaid.run({ nodes: document.querySelectorAll('.mermaid') }); }
  </script>
</body>
</html>`);

  const report = validateDocument(filePath);
  assert.ok(codes(report).includes('HTML015'));
  assert.ok(codes(report).includes('HTML016'));
  assert.ok(codes(report).includes('HTML017'));
});

// ── Fixture-driven boundary tests ──────────────────────────────────

test('fixture: meta-text in body is a hard error (CONTENT001)', () => {
  const filePath = path.join(fixturesDir, 'meta-text-in-body.md');
  const report = validateDocument(filePath);
  const errors = codes(report);
  assert.ok(errors.includes('CONTENT001'), `expected CONTENT001 error, got: ${JSON.stringify(report.issues)}`);
});

test('fixture: meta-text inside fenced block does NOT trigger CONTENT001', () => {
  const filePath = path.join(fixturesDir, 'meta-text-in-fence-ok.md');
  const report = validateDocument(filePath);
  const metaIssues = report.issues.filter((i) => i.code === 'CONTENT001');
  assert.equal(metaIssues.length, 0, `fenced meta-text should not trigger CONTENT001, got: ${JSON.stringify(metaIssues)}`);
});

test('fixture: secret detection fires CONTENT003 without echoing the value', () => {
  const filePath = path.join(fixturesDir, 'secret-detection.md');
  const report = validateDocument(filePath);
  const secretIssues = report.issues.filter((i) => i.code === 'CONTENT003');
  assert.ok(secretIssues.length > 0, 'expected at least one CONTENT003');
  // The secret value must never appear in the issue message.
  secretIssues.forEach((i) => {
    assert.ok(!/sk-1234567890abcdefghijkl/.test(i.message), 'secret value leaked in message');
  });
});

test('fixture: nested complete document triggers MD007 warning', () => {
  const filePath = path.join(fixturesDir, 'nested-complete-doc.md');
  const report = validateDocument(filePath);
  const md007 = report.issues.filter((i) => i.code === 'MD007');
  assert.ok(md007.length > 0, 'expected MD007 for nested complete document');
});

test('fixture: broken relative link triggers MD005', () => {
  const filePath = path.join(fixturesDir, 'broken-relative-link.md');
  const report = validateDocument(filePath);
  const md005 = report.issues.filter((i) => i.code === 'MD005');
  assert.ok(md005.length > 0, 'expected MD005 for broken relative link');
});

test('fixture: table column mismatch triggers MD006', () => {
  const filePath = path.join(fixturesDir, 'table-column-mismatch.md');
  const report = validateDocument(filePath);
  const md006 = report.issues.filter((i) => i.code === 'MD006');
  assert.ok(md006.length > 0, 'expected MD006 for table column mismatch');
});

test('fixture: empty/process-only document triggers CONTENT004', () => {
  const filePath = path.join(fixturesDir, 'empty-process-only.md');
  const report = validateDocument(filePath);
  const content004 = report.issues.filter((i) => i.code === 'CONTENT004');
  assert.ok(content004.length > 0, 'expected CONTENT004 for empty/process-only document');
});

test('fixture: absolute path is a warning (CONTENT002), not an error', () => {
  const filePath = path.join(fixturesDir, 'absolute-path-project-evidence.md');
  const report = validateDocument(filePath);
  const warnings = codes(report, 'warning');
  const errors = codes(report);
  assert.ok(warnings.includes('CONTENT002'), 'expected CONTENT002 warning');
  assert.ok(!errors.includes('CONTENT002'), 'CONTENT002 should not be an error');
});

// ── Delivery status ────────────────────────────────────────────────

test('delivery status: Markdown pass = pass, HTML pass = unverified', () => {
  const mdPath = writeFixture('status-md.md', `# Test

Stream 是数据处理流水线。
`);
  const mdReport = validateDocument(mdPath);
  const mdStatus = computeStatus(mdReport);
  assert.equal(mdStatus.static_status, 'pass');
  assert.equal(mdStatus.delivery_status, 'pass');

  const htmlPath = path.resolve(here, '../assets/knowledge-document.html');
  const htmlReport = validateDocument(htmlPath);
  const htmlStatus = computeStatus(htmlReport);
  assert.equal(htmlStatus.static_status, 'pass');
  assert.equal(htmlStatus.delivery_status, 'unverified');
});

test('delivery status: errors produce fail', () => {
  const filePath = path.join(fixturesDir, 'meta-text-in-body.md');
  const report = validateDocument(filePath);
  const status = computeStatus(report);
  assert.equal(status.static_status, 'fail');
  assert.equal(status.delivery_status, 'fail');
});
