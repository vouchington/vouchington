# Commit Checklist

Use this checklist before every `git commit`. GitHub Actions is the full gate after you push.

## Checklist

- **Format first** — run `pnpm run oxfmt:check` (global scan) on all changed file types before staging: `.ts/.tsx/.mts/.cts/.js/.mjs/.cjs`, `.json/.jsonc`, `.md`, `.yml/.yaml`, `.toml`.
  - The pinned Oxfmt processes explicit tracked dot-directory paths such as `.agents/skills/**/*.md`; keep those files in targeted formatter commands. This checklist still requires the global scan before committing.
- **Lint TypeScript** — `pnpm exec oxlint --deny-warnings --type-aware <changed TS/MTS files>` before committing. Catches import-order violations and missing `vi.fn` type parameters that appear on nearly every first push.
- **File size cap** — no `.ts/.tsx/.mts/.cts/.js/.mjs/.cjs` source file may exceed 200 lines; test files cap at 300 lines. Oxlint `max-lines` in [.oxlintrc.json](../../.oxlintrc.json) enforces both caps.
- **Doc size budget** — check current size first (`wc -l <file>` / `wc -c <file>`) before editing `CLAUDE.md` or `AGENTS.md` files. They have a hard limit of 180 lines and 12,000 chars enforced by `no-mistakes` in CI.
- **Commit message format** — use [conventional commit](https://www.conventionalcommits.org/) format: `type(scope): description`. Always add a `Co-Authored-By:` trailer when using an AI agent.
- **Commit reminder** — after commitlint passes, [commit-msg](../../.husky/commit-msg) prints the cheap before-push command list.
- **Never amend** — `git commit --amend`, `-n`, and `--no-verify` are banned by repository policy and enforced by [dev/codex-hooks/policy.mts](../../dev/codex-hooks/policy.mts). Add a new commit instead.
- **`package.json` changes** — require a matching `pnpm-lock.yaml` commit and `pnpm run syncpack:lint && pnpm run no-mistakes` (auto-fix Syncpack with `pnpm run syncpack:fix`). See [docs/checklists/package-json.md](package-json.md).
- **Skill, doc, and test edits** — when authoring or editing `.agents/skills/**/*.md`, test every fenced shell recipe locally — bad `rg`/`find` arguments silently produce empty output. When creating new tests that check live repo files/policies, run them locally before the first push (`pnpm exec vitest run <changed-test-file>`).
- **Commits are free; pushes are expensive** — each push re-runs CI and bot reviewers. Batch multiple commits and push once per drained review set. If a bot reviewer raises a non-actionable or repeat suggestion that contradicts a product decision or accepted plan, document it in the canonical Shepherd Journal details container (using `pnpm exec pr-shepherd apply journal <pr-number> '- ...'`) and dismiss the review rather than accepting it in a new commit.

## Before Pushing

Before the first push, run these cheap local steps (also covered in [agent-workflow skill § Before Pushing](../../.agents/skills/agent-workflow/before-pushing.md)). GitHub Actions is the full gate.

1. `pnpm exec oxlint --deny-warnings --type-aware <changed TS/MTS files>`
2. `pnpm exec vitest run <directly changed test files> --bail=3`
3. `git diff --name-only origin/main...HEAD` — scope check before rebasing
4. `pnpm exec oxfmt --check <changed supported files>`

Optional planning (not a push requirement): batch compatible sources with `pnpm exec no-mistakes tests plan vitest --environment prePush --changed-file <source-file-a> --changed-file <source-file-b> --format paths`. For long lists, use `--changed-files <manifest>`.

That changed-file form is local planning without a comparison baseline. For a dependency manifest or
lockfile change, reproduce the semantic plan from the exact two revisions instead; do not infer that
an empty direct/dependency group means that the dependency is safe:

```bash
git fetch origin main
pnpm exec no-mistakes tests plan vitest --environment pullRequest --base origin/main --head HEAD --format json
pnpm exec no-mistakes tests plan playwright --environment pullRequest --base origin/main --head HEAD --format json
```

Use `--format json` to inspect causal reasons separately from the safety sample and to surface a
missing-baseline or unsupported-dependency warning. The configured environment then decides whether
that warning keeps its sample, falls back to a broader suite, or both; it must never be treated as a
silent causal zero-selection result.

## See Also

- [git-commit-checklist skill](../../.agents/skills/git-commit-checklist/SKILL.md) — skill entry point
- [agent-workflow skill § Before Pushing](../../.agents/skills/agent-workflow/before-pushing.md) — full before-push workflow
- [docs/development/tests.md](../development/tests.md) — local reproduce commands
- [docs/development/ci.md](../development/ci.md) — CI owners
- [CLAUDE.md](../../CLAUDE.md) — root instructions
