---
name: package-json-checklist
description: Use when editing a Vouchington package manifest or adding a dependency. Loads the portable package-metadata checklist, then applies local workspace policy.
---

# Vouchington package.json Adapter

## Canonical skill (required)

Claude Code and Codex load `vouchington-workflow:package-json-checklist`; Grok, Cursor, and OpenCode read `node_modules/vouchington-tooling/skills/package-json-checklist/SKILL.md` and resolve its supporting resources relative to that directory. If it cannot be read, stop and report the missing prerequisite; never apply this overlay alone.

## Vouchington additions

Follow [the package checklist](../../../docs/checklists/package-json.md) for pnpm, lockfile,
service-registration, first-party-package, and validation rules. Consult
[first-party dependencies](../../../docs/development/first-party-dependencies.md), and read
[backend instructions](../../../backend/CLAUDE.md) before creating a backend service. Before
committing, load [git-commit-checklist](../git-commit-checklist/SKILL.md).
