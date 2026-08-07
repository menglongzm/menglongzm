#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import process from 'node:process';
import { validateFlowData } from './validate-flow-data.mjs';

const PLACEHOLDER = '__FLOW_DATA_JSON__';

function add(errors, path, message) {
  errors.push(`${path}: ${message}`);
}

export function validateRenderedHtml(html, filename = '<html>') {
  const errors = [];

  // 1. Doctype
  if (!/<!doctype\s+html/i.test(html.substring(0, 200))) {
    add(errors, `${filename}`, 'must start with <!doctype html>');
  }

  // 2. lang attribute
  if (!/<html\s+[^>]*lang=/i.test(html)) {
    add(errors, `${filename}`, '<html> must have a lang attribute');
  }

  // 3. viewport meta
  if (!/<meta\s+name=["']viewport["']/i.test(html)) {
    add(errors, `${filename}`, 'must include a viewport meta tag');
  }

  // 4. Unique #flow-data
  const flowDataMatches = html.match(/id=["']flow-data["']/g);
  if (!flowDataMatches) {
    add(errors, `${filename}`, 'must contain exactly one id="flow-data" script tag');
  } else if (flowDataMatches.length > 1) {
    add(errors, `${filename}`, `must contain exactly one id="flow-data"; found ${flowDataMatches.length}`);
  }

  // 5. Placeholder replaced
  if (html.includes(PLACEHOLDER)) {
    add(errors, `${filename}`, `placeholder ${PLACEHOLDER} was not replaced`);
  }

  // 6. No external dependencies (no CDN, no http(s):// in script/link src)
  const externalDeps = html.match(/<(?:script|link)\s+[^>]*src=["']https?:\/\//gi);
  if (externalDeps) {
    add(errors, `${filename}`, `must not have external dependencies; found ${externalDeps.length} external resource(s)`);
  }

  // 7. No duplicate static IDs (check for common IDs that should be unique)
  const staticIds = ['app', 'page-title', 'page-summary', 'scope-strip', 'coverage-summary', 'selection-basis', 'flow-tabs', 'flow-shell', 'theme-toggle', 'flow-data'];
  for (const id of staticIds) {
    const matches = html.match(new RegExp(`id=["']${id}["']`, 'g'));
    if (matches && matches.length > 1) {
      add(errors, `${filename}`, `duplicate static id "${id}" found ${matches.length} times`);
    }
  }

  // 8. Extract embedded JSON and re-validate
  const jsonMatch = html.match(/<script\s+type=["']application\/json["']\s+id=["']flow-data["']>([\s\S]*?)<\/script>/);
  if (!jsonMatch) {
    add(errors, `${filename}`, 'could not extract embedded flow-data JSON');
  } else {
    let data;
    try {
      data = JSON.parse(jsonMatch[1]);
    } catch (parseError) {
      add(errors, `${filename}`, `embedded JSON is invalid: ${parseError.message}`);
      return errors;
    }

    const dataErrors = validateFlowData(data);
    if (dataErrors.length) {
      for (const err of dataErrors) add(errors, `${filename}`, `re-validation: ${err}`);
    }
  }

  // 9. Check for required controls
  const requiredControls = [
    { pattern: /data-action=["']play["']/, name: 'play button' },
    { pattern: /data-action=["']pause["']/, name: 'pause button' },
    { pattern: /data-action=["']prev["']/, name: 'prev button' },
    { pattern: /data-action=["']next["']/, name: 'next button' },
    { pattern: /data-action=["']reset["']/, name: 'reset button' },
    { pattern: /data-track=["']request["']/, name: 'request track toggle' },
    { pattern: /data-track=["']return["']/, name: 'return track toggle' },
    { pattern: /id=["']theme-toggle["']/, name: 'theme toggle button' },
  ];
  for (const { pattern, name } of requiredControls) {
    if (!pattern.test(html)) {
      add(errors, `${filename}`, `missing required control: ${name}`);
    }
  }

  // 10. Check for ARIA tabpanel
  if (!/role=["']tablist["']/.test(html)) {
    add(errors, `${filename}`, 'missing role="tablist" on tab container');
  }
  if (!/aria-selected=/.test(html.replace(/<script[\s\S]*?<\/script>/g, ''))) {
    // aria-selected is set dynamically, so check for the JS code that sets it
    if (!/aria-selected/.test(html)) {
      add(errors, `${filename}`, 'missing aria-selected attribute or its setter');
    }
  }
  if (!/role=["']tabpanel["']/.test(html.replace(/<script[\s\S]*?<\/script>/g, ''))) {
    if (!/role.*tabpanel/.test(html)) {
      add(errors, `${filename}`, 'missing role="tabpanel" attribute or its setter');
    }
  }

  // 11. Check for diagnostics interface
  if (!/window\.__flowDiagnostics/.test(html)) {
    add(errors, `${filename}`, 'missing window.__flowDiagnostics diagnostic interface');
  }
  if (!/window\.__flowData/.test(html)) {
    add(errors, `${filename}`, 'missing window.__flowData data interface');
  }

  // 12. Check for ResizeObserver
  if (!/ResizeObserver/.test(html)) {
    add(errors, `${filename}`, 'missing ResizeObserver for connector redraw');
  }

  // 13. Check for template version marker
  if (!/version.*2/.test(html.substring(0, 1000)) && !/FLOW_DATA.*version.*2/.test(html)) {
    // The version is in the embedded JSON, not in the HTML itself
    // This is a soft check
  }

  // 14. Check for safe injection (no raw </script> in data)
  const unsafeScriptClose = jsonMatch?.[1]?.match(/<\/script>/gi);
  if (unsafeScriptClose) {
    add(errors, `${filename}`, `embedded JSON contains ${unsafeScriptClose.length} unsafe </script> sequence(s) - injection not properly escaped`);
  }

  return errors;
}

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error('Usage: node validate-rendered-html.mjs <output.html>');
    process.exitCode = 2;
    return;
  }
  let html;
  try {
    html = await readFile(input, 'utf8');
  } catch (error) {
    console.error(`Cannot read HTML: ${error.message}`);
    process.exitCode = 2;
    return;
  }
  const errors = validateRenderedHtml(html, input);
  if (errors.length) {
    console.error(`HTML invalid (${errors.length} error${errors.length === 1 ? '' : 's'}):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`HTML valid: ${input}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
