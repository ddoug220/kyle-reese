import fs from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';
import { analyzeSource } from './analyze-source.js';

export const DEFAULT_THRESHOLDS = Object.freeze({
  cyclomatic: 22,
  cognitive: 22,
  halsteadDifficulty: 80,
});

export const DEFAULT_INCLUDE = Object.freeze([
  '**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}',
]);

export const DEFAULT_EXCLUDE = Object.freeze([
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/.next/**',
  '**/.cache/**',
  '**/*.d.ts',
]);

export async function auditProject(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const config = await loadConfig(root, options.configFile);
  const thresholds = normalizeThresholds({
    ...DEFAULT_THRESHOLDS,
    ...config.thresholds,
    ...options.thresholds,
  });
  const include = options.include ?? config.include ?? DEFAULT_INCLUDE;
  const exclude = options.exclude ?? config.exclude ?? DEFAULT_EXCLUDE;
  const relativeFiles = await fg(include, {
    cwd: root,
    absolute: false,
    onlyFiles: true,
    unique: true,
    followSymbolicLinks: false,
    ignore: exclude,
  });
  relativeFiles.sort();

  const violations = [];
  const parseErrors = [];
  const allFunctions = [];
  const maxima = { cyclomatic: 0, cognitive: 0, halsteadDifficulty: 0 };

  for (const relativeFile of relativeFiles) {
    const absoluteFile = path.join(root, relativeFile);
    let sourceText;
    try {
      sourceText = await fs.readFile(absoluteFile, 'utf8');
    } catch (error) {
      parseErrors.push({ file: relativeFile, line: 1, column: 1, message: error.message });
      continue;
    }

    const analysis = analyzeSource(relativeFile, sourceText);
    parseErrors.push(...analysis.parseErrors);
    for (const result of analysis.functions) {
      const normalized = {
        ...result,
        metrics: {
          cyclomatic: result.metrics.cyclomatic,
          cognitive: result.metrics.cognitive,
          halsteadDifficulty: result.metrics.halstead.difficulty,
          halstead: result.metrics.halstead,
        },
      };
      allFunctions.push(normalized);
      maxima.cyclomatic = Math.max(maxima.cyclomatic, normalized.metrics.cyclomatic);
      maxima.cognitive = Math.max(maxima.cognitive, normalized.metrics.cognitive);
      maxima.halsteadDifficulty = Math.max(
        maxima.halsteadDifficulty,
        normalized.metrics.halsteadDifficulty,
      );
      const failedMetrics = failedMetricNames(normalized.metrics, thresholds);
      if (failedMetrics.length > 0) violations.push({ ...normalized, failedMetrics });
    }
  }

  violations.sort((left, right) => {
    const severityDifference = severity(right, thresholds) - severity(left, thresholds);
    if (severityDifference !== 0) return severityDifference;
    return left.file.localeCompare(right.file) || left.line - right.line;
  });

  return {
    healthy: violations.length === 0 && parseErrors.length === 0,
    root,
    thresholds,
    include,
    exclude,
    summary: {
      filesScanned: relativeFiles.length,
      functionsScanned: allFunctions.length,
      violatingFunctions: violations.length,
      violatingFiles: new Set(violations.map((violation) => violation.file)).size,
      violationsByMetric: {
        cyclomatic: violations.filter((violation) => violation.failedMetrics.includes('cyclomatic')).length,
        cognitive: violations.filter((violation) => violation.failedMetrics.includes('cognitive')).length,
        halsteadDifficulty: violations.filter((violation) =>
          violation.failedMetrics.includes('halsteadDifficulty')).length,
      },
      parseErrors: parseErrors.length,
      maxima,
    },
    violations,
    parseErrors,
    functions: options.includeFunctions ? allFunctions : undefined,
  };
}

export async function loadConfig(root, explicitConfigFile) {
  const configFile = explicitConfigFile
    ? path.resolve(root, explicitConfigFile)
    : path.join(root, 'kyle-reese.config.json');
  try {
    return JSON.parse(await fs.readFile(configFile, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT' && !explicitConfigFile) return {};
    throw new Error(`Could not read ${configFile}: ${error.message}`);
  }
}

export function failedMetricNames(metrics, thresholds) {
  const failures = [];
  if (metrics.cyclomatic >= thresholds.cyclomatic) failures.push('cyclomatic');
  if (metrics.cognitive >= thresholds.cognitive) failures.push('cognitive');
  if (metrics.halsteadDifficulty >= thresholds.halsteadDifficulty) {
    failures.push('halsteadDifficulty');
  }
  return failures;
}

function normalizeThresholds(thresholds) {
  for (const [name, value] of Object.entries(thresholds)) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`Threshold ${name} must be a positive number.`);
    }
  }
  return thresholds;
}

function severity(result, thresholds) {
  return Math.max(
    result.metrics.cyclomatic / thresholds.cyclomatic,
    result.metrics.cognitive / thresholds.cognitive,
    result.metrics.halsteadDifficulty / thresholds.halsteadDifficulty,
  );
}
