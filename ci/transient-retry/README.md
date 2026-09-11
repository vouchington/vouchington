# Transient-Retry Rule Catalogue

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
