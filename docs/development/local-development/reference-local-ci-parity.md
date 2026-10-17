# Local CI Parity

[Back to Dev Environment Reference](README.md#local-ci-parity)

Use `./dev/ci-local` to print and run CI-equivalent commands from this worktree:

```bash
./dev/ci-local --list
./dev/ci-local web-integration --dry-run
./dev/ci-local backend-smoke
```

The runner checks that registered commands still appear in their source workflow files. The
`web-integration` target sources local `.env` for setup, then unsets `CF_WORKER_SECRET` for the
Vitest step so local runs match CI's backend-origin secret behavior while retaining local DB and
Valkey URLs.

## Static gates that local selection must list

`pnpm exec no-mistakes planning-impact` selects Vitest tests only, and `pnpm exec no-mistakes
impacted-checks --changed-files <manifest>` lists only the commands declared under `checks.commands`
in [`.no-mistakes.yml`](../../../.no-mistakes.yml) plus the selected tests. A static gate that CI
runs but that entry does not declare therefore never appears in a focused local plan
([#3015](https://github.com/vouchington/vouchington/issues/3015)). The declared gates are the
typechecks, `pnpm run no-mistakes` (repository rules such as test-source correspondence and
document size budgets), the `static-code-analysis.yml` Repo Node static checks step (`scc`
complexity 50, repo file policy), and `pnpm run knip:production-exports` for backend production
sources. `ci/no-mistakes-ci-only-gates-config.test.mts` pins each entry to its workflow step, and
`./dev/ci-local static` runs the same commands.

Intentionally CI-only, so expect them to fail first on a hosted run: full area suites (CI never
selects files), and workflow step environment, which only the hosted job proves. Compare a new
workflow step's `env:` with its sibling steps; `explain-analyze.test.mts` pins the stored-secret key
across the EXPLAIN seed and run steps ([#2734](https://github.com/vouchington/vouchington/pull/2734)).
