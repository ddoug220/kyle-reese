# kyle-reese

[![CI](https://github.com/ddoug220/kyle-reese/actions/workflows/ci.yml/badge.svg)](https://github.com/ddoug220/kyle-reese/actions/workflows/ci.yml)
[![Node.js 20+](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![MIT license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Stop letting pre-Skynet machines pollute your codebase. `kyle-reese` is a relentless CLI tool designed to hunt down JavaScript and TypeScript functions that have grown too hard to reason about. It can't be bargained with. It can't be reasoned with. It doesn't feel pity, or remorse, or fear. And it absolutely will not stop, ever, until your code is free of slop. It audits three function-level metrics and can apply a narrow set of verified refactors.

The limits are exclusive. A value of 22 fails a `< 22` limit.

## Why use `kyle-reese`?
- Zero Trust for Tech Com. If an LLM hallucinated a 40-line utility function to do .map() already does, Kyle will find it and mark it for termination.
- Detects lazy pattern replication, excessive boilerplate and typical AI-generated fluff that inflates your bundle size.
- Evaluates complexity and code readability to ensure your team isn't inheriting tech debt from a prompt-factory.

## Read the report

Text output lists the 50 worst functions by default:

```text
Scanned 148 functions in 23 files.
Limits are strict: cyclomatic < 22, cognitive < 22, Halstead difficulty < 80.

Violations (2 functions):
  src/planner.ts:48:1 planWork — cyclomatic=27, cognitive=31
  src/parser.ts:92:1 parseInput — halstead=84.5
```

Limit the text report or emit complete JSON:

```sh
npx kyle-reese audit . --limit 10
npx kyle-reese audit . --json
```

## Apply verified fixes

Fix mode extracts eligible branch-bearing statements into local arrow functions. The refactor preserves closure access, lexical `this`, execution order, and thrown errors.

Every written edit requires a verification command. `kyle-reese` runs the command after each edit and restores an edit when verification fails.

```sh
npx kyle-reese fix . \
  --check-command '["npm","test"]'
```

Inspect one proposed extraction without writing files:

```sh
npx kyle-reese fix . --dry-run
```

Fix mode refuses to move returns, jumps, `await`, `yield`, declarations whose scope would change, labels, function-scoped `var`, or direct `eval`. It stops and reports remaining violations when it cannot prove a conservative extraction is available. See [Fix-mode safety](docs/fix-mode.md) for the complete contract.

## Configure a project

Create `kyle-reese.config.json` in the project root:

```json
{
  "thresholds": {
    "cyclomatic": 22,
    "cognitive": 22,
    "halsteadDifficulty": 80
  },
  "include": ["src/**/*.{js,jsx,ts,tsx}"],
  "exclude": ["**/*.generated.ts", "**/fixtures/**"],
  "fix": {
    "checkCommand": ["npm", "test"],
    "maxPasses": 50
  }
}
```

Command-line thresholds override configuration values:

```sh
npx kyle-reese audit . --cyclomatic 18 --cognitive 20 --halstead 70
```

## Run in continuous integration

Add a script to the audited project's `package.json`:

```json
{
  "scripts": {
    "audit:complexity": "kyle-reese audit ."
  }
}
```

Run `npm run audit:complexity` in CI. Metric failures produce exit code `1`, so the job fails without extra glue code.

## Use the library interface

```js
import { auditProject, fixProject } from 'kyle-reese';

const report = await auditProject({
  root: process.cwd(),
  thresholds: {
    cyclomatic: 22,
    cognitive: 22,
    halsteadDifficulty: 80,
  },
});

const result = await fixProject({
  root: process.cwd(),
  checkCommand: ['npm', 'test'],
});
```

The library returns data instead of printing or exiting. See [Metric definitions](docs/metrics.md) for the counting rules and JSON fields.

## CLI reference

```text
kyle-reese <audit|fix> [path] [options]

--cyclomatic <n>       Require cyclomatic complexity to be less than n.
--cognitive <n>        Require cognitive complexity to be less than n.
--halstead <n>         Require Halstead difficulty to be less than n.
--config <path>        Read a config file relative to the project root.
--json                 Print machine-readable JSON.
--limit <n>            Limit violations in text output.
--dry-run              Show one safe extraction without writing it.
--check-command <json> Verification command required by fix mode.
--max-passes <n>       Set the maximum verified edits in one run.
--help                 Show command help.
```

## Develop and contribute

The project requires Node.js 20 or newer.

```sh
git clone https://github.com/ddoug220/kyle-reese.git
cd kyle-reese
npm ci
npm run verify
```

Read [CONTRIBUTING.md](CONTRIBUTING.md) before changing metric rules or fix safety. Security reports belong in a [private GitHub security advisory](SECURITY.md), not a public issue.

## License

[MIT](LICENSE)
