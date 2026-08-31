export function formatReport(report, options = {}) {
  if (options.json) return `${JSON.stringify(report, null, 2)}\n`;

  const lines = [];
  const { summary, thresholds } = report;
  const maxViolations = options.maxViolations ?? 50;
  lines.push(
    `Scanned ${summary.functionsScanned} functions in ${summary.filesScanned} files.`,
  );
  lines.push(
    `Limits are strict: cyclomatic < ${thresholds.cyclomatic}, cognitive < ${thresholds.cognitive}, Halstead difficulty < ${thresholds.halsteadDifficulty}.`,
  );

  if (report.parseErrors.length > 0) {
    lines.push('', `Parse errors (${report.parseErrors.length}):`);
    for (const error of report.parseErrors) {
      lines.push(`  ${error.file}:${error.line}:${error.column} ${error.message}`);
    }
  }

  if (report.violations.length === 0) {
    lines.push('', report.parseErrors.length === 0 ? 'Health check passed.' : 'No metric violations found.');
    return `${lines.join('\n')}\n`;
  }

  lines.push('', `Violations (${report.violations.length} functions):`);
  for (const violation of report.violations.slice(0, maxViolations)) {
    const failed = violation.failedMetrics
      .map((name) => `${displayName(name)}=${metricValue(violation.metrics, name)}`)
      .join(', ');
    lines.push(`  ${violation.file}:${violation.line}:${violation.column} ${violation.name} — ${failed}`);
  }
  const hiddenCount = report.violations.length - maxViolations;
  if (hiddenCount > 0) {
    lines.push(`  … ${hiddenCount} more. Use --json for the complete report.`);
  }
  lines.push(
    '',
    `Maxima: cyclomatic ${summary.maxima.cyclomatic}, cognitive ${summary.maxima.cognitive}, Halstead difficulty ${summary.maxima.halsteadDifficulty}.`,
  );
  return `${lines.join('\n')}\n`;
}

function metricValue(metrics, name) {
  return name === 'halsteadDifficulty' ? metrics.halsteadDifficulty : metrics[name];
}

function displayName(name) {
  return name === 'halsteadDifficulty' ? 'halstead' : name;
}
