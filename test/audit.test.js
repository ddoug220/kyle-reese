import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { auditProject } from '../src/index.js';

test('enforces strict less-than thresholds at the boundary', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kyle-reese-audit-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const branches = Array.from({ length: 21 }, (_, index) => {
    return `  if (value === ${index}) total += ${index};`;
  }).join('\n');
  await fs.writeFile(
    path.join(root, 'boundary.js'),
    `export function boundary(value) {\n  let total = 0;\n${branches}\n  return total;\n}\n`,
  );

  const report = await auditProject({ root, thresholds: { cognitive: 100, halsteadDifficulty: 1000 } });

  assert.equal(report.summary.functionsScanned, 1);
  assert.equal(report.violations.length, 1);
  assert.equal(report.violations[0].metrics.cyclomatic, 22);
  assert.deepEqual(report.violations[0].failedMetrics, ['cyclomatic']);
});

test('reports cognitive nesting and Halstead details per function', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kyle-reese-metrics-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(
    path.join(root, 'nested.ts'),
    `export function nested(a: number, b: number) {
  if (a > 0) {
    for (let index = 0; index < b; index += 1) {
      if (index % 2 === 0 && a !== b) return index;
    }
  }
  return -1;
}
`,
  );

  const report = await auditProject({ root, includeFunctions: true });
  const result = report.functions[0];

  assert.equal(result.metrics.cyclomatic, 5);
  assert.equal(result.metrics.cognitive, 7);
  assert.ok(result.metrics.halsteadDifficulty > 0);
  assert.ok(result.metrics.halstead.distinctOperators > 0);
  assert.ok(result.metrics.halstead.distinctOperands > 0);
});

test('reports syntax errors as an unhealthy audit', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kyle-reese-parse-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'broken.ts'), 'export function broken( {\n');

  const report = await auditProject({ root });

  assert.equal(report.healthy, false);
  assert.ok(report.parseErrors.length > 0);
});

test('measures a logical expression-bodied arrow without a parent node', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kyle-reese-arrow-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'arrow.js'), 'export const both = (left, right) => left && right;\n');

  const report = await auditProject({ root, includeFunctions: true });

  assert.equal(report.functions[0].metrics.cyclomatic, 2);
  assert.equal(report.functions[0].metrics.cognitive, 1);
});
