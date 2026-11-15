---
name: package-json-checklist
description: Edit Vouchington package manifests, dependencies, and workspace metadata.
---

# Vouchington package.json Adapter

## Canonical skill (required)

Claude Code, Codex, and Grok load the plugin skill `skills:package-json-checklist`. If it cannot be loaded, stop and report the missing prerequisite; never apply this adapter alone.

## Vouchington additions

Follow [the package checklist](../../../docs/checklists/package-json.md) for pnpm, lockfile,
service-registration, first-party-package, and validation rules. Read
[backend instructions](../../../backend/AGENTS.md) before creating a backend service. Before
committing, load [git-commit-checklist](../git-commit-checklist/SKILL.md).

When main advances under a dependency PR and Syncpack reports
`DiffersToHighestOrLowestSemver`, rebase onto current main, run `pnpm install`, then run
`pnpm exec syncpack lint` and `pnpm exec syncpack format --check` locally. Commit only the resulting
manifest and lockfile changes, then push, so the dependency update stays consistent with main.
