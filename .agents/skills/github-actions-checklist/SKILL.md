---
name: github-actions-checklist
description: Edit Vouchington GitHub Actions workflows and composite actions.
---

# Vouchington GitHub Actions Adapter

## Canonical skill (required)

Claude Code, Codex, and Grok load the plugin skill `skills:github-actions-authoring` and read its `references/workflow-baseline.md` (the checklist). If either cannot be loaded, stop and report the missing prerequisite; never apply this adapter alone.

## Vouchington additions

Read [the GitHub Actions checklist](../../../docs/checklists/github-actions.md) and the scoped
[workflow instructions](../../../.github/workflows/AGENTS.md). Keep workflow YAML, runner policy,
workflow docs, and validation synchronized.
