# Metric definitions

`kyle-reese` calculates each metric per function. A parent function does not inherit branches, operators, or operands from a nested function.

The definitions in this document are the package contract. Other analyzers may report different values under the same metric names.

## Cyclomatic complexity

Every function starts at 1. The score increases by 1 for each:

- `if` statement;
- `for`, `for…in`, `for…of`, `while`, or `do…while` loop;
- `catch` clause;
- non-default `case` clause;
- ternary expression;
- `&&`, `||`, or `??` operator.

Example:

```js
function label(value, fallback) {
  if (value && value.ready) return value.name;
  return fallback ?? 'unknown';
}
```

The function scores 4: the base path, `if`, `&&`, and `??`.

## Cognitive complexity

Cognitive complexity measures control-flow cost and adds extra cost for nesting.

- An `if`, loop, switch, catch clause, or ternary adds 1 plus its current nesting depth.
- An `else` adds 1.
- An `else if` adds flow cost without adding artificial nesting for the chain.
- A sequence of the same logical operator adds 1. Changing the operator starts another sequence.
- A labeled `break` or `continue` adds 1.
- Ordinary calls, assignments, and unlabelled jumps add no cognitive cost.

## Halstead difficulty

Halstead difficulty uses:

```text
(distinct operators / 2) × (total operands / distinct operands)
```

The analyzer measures executable function bodies. It excludes TypeScript type nodes and nested function bodies.

The JSON result includes the values behind the calculation:

```json
{
  "halsteadDifficulty": 12.5,
  "halstead": {
    "difficulty": 12.5,
    "operators": 18,
    "distinctOperators": 5,
    "operands": 30,
    "distinctOperands": 6
  }
}
```

## Threshold semantics

Thresholds are exclusive. A configuration value of 22 requires the measured value to be less than 22. Values of 22 and above fail.

## Parsing and file scope

The default audit includes:

```text
**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}
```

It excludes dependency, Git, build, coverage, cache, and TypeScript declaration files. Override `include` or `exclude` in `kyle-reese.config.json` when generated code or fixtures need a project-specific rule.

A parse error makes the audit unhealthy even when every parsed function passes its metric limits.
