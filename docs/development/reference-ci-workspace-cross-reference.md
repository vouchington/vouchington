# Workspace Cross-Reference

[Back to CI Reference](ci.md#workspace-cross-reference)

| Workspace | Static analysis                                                              | Typecheck             | Tests            |
| --------- | ---------------------------------------------------------------------------- | --------------------- | ---------------- |
| tooling   | oxlint, oxfmt, knip, dep-cruise:scripts, no-mistakes, shellcheck, actionlint | `typecheck:scripts`   | `test:tooling`   |
| ts-shared | oxlint, oxfmt                                                                | `typecheck:ts-shared` | `test:ts-shared` |
