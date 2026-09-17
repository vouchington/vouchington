---
name: review-github-issue-taxonomy
description: Audit Vouchington GitHub labels, milestones, projects, descriptions, colors, and path-label automation using the portable taxonomy-review workflow.
---

# Vouchington Taxonomy Review Adapter

## Canonical skill (required)

Claude Code and Codex load `vouchington-workflow:review-github-issue-taxonomy`; Grok, Cursor, and OpenCode read `node_modules/vouchington-tooling/skills/review-github-issue-taxonomy/SKILL.md` and resolve its supporting resources relative to that directory. If it cannot be read, stop and report the missing prerequisite; never apply this overlay alone.

## Vouchington additions

Use [`.github/labeler.yml`](../../../.github/labeler.yml) only as an intentional subset of
path-derived component labels. Remain read-only unless local labeler edits or live taxonomy mutation
are explicitly authorized. Load [organize-github-issues](../organize-github-issues/SKILL.md) only
when the request also asks to organize issues using the approved taxonomy.
