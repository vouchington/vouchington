---
name: organize-github-issues
description: Organize Vouchington open issues, issue project membership, and pull-request milestones using the portable issue-hygiene workflow and local taxonomy rules.
---

# Vouchington Issue Organization Adapter

## Canonical skill (required)

Claude Code and Codex load `vouchington-workflow:organize-github-issues`; Grok, Cursor, and OpenCode read `node_modules/vouchington-tooling/skills/organize-github-issues/SKILL.md` and resolve its supporting resources relative to that directory. If it cannot be read, stop and report the missing prerequisite; never apply this overlay alone.

## Vouchington additions

Use only existing live labels, described open milestones, and described open org projects. Treat
[`.github/labeler.yml`](../../../.github/labeler.yml) as a subset of component labels, not the
whole taxonomy. Preserve non-priority issue labels. For PRs, mutate milestones only: preserve
labels, priorities, and comments, and never infer intent from files, commits, or diffs. An explicit
narrower scope is authoritative; if required live evidence is unavailable, fail closed without
mutation. If the token lacks the `project` scope, skip project steps and report that in the run's
output — never work around it. Load
[review-github-issue-taxonomy](../review-github-issue-taxonomy/SKILL.md) only when the taxonomy
itself needs review or change.

This workflow never creates issues, labels, milestones, or projects; never closes issues; and never
edits an issue title, body, assignees, or type. It may set an issue's project to one existing,
described, open org project, or clear it back to none, but never assigns more than one project to
an issue at a time. It uses only shallow issue/PR evidence (title, body, current metadata,
milestone, project, and comments), never implementation code, commits, or diffs. PR mutation is
milestone-only; preserve all PR labels, priorities, comments, and projects.
