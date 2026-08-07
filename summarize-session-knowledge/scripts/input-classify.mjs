#!/usr/bin/env node

/**
 * Input classification and manifest helpers for summarize-session-knowledge.
 *
 * This module provides pure-path classification logic (no I/O) so it can be
 * unit-tested with fixtures.  The agent fills in encoding/size/hash/read_status
 * after actually reading the file; this module only decides whether a path
 * should be excluded by default and produces a manifest template.
 */

import path from 'node:path';

// ── Binary extensions ──────────────────────────────────────────────

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.zip', '.gz', '.tar', '.rar', '.7z', '.jar', '.war',
  '.exe', '.dll', '.so', '.dylib', '.bin',
  '.mp3', '.mp4', '.avi', '.mov', '.wav', '.flv',
  '.class', '.pyc', '.o', '.obj'
]);

// ── Credential patterns ────────────────────────────────────────────

const CREDENTIAL_PATTERNS = [
  /\.env$/i,
  /\.env\./i,
  /\.pem$/i,
  /\.key$/i,
  /\.pfx$/i,
  /\.p12$/i,
  /(?:^|[\\/])id_rsa/i,
  /(?:^|[\\/])id_ecdsa/i,
  /(?:^|[\\/])id_ed25519/i,
  /\.npmrc$/i,
  /\.pypirc$/i,
  /\.netrc$/i,
  /credentials/i,
  /\.secret/i
];

// ── Default exclusion rules ─────────────────────────────────────────

export const DEFAULT_EXCLUSION_RULES = [
  { name: 'generated artifact', test: (p) => /(?:^|[\\/])(?:dist|build|target|out|output)[\\/]/i.test(p) || /\.(?:generated|compiled|min)\./i.test(p) },
  { name: 'cache', test: (p) => /(?:^|[\\/])(?:node_modules|\.cache|\.gradle|__pycache__|\.pytest_cache)[\\/]/i.test(p) },
  { name: 'tool log', test: (p) => /\.log$/i.test(p) || /(?:^|[\\/])logs?[\\/]/i.test(p) },
  { name: 'progress record', test: (p) => /\.(?:progress|tmp)\./i.test(p) || /(?:^|[\\/])\.tmp[\\/]/i.test(p) },
  { name: 'credential', test: (p) => CREDENTIAL_PATTERNS.some((re) => re.test(p)) },
  { name: 'binary file', test: (p) => BINARY_EXTENSIONS.has(path.extname(p).toLowerCase()) }
];

/**
 * Classify an input path against default exclusion rules.
 *
 * @param {string} inputPath - File path to classify.
 * @param {{skillRoot?: string, explicitIncludes?: string[]}} [options]
 * @returns {{excluded: boolean, reason: string}}
 */
export function classifyInput(inputPath, options = {}) {
  const { skillRoot, explicitIncludes = [] } = options;
  const normalized = inputPath.replace(/\\/g, '/');

  // Explicit user include overrides default exclusion.
  if (explicitIncludes.some((p) => p.replace(/\\/g, '/') === normalized)) {
    return { excluded: false, reason: 'explicitly included by user' };
  }

  // Skill's own files.
  if (skillRoot) {
    const root = skillRoot.replace(/\\/g, '/');
    if (normalized === root || normalized.startsWith(root + '/')) {
      return { excluded: true, reason: 'skill own file' };
    }
  }

  for (const rule of DEFAULT_EXCLUSION_RULES) {
    if (rule.test(normalized)) {
      return { excluded: true, reason: rule.name };
    }
  }

  return { excluded: false, reason: 'knowledge source candidate' };
}

/**
 * Create an InputManifest template.  The agent fills in encoding, size,
 * content_hash and read_status after actually reading the file.
 *
 * @param {string} inputPath
 * @param {{skillRoot?: string, explicitIncludes?: string[], sourcePriority?: string}} [options]
 * @returns {object} Manifest object (not written to output).
 */
export function createManifest(inputPath, options = {}) {
  const classification = classifyInput(inputPath, options);
  return {
    path: inputPath,
    input_type: classification.excluded ? 'excluded' : 'candidate',
    include_reason: classification.reason,
    encoding: null,
    size: null,
    content_hash: null,
    read_status: null,
    source_priority: options.sourcePriority || null
  };
}

// ── Input state machine (documentation + helpers) ──────────────────

export const INPUT_STATES = {
  READ_OK: 'read_ok',
  NOT_FOUND: 'not_found',
  EMPTY_INPUT: 'empty_input',
  PROCESS_ONLY: 'process_only',
  ENCODING_ERROR: 'encoding_error',
  BINARY_REFUSED: 'binary_refused',
  PARTIAL_READ: 'partial_read',
  TARGET_UNREAD_OVERWRITE: 'target_unread_overwrite'
};

/**
 * Determine the delivery implication of an input state.
 *
 * @param {string} readStatus - One of INPUT_STATES values.
 * @returns {{block: boolean, delivery: 'pass'|'unverified'|'fail'}}
 */
export function inputStateDelivery(readStatus) {
  switch (readStatus) {
    case INPUT_STATES.READ_OK:
      return { block: false, delivery: 'pass' };
    case INPUT_STATES.NOT_FOUND:
    case INPUT_STATES.EMPTY_INPUT:
    case INPUT_STATES.PROCESS_ONLY:
    case INPUT_STATES.BINARY_REFUSED:
    case INPUT_STATES.TARGET_UNREAD_OVERWRITE:
      return { block: true, delivery: 'fail' };
    case INPUT_STATES.ENCODING_ERROR:
    case INPUT_STATES.PARTIAL_READ:
      return { block: false, delivery: 'unverified' };
    default:
      return { block: false, delivery: 'unverified' };
  }
}
