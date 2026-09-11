---
name: github-issue
description: Search, create, classify, verify, update, link, and relate Filaments GitHub issues using the portable Vouchington workflow and local routing policy.
---

# Filaments GitHub Issue Adapter

## Canonical skill (required)

Claude Code and Codex load `vouchington-workflow:github-issue`; the Claude
`github-issue-agent` subagent, Grok, Cursor, and OpenCode read
`node_modules/vouchington-tooling/skills/github-issue/SKILL.md` and resolve its supporting resources
relative to that directory. If it cannot be read, stop before any `gh` call; report the missing prerequisite and never apply this overlay alone.
The local routing decision is recorded in
[Public repository issue routing](../../../docs/development/public-repository-issue-routing.md).

## Filaments additions

Invoke this workflow through the `github-issue-agent` subagent. It may inspect GitHub and make only
the issue mutations explicitly authorized by the caller. It must not edit local files, push code,
create branches, close/delete/lock issues, or infer a target repository. If `gh` authentication or a
GitHub remote is unavailable, return `NOT AVAILABLE: <reason>` and stop.

The interactive root agent acting as the human-facing orchestrator may close a specifically
identified issue only when the human explicitly authorizes that exact closure. For this exception,
the root performs the close directly and must not delegate it. Immediately before closing, the root
must follow the canonical `Mutation authority` gate and the `Issue workflow` current-discussion and
acceptance-evidence checks, then read back and report the final issue state. This exception does not
authorize the root to delete or lock issues.

Before absorbing a newly discovered blocker, require the calling main workflow to reproduce it
against refreshed `origin/main` and provide the evidence. Then search for an existing fix or issue.
If an existing fix resolves the blocker, report it so the calling main workflow can use and retest
it. Otherwise, whether or not an issue exists, ask whether to widen the accepted scope or only link
or record a follow-up. Filing an issue records work but does not amend the accepted plan or
authorize implementation.

Resolve `CURRENT_REPO` once and use it as `PR_REPO`; PR inspection and `dev/pr-description.mts`
always operate there. Default `TARGET_REPO` to `jonathanong/filaments`; set another repository
only from explicit human input. Delegate every repository authorization, mutation check, duplicate search,
relationship, batch preflight, post-write verification, and label-creation decision to the canonical
skill. Its `Mutation authority` gate re-fetches and re-verifies the exact canonical repository
immediately before every write; transport helpers never grant authority. A denied request to create an issue outside Filaments becomes a Filaments tracking issue with
the copy-ready external report, unless the caller opts out. Pass `TARGET_REPO` to every issue call and
`PR_REPO` to every PR call.

Keep agent output bounded and stable: searches return at most five `#N: title -- url` lines, a
near-duplicate returns `Duplicate of #N: <url>`, and mutations return action, URL, labels,
milestone, and verification.

Before filing in Filaments, verify every existing `## Files / areas` path against `HEAD`. Mark
proposed paths as `New` and verify their owning parent/module. Reject absolute and parent-traversal
paths. For an authorized non-Filaments target, verify only redacted remote metadata through the
Contents API. Write enough context, goal, ownership,
verified areas, approach, acceptance evidence, and out-of-scope boundary for a junior engineer to act.

Before creating, load [organize-github-issues](../organize-github-issues/SKILL.md) for its live
taxonomy rubric. Treat that organizer as read-only classification; only this separately authorized,
gated workflow may create an issue. An ambiguous described milestone stays unassigned. Use
`dependencies` for
dependency-owned work. Apply exactly one canonical `priority:` label that already exists and every
clearly supported existing label. Derive component labels through
[`.github/labeler.yml`](../../../.github/labeler.yml). A missing required priority, caller-required
label, or path-derived label blocks creation. Existing labels need no separate approval; creating a
label requires the canonical skill's exact approval. Never create milestones.

For another authorized repository, keep its taxonomy independent: do not apply the Filaments
labeler or require Filaments priority/dependency policy.

## New-Issue Classification

The rules above are the complete Filaments classification overlay.

Use `## Context`, `## Problem / Goal`, `## Suggested approach`, `## Files / areas`, and
`## Originating session`. A dependency defect or feature tracked in Filaments must also include
`## Upstream issue (copy-paste ready)`: either a dependency-voice title plus minimal reproduction,
expected behavior, actual behavior, and installed version, or an
`Existing upstream tracker: <URL> — <state>` reference. Never include Filaments-internal paths,
links, or jargon in that report. Omit the block for non-dependency work or an issue created directly
in its authorized owning repository.

Create `Plan:` issues through `node dev/plan-issue.mts create` only as the immediate mutation after
the local [planning](../planning/SKILL.md) validation and canonical gate pass for the exact
`TARGET_REPO`; the helper never grants authority. For PR links and body
mutation, use `node dev/pr-description.mts` in `PR_REPO`; same-repository closes are `Closes #N`, and
cross-repository closes are `Closes owner/repo#N`.

## Batch preflight

The [batch manifest](../../../dev/agent-issue-labels/README.md#batch-github-issue-preflight) exposes only the read-only
`preflight` mode. Perform every authorized write and its read-back through the canonical workflow
one issue at a time.
