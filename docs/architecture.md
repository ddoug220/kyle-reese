# Architecture

`kyle-reese` presents two library functions and one CLI:

- `auditProject(options)` discovers source files, measures functions, and returns a report.
- `fixProject(options)` proposes conservative edits, verifies each accepted edit, and returns the final audit.
- `kyle-reese` maps command-line input and exit codes to those library functions.

## Source modules

| Module | Responsibility |
| --- | --- |
| `src/analyze-source.js` | Parse one source file and measure each function. |
| `src/audit.js` | Discover files, apply thresholds, and assemble a project report. |
| `src/fix.js` | Find eligible extractions, write them, verify them, and roll back failures. |
| `src/report.js` | Format reports for people or JSON consumers. |
| `src/cli.js` | Parse commands, print results, and set process exit codes. |
| `src/index.js` | Export the library interface. |

The TypeScript compiler parses JavaScript and TypeScript syntax. `fast-glob` owns file discovery. No project code is executed during an audit.

## Design constraints

- Metric rules must be deterministic and documented.
- Nested functions are measured separately from their parents.
- Audits do not write to the target project.
- Fix mode requires an explicit verification command before writing.
- A failed fix check restores the changed file.
- Unsupported transformations stop instead of guessing.

Tests call the same exported functions that library users call. CLI tests are limited to command mapping because the audit and fix behavior lives behind the library interface.
