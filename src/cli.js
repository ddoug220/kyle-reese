#!/usr/bin/env node

import { auditProject } from './audit.js';
import { fixProject } from './fix.js';
import { formatReport } from './report.js';

try {
  const parsed = parseArguments(process.argv.slice(2));
  if (parsed.help) {
    process.stdout.write(helpText());
    process.exitCode = 0;
  } else if (parsed.command === 'audit') {
    const report = await auditProject(parsed.options);
    process.stdout.write(formatReport(report, {
      json: parsed.json,
      maxViolations: parsed.maxViolations,
    }));
    process.exitCode = report.healthy ? 0 : 1;
  } else if (parsed.command === 'fix') {
    const result = await fixProject(parsed.options);
    if (parsed.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      process.stdout.write(formatFixResult(result, parsed.maxViolations));
    }
    process.exitCode = result.healthy ? 0 : 1;
  }
} catch (error) {
  process.stderr.write(`kyle-reese: ${error.message}\n`);
  process.exitCode = 2;
}

function parseArguments(args) {
  const command = args[0] && !args[0].startsWith('-') ? args.shift() : 'audit';
  if (!['audit', 'fix'].includes(command)) {
    throw new Error(`Unknown command ${command}. Use audit or fix.`);
  }
  const options = {};
  let json = false;
  let help = false;
  let maxViolations = 50;

  if (args[0] && !args[0].startsWith('-')) options.root = args.shift();
  while (args.length > 0) {
    const flag = args.shift();
    if (flag === '--help' || flag === '-h') help = true;
    else if (flag === '--json') json = true;
    else if (flag === '--dry-run') options.dryRun = true;
    else if (flag === '--config') options.configFile = requiredValue(flag, args);
    else if (flag === '--limit') maxViolations = positiveNumber(flag, args);
    else if (flag === '--max-passes') options.maxPasses = positiveNumber(flag, args);
    else if (flag === '--cyclomatic') setThreshold(options, 'cyclomatic', flag, args);
    else if (flag === '--cognitive') setThreshold(options, 'cognitive', flag, args);
    else if (flag === '--halstead') setThreshold(options, 'halsteadDifficulty', flag, args);
    else if (flag === '--check-command') {
      options.checkCommand = commandArray(flag, requiredValue(flag, args));
    } else {
      throw new Error(`Unknown option ${flag}.`);
    }
  }
  return { command, options, json, help, maxViolations };
}

function setThreshold(options, metric, flag, args) {
  options.thresholds ??= {};
  options.thresholds[metric] = positiveNumber(flag, args);
}

function positiveNumber(flag, args) {
  const value = Number(requiredValue(flag, args));
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${flag} requires a positive number.`);
  return value;
}

function commandArray(flag, raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${flag} must be a JSON array, for example '["npm","test"]'.`);
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.some((part) => typeof part !== 'string')) {
    throw new Error(`${flag} must be a non-empty JSON array of strings.`);
  }
  return parsed;
}

function requiredValue(flag, args) {
  const value = args.shift();
  if (value === undefined) throw new Error(`${flag} requires a value.`);
  return value;
}

function formatFixResult(result, maxViolations) {
  const lines = [formatReport(result.report, { maxViolations }).trimEnd()];
  if (result.edits.length > 0) {
    lines.push('', result.dryRun ? 'Proposed extraction:' : `Applied extractions (${result.edits.length}):`);
    for (const edit of result.edits) {
      lines.push(`  ${edit.file}:${edit.line} ${edit.function} → ${edit.helper}`);
    }
  }
  if (result.stoppedReason) lines.push('', result.stoppedReason);
  return `${lines.join('\n')}\n`;
}

function helpText() {
  return `kyle-reese <audit|fix> [path] [options]

Commands:
  audit                 Measure every JavaScript and TypeScript function.
  fix                   Extract safe statement groups and re-audit after each edit.

Options:
  --cyclomatic <n>      Require cyclomatic complexity to be less than n (default 22).
  --cognitive <n>       Require cognitive complexity to be less than n (default 22).
  --halstead <n>        Require Halstead difficulty to be less than n (default 80).
  --config <path>       Read a config file relative to the project root.
  --json                Print machine-readable JSON.
  --limit <n>           Show at most n violations in text output (default 50).
  --dry-run             Show one safe extraction without writing it.
  --check-command <json-array>
                         Verification command required by fix mode.
  --max-passes <n>      Maximum verified edits in one run (default 50).
  --help                Show this help.
`;
}
