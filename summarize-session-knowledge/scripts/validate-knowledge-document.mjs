#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Patterns that are almost certainly conversation meta-text when they
// appear in the document body (outside fenced code blocks).
const HARD_META_PATTERNS = [
  /The user wants me/i,
  /深度思考/,
  /用户(?:希望|要求)我/,
  /让我先/,
  /我接下来/,
  /我无法(?:直接)?创建文件/,
  /请复制以下内容/,
  /作为 AI/,
  /进入计划模式/,
  /token 管理/,
  /调用 agent/
];

// Patterns that *might* be legitimate technical terms; report as warning
// so a human can judge whether they are real meta-text or a valid concept.
const SOFT_META_PATTERNS = [
  /\bWait\b/i,
  /\bthinking\b/i,
  /工具调用/,
  /权限模式/,
  /当前上下文/
];

// Secret shapes.  The matched value is NEVER echoed — only the type label
// and line number are reported.
const SECRET_PATTERNS = [
  { type: 'private key block', pattern: /-----BEGIN (?:RSA )?PRIVATE KEY-----/ },
  { type: 'AWS access key ID', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { type: 'GitHub personal access token', pattern: /\bghp_[A-Za-z0-9]{36}\b/ },
  { type: 'GitHub OAuth token', pattern: /\bgho_[A-Za-z0-9]{36}\b/ },
  { type: 'OpenAI API key', pattern: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { type: 'Slack token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  {
    type: 'credential assignment',
    pattern: /(?:api_key|api_token|secret|password|passwd|access_token|refresh_token|private_key)\s*[:=]\s*["']?[A-Za-z0-9+/=_-]{16,}["']?/i
  }
];

const CDN_DEPENDENCIES = [
  {
    name: 'Mermaid',
    anyVersion: /cdn\.jsdelivr\.net\/npm\/mermaid@/i,
    pinnedVersion: /cdn\.jsdelivr\.net\/npm\/mermaid@11\.12\.0\//i
  },
  {
    name: 'svg-pan-zoom',
    anyVersion: /cdn\.jsdelivr\.net\/npm\/svg-pan-zoom@/i,
    pinnedVersion: /cdn\.jsdelivr\.net\/npm\/svg-pan-zoom@3\.6\.2\//i
  },
  {
    name: 'Prism',
    anyVersion: /cdn\.jsdelivr\.net\/npm\/prismjs@/i,
    pinnedVersion: /cdn\.jsdelivr\.net\/npm\/prismjs@1\.29\.0\//i
  }
];

function issue(severity, code, message, line = null) {
  return { severity, code, message, line };
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split('\n').length;
}

// ── Markdown helpers ───────────────────────────────────────────────

function countTableColumns(row) {
  const parts = row.split('|');
  if (parts[0].trim() === '') parts.shift();
  if (parts.length > 0 && parts[parts.length - 1].trim() === '') parts.pop();
  return parts.length;
}

function isTableSeparator(row) {
  const trimmed = row.trim();
  if (!/^\|/.test(trimmed)) return false;
  return /^\|[\s:|-]+\|?\s*$/.test(trimmed) && /-/.test(trimmed);
}

function checkTableColumns(outsideLines, issues) {
  let i = 0;
  while (i < outsideLines.length) {
    if (!/^\s*\|/.test(outsideLines[i].line)) { i++; continue; }

    const group = [];
    while (i < outsideLines.length && /^\s*\|/.test(outsideLines[i].line)) {
      group.push(outsideLines[i]);
      i++;
    }
    if (group.length < 2) continue;

    const separator = group.find((g) => isTableSeparator(g.line));
    if (!separator) continue;

    const expected = countTableColumns(separator.line);
    group.forEach((row) => {
      if (row === separator) return;
      const cols = countTableColumns(row.line);
      if (cols !== expected) {
        issues.push(issue('error', 'MD006', `Table row has ${cols} columns but separator defines ${expected}.`, row.number));
      }
    });
  }
}

// ── Markdown validation ─────────────────────────────────────────────

function validateMarkdown(source, filePath) {
  const issues = [];
  const lines = source.split(/\r?\n/);

  // Track fence state so meta-text checks skip fenced teaching examples.
  let fence = null;
  const outsideLines = [];   // {line, number} outside fences
  const fencedBlocks = [];   // {startLine, endLine, info, content}

  lines.forEach((line, index) => {
    const number = index + 1;
    const open = line.match(/^\s*(`{3,}|~{3,})(.*)$/);
    if (open) {
      const marker = open[1][0];
      if (!fence) {
        const info = open[2].trim();
        fence = { marker, info, line: number, startIndex: index };
        if (!info) {
          issues.push(issue('error', 'MD002', `Opening code fence at line ${number} must declare a language.`, number));
        }
      } else if (fence.marker === marker) {
        fencedBlocks.push({
          startLine: fence.line,
          endLine: number,
          info: fence.info,
          content: lines.slice(fence.startIndex + 1, index).join('\n')
        });
        fence = null;
      }
      return;
    }
    if (!fence) outsideLines.push({ line, number });
  });

  if (fence) {
    issues.push(issue('error', 'MD004', `Unclosed ${fence.marker} code fence opened at line ${fence.line}.`, fence.line));
  }

  // MD001 — exactly one H1 outside fences
  const h1Outside = outsideLines.filter(({ line }) => /^#\s+/.test(line));
  if (h1Outside.length !== 1) {
    issues.push(issue('error', 'MD001', `Markdown must contain exactly one level-one heading; found ${h1Outside.length}.`));
  }

  // MD003 — heading level jumps (outside fences)
  let previousLevel = 0;
  outsideLines.forEach(({ line, number }) => {
    const heading = line.match(/^(#{1,6})\s+/);
    if (heading) {
      const level = heading[1].length;
      if (level > previousLevel + 1 && previousLevel !== 0) {
        issues.push(issue('error', 'MD003', `Heading level jumps from ${previousLevel} to ${level}.`, number));
      }
      previousLevel = level;
    }
  });

  // MD007 — fenced block that looks like a complete nested document
  fencedBlocks.forEach((block) => {
    if (/^#\s+/.test(block.content.trim())) {
      issues.push(issue('warning', 'MD007', `Fenced block at line ${block.startLine} appears to contain a complete Markdown document (starts with a level-1 heading).`, block.startLine));
    }
  });

  // CONTENT001 — hard meta-text in body → error; soft → warning
  outsideLines.forEach(({ line, number }) => {
    HARD_META_PATTERNS.forEach((pattern) => {
      if (pattern.test(line)) {
        issues.push(issue('error', 'CONTENT001', `Conversation meta-text in document body: ${pattern}.`, number));
      }
    });
    SOFT_META_PATTERNS.forEach((pattern) => {
      if (pattern.test(line)) {
        issues.push(issue('warning', 'CONTENT001', `Possible conversation meta-text: ${pattern}.`, number));
      }
    });
  });

  // CONTENT002 — absolute paths (warning, all lines)
  const absolutePath = /(?:[A-Za-z]:\\|\/Users\/|\/home\/|\\Users\\)/;
  lines.forEach((line, index) => {
    if (absolutePath.test(line)) {
      issues.push(issue('warning', 'CONTENT002', 'Absolute local path should be removed or marked as necessary project evidence.', index + 1));
    }
  });

  // CONTENT003 — secret detection (error, all lines including fences)
  // Never echo the matched value — only report type and position.
  lines.forEach((line, index) => {
    SECRET_PATTERNS.forEach(({ type, pattern }) => {
      if (pattern.test(line)) {
        issues.push(issue('error', 'CONTENT003', `Possible secret detected (${type}) at line ${index + 1}. Remove the value or replace with a placeholder; never echo secrets.`, index + 1));
      }
    });
  });

  // CONTENT004 — no substantive knowledge content
  const substantive = outsideLines.filter(({ line }) => {
    const trimmed = line.trim();
    if (trimmed === '') return false;
    if (/^(#{1,6})\s+/.test(line)) return false;
    if (HARD_META_PATTERNS.some((p) => p.test(line))) return false;
    return true;
  });
  if (substantive.length === 0) {
    issues.push(issue('error', 'CONTENT004', 'Document has no substantive knowledge content outside headings, code fences and meta-text; do not generate empty knowledge documents from process-only or empty input.'));
  }

  // MD005 — broken relative links (outside fences)
  if (filePath) {
    const dir = path.dirname(filePath);
    outsideLines.forEach(({ line, number }) => {
      for (const match of line.matchAll(/\[[^\]]+\]\(([^)#]+)(?:#[^)]+)?\)/g)) {
        const target = match[1];
        if (/^(?:https?:|mailto:)/.test(target)) continue;
        if (!fs.existsSync(path.resolve(dir, target))) {
          issues.push(issue('error', 'MD005', `Relative link target does not exist: ${target}.`, number));
        }
      }
    });
  }

  // MD006 — table column mismatch
  checkTableColumns(outsideLines, issues);

  return { filePath, format: 'markdown', issues };
}

// ── HTML helpers ───────────────────────────────────────────────────

function hasClass(tag, className) {
  const classes = tag.match(/\bclass\s*=\s*["']([^"']*)["']/i)?.[1] || '';
  return classes.split(/\s+/).includes(className);
}

function allTags(source, name) {
  return [...source.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map((match) => ({
    raw: match[0],
    index: match.index ?? 0
  }));
}

// ── HTML validation ────────────────────────────────────────────────

function validateHtml(source, filePath) {
  const issues = [];
  if (!/^\s*<!doctype html>/i.test(source)) issues.push(issue('error', 'HTML001', 'HTML must start with a doctype.'));
  if (!/<html\b[^>]*\blang\s*=\s*["'][^"']+["']/i.test(source)) issues.push(issue('error', 'HTML002', 'HTML must declare a document language.'));
  if (!/<meta\b[^>]*charset\s*=\s*["']?utf-8/i.test(source)) issues.push(issue('error', 'HTML003', 'HTML must declare UTF-8.'));
  if (!/<meta\b[^>]*name\s*=\s*["']viewport["']/i.test(source)) issues.push(issue('error', 'HTML004', 'HTML must include a viewport meta tag.'));
  if (!/<aside\b[^>]*\bclass\s*=\s*["'][^"']*sidebar/i.test(source) || !/<nav\b[^>]*\bclass\s*=\s*["'][^"']*toc/i.test(source)) {
    issues.push(issue('error', 'HTML005', 'HTML must contain an aside.sidebar > nav.toc table of contents.'));
  }
  if (!/<main\b[^>]*\bclass\s*=\s*["'][^"']*content/i.test(source)) issues.push(issue('error', 'HTML006', 'HTML must contain main.content.'));

  const headings = [...source.matchAll(/<h([1-6])\b[^>]*\bid\s*=\s*["']([^"']+)["'][^>]*>/gi)];
  const headingIds = new Set(headings.map((match) => match[2]));
  const tocHrefs = [...source.matchAll(/<a\b[^>]*\bhref\s*=\s*["']#([^"']+)["'][^>]*>/gi)].map((match) => match[1]);
  tocHrefs.forEach((id, index) => {
    if (!headingIds.has(id)) issues.push(issue('error', 'HTML007', `TOC link #${id} has no matching heading id.`, lineNumberAt(source, source.indexOf(tocHrefs[index]))));
  });
  if (new Set(headings.map((match) => match[2])).size !== headings.length) issues.push(issue('error', 'HTML008', 'Heading IDs must be unique.'));

  const mermaidBlocks = allTags(source, 'div').filter((tag) => hasClass(tag.raw, 'mermaid'));
  if (mermaidBlocks.length > 0) {
    if (!/mermaid@11\.12\.0/i.test(source)) issues.push(issue('error', 'HTML009', 'Mermaid CDN must use the pinned 11.12.0 version.'));
    if (!/securityLevel\s*:\s*["']strict["']/i.test(source)) issues.push(issue('error', 'HTML010', 'Mermaid must use securityLevel strict.'));
    if (!/await\s+window\.mermaid\.run|await\s+mermaid\.run/i.test(source)) issues.push(issue('error', 'HTML011', 'Mermaid rendering must await mermaid.run.'));
    if (!/mermaidSources|textContent\.trim\(\)/i.test(source)) issues.push(issue('error', 'HTML012', 'Mermaid source should be preserved before re-rendering.'));
  }

  const codeBlocks = [...source.matchAll(/<pre\b[\s\S]*?<code\b([^>]*)>[\s\S]*?<\/code>\s*<\/pre>/gi)];
  if (codeBlocks.length > 0) {
    if (!/prismjs@1\.29\.0/i.test(source)) issues.push(issue('error', 'HTML013', 'Prism CDN must use the pinned 1.29.0 version.'));
    codeBlocks.forEach((match) => {
      if (!/\blanguage-[\w-]+\b/i.test(match[1])) {
        issues.push(issue('error', 'HTML014', 'Every multiline code block must declare a language-* class.', lineNumberAt(source, match.index ?? 0)));
      }
    });
  }

  const complexContainers = [...source.matchAll(/<[^>]*\bclass\s*=\s*["'][^"']*pan-zoom-container[^"']*["'][^>]*>/gi)];
  if (complexContainers.length > 0) {
    if (!/svg-pan-zoom@3\.6\.2/i.test(source)) issues.push(issue('error', 'HTML015', 'Complex diagrams require the pinned svg-pan-zoom 3.6.2 CDN.'));
    if (!/destroyPanZoom\s*\(/i.test(source) || !/initPanZoom\s*\(/i.test(source)) issues.push(issue('error', 'HTML016', 'Complex diagrams require pan/zoom destroy and initialization lifecycle.'));
    const actions = ['in', 'out', 'reset'];
    if (!actions.every((action) => new RegExp(`data-zoom-action=["']${action}["']`, 'i').test(source))) {
      issues.push(issue('error', 'HTML017', 'Complex diagrams require zoom-in, zoom-out and reset controls.'));
    }
  }

  if (/<script\b[^>]*src\s*=\s*["'][^"']*(?:latest|\/npm\/(?:mermaid|prismjs|svg-pan-zoom)(?:\/|["']))/i.test(source)) {
    issues.push(issue('error', 'HTML018', 'External JavaScript dependencies must use fixed versions.'));
  }

  const dangerousMarkup = /<script\b|\bon(?:click|load|error)\s*=|javascript:/i;
  const bodyWithoutScripts = source.replace(/<script\b[\s\S]*?<\/script>/gi, '');
  if (dangerousMarkup.test(bodyWithoutScripts)) issues.push(issue('error', 'HTML019', 'Document content contains executable markup; escape input data.'));

  if (/\.sidebar\s*\{[^}]*position\s*:\s*fixed/i.test(source)) {
    issues.push(issue('warning', 'HTML020', 'Prefer the asset sticky/grid layout unless a fixed sidebar is proven not to cover content.'));
  }

  CDN_DEPENDENCIES.forEach((dependency) => {
    if (dependency.anyVersion.test(source) && !dependency.pinnedVersion.test(source)) {
      issues.push(issue('warning', 'HTML021', `${dependency.name} CDN does not match the skill's pinned version.`));
    }
  });

  // CONTENT003 — secret detection in HTML (all text)
  const lines = source.split(/\r?\n/);
  lines.forEach((line, index) => {
    SECRET_PATTERNS.forEach(({ type, pattern }) => {
      if (pattern.test(line)) {
        issues.push(issue('error', 'CONTENT003', `Possible secret detected (${type}) at line ${index + 1}. Remove the value or replace with a placeholder; never echo secrets.`, index + 1));
      }
    });
  });

  return { filePath, format: 'html', issues };
}

// ── Delivery status ────────────────────────────────────────────────

export function computeStatus(report) {
  const hasErrors = report.issues.some((i) => i.severity === 'error');
  const staticStatus = hasErrors ? 'fail' : 'pass';
  let deliveryStatus;
  if (hasErrors) {
    deliveryStatus = 'fail';
  } else if (report.format === 'html') {
    // A static checker cannot prove browser verification was performed.
    // HTML documents require real browser verification before claiming "pass".
    deliveryStatus = 'unverified';
  } else {
    deliveryStatus = 'pass';
  }
  return { static_status: staticStatus, delivery_status: deliveryStatus };
}

// ── Public API ──────────────────────────────────────────────────────

export function validateDocument(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  return filePath.toLowerCase().endsWith('.html')
    ? validateHtml(source, filePath)
    : validateMarkdown(source, filePath);
}

function printReport(report) {
  const errors = report.issues.filter((item) => item.severity === 'error');
  const warnings = report.issues.filter((item) => item.severity === 'warning');
  const status = computeStatus(report);
  console.log(`${report.filePath}: ${report.format}; ${errors.length} error(s), ${warnings.length} warning(s); static=${status.static_status}, delivery=${status.delivery_status}`);
  report.issues.forEach((item) => {
    const location = item.line ? `:${item.line}` : '';
    console.log(`- ${item.severity.toUpperCase()} ${item.code}${location}: ${item.message}`);
  });
  return errors.length === 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const files = args.filter((a) => a !== '--json');

  if (files.length === 0) {
    console.error('Usage: node scripts/validate-knowledge-document.mjs [--json] <document> [...documents]');
    process.exitCode = 2;
  } else if (jsonMode) {
    const reports = files.map((filePath) => {
      const report = validateDocument(filePath);
      const status = computeStatus(report);
      return {
        filePath: report.filePath,
        format: report.format,
        static_status: status.static_status,
        delivery_status: status.delivery_status,
        issues: report.issues
      };
    });
    console.log(JSON.stringify(reports, null, 2));
    process.exitCode = reports.every((r) => r.static_status === 'pass') ? 0 : 1;
  } else {
    const passed = files.every((filePath) => printReport(validateDocument(filePath)));
    process.exitCode = passed ? 0 : 1;
  }
}
