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
- **Orphan issues:** automation-owned labels are `automation:auto-fix` and
  `automation:scheduled`, or a title beginning `Automation` (ASCII case
  insensitive). `needs-human` marks intentionally PR-free backlog items.
- **Ready and shepherd:** use [ready-and-shepherd](../ready-and-shepherd/SKILL.md)
  with `--arm-auto-merge`. Its activation preflight requires both
  `HARNESS_DISPATCH_ENABLED` and `HARNESS_SHEPHERD_ENABLED` to be exactly `true`
  before any mutation. When either is disabled or unreadable, report
  `activation disabled — unchanged`.
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
