# Transient-Retry Rule Catalogue

Source entrypoint: [ci/transient-retry/README.md](../../../../ci/transient-retry/README.md)

This directory contains the extensible rule catalogue for known-transient CI failures on `main`.
Automatic `main` recovery runs only while `HARNESS_DISPATCH_ENABLED` and
`HARNESS_FIX_MAIN_ENABLED` are both exactly `true`; both gates are unset by default. The manual
non-`main` PR-branch helper documented below remains available.

## Contents

- <a id="what-is-the-rule-catalogue"></a>[What is the rule catalogue?](reference-what-is-the-rule-catalogue.md)
- <a id="how-automatic-reruns-work-on-main-ci-only"></a>[How automatic reruns work on `main` (CI only)](reference-how-automatic-reruns-work-on-main-ci-only.md)
- <a id="how-agents-should-use-this-on-non-main-non-dependabot-pr-branches"></a>[How agents should use this on non-`main`, non-Dependabot PR branches](reference-how-agents-should-use-this-on-non-main-non-dependabot-pr-branches.md)
- <a id="rule-consolidation-concepts"></a>[Rule Consolidation Concepts](reference-rule-consolidation-concepts.md)
- <a id="shared-vocabulary-aws-transport-transients"></a>[Shared Vocabulary: AWS Transport Transients](reference-shared-vocabulary-aws-transport-transients.md)
- <a id="shared-vocabulary-undicifetch-transport-transients"></a>[Shared Vocabulary: undici/fetch Transport Transients](reference-shared-vocabulary-undici-fetch-transport-transients.md)
- <a id="cautionary-examples"></a>[Cautionary Examples](reference-cautionary-examples.md)
- <a id="rule-authoring-guide"></a>[Rule authoring guide](reference-rule-authoring-guide.md)
- <a id="running-tests"></a>[Running tests](reference-running-tests.md)

## Design rationale

- Never pin a `describe`/`it` title string or a raw timeout digit count (`30000ms`) in a matcher — a
  project's own `testTimeout` already owns that number, and a title is a surface variant that drifts
  on rename with zero test signal. `hasBackendSesSendEmailTimeout` (#10806/#10825) required
  `Test timed out in 120000ms` and went silently dead for months after `testTimeout` dropped from
  `120000` to `60000`, because its own fixture synthesized the same stale digits. Match on the vitest
  project plus its own `include` glob (the credentialed-probe boundary) and a provider-transport
  marker instead — see [`backend-credentialed-log-fingerprints.mts`](../../../../ci/transient-retry/backend-credentialed-log-fingerprints.mts). Any repo-owned source-path
  literal that does survive in this directory needs a [`repo-owned-literal-freshness.test.mts`](../../../../ci/transient-retry/repo-owned-literal-freshness.test.mts) table
  row; its completeness scanner recognizes only path-shaped literals (`backend/…`, `web/…`,
  `playwright/…`, `cloudflare-worker/…`) — a pinned title or timeout digit count has no automated
  scanner at all, which is exactly why pinning either is disallowed outright rather than merely
  discouraged.
