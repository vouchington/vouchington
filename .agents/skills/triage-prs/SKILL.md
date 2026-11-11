---
name: triage-prs
description: Review the Voucha PR queue under the user's triage authorization.
argument-hint: '[number | URL | author:<login> | label:<name> | title:<text> | all]'
---

# Voucha PR triage adapter

Read `vouchington-workflow:triage-prs`, or
`node_modules/vouchington-tooling/skills/triage-prs/SKILL.md` when the plugin is
unavailable. If neither source is readable, stop. The canonical skill owns the
triage procedure, including reviewed-head checks. Apply these repository
parameters after reading it:

- **Scope:** require an explicit number, URL, `author:`, `label:`, `title:`, or
  `all` selector. Stop for an empty or ambiguous argument; never dispatch the
  canonical no-argument default.

- **Repository and automation label:** `vouchington/vouchington`; `automation`.
- **Orphan issues:** `needs-human` marks intentionally PR-free backlog items; no issue label
  or title marks automation ownership.
- **Ready and shepherd:** the canonical skill owns the ready, steer, arm and shepherd mechanics.
  Here, apply the `automation` label (`gh pr edit <N> --add-label automation`, idempotent) to
  every PR it hands off; it marks agent- and loop-created PRs. This skill is run by the loop's own batch
  callers, which run the shepherd worker directly, so it never posts a `/shepherd` comment. Any
  other author hands a PR over with the standard `/shepherd` handoff in
  [Git and PRs](../agent-workflow/git-and-prs.md#shepherding), once, and stops.
- **Provider-PR handoff:** [triage-security](../triage-security/SKILL.md) applies its own
  ready-and-label check; this skill never accepts that handoff.
- **Feedback source and rubric:** only exact paths in `docs/prompts/**` can be
  changed by the bounded feedback flow. Apply
  [agent-authored PR creation feedback](../agent-workflow/code-review.md#agent-authored-pr-creation-feedback)
  and persist results through [retrospective](../retrospective/SKILL.md).
  A feedback PR carries `<!-- pr-creation-feedback-origin: triage-prs -->`.
- **Merge authority:** follow [Git and PRs](../agent-workflow/git-and-prs.md)
  and [merge authority](../../../docs/development/merge-authority.md).
  Native stacks use [stacked PRs](../stacked-prs/SKILL.md).
- **CI failures:** diagnose with [review-ci-logs](../review-ci-logs/SKILL.md)
  and classify retries through [transient retry](../../../ci/transient-retry/README.md).
