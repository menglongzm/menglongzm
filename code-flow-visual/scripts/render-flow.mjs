#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { validateFlowData } from './validate-flow-data.mjs';
import { validateRenderedHtml } from './validate-rendered-html.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const templatePath = resolve(scriptDir, '..', 'assets', 'flow-template.html');
const placeholder = '__FLOW_DATA_JSON__';

function serializeForHtml(data) {
  return JSON.stringify(data, null, 2)
    .replaceAll('<', '\\u003c')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

export async function renderFlow(inputPath, outputPath) {
  const data = JSON.parse(await readFile(inputPath, 'utf8'));
  const errors = validateFlowData(data);
  if (errors.length) {
    const detail = errors.map((error) => `- ${error}`).join('\n');
    throw new Error(`FLOW_DATA invalid (${errors.length} error${errors.length === 1 ? '' : 's'}):\n${detail}`);
  }

  const template = await readFile(templatePath, 'utf8');
  const occurrences = template.split(placeholder).length - 1;
  if (occurrences !== 1) throw new Error(`Template must contain exactly one ${placeholder} placeholder; found ${occurrences}`);

  const html = template.replace(placeholder, serializeForHtml(data));
  await mkdir(dirname(resolve(outputPath)), { recursive: true });
  await writeFile(outputPath, html, 'utf8');

  // Auto-validate the rendered HTML
  const htmlErrors = validateRenderedHtml(html, outputPath);
  if (htmlErrors.length) {
    const detail = htmlErrors.map((error) => `- ${error}`).join('\n');
    throw new Error(`Rendered HTML failed validation (${htmlErrors.length} error${htmlErrors.length === 1 ? '' : 's'}):\n${detail}`);
  }

  return { outputPath: resolve(outputPath), flows: data.flows.length };
}

async function main() {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath || !outputPath) {
    console.error('Usage: node render-flow.mjs <flow-data.json> <output.html>');
    process.exitCode = 2;
    return;
  }
  try {
    const result = await renderFlow(inputPath, outputPath);
    console.log(`Rendered ${result.flows} flow${result.flows === 1 ? '' : 's'} to ${result.outputPath}`);
    console.log(`HTML validation passed`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
