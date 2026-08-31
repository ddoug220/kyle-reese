# Contributing to kyle-reese

Thank you for helping improve `kyle-reese`. Changes should keep metric results reproducible and fix mode conservative.

## Set up the project

You need Node.js 20 or newer and npm.

```sh
git clone https://github.com/ddoug220/kyle-reese.git
cd kyle-reese
npm ci
npm run verify
```

`npm run verify` runs the tests, audits this package against its own default limits, and checks the npm tarball contents.

## Make a change

1. Create a branch from `main`.
2. Add or update a test that demonstrates the behavior.
3. Make the smallest code change that satisfies the test.
4. Run `npm run verify`.
5. Update `README.md`, files under `docs/`, or `CHANGELOG.md` when behavior visible to users changes.
6. Open a pull request that explains the problem, the change, and the verification you ran.

## Change a metric rule

A metric change can make existing projects pass or fail. A pull request that changes counting rules must include:

- a focused fixture for the syntax being counted;
- the exact result before and after the change;
- an update to `docs/metrics.md`;
- a changelog entry under `Unreleased`.

Do not change a rule only to make one codebase pass.

## Change fix mode

Fix mode writes to user code. A new transformation must prove:

- the rewritten source still parses;
- the targeted health debt decreases;
- bindings, control flow, execution order, and error behavior stay intact;
- a failed verification command restores the original file;
- unsupported syntax is refused instead of guessed at.

Add a behavior test, not only a source snapshot.

## Report a security problem

Do not open a public issue for a vulnerability. Follow [SECURITY.md](SECURITY.md).

By participating, you agree to follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
