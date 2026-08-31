import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import { auditProject, failedMetricNames, loadConfig } from './audit.js';
import { analyzeSource, measureNode } from './analyze-source.js';

export async function fixProject(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const config = await loadConfig(root, options.configFile);
  const checkCommand = options.checkCommand ?? config.fix?.checkCommand;
  const dryRun = options.dryRun ?? false;
  const maxPasses = options.maxPasses ?? config.fix?.maxPasses ?? 50;

  if (!dryRun && !isCommand(checkCommand)) {
    throw new Error(
      'Fix mode requires checkCommand, such as ["npm", "test"]. Use dryRun to inspect a proposed change without writing it.',
    );
  }

  const auditOptions = {
    root,
    configFile: options.configFile,
    thresholds: options.thresholds,
    include: options.include,
    exclude: options.exclude,
  };
  let report = await auditProject(auditOptions);
  const initialReport = report;
  const edits = [];
  let stoppedReason;

  for (let pass = 0; !report.healthy && pass < maxPasses; pass += 1) {
    const proposal = await findSafeExtraction(root, report);
    if (!proposal) {
      stoppedReason = 'No behavior-preserving extraction was available for the remaining violations.';
      break;
    }
    if (dryRun) {
      edits.push(proposal.summary);
      stoppedReason = 'Dry run stopped before writing the proposed extraction.';
      break;
    }

    await fs.writeFile(proposal.absoluteFile, proposal.updatedSource);
    const check = await runCommand(checkCommand, root);
    if (check.code !== 0) {
      await fs.writeFile(proposal.absoluteFile, proposal.originalSource);
      stoppedReason = `Verification failed after editing ${proposal.summary.file}; the edit was reverted.\n${check.output}`;
      break;
    }

    const nextReport = await auditProject(auditOptions);
    if (healthDebt(nextReport) >= healthDebt(report)) {
      await fs.writeFile(proposal.absoluteFile, proposal.originalSource);
      stoppedReason = `The proposed edit did not reduce measured health debt in ${proposal.summary.file}; the edit was reverted.`;
      break;
    }
    edits.push(proposal.summary);
    report = nextReport;
  }

  if (!report.healthy && edits.length >= maxPasses && !stoppedReason) {
    stoppedReason = `Stopped after the configured maximum of ${maxPasses} passes.`;
  }

  return {
    healthy: report.healthy,
    dryRun,
    initialReport,
    report,
    edits,
    stoppedReason,
  };
}

async function findSafeExtraction(root, report) {
  const files = [...new Set(report.violations.map((violation) => violation.file))];
  for (const relativeFile of files) {
    const absoluteFile = path.join(root, relativeFile);
    const originalSource = await fs.readFile(absoluteFile, 'utf8');
    const analysis = analyzeSource(relativeFile, originalSource);
    const violations = report.violations.filter((violation) => violation.file === relativeFile);

    for (const violation of violations) {
      const functionNode = findFunctionNode(analysis.sourceFile, violation.start);
      if (!functionNode || !ts.isBlock(functionNode.body)) continue;
      const candidates = functionNode.body.statements
        .filter((statement) => safeToExtract(statement))
        .map((statement) => ({
          statement,
          metrics: normalizeMetrics(measureNode(statement, analysis.sourceFile)),
        }))
        .filter(({ metrics }) => {
          const addsComplexity = metrics.cyclomatic > 1 || metrics.cognitive > 0;
          return addsComplexity && failedMetricNames(metrics, report.thresholds).length === 0;
        })
        .sort((left, right) => candidateValue(right.metrics) - candidateValue(left.metrics));

      for (const candidate of candidates) {
        const helperName = uniqueHelperName(originalSource, violation.name);
        const updatedSource = extractStatement(
          originalSource,
          candidate.statement,
          analysis.sourceFile,
          helperName,
        );
        const updatedAnalysis = analyzeSource(relativeFile, updatedSource);
        if (updatedAnalysis.parseErrors.length > 0) continue;
        if (
          fileHealthDebt(updatedAnalysis.functions, report.thresholds) >=
          fileHealthDebt(analysis.functions, report.thresholds)
        ) {
          continue;
        }

        return {
          absoluteFile,
          originalSource,
          updatedSource,
          summary: {
            file: relativeFile,
            line: violation.line,
            function: violation.name,
            helper: helperName,
            extractedMetrics: candidate.metrics,
          },
        };
      }
    }
  }
  return undefined;
}

function safeToExtract(root) {
  if (ts.isVariableStatement(root)) return false;
  let safe = true;

  function visit(node) {
    if (!safe) return;
    if (node !== root && isFunctionLike(node)) return;
    if (
      ts.isReturnStatement(node) ||
      ts.isBreakStatement(node) ||
      ts.isContinueStatement(node) ||
      ts.isLabeledStatement(node) ||
      ts.isAwaitExpression(node) ||
      ts.isYieldExpression(node)
    ) {
      safe = false;
      return;
    }
    if (
      ts.isVariableStatement(node) &&
      (node.declarationList.flags & ts.NodeFlags.BlockScoped) === 0
    ) {
      safe = false;
      return;
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'eval'
    ) {
      safe = false;
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(root);
  return safe;
}

function extractStatement(source, statement, sourceFile, helperName) {
  const start = statement.getStart(sourceFile);
  const end = statement.end;
  const position = sourceFile.getLineAndCharacterOfPosition(start);
  const lineStart = sourceFile.getPositionOfLineAndCharacter(position.line, 0);
  const indentation = source.slice(lineStart, start).match(/^\s*/)?.[0] ?? '';
  const original = source.slice(start, end);
  const bodyIndent = `${indentation}  `;
  const indentedOriginal = original
    .split('\n')
    .map((line, index) => {
      const relativeLine = index === 0 ? line : line.slice(Math.min(indentation.length, line.length));
      return `${bodyIndent}${relativeLine}`;
    })
    .join('\n');
  const replacement = [
    `const ${helperName} = () => {`,
    indentedOriginal,
    `${indentation}};`,
    `${indentation}${helperName}();`,
  ].join('\n');
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`;
}

function findFunctionNode(sourceFile, start) {
  let found;
  function visit(node) {
    if (found) return;
    if (isFunctionLike(node) && node.body && node.getStart(sourceFile) === start) {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

function isFunctionLike(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  );
}

function normalizeMetrics(metrics) {
  return {
    cyclomatic: metrics.cyclomatic,
    cognitive: metrics.cognitive,
    halsteadDifficulty: metrics.halstead.difficulty,
    halstead: metrics.halstead,
  };
}

function uniqueHelperName(source, functionName) {
  const words = functionName.match(/[A-Za-z0-9]+/g) ?? ['Function'];
  const stem = words
    .map((word) => `${word[0].toUpperCase()}${word.slice(1)}`)
    .join('');
  let suffix = 1;
  while (source.includes(`run${stem}Part${suffix}`)) suffix += 1;
  return `run${stem}Part${suffix}`;
}

function candidateValue(metrics) {
  return metrics.cyclomatic + metrics.cognitive + metrics.halsteadDifficulty / 10;
}

function fileHealthDebt(functions, thresholds) {
  return functions.reduce((total, result) => {
    const metrics = normalizeMetrics(result.metrics);
    return total + metricDebt(metrics.cyclomatic, thresholds.cyclomatic)
      + metricDebt(metrics.cognitive, thresholds.cognitive)
      + metricDebt(metrics.halsteadDifficulty, thresholds.halsteadDifficulty);
  }, 0);
}

function healthDebt(report) {
  return report.violations.reduce((total, violation) => {
    return total + metricDebt(violation.metrics.cyclomatic, report.thresholds.cyclomatic)
      + metricDebt(violation.metrics.cognitive, report.thresholds.cognitive)
      + metricDebt(
        violation.metrics.halsteadDifficulty,
        report.thresholds.halsteadDifficulty,
      );
  }, report.parseErrors.length * 1000);
}

function metricDebt(value, threshold) {
  return value < threshold ? 0 : 1 + (value - threshold) / threshold;
}

function isCommand(command) {
  return Array.isArray(command) && command.length > 0 && command.every((part) => typeof part === 'string');
}

function runCommand(command, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), {
      cwd,
      env: process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, output: output.trim() }));
  });
}
