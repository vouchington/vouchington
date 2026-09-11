# Automation PR labeling

[Back to Merge Authority](merge-authority.md#automation-pr-labeling)

Interactive automation-created pull requests receive the `automation` label through the
`ready-and-shepherd` workflow, and `/triage-prs` uses that label as its default scope.

Auto Harness-created pull requests use the `automation` provenance label, with additive
`automation:auto-fix` and `automation:scheduled` labels supplied by their callers. The agent must
revalidate the exact PR identity before applying labels; provider session creation alone is not
publication evidence.

`/triage-prs` feedback PRs receive the same `automation` label and durable
`<!-- pr-creation-feedback-origin: triage-prs -->` body marker. They remain reviewable in the default
queue, but the marker suppresses new creation-feedback recommendations when that feedback PR is
triaged, preventing recursive publication.

Issue-maintenance sessions do not apply PR labels. Interactive Codex Security triage remains a
separate provider-specific workflow and continues to label any PR it creates through the
interactive publication path.
