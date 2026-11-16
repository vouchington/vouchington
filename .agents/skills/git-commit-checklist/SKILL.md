---
name: git-commit-checklist
description: Validate and prepare Vouchington commits before staging or committing.
---

# Vouchington Git Commit Adapter

## Canonical skill (required)

Claude Code, Codex, and Grok load the plugin skill `skills:git-commit-checklist`. If it cannot be loaded, stop and report the missing prerequisite; never apply this adapter alone.

## Vouchington additions

Follow [the commit checklist](../../../docs/checklists/commit.md) for this repository's command
details, file-size budgets, commit-message format, and hook policy. For manifest changes, also
load [package-json-checklist](../package-json-checklist/SKILL.md). Before the first push, use
[Before Pushing](../agent-workflow/before-pushing.md). Run changed `*.test.mts` files with the
checklist's Vitest command. CI runs each selected area's full suite
([area test suites](../../../docs/development/ci.md#area-test-suites)).
