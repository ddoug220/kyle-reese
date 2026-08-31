# Changelog

This project records user-visible changes in this file. Versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-08-31

### Added

- Function-level cyclomatic, cognitive, and Halstead difficulty audits for JavaScript and TypeScript.
- Text and JSON reports with strict exclusive thresholds.
- Verified fix mode with per-edit checks and rollback on failure.
- Configuration through `kyle-reese.config.json` and command-line overrides.
- CLI and library interfaces.

### Fixed

- Prevented Dependabot from proposing TypeScript major versions that remove the compiler API required by the analyzer.

[Unreleased]: https://github.com/ddoug220/kyle-reese/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/ddoug220/kyle-reese/releases/tag/v0.1.0
