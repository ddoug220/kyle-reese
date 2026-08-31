# Fix-mode safety

Fix mode lowers measured health debt only when it can make a narrow source transformation and verify the result after every write.

## What fix mode changes

The current fixer can move an eligible branch-bearing statement into a local arrow function and call that function at the original location. This keeps the code in the same enclosing function and preserves lexical access to outer bindings.

The candidate helper must pass every configured metric limit. The rewritten file must parse, and the total measured health debt must decrease.

## What fix mode refuses

The fixer does not move a statement when it contains:

- a `return`;
- a `break` or `continue`;
- a label;
- `await` or `yield`;
- a top-level declaration whose scope would change;
- function-scoped `var`;
- direct `eval`.

These refusals favor unchanged behavior over the appearance of a fully automatic repair.

## Verification contract

Writing changes requires `checkCommand`:

```json
{
  "fix": {
    "checkCommand": ["npm", "test"]
  }
}
```

The command is an argument array, not a shell string. This avoids shell expansion and makes the executable and arguments explicit.

For each proposed edit, fix mode:

1. confirms that the rewritten source parses;
2. confirms that measured health debt decreases;
3. writes the file;
4. runs the verification command from the audited project root;
5. restores the original file if verification fails;
6. re-audits before choosing another edit.

Choose a verification command that exercises the behavior of the files fix mode may change. A syntax check alone cannot prove application behavior.

## Dry run

`--dry-run` returns the first eligible extraction without writing it or requiring a check command:

```sh
npx kyle-reese fix . --dry-run --json
```

Use dry run to inspect whether deterministic fix mode can help a codebase before authorizing writes.

## Remaining violations

Fix mode is intentionally incomplete. A function with intertwined returns, state, or asynchronous control flow may need a human-designed refactor. The command reports the remaining violations and exits with code 1 instead of adding suppressions or changing a threshold.
