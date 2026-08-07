import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  classifyInput,
  createManifest,
  inputStateDelivery,
  INPUT_STATES
} from '../scripts/input-classify.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(here, '..');

// ── Default exclusion ──────────────────────────────────────────────

test('excludes generated artifacts (dist/)', () => {
  const result = classifyInput('project/dist/index.js');
  assert.ok(result.excluded);
  assert.equal(result.reason, 'generated artifact');
});

test('excludes cache (node_modules/)', () => {
  const result = classifyInput('project/node_modules/lodash/index.js');
  assert.ok(result.excluded);
  assert.equal(result.reason, 'cache');
});

test('excludes tool logs (*.log)', () => {
  const result = classifyInput('project/app.log');
  assert.ok(result.excluded);
  assert.equal(result.reason, 'tool log');
});

test('excludes credentials (.env)', () => {
  const result = classifyInput('project/.env');
  assert.ok(result.excluded);
  assert.equal(result.reason, 'credential');
});

test('excludes credentials (id_rsa)', () => {
  const result = classifyInput('~/.ssh/id_rsa');
  assert.ok(result.excluded);
  assert.equal(result.reason, 'credential');
});

test('excludes binary files (.png)', () => {
  const result = classifyInput('project/diagram.png');
  assert.ok(result.excluded);
  assert.equal(result.reason, 'binary file');
});

test('excludes skill own files', () => {
  const result = classifyInput(
    path.join(skillRoot, 'SKILL.md'),
    { skillRoot }
  );
  assert.ok(result.excluded);
  assert.equal(result.reason, 'skill own file');
});

// ── Explicit include override ─────────────────────────────────────

test('explicit include overrides default exclusion', () => {
  const distPath = 'project/dist/index.js';
  const result = classifyInput(distPath, {
    explicitIncludes: [distPath]
  });
  assert.ok(!result.excluded);
  assert.equal(result.reason, 'explicitly included by user');
});

test('explicit include does not affect other paths', () => {
  const result = classifyInput('project/dist/other.js', {
    explicitIncludes: ['project/dist/index.js']
  });
  assert.ok(result.excluded);
});

// ── Normal sources not excluded ────────────────────────────────────

test('does not exclude normal source files', () => {
  const result = classifyInput('project/src/main/java/Service.java');
  assert.ok(!result.excluded);
  assert.equal(result.reason, 'knowledge source candidate');
});

test('does not exclude markdown design docs', () => {
  const result = classifyInput('project/docs/architecture.md');
  assert.ok(!result.excluded);
});

// ── Manifest template ──────────────────────────────────────────────

test('createManifest produces correct template for candidate', () => {
  const manifest = createManifest('project/src/Main.java', {
    sourcePriority: 'primary'
  });
  assert.equal(manifest.input_type, 'candidate');
  assert.equal(manifest.include_reason, 'knowledge source candidate');
  assert.equal(manifest.source_priority, 'primary');
  assert.equal(manifest.encoding, null);
  assert.equal(manifest.read_status, null);
});

test('createManifest produces correct template for excluded', () => {
  const manifest = createManifest('project/.env');
  assert.equal(manifest.input_type, 'excluded');
  assert.equal(manifest.include_reason, 'credential');
});

// ── Input state machine ────────────────────────────────────────────

test('input state: read_ok → pass', () => {
  const result = inputStateDelivery(INPUT_STATES.READ_OK);
  assert.equal(result.block, false);
  assert.equal(result.delivery, 'pass');
});

test('input state: not_found → block + fail', () => {
  const result = inputStateDelivery(INPUT_STATES.NOT_FOUND);
  assert.equal(result.block, true);
  assert.equal(result.delivery, 'fail');
});

test('input state: empty_input → block + fail', () => {
  const result = inputStateDelivery(INPUT_STATES.EMPTY_INPUT);
  assert.equal(result.block, true);
  assert.equal(result.delivery, 'fail');
});

test('input state: process_only → block + fail', () => {
  const result = inputStateDelivery(INPUT_STATES.PROCESS_ONLY);
  assert.equal(result.block, true);
  assert.equal(result.delivery, 'fail');
});

test('input state: binary_refused → block + fail', () => {
  const result = inputStateDelivery(INPUT_STATES.BINARY_REFUSED);
  assert.equal(result.block, true);
  assert.equal(result.delivery, 'fail');
});

test('input state: target_unread_overwrite → block + fail', () => {
  const result = inputStateDelivery(INPUT_STATES.TARGET_UNREAD_OVERWRITE);
  assert.equal(result.block, true);
  assert.equal(result.delivery, 'fail');
});

test('input state: encoding_error → unverified', () => {
  const result = inputStateDelivery(INPUT_STATES.ENCODING_ERROR);
  assert.equal(result.block, false);
  assert.equal(result.delivery, 'unverified');
});

test('input state: partial_read → unverified', () => {
  const result = inputStateDelivery(INPUT_STATES.PARTIAL_READ);
  assert.equal(result.block, false);
  assert.equal(result.delivery, 'unverified');
});
