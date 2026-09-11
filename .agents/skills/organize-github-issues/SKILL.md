---
name: organize-github-issues
description: Organize Filaments open issues and pull-request milestones using the portable issue-hygiene workflow and local taxonomy rules.
---

# Filaments Issue Organization Adapter

## Canonical skill (required)

Claude Code and Codex load `vouchington-workflow:organize-github-issues`; Grok, Cursor, and OpenCode read `node_modules/vouchington-tooling/skills/organize-github-issues/SKILL.md` and resolve its supporting resources relative to that directory. If it cannot be read, stop and report the missing prerequisite; never apply this overlay alone.

## Filaments additions

Use only existing live labels and described open milestones. Treat
[`.github/labeler.yml`](../../../.github/labeler.yml) as a subset of component labels, not the
whole taxonomy. Preserve non-priority issue labels. For PRs, mutate milestones only: preserve
labels, priorities, and comments, and never infer intent from files, commits, or diffs. An explicit
narrower scope is authoritative; if required live evidence is unavailable, fail closed without
mutation. Load [review-github-issue-taxonomy](../review-github-issue-taxonomy/SKILL.md) only when
the taxonomy itself needs review or change.

This workflow never creates issues, labels, or milestones; never closes issues; and never edits an
issue title, body, assignees, projects, or type. It uses only shallow issue/PR evidence (title,
body, current metadata, milestone, and comments), never implementation code, commits, or diffs.
PR mutation is milestone-only; preserve all PR labels, priorities, and comments.
