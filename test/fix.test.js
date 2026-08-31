import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fixProject } from '../src/index.js';

test('extracts complex statements until the project is healthy and verifies every edit', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kyle-reese-fix-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const branches = Array.from({ length: 22 }, (_, index) => {
    return `  if (value > ${index}) total += ${index + 1};`;
  }).join('\n');
  await fs.writeFile(
    path.join(root, 'subject.js'),
    `export function score(value) {\n  let total = 0;\n${branches}\n  return total;\n}\n`,
  );
  await fs.writeFile(
    path.join(root, 'verify.mjs'),
    `import assert from 'node:assert/strict';
import { score } from './subject.js';
assert.equal(score(0), 0);
assert.equal(score(30), 253);
`,
  );

  const result = await fixProject({
    root,
    checkCommand: [process.execPath, 'verify.mjs'],
    thresholds: { halsteadDifficulty: 1000 },
  });

  assert.equal(result.healthy, true);
  assert.ok(result.edits.length >= 2);
  const updated = await fs.readFile(path.join(root, 'subject.js'), 'utf8');
  assert.match(updated, /const runScorePart1 = \(\) =>/);
});

test('refuses to write without a verification command', async () => {
  await assert.rejects(
    fixProject({ root: process.cwd() }),
    /requires checkCommand/,
  );
});

test('dry run leaves source unchanged', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kyle-reese-dry-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const branches = Array.from({ length: 22 }, (_, index) => {
    return `  if (value > ${index}) value += ${index};`;
  }).join('\n');
  const source = `export function mutate(value) {\n${branches}\n  return value;\n}\n`;
  await fs.writeFile(path.join(root, 'subject.js'), source);

  const result = await fixProject({
    root,
    dryRun: true,
    thresholds: { halsteadDifficulty: 1000 },
  });

  assert.equal(result.edits.length, 1);
  assert.equal(await fs.readFile(path.join(root, 'subject.js'), 'utf8'), source);
});

test('does not extract a declaration whose scope would change', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kyle-reese-scope-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const declarations = Array.from({ length: 22 }, (_, index) => {
    return `  const value${index} = input && ${index};`;
  }).join('\n');
  const source = `export function declared(input) {\n${declarations}\n  return value21;\n}\n`;
  await fs.writeFile(path.join(root, 'subject.js'), source);

  const result = await fixProject({
    root,
    dryRun: true,
    thresholds: { halsteadDifficulty: 1000 },
  });

  assert.equal(result.edits.length, 0);
  assert.match(result.stoppedReason, /No behavior-preserving extraction/);
  assert.equal(await fs.readFile(path.join(root, 'subject.js'), 'utf8'), source);
});
