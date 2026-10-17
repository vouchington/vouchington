# Transient-Retry Rule Catalogue

Source entrypoint: [ci/transient-retry/README.md](../../../../ci/transient-retry/README.md)

This directory explains the rule catalogue for known-transient CI failures on `main`.
Automatic `main` recovery runs only while `HARNESS_DISPATCH_ENABLED` and
`HARNESS_FIX_MAIN_ENABLED` are both exactly `true`; both gates are unset by default. The manual
non-`main` PR-branch helper documented below remains available.

## Contents

- <a id="what-is-the-rule-catalogue"></a>[What is the rule catalogue?](reference-what-is-the-rule-catalogue.md)
- <a id="how-automatic-reruns-work-on-main-ci-only"></a>[How automatic reruns work on `main` (CI only)](reference-how-automatic-reruns-work-on-main-ci-only.md)
- <a id="how-agents-should-use-this-on-non-main-non-dependabot-pr-branches"></a>[How agents should use this on non-`main`, non-Dependabot PR branches](reference-how-agents-should-use-this-on-non-main-non-dependabot-pr-branches.md)
- <a id="rule-consolidation-concepts"></a>[Rule Consolidation Concepts](reference-rule-consolidation-concepts.md)

## Design rationale

- Never pin a `describe`/`it` title string or a raw timeout digit count in a matcher. A project's
  own `testTimeout` owns that number, and a title drifts on rename with zero test signal. A matcher
  that required a stale timeout literal went silently dead for months because its own fixture
  synthesized the same stale digits. Match on markers the failing tool owns instead. A pinned title
  or timeout digit count has no automated guard, which is why pinning is disallowed outright.
- No rule reruns a live-provider failure. Those jobs are informational smoke checks that never gate
  CI, so an automatic rerun gains nothing
  ([live-provider smoke checks](../../tests.md#live-provider-smoke-checks)). Shared
  infrastructure rules can still rerun them because they also guard gating jobs.
- A job-level timeout match is unsafe for a heterogeneous job, because it would rerun real code-bug
  deadlocks. A timeout rule must prove the job is homogeneous by config or pin the owning
  project's boundary.
