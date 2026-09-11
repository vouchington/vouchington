# Standalone Workflow Checks

[Back to CI Reference](ci.md#standalone-workflow-checks)

Standalone workflows own their event admission, permissions, concurrency, runner selection, and
mutation boundary. Reusable workflows inherit authorization from an admitted caller and must keep
caller-to-callee permissions exact.

<a id="dependabot-auto-merge-and-main-push-ci"></a>

## Security and analysis workflows

- [Dependabot auto-merge](reference-dependency-updates-dependabot-automerge.md) delegates generic
  eligibility and mutation handling to the pinned shared tooling action. It uses a separate mutation
  token so the eventual merge still emits the `main` push workflows; its no-PR-checkout gate admits
  only Dependabot pull requests against the default branch.
- [Gitleaks](../../.github/workflows/gitleaks.yml) scans Git history with the checked-in baseline.
  The local directory helper scans isolated staged and working-tree snapshots instead.
- [Actionlint](../../.github/workflows/actionlint.yml) and zizmor validate workflow syntax,
  permission boundaries, and high-confidence workflow security findings.
- [Lychee](../../.github/workflows/lint-links.yml) validates documentation links on pull requests,
  main pushes, and the weekly schedule.
- Trivy runs auditable CLI gates after Docker builds: fixable CRITICAL/HIGH OS findings block,
  component SBOMs remain unfiltered, and scanner failures stay distinct from findings.

The shared `clean-workspace` action preserves dependency caches on trusted self-hosted runners but
clears incremental build data and stale generated output before a job uses the checkout.

<a id="codex-automation-workflows-are-standalone"></a>
<a id="codex-trusted-runtime-policy"></a>

## Auto Harness automation workflows

The repository automation entrypoints are [Fix Main](../../.github/workflows/fix-main.yml),
[Fix Issue](../../.github/workflows/fix-issue.yml),
[Plan](../../.github/workflows/plan.yml),
[Shepherd](../../.github/workflows/shepherd.yml),
[Fix Dependabot](../../.github/workflows/fix-dependabot.yml), and
[Scheduled Prompts](../../.github/workflows/scheduled-prompts.yml). Each entry job requires both
`vars.HARNESS_DISPATCH_ENABLED == 'true'` and its exact per-surface gate before any reaction,
comment, checkpoint, workflow rerun, prompt rendering, dispatch, or escalation. Every gate is unset
by default.

All callers delegate through [Harness Dispatch](../../.github/workflows/harness-dispatch.yml), which
runs on the general `[self-hosted]` runner pool as a single `dispatch` job gated by the same
enablement and surface-gate check. `dispatch` checks out the immutable workflow SHA without
persisted credentials and invokes the dispatch script. Every admission point across all 7 harness
workflows — `dispatch` included — shares one fixed `concurrency.group` literal
(`harness-dispatch-fleet-admission`), bounding total concurrent dispatch fleet-wide to 1 (with the
rest FIFO-queued) now that relabeling removed the old single-host runner's accidental implicit cap.
The callee receives `HARNESS_API_KEY` as a repository secret that only its own `dispatch` job
forwards by explicit name through `workflow_call`; caller checkouts do not receive it. That job
still declares the `auto-harness` GitHub Environment, which permits only `main`, purely for
branch-policy enforcement.

The provider-neutral local script in
[`ci/harness-session-dispatch.mts`](../../ci/harness-session-dispatch.mts) requires an explicit
enable flag and exact HTTPS `HARNESS_URL`, then delegates transport to the first-party
[`auto-harness-client`](https://github.com/jonathanong/auto-harness) npm library. Target routing is
a static per-repository configuration — the `HARNESS_REPOSITORY_ID`, `HARNESS_TARGET`, and
`HARNESS_FALLBACKS` GitHub repository variables — rather than a runtime repository/provider-target
lookup: _which_ provider or command to route to is fixed by these variables, not decided
dynamically per request. (A name-based `HARNESS_TARGET`/`HARNESS_FALLBACKS` value is still resolved
to an id via a runtime catalog call — see
[`reference-harness-automation.md`](../../.github/workflows/reference-harness-automation.md) — but
that resolves the name string the variables already contain, it doesn't choose the route.) The
client races each request against a bounded timeout (30s default, capped at 300s) and
raises a typed `AutoHarnessError`/`AutoHarnessRequestTimeoutError` on failure; it does not itself
bound response size, refuse redirects, or restrict session URLs to the configured origin, so those
properties now rest on `auto-harness` being a trusted first-party endpoint rather than on local
transport hardening. Unit tests inject transport by passing a mock `fetch` implementation;
activation validation additionally uses a read-only live smoke prompt.

## Source-run revalidation

Fix Main and Fix Dependabot act on a `workflow_run` event whose completion may already be
superseded by a newer run of the same workflow. Every job in those two workflows that
reads `github.event.workflow_run.*`, directly or by forwarding a `source-run-*` reusable-workflow
input, must independently revalidate that the triggering run is still the current one before it
mutates GitHub state, gate on an upstream job that already did so, or carry a declared exemption.
The check does not auto-discover a third `workflow_run`-triggered workflow or another
`source-run-*` forwarder (e.g. Scheduled Prompts' self-derived `source-run-id`); registering one
requires adding it to `SOURCE_RUN_WORKFLOWS`. Three provider-neutral modules implement the shared
check:

- [`ci/source-run-assessment.mts`](../../ci/source-run-assessment.mts) defines
  `MAX_SOURCE_RUN_AGE_MS` (48 hours) and the fetch-failure/repository-or-run-id-mismatch/stale/
  current bucketing that both other modules share.
- [`ci/source-run-state.mts`](../../ci/source-run-state.mts) is the entry point a job that checks
  out the repository runs directly, as `node ci/source-run-state.mts`.
- [`ci/source-run-guard-shell.mts`](../../ci/source-run-guard-shell.mts) generates an equivalent
  inline shell for jobs that never check out the repository (they cannot import the TypeScript
  module), spliced verbatim into a `run:` step and interpolating `MAX_SOURCE_RUN_AGE_MS` so the
  shell and the module cannot drift out of sync.

A guarded job runs one of those two forms in its own step with `id: source-state`; each mutating
step it owns carries `if: steps.source-state.outputs.current == 'true'`. Downstream jobs consume
the verdict through job outputs (`current` or `source-current`) re-exported from that step or from
a stricter follow-up check built on it. A gated job has no own guard step but its `if:` condition
requires `needs.<upstream>.outputs.(current|source-current) == 'true'`, one hop, where `<upstream>`
is itself guarded. `pnpm test -- --project ci-tools` runs
[`ci/source-run-guard-inventory.mts`](../../ci/source-run-guard-inventory.mts), which extracts every
such job from `fix-main.yml` and `fix-dependabot.yml`, and
[`ci/source-run-guard-check.mts`](../../ci/source-run-guard-check.mts), which asserts every
extracted job is guarded, gated, or exempt, and that every declared exemption still matches a real
job; either failure blocks CI. The declared `SOURCE_RUN_EXEMPTIONS` are:

| Workflow                        | Job                  | Why exempt                                                                                                                                                                                                               |
| ------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `dispatch-completed-deploy.yml` | `dispatch`           | Every trusted successful default-branch completion is an intended immutable deployment request, not stale automation to suppress; private infrastructure validates the exact run attempt and owns deployment sequencing. |
| `fix-main.yml`                  | `related-candidates` | Read-only related-PR/issue lookup keyed by workflow name. Performs no mutation; every downstream job that acts on its output is independently guarded before mutating.                                                   |

Both `triage-and-rerun` jobs (`fix-main.yml` and `fix-dependabot.yml`) used to be exempt here on the
rationale that `gh run rerun` is idempotent and mutates no issue or PR. That reasoning was wrong —
each call creates a new run attempt. Fix Dependabot therefore routes every rerun route (targeted
transient job, full transient workflow, and uncatalogued cancelled/timed-out attempt one) through
[`ci/revalidate-dependabot-rerun.mts`](../../ci/revalidate-dependabot-rerun.mts). In the same process
immediately before the mutation, it refetches the exact run and its PR association, then requires the
live PR to be open, Dependabot-authored, same-repository, and at the source ref/SHA. A changed source
attempt/status/conclusion, aged run, closed PR, or advanced Dependabot head emits a notice and exits
without mutation. Malformed input, API uncertainty, or an identity mismatch fails closed.

## Trusted-host boundary

The selected provider runs on a trusted host with repository-scoped git and `gh` credentials.
Prompts treat GitHub content as untrusted evidence, revalidate authorization and exact target state
immediately before mutation, use exact branch leases, and prohibit merge and auto-merge. The
complete contract and accepted residual risk are in
[Auto Harness automation security boundary](../../.github/workflows/reference-harness-automation-accepted-risk.md).

Interactive Codex tooling and Codex Cloud Security remain intentionally provider-specific and are
not part of repository automation dispatch.
