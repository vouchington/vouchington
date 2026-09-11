# PR Creation Feedback (full contract)

Full detail for [SKILL.md's `## PR Creation Feedback` step](SKILL.md#pr-creation-feedback). Read this
file only when a PR-triage caller supplied agent-authored PR creation feedback this session.

Keep both the per-PR findings and the deduplicated grouped themes; cross-reference a matching
`## Scheduled Prompt Suggestions` item rather than copying its evidence.

Use this shape:

```markdown
## PR Creation Feedback

### Per-PR findings

- PR #N — `<recurring|one-off>`
  - Evidence: <body, diff, checks, or shepherd correction>
  - Generator provenance: <verified generating prompt or skill>
  - Source target: <exact file path>
  - Recommendation: <specific preventive improvement>

### Grouped themes

- <theme>
  - PRs: #N, #N
  - Recurrence: <recurring|one-off>
  - Source target: <exact file path>
  - Recommendation: <deduplicated improvement>
  - Disposition: <issue #N|PR #N|preauthorized-pr #N|deferred>
```

If there is no actionable feedback, write `No actionable feedback:` followed by `none` instead of
inventing a theme.

## Disposition

Ask the user whether to **file issues**, **make a PR**, or **defer**:

- **File issues:** deduplicate by root cause, use the shared [github-issue](../github-issue/SKILL.md)
  workflow, and record each issue link.
- **Make a PR:** when multiple unrelated themes exist, ask which single theme to implement; reuse or
  create its tracking issue, make one coherent draft PR, do not merge it, and record the PR link.
- **Defer:** make no GitHub change and keep the theme eligible for a later `retrospective-distill`
  run.

When `/triage-prs` already completed its bounded prompt-feedback publication flow, it passes
`Disposition: preauthorized-pr #N`. Record that exact disposition and PR link without asking again.
If the publication failed or only partly completed, record the concrete blocker as `deferred`; never
claim the feedback was handled.

Save one retrospective containing the final disposition and links for all PRs.
