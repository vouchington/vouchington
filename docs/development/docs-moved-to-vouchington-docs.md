# Documentation Moved to vouchington-docs

Some `docs/**` pages disclosed information too sensitive for a public repository — live abuse
thresholds, a vote-buying multiplier formula, real infrastructure topology, real personal-machine
hostnames, or investor-facing business figures. Rather than deleting that content outright, each
page was moved verbatim to the private `vouchington/vouchington-docs` repository, which the relevant
team can still consult.

This table is the authoritative registry of every path deliberately absent from this repo for that
reason. A path listed here that reappears after a wholesale sync from `filaments` was resurrected by
the sync, not intentionally restored — delete it again and add the sync's source commit to this
doc's history rather than silently re-removing it. Add a row here in the same change that moves a
page out, before merging.

| Removed from this repo (`docs/**`)                                                                | Now at (`vouchington/vouchington-docs`)                              | Why                                                                                                    |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `docs/runbooks/csam-child-safety-escalation.md`                                                   | `csam-child-safety-escalation.md`                                    | States plainly there is no automated content hashing and no paging/alerting on child-safety escalation |
| `docs/requirements/trust-safety/vote-weight.md`                                                   | `vote-weight.md`                                                     | Published the exact stackable vote-weight multiplier formula and a maximum-weight calculation          |
| `docs/requirements/trust-safety/vote-integrity.md`                                                | `vote-integrity.md`                                                  | Published exact brigading detection thresholds an attacker could stay just under                       |
| `docs/development/reference-host-locks-nextjs-build-worker-reserve.md`                            | `reference-host-locks-nextjs-build-worker-reserve.md`                | Named real personal-machine hostnames and the self-hosted runner fleet's memory/CPU topology           |
| `docs/overview/infrastructure/reference-networking-topology.md`                                   | `reference-networking-topology.md`                                   | Full live VPC map with real subnet CIDRs and security-group port rules                                 |
| `docs/strategy/go-to-market.md`                                                                   | `go-to-market.md`                                                    | Real phase targets and the founder's handle wired into launch tactics                                  |
| `docs/overview/architecture/openai-cost-model.md`                                                 | `openai-cost-model.md`                                               | Real per-call OpenAI cost figures                                                                      |
| `docs/overview/infrastructure/deployment-costs.md`                                                | `deployment-costs.md`                                                | Real aggregate infrastructure spend                                                                    |
| `docs/overview/infrastructure/reference-deployment-costs-ci-testing-costs.md`                     | `reference-deployment-costs-ci-testing-costs.md`                     | Real CI/testing infrastructure spend                                                                   |
| `docs/overview/infrastructure/reference-deployment-costs-cost-controls-already-in-place.md`       | `reference-deployment-costs-cost-controls-already-in-place.md`       | Real cost figures behind existing cost-control measures                                                |
| `docs/overview/infrastructure/reference-deployment-costs-cross-environment-saas.md`               | `reference-deployment-costs-cross-environment-saas.md`               | Real third-party SaaS spend across environments                                                        |
| `docs/overview/infrastructure/reference-deployment-costs-per-environment-aws-costs.md`            | `reference-deployment-costs-per-environment-aws-costs.md`            | Real per-environment AWS spend                                                                         |
| `docs/overview/infrastructure/reference-deployment-costs-per-environment-ecs-fargate-sizing.md`   | `reference-deployment-costs-per-environment-ecs-fargate-sizing.md`   | Real per-environment ECS Fargate task sizing and its cost                                              |
| `docs/overview/infrastructure/reference-deployment-costs-per-environment-optional-add-ons.md`     | `reference-deployment-costs-per-environment-optional-add-ons.md`     | Real cost of optional per-environment infrastructure add-ons                                           |
| `docs/overview/infrastructure/reference-deployment-costs-per-environment-pre-launch-baseline.md`  | `reference-deployment-costs-per-environment-pre-launch-baseline.md`  | Real pre-launch baseline infrastructure spend                                                          |
| `docs/overview/infrastructure/reference-deployment-costs-per-environment-public-ipv4-subtotal.md` | `reference-deployment-costs-per-environment-public-ipv4-subtotal.md` | Real public IPv4 cost subtotal per environment                                                         |
| `docs/overview/infrastructure/reference-deployment-costs-per-environment-steady-state.md`         | `reference-deployment-costs-per-environment-steady-state.md`         | Real steady-state infrastructure spend per environment                                                 |

The first six rows moved together in the docs-redaction pass that followed the `filaments` history
sync; the remaining eleven (`openai-cost-model.md`, `deployment-costs.md`, and the
`reference-deployment-costs-*` set) moved together in an earlier pass, before that sync. Both passes
also redacted narrower spans in place in several other files rather than moving them wholesale — see
each redacted file's own history for that content; this registry covers only whole-file moves.

Referrers to a moved path were repaired (reworded or dropped) in the same change that moved it — this
repo intentionally contains no link to any path in the right-hand column by URL, so `lint:links`
keeps passing. Do not repoint a referrer at `vouchington/vouchington-docs` by URL; reword or drop it
instead, the same way the existing referrer repairs did.
