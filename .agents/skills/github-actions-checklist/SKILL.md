---
name: github-actions-checklist
description: Use when editing a Filaments GitHub Actions workflow or composite action. Loads the portable workflow checklist, then applies local CI policy.
---

# Filaments GitHub Actions Adapter

## Canonical skill (required)

Claude Code and Codex load `vouchington-workflow:github-actions-checklist`; Grok, Cursor, and OpenCode read `node_modules/vouchington-tooling/skills/github-actions-checklist/SKILL.md` and resolve its supporting resources relative to that directory. If it cannot be read, stop and report the missing prerequisite; never apply this overlay alone.

## Filaments additions

Read [the GitHub Actions checklist](../../../docs/checklists/github-actions.md) and the scoped
[workflow instructions](../../../.github/workflows/CLAUDE.md). Keep workflow YAML, runner policy,
workflow docs, and validation synchronized. Use
[AUTHORING.md](../../../.github/workflows/AUTHORING.md) for workflow PR splitting and
[RUNNERS.md](../../../.github/workflows/RUNNERS.md) for runner and host safety.
