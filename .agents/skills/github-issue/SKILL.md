---
name: github-issue
description: Search, verify, create, update, classify, and link Vouchington GitHub issues.
---

# Vouchington GitHub Issue Adapter

## Canonical skill (required)

Claude Code and Codex load `vouchington-workflow:github-issue`; the Claude
`github-issue-agent` subagent, Grok, Cursor, and OpenCode read
`node_modules/vouchington-tooling/skills/github-issue/SKILL.md`. If neither source is readable,
report the missing prerequisite before any issue mutation; never apply this overlay alone.

## Vouchington additions

Use the `github-issue-agent` for issue work within the caller's authorization. The interactive
root may close a specifically identified issue only with explicit human authorization for that
closure; it must first apply the canonical mutation gate and read back the result. The issue agent
must not close an issue; the root cannot delegate that exception. The issue agent does not edit
code, push, create branches, delete, or lock issues. Follow
[public repository routing](../../../docs/development/public-repository-issue-routing.md).

Default `TARGET_REPO` to `vouchington/vouchington`; change it only on explicit human input.
`PR_REPO` is the current repository. A denied external issue request becomes a Vouchington
tracking issue with a copy-ready external report unless the caller opts out. Keep another
repository's taxonomy independent of Vouchington's.

Before filing in Vouchington, verify existing `## Files / areas` paths against `HEAD`; mark
proposed paths `New` and verify their owner. Load [organize-github-issues](../organize-github-issues/SKILL.md)
for live taxonomy classification. Apply one existing `priority:` label and every supported
existing component label from the live taxonomy; [the labeler](../../../.github/labeler.yml) is
supporting evidence only. Use an existing open, described project for strategic tracking and an
existing open, described milestone for repository sequencing when supported; do not create either as part of this workflow. Apply `dependencies` for
dependency-owned work. A missing required priority, caller-required, or path-derived label
blocks creation.

Use `## Context`, `## Problem / Goal`, `## Suggested approach`, `## Files / areas`, and
`## Originating session` in new issue bodies. A dependency defect tracked here also needs
`## Upstream issue (copy-paste ready)` with an external-facing reproduction or an existing
upstream tracker, without Vouchington-internal paths. A `Plan:` issue uses the ordinary issue
workflow. For PR links and body updates use the `vouchington-tooling` MCP `pr_create` or
`pr_update` tool in `PR_REPO`.

The [batch manifest](../../../docs/development/local-development/agent-issue-labels/README.md#batch-github-issue-preflight)
provides read-only `preflight`; write and verify each authorized issue individually.
