# CLAUDE.md and AGENTS.md Size Cap

[Back to Tests and Checks](tests.md)

`no-mistakes` enforces a hard limit of **180 lines / 12,000 characters** on every `CLAUDE.md` and
`AGENTS.md` file in the repository (rule `agents-md-max-size`, configured in `.no-mistakes.yml`).
The check runs as part of `pnpm run no-mistakes` and in CI.

To reproduce locally:

```bash
pnpm run no-mistakes
```

When a doc is approaching the limit, move detailed content to a sub-document in the same directory
(e.g. `docs/development/`) and cross-link from the parent. Add terse one-liners to `CLAUDE.md`;
reserve longer explanations for the linked doc. Check the current size with:

```bash
wc -l CLAUDE.md && wc -c CLAUDE.md
```
