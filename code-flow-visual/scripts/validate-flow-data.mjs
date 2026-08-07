#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import process from 'node:process';

const NODE_KINDS = new Set([
  'frontend',
  'interceptor',
  'middleware',
  'controller',
  'service',
  'data-access',
  'database',
  'cache',
  'queue',
  'external-api',
  'filesystem',
  'memory',
  'transform',
  'response',
  'break',
]);
const LANES = new Set(['request', 'turnaround', 'return']);
const DIRECTIONS = new Set(['request', 'return', 'branch', 'spawn']);
const METHOD_KINDS = new Set(['controller', 'service', 'data-access']);
const CALL_TARGET_KINDS = new Set([...METHOD_KINDS, 'database']);
const TERMINAL_KINDS = new Set([
  'database',
  'cache',
  'queue',
  'external-api',
  'filesystem',
  'memory',
  'break',
]);
const EVIDENCE_BASES = new Set([
  'confirmed',
  'static-inference',
  'framework-derived',
  'config-scoped',
  'runtime-unknown',
]);
const RESULT_SOURCES = new Set([
  'query-result',
  'affected-row-count',
  'in-memory-object',
  'generated-value',
  'response-body',
  'unknown',
]);
const SCOPE_TYPES = new Set(['feature', 'module', 'project']);
const COVERAGE_TYPES = new Set(['complete', 'sampled', 'partial']);
const FLOW_STATUSES = new Set(['complete', 'broken']);
const PARAM_IN_VALUES = new Set(['path', 'query', 'header', 'body']);

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

function add(errors, path, message) {
  errors.push(`${path}: ${message}`);
}

function validateEvidence(evidence, path, errors) {
  if (!Array.isArray(evidence) || evidence.length === 0) {
    add(errors, path, 'must contain at least one source evidence item');
    return;
  }

  evidence.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isObject(item)) {
      add(errors, itemPath, 'must be an object');
      return;
    }
    if (!isNonEmptyString(item.path)) add(errors, `${itemPath}.path`, 'must be a non-empty string');
    if (!Number.isInteger(item.line) || item.line < 1) add(errors, `${itemPath}.line`, 'must be a positive integer');
    if (item.symbol !== undefined && !isNonEmptyString(item.symbol)) add(errors, `${itemPath}.symbol`, 'must be a non-empty string when present');
    if (!EVIDENCE_BASES.has(item.basis)) add(errors, `${itemPath}.basis`, `must be one of ${[...EVIDENCE_BASES].join(', ')}`);
  });
}

function validateParams(params, path, errors) {
  if (!Array.isArray(params)) {
    add(errors, path, 'must be an array');
    return;
  }
  params.forEach((param, index) => {
    const paramPath = `${path}[${index}]`;
    if (!isObject(param)) {
      add(errors, paramPath, 'must be an object');
      return;
    }
    for (const key of ['name', 'type', 'meaning']) {
      if (!isNonEmptyString(param[key])) add(errors, `${paramPath}.${key}`, 'must be a non-empty string');
    }
    if (param.source !== undefined && !isNonEmptyString(param.source)) add(errors, `${paramPath}.source`, 'must be a non-empty string when present');
  });
}

function validateHttpParams(params, path, errors) {
  if (!Array.isArray(params)) {
    add(errors, path, 'must be an array');
    return;
  }
  params.forEach((param, index) => {
    const paramPath = `${path}[${index}]`;
    if (!isObject(param)) {
      add(errors, paramPath, 'must be an object');
      return;
    }
    for (const key of ['name', 'type', 'meaning']) {
      if (!isNonEmptyString(param[key])) add(errors, `${paramPath}.${key}`, 'must be a non-empty string');
    }
    if (!isNonEmptyString(param.in) || !PARAM_IN_VALUES.has(param.in)) {
      add(errors, `${paramPath}.in`, `must be one of ${[...PARAM_IN_VALUES].join(', ')}`);
    }
  });
}

function validateResult(result, path, errors) {
  if (!isObject(result) || !isNonEmptyString(result.type)) {
    add(errors, path, 'must include a result.type string');
    return;
  }
  if (result.shape !== undefined && !isNonEmptyString(result.shape)) add(errors, `${path}.shape`, 'must be a non-empty string when present');
  if (result.source !== undefined && !RESULT_SOURCES.has(result.source)) {
    add(errors, `${path}.source`, `must be one of ${[...RESULT_SOURCES].join(', ')} when present`);
  }
  if (result.consumed !== undefined && !isNonEmptyString(result.consumed)) {
    add(errors, `${path}.consumed`, 'must be a non-empty string when present');
  }
}

function validateFlow(flow, flowPath, errors) {
  if (!isObject(flow)) {
    add(errors, flowPath, 'must be an object');
    return;
  }
  for (const key of ['id', 'title', 'entryNodeId', 'status']) {
    if (!isNonEmptyString(flow[key])) add(errors, `${flowPath}.${key}`, 'must be a non-empty string');
  }
  if (!FLOW_STATUSES.has(flow.status)) add(errors, `${flowPath}.status`, 'must be complete or broken');
  if (!Array.isArray(flow.nodes) || flow.nodes.length === 0) {
    add(errors, `${flowPath}.nodes`, 'must contain at least one node');
    return;
  }
  if (!Array.isArray(flow.edges)) {
    add(errors, `${flowPath}.edges`, 'must be an array');
    return;
  }

  const nodes = new Map();
  flow.nodes.forEach((node, index) => {
    const nodePath = `${flowPath}.nodes[${index}]`;
    if (!isObject(node)) {
      add(errors, nodePath, 'must be an object');
      return;
    }
    if (!isNonEmptyString(node.id)) add(errors, `${nodePath}.id`, 'must be a non-empty string');
    else if (nodes.has(node.id)) add(errors, `${nodePath}.id`, `duplicates node ${node.id}`);
    else nodes.set(node.id, node);
    if (!Number.isInteger(node.depth) || node.depth < 0) add(errors, `${nodePath}.depth`, 'must be a non-negative integer');
    if (!LANES.has(node.lane)) add(errors, `${nodePath}.lane`, 'must be request, turnaround, or return');
    if (!NODE_KINDS.has(node.kind)) add(errors, `${nodePath}.kind`, `must be one of ${[...NODE_KINDS].join(', ')}`);
    for (const key of ['layer', 'symbol', 'role']) {
      if (!isNonEmptyString(node[key])) add(errors, `${nodePath}.${key}`, 'must be a non-empty string');
    }
    if (METHOD_KINDS.has(node.kind)) {
      if (!isNonEmptyString(node.signature)) add(errors, `${nodePath}.signature`, 'is required for controller, service, and data-access nodes');
      validateParams(node.params, `${nodePath}.params`, errors);
    } else if (node.params !== undefined) {
      validateParams(node.params, `${nodePath}.params`, errors);
    }
    validateResult(node.result, `${nodePath}.result`, errors);
    validateEvidence(node.evidence, `${nodePath}.evidence`, errors);
    if (node.kind !== 'break' && Array.isArray(node.evidence) && node.evidence.length > 0 && node.evidence.every((item) => item?.basis === 'runtime-unknown')) {
      add(errors, `${nodePath}.evidence`, 'non-break nodes cannot rely only on runtime-unknown evidence');
    }

    if (node.kind === 'frontend') {
      if (!isObject(node.http)) add(errors, `${nodePath}.http`, 'is required for frontend/external caller nodes');
      else {
        if (!isNonEmptyString(node.http.method)) add(errors, `${nodePath}.http.method`, 'must be a non-empty string');
        if (!isNonEmptyString(node.http.url)) add(errors, `${nodePath}.http.url`, 'must be a non-empty string');
        if (node.http.params !== undefined) {
          validateHttpParams(node.http.params, `${nodePath}.http.params`, errors);
        }
        if (node.http.urlMapping !== undefined) {
          if (!isObject(node.http.urlMapping)) add(errors, `${nodePath}.http.urlMapping`, 'must be an object when present');
        }
      }
    }
    if (node.kind === 'database') {
      if (!isObject(node.database)) add(errors, `${nodePath}.database`, 'is required for database nodes');
      else {
        for (const key of ['system', 'table', 'operation', 'criteria']) if (!isNonEmptyString(node.database[key])) add(errors, `${nodePath}.database.${key}`, 'must be a non-empty string');
        if (node.database.returnsRows === true && !isNonEmptyString(node.database.returnsRowsEvidence)) {
          add(errors, `${nodePath}.database.returnsRowsEvidence`, 'is required when returnsRows is true');
        }
        // DML operations default to affected-row-count
        const dmlOps = new Set(['INSERT', 'UPDATE', 'DELETE', 'UPSERT']);
        if (dmlOps.has(node.database.operation?.toUpperCase())) {
          if (node.result?.source === 'query-result' && !node.database.returnsRows) {
            add(errors, `${nodePath}.result.source`, 'DML nodes claiming query-result must set database.returnsRows to true with evidence');
          }
        }
      }
    }
    if (node.kind === 'response') {
      if (!isObject(node.response)) add(errors, `${nodePath}.response`, 'is required for response nodes');
      else {
        if (!Number.isInteger(node.response.status) || node.response.status < 100) add(errors, `${nodePath}.response.status`, 'must be an HTTP status integer');
        for (const key of ['contentType', 'bodyShape']) if (!isNonEmptyString(node.response[key])) add(errors, `${nodePath}.response.${key}`, 'must be a non-empty string');
      }
    }
    if (node.kind === 'break') {
      if (!isObject(node.break)) add(errors, `${nodePath}.break`, 'is required for break nodes');
      else for (const key of ['phase', 'reason', 'knownNext']) if (!isNonEmptyString(node.break[key])) add(errors, `${nodePath}.break.${key}`, 'must be a non-empty string');
    }
  });

  if (!nodes.has(flow.entryNodeId)) add(errors, `${flowPath}.entryNodeId`, 'must reference an existing node');
  else if (nodes.get(flow.entryNodeId).kind !== 'frontend') add(errors, `${flowPath}.entryNodeId`, 'must reference a frontend/external caller node');

  const edges = [];
  const edgeIds = new Set();
  const outgoing = new Map([...nodes.keys()].map((id) => [id, []]));
  const requestOutgoing = new Map([...nodes.keys()].map((id) => [id, []]));
  const returnOutgoing = new Map([...nodes.keys()].map((id) => [id, []]));
  const spawnEdges = [];
  flow.edges.forEach((edge, index) => {
    const edgePath = `${flowPath}.edges[${index}]`;
    if (!isObject(edge)) {
      add(errors, edgePath, 'must be an object');
      return;
    }
    if (!isNonEmptyString(edge.id)) add(errors, `${edgePath}.id`, 'must be a non-empty string');
    else if (edgeIds.has(edge.id)) add(errors, `${edgePath}.id`, `duplicates edge ${edge.id}`);
    else edgeIds.add(edge.id);
    if (!nodes.has(edge.from)) add(errors, `${edgePath}.from`, `unknown node ${edge.from}`);
    if (!nodes.has(edge.to)) add(errors, `${edgePath}.to`, `unknown node ${edge.to}`);
    if (!DIRECTIONS.has(edge.direction)) add(errors, `${edgePath}.direction`, 'must be request, return, branch, or spawn');
    if (!Number.isInteger(edge.order) || edge.order < 0) add(errors, `${edgePath}.order`, 'must be a non-negative integer');
    if ((edge.direction === 'branch' || edge.direction === 'spawn') && !isNonEmptyString(edge.condition)) add(errors, `${edgePath}.condition`, 'is required for branch and spawn edges');
    if (edge.direction === 'return') {
      if (!isObject(edge.transform)) add(errors, `${edgePath}.transform`, 'is required for return edges');
      else for (const key of ['before', 'after', 'action']) if (!isNonEmptyString(edge.transform[key])) add(errors, `${edgePath}.transform.${key}`, 'must be a non-empty string');
    }
    if (edge.direction === 'request' || edge.direction === 'branch') {
      const target = nodes.get(edge.to);
      if (target && CALL_TARGET_KINDS.has(target.kind)) {
        if (!isObject(edge.call) || !Array.isArray(edge.call.arguments)) add(errors, `${edgePath}.call.arguments`, 'is required when a request/branch edge enters a method node');
        else {
          edge.call.arguments.forEach((arg, argIndex) => {
            const argPath = `${edgePath}.call.arguments[${argIndex}]`;
            if (!isObject(arg) || !isNonEmptyString(arg.parameter) || !isNonEmptyString(arg.expression)) add(errors, argPath, 'must include parameter and expression strings');
          });
          if (METHOD_KINDS.has(target.kind) && Array.isArray(target.params)) {
            const expected = new Set(target.params.map((param) => param.name));
            const provided = new Set(edge.call.arguments.map((arg) => arg?.parameter));
            for (const name of expected) if (!provided.has(name)) add(errors, `${edgePath}.call.arguments`, `must map target parameter ${name}`);
            for (const name of provided) if (isNonEmptyString(name) && !expected.has(name)) add(errors, `${edgePath}.call.arguments`, `maps unknown target parameter ${name}`);
          }
        }
      }
    }
    validateEvidence(edge.evidence, `${edgePath}.evidence`, errors);
    if (Array.isArray(edge.evidence) && edge.evidence.length > 0 && edge.evidence.every((item) => item?.basis === 'runtime-unknown')) {
      add(errors, `${edgePath}.evidence`, 'edges cannot rely only on runtime-unknown evidence');
    }
    if (nodes.has(edge.from) && nodes.has(edge.to)) {
      edges.push(edge);
      outgoing.get(edge.from).push(edge);
      if (edge.direction === 'request' || edge.direction === 'branch') requestOutgoing.get(edge.from).push(edge);
      if (edge.direction === 'return') returnOutgoing.get(edge.from).push(edge);
      if (edge.direction === 'spawn') spawnEdges.push(edge);
    }
  });

  for (const [id, node] of nodes) if (node.kind === 'break' && outgoing.get(id).length > 0) add(errors, `${flowPath}.nodes[${id}]`, 'break nodes must have out-degree 0');

  const allReachable = walk(flow.entryNodeId, outgoing);
  for (const id of nodes.keys()) if (!allReachable.has(id)) add(errors, `${flowPath}.nodes.${id}`, 'must be reachable from entryNodeId through declared edges');

  const requestReachable = walk(flow.entryNodeId, requestOutgoing);
  const reachableTerminals = [...requestReachable].filter((id) => TERMINAL_KINDS.has(nodes.get(id)?.kind));
  if (reachableTerminals.length === 0) add(errors, `${flowPath}.entryNodeId`, 'request path must reach a database/external/memory terminal or break node');

  const reachableBreaks = reachableTerminals.filter((id) => nodes.get(id).kind === 'break');
  if (flow.status === 'broken' && reachableBreaks.length === 0) add(errors, `${flowPath}.status`, 'broken flows must reach a break node');
  if (flow.status === 'complete' && reachableBreaks.length > 0) add(errors, `${flowPath}.status`, 'complete flows cannot have a reachable break node');

  if (flow.status === 'complete') {
    if (!isNonEmptyString(flow.responseNodeId) || !nodes.has(flow.responseNodeId)) add(errors, `${flowPath}.responseNodeId`, 'complete flows require an existing response node');
    else if (nodes.get(flow.responseNodeId).kind !== 'response') add(errors, `${flowPath}.responseNodeId`, 'must reference a response node');
    for (const terminalId of reachableTerminals.filter((id) => nodes.get(id).kind !== 'break')) {
      if (!canReach(terminalId, flow.responseNodeId, returnOutgoing)) add(errors, `${flowPath}.nodes.${terminalId}`, 'terminal must have a return path to responseNodeId');
    }
  }

  // Validate paths
  validatePaths(flow, flowPath, nodes, edgeIds, errors);

  // Validate transactions
  if (flow.transactions !== undefined) {
    validateTransactions(flow, flowPath, nodes, errors);
  }

  // Validate spawn edges don't appear in parent path sync sequences
  if (Array.isArray(flow.paths) && spawnEdges.length > 0) {
    const spawnEdgeIds = new Set(spawnEdges.map((e) => e.id));
    flow.paths.forEach((path, pathIndex) => {
      if (path.steps) {
        path.steps.forEach((step, stepIndex) => {
          if (step.edgeId && spawnEdgeIds.has(step.edgeId)) {
            add(errors, `${flowPath}.paths[${pathIndex}].steps[${stepIndex}].edgeId`, 'spawn edges cannot appear in parent path sync sequences; create a separate spawn path');
          }
        });
      }
    });
  }

  return { nodes, edges, requestReachable, reachableTerminals };
}

function validatePaths(flow, flowPath, nodes, edgeIds, errors) {
  if (!Array.isArray(flow.paths) || flow.paths.length === 0) {
    add(errors, `${flowPath}.paths`, 'must contain at least one path');
    return;
  }

  const pathIds = new Set();
  const allNodeIds = new Set(nodes.keys());
  const allEdgeRefs = new Set();
  const memberNodeRefs = new Set();
  const memberEdgeRefs = new Set();

  flow.paths.forEach((path, pathIndex) => {
    const pathPath = `${flowPath}.paths[${pathIndex}]`;
    if (!isObject(path)) {
      add(errors, pathPath, 'must be an object');
      return;
    }
    if (!isNonEmptyString(path.id)) {
      add(errors, `${pathPath}.id`, 'must be a non-empty string');
    } else if (pathIds.has(path.id)) {
      add(errors, `${pathPath}.id`, `duplicates path ${path.id}`);
    } else {
      pathIds.add(path.id);
    }
    if (!isNonEmptyString(path.label)) add(errors, `${pathPath}.label`, 'must be a non-empty string');
    if (path.condition !== null && path.condition !== undefined && !isNonEmptyString(path.condition)) {
      add(errors, `${pathPath}.condition`, 'must be a non-empty string or null');
    }
    if (!Array.isArray(path.steps) || path.steps.length === 0) {
      add(errors, `${pathPath}.steps`, 'must contain at least one step');
      return;
    }

    let prevNodeId = null;
    const visitedNodes = new Set();
    let dbCount = 0;
    path.steps.forEach((step, stepIndex) => {
      const stepPath = `${pathPath}.steps[${stepIndex}]`;
      if (!isObject(step)) {
        add(errors, stepPath, 'must be an object');
        return;
      }
      if (!isNonEmptyString(step.nodeId) || !allNodeIds.has(step.nodeId)) {
        add(errors, `${stepPath}.nodeId`, `must reference an existing node`);
      } else {
        const node = nodes.get(step.nodeId);
        if (node?.kind === 'database') dbCount++;
        memberNodeRefs.add(step.nodeId);
      }
      if (stepIndex === 0) {
        if (step.edgeId !== null && step.edgeId !== undefined) {
          add(errors, `${stepPath}.edgeId`, 'first step must have edgeId null');
        }
        prevNodeId = step.nodeId;
        visitedNodes.add(step.nodeId);
      } else {
        if (!isNonEmptyString(step.edgeId) || !edgeIds.has(step.edgeId)) {
          add(errors, `${stepPath}.edgeId`, `must reference an existing edge`);
        } else {
          memberEdgeRefs.add(step.edgeId);
          // Check continuity: edge must arrive at current step's nodeId
          // and depart from a previously visited node (supports sub-call returns)
          const edge = flow.edges.find((e) => e.id === step.edgeId);
          if (edge && step.nodeId) {
            if (edge.to !== step.nodeId) {
              add(errors, `${stepPath}.edgeId`, `edge ${step.edgeId} ends at ${edge.to}, but current step is ${step.nodeId}`);
            }
            if (prevNodeId && edge.from !== prevNodeId && !visitedNodes.has(edge.from)) {
              add(errors, `${stepPath}.edgeId`, `edge ${step.edgeId} starts from ${edge.from}, which was not previously visited in the path`);
            }
          }
        }
        prevNodeId = step.nodeId;
        visitedNodes.add(step.nodeId);
      }
    });

    if (!isNonEmptyString(path.terminalNodeId) || !allNodeIds.has(path.terminalNodeId)) {
      add(errors, `${pathPath}.terminalNodeId`, 'must reference an existing node');
    } else if (path.steps.length > 0) {
      const lastStep = path.steps[path.steps.length - 1];
      if (lastStep.nodeId !== path.terminalNodeId) {
        add(errors, `${pathPath}.terminalNodeId`, `must match the last step nodeId (${lastStep.nodeId})`);
      }
    }

    if (path.dbOperationCount !== undefined) {
      if (!Number.isInteger(path.dbOperationCount) || path.dbOperationCount < 0) {
        add(errors, `${pathPath}.dbOperationCount`, 'must be a non-negative integer');
      } else if (path.dbOperationCount !== dbCount) {
        add(errors, `${pathPath}.dbOperationCount`, `must equal the number of database nodes in steps (${dbCount})`);
      }
    }
  });

  // All nodes must belong to at least one path
  for (const nodeId of allNodeIds) {
    if (!memberNodeRefs.has(nodeId)) {
      add(errors, `${flowPath}.nodes.${nodeId}`, 'must belong to at least one path');
    }
  }
  // All edges should belong to at least one path (except spawn edges which may be in separate spawn paths)
  for (const edgeId of edgeIds) {
    if (!memberEdgeRefs.has(edgeId)) {
      // Check if it's a spawn edge - those can be in spawn paths
      const edge = flow.edges.find((e) => e.id === edgeId);
      if (edge?.direction !== 'spawn') {
        add(errors, `${flowPath}.edges.${edgeId}`, 'must belong to at least one path');
      }
    }
  }
}

function validateTransactions(flow, flowPath, nodes, errors) {
  if (!Array.isArray(flow.transactions)) {
    add(errors, `${flowPath}.transactions`, 'must be an array');
    return;
  }

  const allNodeIds = new Set(nodes.keys());
  const txIds = new Set();

  flow.transactions.forEach((tx, txIndex) => {
    const txPath = `${flowPath}.transactions[${txIndex}]`;
    if (!isObject(tx)) {
      add(errors, txPath, 'must be an object');
      return;
    }
    if (!isNonEmptyString(tx.id)) {
      add(errors, `${txPath}.id`, 'must be a non-empty string');
    } else if (txIds.has(tx.id)) {
      add(errors, `${txPath}.id`, `duplicates transaction ${tx.id}`);
    } else {
      txIds.add(tx.id);
    }

    if (!isNonEmptyString(tx.entryNodeId) || !allNodeIds.has(tx.entryNodeId)) {
      add(errors, `${txPath}.entryNodeId`, 'must reference an existing node');
    }

    const members = new Set();
    if (Array.isArray(tx.memberNodeIds)) {
      tx.memberNodeIds.forEach((nodeId, memberIndex) => {
        if (!isNonEmptyString(nodeId) || !allNodeIds.has(nodeId)) {
          add(errors, `${txPath}.memberNodeIds[${memberIndex}]`, 'must reference an existing node');
        } else if (members.has(nodeId)) {
          add(errors, `${txPath}.memberNodeIds[${memberIndex}]`, `duplicates member ${nodeId}`);
        } else {
          members.add(nodeId);
        }
      });
    } else {
      add(errors, `${txPath}.memberNodeIds`, 'must be an array');
    }

    const outsideMembers = new Set();
    if (Array.isArray(tx.outsideTxNodeIds)) {
      tx.outsideTxNodeIds.forEach((nodeId, outIndex) => {
        if (!isNonEmptyString(nodeId) || !allNodeIds.has(nodeId)) {
          add(errors, `${txPath}.outsideTxNodeIds[${outIndex}]`, 'must reference an existing node');
        } else if (members.has(nodeId)) {
          add(errors, `${txPath}.outsideTxNodeIds[${outIndex}]`, `${nodeId} cannot be both inside and outside the transaction`);
        } else if (outsideMembers.has(nodeId)) {
          add(errors, `${txPath}.outsideTxNodeIds[${outIndex}]`, `duplicates outside member ${nodeId}`);
        } else {
          outsideMembers.add(nodeId);
        }
      });
    }

    if (tx.commitPointNodeId !== undefined && tx.commitPointNodeId !== null) {
      if (!isNonEmptyString(tx.commitPointNodeId) || !allNodeIds.has(tx.commitPointNodeId)) {
        add(errors, `${txPath}.commitPointNodeId`, 'must reference an existing node when present');
      } else {
        const commitNode = nodes.get(tx.commitPointNodeId);
        if (commitNode && commitNode.lane !== 'return') {
          add(errors, `${txPath}.commitPointNodeId`, 'must reference a return-lane node');
        }
      }
    }

    if (tx.rollbackConditions !== undefined && !Array.isArray(tx.rollbackConditions)) {
      add(errors, `${txPath}.rollbackConditions`, 'must be an array when present');
    }
  });
}

function walk(start, adjacency) {
  const visited = new Set();
  if (!start || !adjacency.has(start)) return visited;
  const queue = [start];
  while (queue.length) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);
    for (const edge of adjacency.get(current) ?? []) if (!visited.has(edge.to)) queue.push(edge.to);
  }
  return visited;
}

function canReach(start, target, adjacency) {
  const visited = new Set();
  const queue = [start];
  while (queue.length) {
    const current = queue.shift();
    if (current === target) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const edge of adjacency.get(current) ?? []) queue.push(edge.to);
  }
  return false;
}

export function validateFlowData(data) {
  const errors = [];
  if (!isObject(data)) return ['root: must be an object'];
  if (data.version !== 2) add(errors, 'version', 'must be 2');
  if (!isObject(data.meta)) add(errors, 'meta', 'must be an object');
  else {
    for (const key of ['title', 'summary']) if (!isNonEmptyString(data.meta[key])) add(errors, `meta.${key}`, 'must be a non-empty string');
    if (!Array.isArray(data.meta.roots)) add(errors, 'meta.roots', 'must be an array');
    else data.meta.roots.forEach((root, index) => {
      if (!isObject(root) || !isNonEmptyString(root.path) || !isNonEmptyString(root.role)) add(errors, `meta.roots[${index}]`, 'must include path and role strings');
    });
  }
  if (!isObject(data.scope)) add(errors, 'scope', 'must be an object');
  else {
    if (!SCOPE_TYPES.has(data.scope.type)) add(errors, 'scope.type', 'must be feature, module, or project');
    if (!COVERAGE_TYPES.has(data.scope.coverage)) add(errors, 'scope.coverage', 'must be complete, sampled, or partial');
    if (typeof data.scope.discoveryComplete !== 'boolean') add(errors, 'scope.discoveryComplete', 'must be boolean');
    if (!isNonEmptyString(data.scope.selectionBasis)) add(errors, 'scope.selectionBasis', 'must be a non-empty string');
    const endpoints = data.scope.counts?.endpoints;
    if (!isObject(endpoints) || !Number.isInteger(endpoints.discovered) || !Number.isInteger(endpoints.traced)) add(errors, 'scope.counts.endpoints', 'must include integer discovered and traced counts');
    else {
      if (endpoints.discovered < 1) add(errors, 'scope.counts.endpoints.discovered', 'must be at least 1');
      if (endpoints.traced < 1) add(errors, 'scope.counts.endpoints.traced', 'must be at least 1');
      if (endpoints.traced > endpoints.discovered) add(errors, 'scope.counts.endpoints', 'traced cannot exceed discovered');
      if (data.scope.coverage === 'complete' && (endpoints.traced !== endpoints.discovered || data.scope.omitted?.length)) add(errors, 'scope.coverage', 'complete requires traced == discovered and no omitted endpoints');
      if (data.scope.coverage === 'sampled' && (endpoints.traced >= endpoints.discovered || !Array.isArray(data.scope.omitted) || data.scope.omitted.length !== endpoints.discovered - endpoints.traced)) add(errors, 'scope.coverage', 'sampled requires an omitted entry for every untraced endpoint');
    }
    if (!Array.isArray(data.scope.omitted)) add(errors, 'scope.omitted', 'must be an array');
    else data.scope.omitted.forEach((item, index) => {
      if (!isObject(item) || !isNonEmptyString(item.method) || !isNonEmptyString(item.url) || !isNonEmptyString(item.reason)) add(errors, `scope.omitted[${index}]`, 'must include method, url, and reason strings');
    });
    if (data.scope.type === 'project' && (!isObject(data.scope.counts?.modules) || !Number.isInteger(data.scope.counts.modules.discovered) || !Number.isInteger(data.scope.counts.modules.traced))) add(errors, 'scope.counts.modules', 'is required for project scope');
  }
  if (!Array.isArray(data.flows) || data.flows.length === 0) add(errors, 'flows', 'must contain at least one flow');
  else {
    const flowIds = new Set();
    data.flows.forEach((flow, index) => {
      if (isObject(flow) && isNonEmptyString(flow.id)) {
        if (flowIds.has(flow.id)) add(errors, `flows[${index}].id`, `duplicates flow ${flow.id}`);
        flowIds.add(flow.id);
      }
      validateFlow(flow, `flows[${index}]`, errors);
    });
    const traced = data.scope?.counts?.endpoints?.traced;
    if (Number.isInteger(traced) && traced !== data.flows.length) add(errors, 'flows', 'must contain one flow per traced endpoint');
  }
  return errors;
}

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error('Usage: node validate-flow-data.mjs <flow-data.json>');
    process.exitCode = 2;
    return;
  }
  let data;
  try {
    data = JSON.parse(await readFile(input, 'utf8'));
  } catch (error) {
    console.error(`Cannot read JSON: ${error.message}`);
    process.exitCode = 2;
    return;
  }
  const errors = validateFlowData(data);
  if (errors.length) {
    console.error(`FLOW_DATA invalid (${errors.length} error${errors.length === 1 ? '' : 's'}):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`FLOW_DATA valid: ${data.flows.length} flow${data.flows.length === 1 ? '' : 's'}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
