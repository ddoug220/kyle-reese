import path from 'node:path';
import ts from 'typescript';

const LOGICAL_OPERATORS = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
]);

const OPERAND_KINDS = new Set([
  ts.SyntaxKind.Identifier,
  ts.SyntaxKind.PrivateIdentifier,
  ts.SyntaxKind.NumericLiteral,
  ts.SyntaxKind.BigIntLiteral,
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.RegularExpressionLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
  ts.SyntaxKind.JsxText,
  ts.SyntaxKind.TrueKeyword,
  ts.SyntaxKind.FalseKeyword,
  ts.SyntaxKind.NullKeyword,
  ts.SyntaxKind.ThisKeyword,
  ts.SyntaxKind.SuperKeyword,
]);

const IGNORED_TOKEN_KINDS = new Set([
  ts.SyntaxKind.OpenBraceToken,
  ts.SyntaxKind.CloseBraceToken,
  ts.SyntaxKind.OpenParenToken,
  ts.SyntaxKind.CloseParenToken,
  ts.SyntaxKind.OpenBracketToken,
  ts.SyntaxKind.CloseBracketToken,
  ts.SyntaxKind.CommaToken,
  ts.SyntaxKind.SemicolonToken,
  ts.SyntaxKind.ColonToken,
  ts.SyntaxKind.EndOfFileToken,
]);

export function analyzeSource(filePath, sourceText) {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(filePath),
  );
  const parseErrors = (sourceFile.parseDiagnostics ?? []).map((diagnostic) => {
    const position = sourceFile.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
    return {
      file: filePath,
      line: position.line + 1,
      column: position.character + 1,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    };
  });
  const functions = [];

  function visit(node) {
    if (isFunctionWithBody(node)) {
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      functions.push({
        file: filePath,
        line: position.line + 1,
        column: position.character + 1,
        name: functionName(node, sourceFile),
        start: node.getStart(sourceFile),
        end: node.end,
        metrics: measureNode(node.body, sourceFile),
      });
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { functions, parseErrors, sourceFile };
}

export function measureNode(root, sourceFile) {
  return {
    cyclomatic: measureCyclomatic(root),
    cognitive: measureCognitive(root),
    halstead: measureHalstead(root, sourceFile),
  };
}

function measureCyclomatic(root) {
  let complexity = 1;

  function visit(node) {
    if (node !== root && isFunctionWithBody(node)) return;
    if (addsCyclomaticBranch(node)) complexity += 1;
    ts.forEachChild(node, visit);
  }

  visit(root);
  return complexity;
}

function measureCognitive(root) {
  let complexity = 0;

  function visit(node, nesting = 0, parent = undefined) {
    if (node !== root && isFunctionWithBody(node)) return;

    if (ts.isIfStatement(node)) {
      complexity += 1 + nesting;
      visit(node.expression, nesting, node);
      visit(node.thenStatement, nesting + 1, node);
      if (node.elseStatement) {
        if (ts.isIfStatement(node.elseStatement)) {
          visitElseIf(node.elseStatement, nesting);
        } else {
          complexity += 1;
          visit(node.elseStatement, nesting + 1, node);
        }
      }
      return;
    }

    if (
      ts.isForStatement(node) ||
      ts.isForInStatement(node) ||
      ts.isForOfStatement(node) ||
      ts.isWhileStatement(node) ||
      ts.isDoStatement(node)
    ) {
      complexity += 1 + nesting;
      ts.forEachChild(node, (child) => visit(child, child === node.statement ? nesting + 1 : nesting, node));
      return;
    }

    if (ts.isSwitchStatement(node)) {
      complexity += 1 + nesting;
      visit(node.expression, nesting, node);
      for (const clause of node.caseBlock.clauses) {
        for (const statement of clause.statements) visit(statement, nesting + 1, clause);
      }
      return;
    }

    if (ts.isCatchClause(node)) {
      complexity += 1 + nesting;
      ts.forEachChild(node, (child) => visit(child, nesting + 1, node));
      return;
    }

    if (ts.isConditionalExpression(node)) {
      complexity += 1 + nesting;
      visit(node.condition, nesting, node);
      visit(node.whenTrue, nesting + 1, node);
      visit(node.whenFalse, nesting + 1, node);
      return;
    }

    complexity += logicalFlowCost(node, parent);
    complexity += labeledJumpCost(node);

    ts.forEachChild(node, (child) => visit(child, nesting, node));
  }

  function visitElseIf(node, nesting) {
    complexity += 1;
    visit(node.expression, nesting, node);
    visit(node.thenStatement, nesting + 1, node);
    if (node.elseStatement) {
      if (ts.isIfStatement(node.elseStatement)) {
        visitElseIf(node.elseStatement, nesting);
      } else {
        complexity += 1;
        visit(node.elseStatement, nesting + 1, node);
      }
    }
  }

  visit(root);
  return complexity;
}

function logicalFlowCost(node, parent) {
  if (!ts.isBinaryExpression(node) || !LOGICAL_OPERATORS.has(node.operatorToken.kind)) {
    return 0;
  }
  const parentOperator = parent && ts.isBinaryExpression(parent)
    ? parent.operatorToken.kind
    : undefined;
  return parentOperator === node.operatorToken.kind ? 0 : 1;
}

function labeledJumpCost(node) {
  return (ts.isBreakStatement(node) || ts.isContinueStatement(node)) && node.label ? 1 : 0;
}

function measureHalstead(root, sourceFile) {
  const operators = [];
  const operands = [];

  function visit(node) {
    if (node !== root && isFunctionWithBody(node)) return;
    if (isTypeNode(node)) return;

    const children = node.getChildren(sourceFile);
    if (children.length > 0) {
      for (const child of children) visit(child);
      return;
    }

    const text = node.getText(sourceFile);
    if (!text || IGNORED_TOKEN_KINDS.has(node.kind)) return;
    if (OPERAND_KINDS.has(node.kind)) {
      operands.push(text);
      return;
    }
    if (isOperatorToken(node.kind)) operators.push(text);
  }

  visit(root);
  const distinctOperators = new Set(operators).size;
  const distinctOperands = new Set(operands).size;
  const difficulty =
    distinctOperands === 0
      ? 0
      : (distinctOperators / 2) * (operands.length / distinctOperands);

  return {
    difficulty: round(difficulty),
    operators: operators.length,
    distinctOperators,
    operands: operands.length,
    distinctOperands,
  };
}

function addsCyclomaticBranch(node) {
  if (
    ts.isIfStatement(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node) ||
    ts.isCatchClause(node) ||
    ts.isConditionalExpression(node) ||
    ts.isCaseClause(node)
  ) {
    return true;
  }
  return ts.isBinaryExpression(node) && LOGICAL_OPERATORS.has(node.operatorToken.kind);
}

function isOperatorToken(kind) {
  if (IGNORED_TOKEN_KINDS.has(kind) || OPERAND_KINDS.has(kind)) return false;
  return (
    (kind >= ts.SyntaxKind.FirstPunctuation && kind <= ts.SyntaxKind.LastPunctuation) ||
    (kind >= ts.SyntaxKind.FirstKeyword && kind <= ts.SyntaxKind.LastKeyword)
  );
}

function isTypeNode(node) {
  return typeof ts.isTypeNode === 'function' && ts.isTypeNode(node);
}

function isFunctionWithBody(node) {
  return (
    (ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node) ||
      ts.isConstructorDeclaration(node)) &&
    node.body !== undefined
  );
}

function functionName(node, sourceFile) {
  if (node.name) return node.name.getText(sourceFile);
  const parent = node.parent;
  if (ts.isVariableDeclaration(parent)) return parent.name.getText(sourceFile);
  if (ts.isPropertyAssignment(parent)) return parent.name.getText(sourceFile);
  if (ts.isPropertyDeclaration(parent)) return parent.name.getText(sourceFile);
  if (ts.isCallExpression(parent)) return '<callback>';
  return `<anonymous@${path.basename(sourceFile.fileName)}>`;
}

function scriptKindFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.tsx') return ts.ScriptKind.TSX;
  if (extension === '.jsx') return ts.ScriptKind.JSX;
  if (extension === '.js' || extension === '.mjs' || extension === '.cjs') return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function round(value) {
  return Math.round(value * 100) / 100;
}
