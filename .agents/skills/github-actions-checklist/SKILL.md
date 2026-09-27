---
name: github-actions-checklist
description: Edit Vouchington GitHub Actions workflows and composite actions.
---

# Vouchington GitHub Actions Adapter

## Canonical skill (required)

Claude Code and Codex load `vouchington-workflow:github-actions-checklist`; Grok, Cursor, and OpenCode read `node_modules/vouchington-tooling/skills/github-actions-checklist/SKILL.md` and resolve its supporting resources relative to that directory. If it cannot be read, stop and report the missing prerequisite; never apply this overlay alone.

## Vouchington additions

Read [the GitHub Actions checklist](../../../docs/checklists/github-actions.md) and the scoped
[workflow instructions](../../../.github/workflows/AGENTS.md). Keep workflow YAML, runner policy,
workflow docs, and validation synchronized. Use
[AUTHORING.md](../../../docs/development/ci/workflows/AUTHORING.md) for workflow PR splitting.
