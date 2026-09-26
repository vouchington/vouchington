# Accepted automation CI risk

[Back to Merge Authority](merge-authority.md#accepted-automation-ci-risk)

Auto Harness dispatch is default-off. When enabled, the selected agent uses host-managed,
repository-scoped git and `gh` credentials for its prompt's bounded PR or comment completion.

The universal human-only merge guard appended by `ci/render-harness-prompt.mts` remains trusted CI
guidance. Exact live revalidation and exact-lease pushes constrain publication, while the
[Auto Harness automation security boundary](../../.github/workflows/reference-harness-automation-accepted-risk.md)
records the accepted direct-host risk. Only the repository owner performs merges.
Every render step sets the action's `merge-authority-doc` input, so the guard ends by pointing the
dispatched session at [Merge Authority](merge-authority.md).

Interactive GitHub tooling may authenticate as an Admin-capable identity and can bypass rulesets.
That separate interactive risk remains governed by the human merge decision; repository automation
must never infer merge authority from that identity.
