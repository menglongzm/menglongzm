import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { validateFlowData } from '../scripts/validate-flow-data.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, 'fixtures');

async function loadFixture(name) {
  return JSON.parse(await readFile(resolve(fixturesDir, name), 'utf8'));
}

describe('validateFlowData - valid fixtures', () => {
  test('complete-order-flow-v2 should pass validation', async () => {
    const data = await loadFixture('complete-order-flow-v2.json');
    const errors = validateFlowData(data);
    assert.equal(errors.length, 0, `Expected no errors, got: ${JSON.stringify(errors, null, 2)}`);
  });
});

describe('validateFlowData - invalid fixtures', () => {
  test('invalid-break-continuation-v2 should fail with break out-degree > 0', async () => {
    const data = await loadFixture('invalid-break-continuation-v2.json');
    const errors = validateFlowData(data);
    assert.ok(errors.length > 0, 'Should have validation errors');
    const breakError = errors.find((e) => e.includes('break nodes must have out-degree 0'));
    assert.ok(breakError, `Should report break out-degree error, got: ${JSON.stringify(errors)}`);
  });

  test('invalid-break-continuation-v2 should fail with runtime-unknown only evidence', async () => {
    const data = await loadFixture('invalid-break-continuation-v2.json');
    const errors = validateFlowData(data);
    const runtimeError = errors.some((e) => e.includes('runtime-unknown'));
    assert.ok(runtimeError, 'Should report runtime-unknown evidence errors');
  });
});

describe('validateFlowData - crash protection', () => {
  test('http.params as non-array should not crash validator', () => {
    const data = {
      version: 2,
      meta: { title: 'Test', summary: 'Test', roots: [{ path: 'a', role: 'b' }] },
      scope: {
        type: 'feature', coverage: 'complete', discoveryComplete: true,
        counts: { endpoints: { discovered: 1, traced: 1 } },
        selectionBasis: 'test', omitted: []
      },
      flows: [{
        id: 'f1', title: 'Test', status: 'complete',
        entryNodeId: 'n1', responseNodeId: 'n2',
        nodes: [
          {
            id: 'n1', depth: 0, lane: 'request', kind: 'frontend',
            layer: 'F', symbol: 'test', role: 'test',
            http: { method: 'GET', url: '/test', params: 'not-an-array' },
            result: { type: 'unknown', source: 'unknown' },
            evidence: [{ path: 'a.ts', line: 1, basis: 'confirmed' }]
          },
          {
            id: 'n2', depth: 1, lane: 'return', kind: 'response',
            layer: 'R', symbol: '200', role: 'test',
            result: { type: 'HTTP 200', source: 'response-body' },
            response: { status: 200, contentType: 'application/json', bodyShape: '{}' },
            evidence: [{ path: 'a.ts', line: 2, basis: 'confirmed' }]
          }
        ],
        edges: [{
          id: 'e1', from: 'n1', to: 'n2', direction: 'return', order: 1,
          label: 'test',
          transform: { before: 'a', after: 'b', action: 'c' },
          evidence: [{ path: 'a.ts', line: 3, basis: 'confirmed' }]
        }],
        paths: [{
          id: 'p1', label: 'main', condition: null,
          steps: [
            { nodeId: 'n1', edgeId: null },
            { nodeId: 'n2', edgeId: 'e1' }
          ],
          terminalNodeId: 'n2', dbOperationCount: 0
        }]
      }]
    };
    // Should not throw
    const errors = validateFlowData(data);
    assert.ok(errors.some((e) => e.includes('http.params') && e.includes('must be an array')));
  });

  test('null http.params should not crash validator', () => {
    const data = {
      version: 2,
      meta: { title: 'Test', summary: 'Test', roots: [{ path: 'a', role: 'b' }] },
      scope: {
        type: 'feature', coverage: 'complete', discoveryComplete: true,
        counts: { endpoints: { discovered: 1, traced: 1 } },
        selectionBasis: 'test', omitted: []
      },
      flows: [{
        id: 'f1', title: 'Test', status: 'complete',
        entryNodeId: 'n1', responseNodeId: 'n2',
        nodes: [
          {
            id: 'n1', depth: 0, lane: 'request', kind: 'frontend',
            layer: 'F', symbol: 'test', role: 'test',
            http: { method: 'GET', url: '/test', params: null },
            result: { type: 'unknown', source: 'unknown' },
            evidence: [{ path: 'a.ts', line: 1, basis: 'confirmed' }]
          },
          {
            id: 'n2', depth: 1, lane: 'return', kind: 'response',
            layer: 'R', symbol: '200', role: 'test',
            result: { type: 'HTTP 200', source: 'response-body' },
            response: { status: 200, contentType: 'application/json', bodyShape: '{}' },
            evidence: [{ path: 'a.ts', line: 2, basis: 'confirmed' }]
          }
        ],
        edges: [{
          id: 'e1', from: 'n1', to: 'n2', direction: 'return', order: 1,
          label: 'test',
          transform: { before: 'a', after: 'b', action: 'c' },
          evidence: [{ path: 'a.ts', line: 3, basis: 'confirmed' }]
        }],
        paths: [{
          id: 'p1', label: 'main', condition: null,
          steps: [
            { nodeId: 'n1', edgeId: null },
            { nodeId: 'n2', edgeId: 'e1' }
          ],
          terminalNodeId: 'n2', dbOperationCount: 0
        }]
      }]
    };
    // Should not throw
    const errors = validateFlowData(data);
    assert.ok(errors.some((e) => e.includes('http.params') && e.includes('must be an array')));
  });
});

describe('validateFlowData - schema v2 features', () => {
  test('version 1 should be rejected', () => {
    const data = { version: 1, meta: {}, scope: {}, flows: [] };
    const errors = validateFlowData(data);
    assert.ok(errors.some((e) => e.includes('version') && e.includes('must be 2')));
  });

  test('missing paths should fail', () => {
    const data = {
      version: 2,
      meta: { title: 'T', summary: 'T', roots: [{ path: 'a', role: 'b' }] },
      scope: { type: 'feature', coverage: 'complete', discoveryComplete: true, counts: { endpoints: { discovered: 1, traced: 1 } }, selectionBasis: 't', omitted: [] },
      flows: [{
        id: 'f', title: 'T', status: 'complete', entryNodeId: 'n1', responseNodeId: 'n2',
        nodes: [
          { id: 'n1', depth: 0, lane: 'request', kind: 'frontend', layer: 'F', symbol: 's', role: 'r', http: { method: 'GET', url: '/' }, result: { type: 't', source: 'response-body' }, evidence: [{ path: 'a', line: 1, basis: 'confirmed' }] },
          { id: 'n2', depth: 1, lane: 'return', kind: 'response', layer: 'R', symbol: '200', role: 'r', result: { type: 't', source: 'response-body' }, response: { status: 200, contentType: 'a', bodyShape: '{}' }, evidence: [{ path: 'a', line: 2, basis: 'confirmed' }] }
        ],
        edges: [{ id: 'e', from: 'n1', to: 'n2', direction: 'return', order: 1, label: 'l', transform: { before: 'a', after: 'b', action: 'c' }, evidence: [{ path: 'a', line: 3, basis: 'confirmed' }] }]
      }]
    };
    const errors = validateFlowData(data);
    assert.ok(errors.some((e) => e.includes('paths') && e.includes('at least one path')));
  });

  test('DML with query-result source but no returnsRows should fail', () => {
    const data = {
      version: 2,
      meta: { title: 'T', summary: 'T', roots: [{ path: 'a', role: 'b' }] },
      scope: { type: 'feature', coverage: 'complete', discoveryComplete: true, counts: { endpoints: { discovered: 1, traced: 1 } }, selectionBasis: 't', omitted: [] },
      flows: [{
        id: 'f', title: 'T', status: 'complete', entryNodeId: 'n1', responseNodeId: 'n3',
        nodes: [
          { id: 'n1', depth: 0, lane: 'request', kind: 'frontend', layer: 'F', symbol: 's', role: 'r', http: { method: 'POST', url: '/' }, result: { type: 't', source: 'response-body' }, evidence: [{ path: 'a', line: 1, basis: 'confirmed' }] },
          { id: 'n2', depth: 1, lane: 'turnaround', kind: 'database', layer: 'DB', symbol: 'INSERT', role: 'r', result: { type: 'Entity', source: 'query-result' }, database: { system: 'PG', table: 't', operation: 'INSERT', criteria: 'c', returnsRows: false }, evidence: [{ path: 'a', line: 2, basis: 'confirmed' }] },
          { id: 'n3', depth: 2, lane: 'return', kind: 'response', layer: 'R', symbol: '200', role: 'r', result: { type: 't', source: 'response-body' }, response: { status: 200, contentType: 'a', bodyShape: '{}' }, evidence: [{ path: 'a', line: 3, basis: 'confirmed' }] }
        ],
        edges: [
          { id: 'e1', from: 'n1', to: 'n2', direction: 'request', order: 1, label: 'l', call: { arguments: [] }, evidence: [{ path: 'a', line: 4, basis: 'confirmed' }] },
          { id: 'e2', from: 'n2', to: 'n3', direction: 'return', order: 1, label: 'l', transform: { before: 'a', after: 'b', action: 'c' }, evidence: [{ path: 'a', line: 5, basis: 'confirmed' }] }
        ],
        paths: [{ id: 'p', label: 'main', condition: null, steps: [{ nodeId: 'n1', edgeId: null }, { nodeId: 'n2', edgeId: 'e1' }, { nodeId: 'n3', edgeId: 'e2' }], terminalNodeId: 'n3', dbOperationCount: 1 }]
      }]
    };
    const errors = validateFlowData(data);
    assert.ok(errors.some((e) => e.includes('returnsRows')), 'Should report returnsRows issue for DML claiming query-result');
  });

  test('expanded evidence basis should be accepted', () => {
    const data = {
      version: 2,
      meta: { title: 'T', summary: 'T', roots: [{ path: 'a', role: 'b' }] },
      scope: { type: 'feature', coverage: 'complete', discoveryComplete: true, counts: { endpoints: { discovered: 1, traced: 1 } }, selectionBasis: 't', omitted: [] },
      flows: [{
        id: 'f', title: 'T', status: 'complete', entryNodeId: 'n1', responseNodeId: 'n3',
        nodes: [
          { id: 'n1', depth: 0, lane: 'request', kind: 'frontend', layer: 'F', symbol: 's', role: 'r', http: { method: 'GET', url: '/' }, result: { type: 't', source: 'response-body' }, evidence: [{ path: 'a', line: 1, basis: 'framework-derived' }] },
          { id: 'n2', depth: 1, lane: 'turnaround', kind: 'memory', layer: 'M', symbol: 'cache', role: 'r', result: { type: 't', source: 'in-memory-object' }, evidence: [{ path: 'a', line: 2, basis: 'config-scoped' }] },
          { id: 'n3', depth: 2, lane: 'return', kind: 'response', layer: 'R', symbol: '200', role: 'r', result: { type: 't', source: 'response-body' }, response: { status: 200, contentType: 'a', bodyShape: '{}' }, evidence: [{ path: 'a', line: 3, basis: 'confirmed' }] }
        ],
        edges: [
          { id: 'e1', from: 'n1', to: 'n2', direction: 'request', order: 1, label: 'l', call: { arguments: [] }, evidence: [{ path: 'a', line: 4, basis: 'static-inference' }] },
          { id: 'e2', from: 'n2', to: 'n3', direction: 'return', order: 1, label: 'l', transform: { before: 'a', after: 'b', action: 'c' }, evidence: [{ path: 'a', line: 5, basis: 'confirmed' }] }
        ],
        paths: [{ id: 'p', label: 'main', condition: null, steps: [{ nodeId: 'n1', edgeId: null }, { nodeId: 'n2', edgeId: 'e1' }, { nodeId: 'n3', edgeId: 'e2' }], terminalNodeId: 'n3', dbOperationCount: 0 }]
      }]
    };
    const errors = validateFlowData(data);
    assert.equal(errors.length, 0, `Expected no errors, got: ${JSON.stringify(errors)}`);
  });

  test('http.params[].in field should be validated', () => {
    const data = {
      version: 2,
      meta: { title: 'T', summary: 'T', roots: [{ path: 'a', role: 'b' }] },
      scope: { type: 'feature', coverage: 'complete', discoveryComplete: true, counts: { endpoints: { discovered: 1, traced: 1 } }, selectionBasis: 't', omitted: [] },
      flows: [{
        id: 'f', title: 'T', status: 'complete', entryNodeId: 'n1', responseNodeId: 'n2',
        nodes: [
          { id: 'n1', depth: 0, lane: 'request', kind: 'frontend', layer: 'F', symbol: 's', role: 'r', http: { method: 'GET', url: '/', params: [{ name: 'p', in: 'invalid', type: 't', meaning: 'm' }] }, result: { type: 't', source: 'response-body' }, evidence: [{ path: 'a', line: 1, basis: 'confirmed' }] },
          { id: 'n2', depth: 1, lane: 'return', kind: 'response', layer: 'R', symbol: '200', role: 'r', result: { type: 't', source: 'response-body' }, response: { status: 200, contentType: 'a', bodyShape: '{}' }, evidence: [{ path: 'a', line: 2, basis: 'confirmed' }] }
        ],
        edges: [{ id: 'e', from: 'n1', to: 'n2', direction: 'return', order: 1, label: 'l', transform: { before: 'a', after: 'b', action: 'c' }, evidence: [{ path: 'a', line: 3, basis: 'confirmed' }] }],
        paths: [{ id: 'p', label: 'main', condition: null, steps: [{ nodeId: 'n1', edgeId: null }, { nodeId: 'n2', edgeId: 'e' }], terminalNodeId: 'n2', dbOperationCount: 0 }]
      }]
    };
    const errors = validateFlowData(data);
    assert.ok(errors.some((e) => e.includes('.in') && e.includes('must be one of')));
  });

  test('path steps discontinuity should fail', () => {
    const data = {
      version: 2,
      meta: { title: 'T', summary: 'T', roots: [{ path: 'a', role: 'b' }] },
      scope: { type: 'feature', coverage: 'complete', discoveryComplete: true, counts: { endpoints: { discovered: 1, traced: 1 } }, selectionBasis: 't', omitted: [] },
      flows: [{
        id: 'f', title: 'T', status: 'complete', entryNodeId: 'n1', responseNodeId: 'n3',
        nodes: [
          { id: 'n1', depth: 0, lane: 'request', kind: 'frontend', layer: 'F', symbol: 's', role: 'r', http: { method: 'GET', url: '/' }, result: { type: 't', source: 'response-body' }, evidence: [{ path: 'a', line: 1, basis: 'confirmed' }] },
          { id: 'n2', depth: 1, lane: 'request', kind: 'service', layer: 'S', symbol: 'svc', role: 'r', signature: 'void m()', params: [], result: { type: 'void', source: 'in-memory-object' }, evidence: [{ path: 'a', line: 2, basis: 'confirmed' }] },
          { id: 'n3', depth: 2, lane: 'return', kind: 'response', layer: 'R', symbol: '200', role: 'r', result: { type: 't', source: 'response-body' }, response: { status: 200, contentType: 'a', bodyShape: '{}' }, evidence: [{ path: 'a', line: 3, basis: 'confirmed' }] }
        ],
        edges: [
          { id: 'e1', from: 'n1', to: 'n2', direction: 'request', order: 1, label: 'l', call: { arguments: [] }, evidence: [{ path: 'a', line: 4, basis: 'confirmed' }] },
          { id: 'e2', from: 'n2', to: 'n3', direction: 'return', order: 1, label: 'l', transform: { before: 'a', after: 'b', action: 'c' }, evidence: [{ path: 'a', line: 5, basis: 'confirmed' }] }
        ],
        paths: [{
          id: 'p', label: 'main', condition: null,
          steps: [
            { nodeId: 'n1', edgeId: null },
            { nodeId: 'n3', edgeId: 'e2' }
          ],
          terminalNodeId: 'n3', dbOperationCount: 0
        }]
      }]
    };
    const errors = validateFlowData(data);
    assert.ok(errors.some((e) => e.includes('starts from') || e.includes('ends at')), 'Should report path discontinuity');
  });

  test('transaction member overlap with outside should fail', () => {
    const data = {
      version: 2,
      meta: { title: 'T', summary: 'T', roots: [{ path: 'a', role: 'b' }] },
      scope: { type: 'feature', coverage: 'complete', discoveryComplete: true, counts: { endpoints: { discovered: 1, traced: 1 } }, selectionBasis: 't', omitted: [] },
      flows: [{
        id: 'f', title: 'T', status: 'complete', entryNodeId: 'n1', responseNodeId: 'n4',
        nodes: [
          { id: 'n1', depth: 0, lane: 'request', kind: 'frontend', layer: 'F', symbol: 's', role: 'r', http: { method: 'GET', url: '/' }, result: { type: 't', source: 'response-body' }, evidence: [{ path: 'a', line: 1, basis: 'confirmed' }] },
          { id: 'n2', depth: 1, lane: 'request', kind: 'service', layer: 'S', symbol: 'svc', role: 'r', signature: 'void m()', params: [], result: { type: 'void', source: 'in-memory-object' }, evidence: [{ path: 'a', line: 2, basis: 'confirmed' }] },
          { id: 'n3', depth: 2, lane: 'turnaround', kind: 'database', layer: 'DB', symbol: 'INSERT', role: 'r', result: { type: 'int', source: 'affected-row-count' }, database: { system: 'PG', table: 't', operation: 'INSERT', criteria: 'c', returnsRows: false }, evidence: [{ path: 'a', line: 3, basis: 'confirmed' }] },
          { id: 'n4', depth: 3, lane: 'return', kind: 'response', layer: 'R', symbol: '200', role: 'r', result: { type: 't', source: 'response-body' }, response: { status: 200, contentType: 'a', bodyShape: '{}' }, evidence: [{ path: 'a', line: 4, basis: 'confirmed' }] }
        ],
        edges: [
          { id: 'e1', from: 'n1', to: 'n2', direction: 'request', order: 1, label: 'l', call: { arguments: [] }, evidence: [{ path: 'a', line: 5, basis: 'confirmed' }] },
          { id: 'e2', from: 'n2', to: 'n3', direction: 'request', order: 2, label: 'l', call: { arguments: [] }, evidence: [{ path: 'a', line: 6, basis: 'confirmed' }] },
          { id: 'e3', from: 'n3', to: 'n4', direction: 'return', order: 1, label: 'l', transform: { before: 'a', after: 'b', action: 'c' }, evidence: [{ path: 'a', line: 7, basis: 'confirmed' }] }
        ],
        paths: [{ id: 'p', label: 'main', condition: null, steps: [{ nodeId: 'n1', edgeId: null }, { nodeId: 'n2', edgeId: 'e1' }, { nodeId: 'n3', edgeId: 'e2' }, { nodeId: 'n4', edgeId: 'e3' }], terminalNodeId: 'n4', dbOperationCount: 1 }],
        transactions: [{
          id: 'tx1', entryNodeId: 'n2', memberNodeIds: ['n3'], outsideTxNodeIds: ['n3'],
          commitPointNodeId: 'n4', rollbackConditions: ['Exception']
        }]
      }]
    };
    const errors = validateFlowData(data);
    assert.ok(errors.some((e) => e.includes('cannot be both inside and outside')), 'Should report transaction overlap');
  });
});
