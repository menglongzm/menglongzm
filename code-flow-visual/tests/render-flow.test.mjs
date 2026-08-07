import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { renderFlow } from '../scripts/render-flow.mjs';
import { validateRenderedHtml } from '../scripts/validate-rendered-html.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, 'fixtures');

describe('renderFlow - valid data', () => {
  let tempDir;

  test('should render complete-order-flow-v2 to valid HTML', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'flow-test-'));
    const inputPath = resolve(fixturesDir, 'complete-order-flow-v2.json');
    const outputPath = join(tempDir, 'output.html');
    const result = await renderFlow(inputPath, outputPath);
    assert.ok(result.outputPath);
    assert.equal(result.flows, 1);

    const html = await readFile(outputPath, 'utf8');
    assert.ok(html.includes('<!doctype html>'));
    assert.ok(html.includes('flow-data'));
    assert.ok(!html.includes('__FLOW_DATA_JSON__'));
  });

  test('rendered HTML should pass HTML validation', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'flow-test-'));
    const inputPath = resolve(fixturesDir, 'complete-order-flow-v2.json');
    const outputPath = join(tempDir, 'output.html');
    await renderFlow(inputPath, outputPath);
    const html = await readFile(outputPath, 'utf8');
    const errors = validateRenderedHtml(html, outputPath);
    assert.equal(errors.length, 0, `HTML validation errors: ${JSON.stringify(errors, null, 2)}`);
  });
});

describe('renderFlow - invalid data', () => {
  test('should reject invalid break continuation data', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'flow-test-'));
    const inputPath = resolve(fixturesDir, 'invalid-break-continuation-v2.json');
    const outputPath = join(tempDir, 'output.html');
    await assert.rejects(
      () => renderFlow(inputPath, outputPath),
      (error) => {
        assert.ok(error.message.includes('FLOW_DATA invalid'));
        return true;
      }
    );
  });
});

describe('renderFlow - injection safety', () => {
  test('should escape </script> in data content', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'flow-test-'));
    const maliciousData = {
      version: 2,
      meta: { title: '</script><script>alert(1)</script>', summary: 'test', roots: [{ path: 'a', role: 'b' }] },
      scope: { type: 'feature', coverage: 'complete', discoveryComplete: true, counts: { endpoints: { discovered: 1, traced: 1 } }, selectionBasis: 't', omitted: [] },
      flows: [{
        id: 'f', title: 'T', status: 'complete', entryNodeId: 'n1', responseNodeId: 'n3',
        nodes: [
          { id: 'n1', depth: 0, lane: 'request', kind: 'frontend', layer: 'F', symbol: '</script>', role: 'r', http: { method: 'GET', url: '/' }, result: { type: 't', source: 'response-body' }, evidence: [{ path: 'a', line: 1, basis: 'confirmed' }] },
          { id: 'n2', depth: 1, lane: 'turnaround', kind: 'memory', layer: 'M', symbol: 'cache', role: 'r', result: { type: 't', source: 'in-memory-object' }, evidence: [{ path: 'a', line: 2, basis: 'confirmed' }] },
          { id: 'n3', depth: 2, lane: 'return', kind: 'response', layer: 'R', symbol: '200', role: 'r', result: { type: 't', source: 'response-body' }, response: { status: 200, contentType: 'a', bodyShape: '{}' }, evidence: [{ path: 'a', line: 3, basis: 'confirmed' }] }
        ],
        edges: [
          { id: 'e1', from: 'n1', to: 'n2', direction: 'request', order: 1, label: 'l', call: { arguments: [] }, evidence: [{ path: 'a', line: 4, basis: 'confirmed' }] },
          { id: 'e2', from: 'n2', to: 'n3', direction: 'return', order: 1, label: 'l', transform: { before: 'a', after: 'b', action: 'c' }, evidence: [{ path: 'a', line: 5, basis: 'confirmed' }] }
        ],
        paths: [{ id: 'p', label: 'main', condition: null, steps: [{ nodeId: 'n1', edgeId: null }, { nodeId: 'n2', edgeId: 'e1' }, { nodeId: 'n3', edgeId: 'e2' }], terminalNodeId: 'n3', dbOperationCount: 0 }]
      }]
    };
    const inputPath = join(tempDir, 'malicious.json');
    await writeFile(inputPath, JSON.stringify(maliciousData), 'utf8');
    const outputPath = join(tempDir, 'output.html');
    await renderFlow(inputPath, outputPath);
    const html = await readFile(outputPath, 'utf8');
    // The </script> should be escaped to \u003c/script>
    assert.ok(!html.includes('</script><script>'), 'Raw </script> should not appear in HTML');
    assert.ok(html.includes('\\u003c'), 'Should use unicode escape for <');
  });
});
