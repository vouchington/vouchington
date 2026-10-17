# Documentation Moved to vouchington-docs

Some `docs/**` pages disclosed information too sensitive for a public repository. Each was moved
to the private `vouchington/vouchington-docs` repository, where the relevant team can still consult it.

This table is the authoritative registry of every path deliberately absent from this repo for that
reason. A path listed here that reappears was resurrected, not intentionally restored; delete it
again. Add a row here in the same change that moves a page out, before merging.

| Removed from this repo                                                                                 | Now at (`vouchington/vouchington-docs`)                                 | Why              |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | ---------------- |
| `docs/runbooks/csam-child-safety-escalation.md`                                                        | `csam-child-safety-escalation.md`                                       | legal-posture    |
| `docs/requirements/trust-safety/vote-weight.md`                                                        | `vote-weight.md`                                                        | abuse-threshold  |
| `docs/requirements/trust-safety/vote-integrity.md`                                                     | `vote-integrity.md`                                                     | abuse-threshold  |
| `docs/development/reference-host-locks-nextjs-build-worker-reserve.md`                                 | `reference-host-locks-nextjs-build-worker-reserve.md`                   | operator-access  |
| `docs/overview/infrastructure/reference-networking-topology.md`                                        | `reference-networking-topology.md`                                      | topology         |
| `docs/strategy/go-to-market.md`                                                                        | `go-to-market.md`                                                       | business         |
| `docs/overview/architecture/openai-cost-model.md`                                                      | `openai-cost-model.md`                                                  | cost             |
| `docs/overview/infrastructure/deployment-costs.md`                                                     | `deployment-costs.md`                                                   | cost             |
| `docs/overview/infrastructure/reference-deployment-costs-ci-testing-costs.md`                          | `reference-deployment-costs-ci-testing-costs.md`                        | cost             |
| `docs/overview/infrastructure/reference-deployment-costs-cost-controls-already-in-place.md`            | `reference-deployment-costs-cost-controls-already-in-place.md`          | cost             |
| `docs/overview/infrastructure/reference-deployment-costs-cross-environment-saas.md`                    | `reference-deployment-costs-cross-environment-saas.md`                  | cost             |
| `docs/overview/infrastructure/reference-deployment-costs-per-environment-aws-costs.md`                 | `reference-deployment-costs-per-environment-aws-costs.md`               | cost             |
| `docs/overview/infrastructure/reference-deployment-costs-per-environment-ecs-fargate-sizing.md`        | `reference-deployment-costs-per-environment-ecs-fargate-sizing.md`      | cost             |
| `docs/overview/infrastructure/reference-deployment-costs-per-environment-optional-add-ons.md`          | `reference-deployment-costs-per-environment-optional-add-ons.md`        | cost             |
| `docs/overview/infrastructure/reference-deployment-costs-per-environment-pre-launch-baseline.md`       | `reference-deployment-costs-per-environment-pre-launch-baseline.md`     | cost             |
| `docs/overview/infrastructure/reference-deployment-costs-per-environment-public-ipv4-subtotal.md`      | `reference-deployment-costs-per-environment-public-ipv4-subtotal.md`    | cost             |
| `docs/overview/infrastructure/reference-deployment-costs-per-environment-steady-state.md`              | `reference-deployment-costs-per-environment-steady-state.md`            | cost             |
| `articles/for-investors.md`                                                                            | `for-investors.md`                                                      | business         |
| `docs/development/ci/workflows/reference-harness-automation-accepted-risk.md`                          | `reference-harness-automation-accepted-risk.md`                         | automation-trust |
| `docs/development/reference-merge-authority-accepted-automation-ci-risk.md`                            | `reference-merge-authority-accepted-automation-ci-risk.md`              | automation-trust |
| `docs/development/reference-worker-performance-sizing-target.md`                                       | `reference-worker-performance-sizing-target.md`                         | cost             |
| `docs/operations/private-docs-site.md`                                                                 | `private-docs-site.md`                                                  | operator-access  |
| `docs/operations/reference-private-docs-site-disable.md`                                               | `reference-private-docs-site-disable.md`                                | operator-access  |
| `docs/operations/reference-private-docs-site-enable.md`                                                | `reference-private-docs-site-enable.md`                                 | operator-access  |
| `docs/operations/reference-private-docs-site-required-github-configuration.md`                         | `reference-private-docs-site-required-github-configuration.md`          | operator-access  |
| `docs/operations/reference-private-docs-site-rotation-and-recovery.md`                                 | `reference-private-docs-site-rotation-and-recovery.md`                  | operator-access  |
| `docs/operations/reference-private-docs-site-security-boundaries.md`                                   | `reference-private-docs-site-security-boundaries.md`                    | operator-access  |
| `docs/operations/reference-private-docs-site-see-also.md`                                              | `reference-private-docs-site-see-also.md`                               | operator-access  |
| `docs/operations/reference-private-docs-site-source-of-truth.md`                                       | `reference-private-docs-site-source-of-truth.md`                        | operator-access  |
| `docs/operations/reference-private-docs-site-verify.md`                                                | `reference-private-docs-site-verify.md`                                 | operator-access  |
| `docs/overview/infrastructure/reference-networking-production-server-external-api-inventory.md`        | `reference-networking-production-server-external-api-inventory.md`      | topology         |
| `docs/requirements/trust-safety/reference-trust-system-phase-2-post-launch-vote-weight-calibration.md` | `reference-trust-system-phase-2-post-launch-vote-weight-calibration.md` | abuse-threshold  |
| `docs/requirements/trust-safety/reference-trust-system-vote-weight-system.md`                          | `reference-trust-system-vote-weight-system.md`                          | abuse-threshold  |
| `docs/strategy/MESSAGING.md`                                                                           | `strategy-MESSAGING.md`                                                 | business         |
| `docs/strategy/README.md`                                                                              | `strategy-README.md`                                                    | business         |
| `docs/strategy/feedback-loops.md`                                                                      | `feedback-loops.md`                                                     | business         |
| `docs/strategy/landing-pages-strategy.md`                                                              | `landing-pages-strategy.md`                                             | business         |
| `docs/strategy/product-strategy.md`                                                                    | `product-strategy.md`                                                   | business         |
| `docs/strategy/reference-defensive-anti-abuse-9-loops.md`                                              | `reference-defensive-anti-abuse-9-loops.md`                             | business         |
| `docs/strategy/reference-engagement-retention-14-loops.md`                                             | `reference-engagement-retention-14-loops.md`                            | business         |
| `docs/strategy/reference-feedback-loops-existing-loops.md`                                             | `reference-feedback-loops-existing-loops.md`                            | business         |
| `docs/strategy/reference-feedback-loops-growth-strategy.md`                                            | `reference-feedback-loops-growth-strategy.md`                           | business         |
| `docs/strategy/reference-feedback-loops-missing-loops-roadmap.md`                                      | `reference-feedback-loops-missing-loops-roadmap.md`                     | business         |
| `docs/strategy/reference-feedback-loops-the-gap.md`                                                    | `reference-feedback-loops-the-gap.md`                                   | business         |
| `docs/strategy/reference-growth-acquisition-8-loops.md`                                                | `reference-growth-acquisition-8-loops.md`                               | business         |
| `docs/strategy/reference-monetization-6-loops.md`                                                      | `reference-monetization-6-loops.md`                                     | business         |
| `docs/strategy/reference-trust-data-quality-7-loops.md`                                                | `reference-trust-data-quality-7-loops.md`                               | business         |

The Why column is a generic category only: cost, topology, abuse-threshold, business,
operator-access, legal-posture, or automation-trust.

Referrers to a moved path were repaired (reworded or dropped) in the same change that moved it — this
repo intentionally contains no link to any path in the right-hand column by URL, so `lint:links`
keeps passing. Do not repoint a referrer at `vouchington/vouchington-docs` by URL; reword or drop it
instead.
