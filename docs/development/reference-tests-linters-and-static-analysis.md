# Linters and Static Analysis

[Back to Tests and Checks](tests.md#linters-and-static-analysis)

`pnpm run lint` fans out to every static tool; the list lives in `package.json` and `.no-mistakes.yml`, and rule placement is in the [static-analysis guide](quality/static-code-analysis/README.md). Swift, .NET, and native-client guard validation belong to `vouchington/vouchington-clients`; this repository keeps only the shared producer contracts those clients consume.

Gotchas that the tools do not explain themselves:

- **Staging gap in path checks.** `config-path-references` and the other presets that share its tracked-only universe resolve references against `git ls-files`, not the working tree. Running `no-mistakes` before staging a newly added config target fails with ``config path `<reference>` from `<key>` does not exist``, which reads like a typo in the reference. The remedy is `git add <file>` (index only), not re-pathing the reference or chasing a rule bug.
- **No DOM in the backend program.** `backend/tsconfig.json` uses `lib: ["es2025"]` with no DOM. A type-only import that reaches `vitest/config` pulls `lib.dom` in transitively, and `@types/node` then defers every web global to the DOM types, silently changing what `typecheck:backend` accepts. Do not import `vitest/config` from `backend/**`; `backend/types/lib-dom-absent.mts` fails with `TS2344` if `lib.dom` re-enters. `test-helpers/tsconfig.json` legitimately loads it, so a nonzero DOM count there is not a regression.
- **Root config in an ancestor project.** The root `vitest.config.mts` is explicitly included in the root TypeScript project so type-aware lint can assign it an ancestor project.
- **Dead error classes.** `unconstructed-error-class` reports exported `Error` subclasses no production code constructs or subclasses. A class only mentioned by `catch` or `instanceof` is dead error handling that Knip does not flag. Delete it with its guards or add the missing `throw`; removing a subclass can newly report its base, so rerun until clean.
- **shellcheck is bash-oriented.** It does not flag zsh reserved-variable shadowing of `status` and `pipestatus`; see [dev/AGENTS.md](../../dev/AGENTS.md).
