# Artifact Rerun Safety

[Back to Workflow Authoring Reference](AUTHORING.md#artifact-rerun-safety)

Before changing artifact handoffs, check failed-only reruns and full reruns explicitly:

- Every `actions/upload-artifact@v7` upload should use `overwrite: true` and
  `retention-days: 1`. `artifact-retention-policy.test.mts` rejects omissions,
  expressions, and every other value. The repository-level artifact and log retention setting
  stays at three days so diagnostic logs remain available beyond workflow artifact lifetimes;
  verify the live value through the versioned
  `GET /repos/{owner}/{repo}/actions/permissions/artifact-and-log-retention` API before changing
  the repository setting.
- Every `actions/download-artifact@v8` download should set `github-token`, `repository`, and `run-id`; add a named allowlist entry in `workflow-automation-safety.test.mts` only for intentional same-attempt diagnostics.
- Consumer jobs that delete artifacts need `actions: write`; download-only consumers need `actions: read`.
- Delete inter-job artifacts only after all required fan-in gates have passed, so failed-only reruns can reuse earlier producer artifacts.
- For reusable workflows, callers must grant the union of top-level and job-level permissions declared by the callee; `workflow-permissions.test.mts` enforces this.
- Every artifact name uploaded anywhere in `.github/workflows/*.yml` or `.github/actions/*/action.yml` must be classified `keep` or `delete` in `ci/cleanup-artifacts-patterns.json` (normalize `${{ ... }}` interpolations to a wildcard before matching a new name against the lists). Patterns are exact names or exact prefixes followed by one trailing `*`; richer glob syntax is rejected so the TypeScript sweep and dependency-free in-run cleanup cannot disagree. Adding a new `actions/upload-artifact@v7` step without adding it to one of these lists fails the guard test in `artifact-retention-policy.test.mts`.
- Coverage is a two-file provenance handoff, not a best-effort diagnostic upload. Project
  `coverage/lcov.info` onto the pull-request patch before transport, upload it together with
  `coverage/coverage-manifest.json`, try both GitHub upload attempts independently, and finish with
  `artifact-upload-outcome.mts` so exhaustion fails the producer directly. The complete contract
  is in [COVERAGE.md](COVERAGE.md#provenance-and-transport).
- Coverage producers must use the leaf `upload-coverage-pair` action for both GitHub upload
  attempts. Keep both attempts, the terminal outcome step, and permission hardening as
  caller-visible steps with their existing IDs, conditions, `continue-on-error`, and exact
  timeouts. The retry attempt must pass `name-suffix: -retry`: a finalize-403 can leave the
  primary's unsuffixed name registered but unfinalized (a "zombie") that `overwrite: true` cannot
  see or replace, so a same-named retry would 409 instead of recovering.
  `ci/normalize-retry-artifact-directories.mts` strips the suffix back off downloaded directories
  before `preparePatchCoverageArtifacts` runs, so the directory-name contract with `coverage-check`
  is unaffected. Fan-in consumers instead use `ci/download-optional-run-artifacts.sh`: the download step
  emits a typed outcome and bounded warning and does not use `continue-on-error`. Coverage
  preparation and Vitest report merge remain terminal, and the tests-processing aggregate gate must
  require merge success or a legitimately skipped merge.
- Vitest-blob callers must use the leaf `upload-vitest-blob` action. Keep both GitHub fallback
  attempts (`timeout-minutes: 1` for the first, `timeout-minutes: 3` for the second, mirroring the
  coverage pair's second attempt) and the terminal `artifact-upload-outcome.mts` assertion
  as caller-visible steps with their own IDs, conditions, `continue-on-error`, and exact timeouts.
  The composite action wraps only the single `actions/upload-artifact@v7` call, never the
  retry-then-assert sequence: `timeout-minutes` is not among the step keys GitHub documents for
  composite actions (unlike `continue-on-error`, which is), so collapsing both attempts into the
  action would give a hung first attempt's finalize call the whole shared budget instead of a
  bounded 1 minute, starving the second attempt of the window it exists for. Setting
  `ACTIONS_ARTIFACT_UPLOAD_TIMEOUT_MS` on the leaf action does not substitute for the outer
  `timeout-minutes` split: in the pinned `actions/upload-artifact@v7` bundle it only bounds
  `uploadToBlobStorage`'s no-progress watchdog around the byte-streaming phase, reset by every
  `onProgress` event, and never covers the glob/stat walk, `CreateArtifact`, or `FinalizeArtifact`
  Twirp calls (each retried up to 5 times against a 180s socket-inactivity timeout) — a backend
  dribbling bytes on any of those can hold the step open indefinitely regardless of that env var.
- Vitest-blob GitHub fallback payloads use the exact `vitest-blob-manifest:v1` plus `${suite}.json`
  contract. The manifest proves repository, revision, run, attempt, suite, byte length, and
  SHA-256; extra archive/artifact entries and non-regular files are invalid. Fan-in downloads into
  a single root and validates every candidate before selecting the greatest attempt for each
  expected suite. The exact `vitest-report-expectations:v2` context carries the producing minimum
  attempt from a mandatory `vitest-report-attempt-*` marker for every suite, so one rerun matrix
  child cannot fall back to an older report while an untouched successful sibling remains reusable.
  Marker steps use `always()` so a participating cancelled child records its current attempt too;
  single-artifact flattened downloads and multi-artifact nested downloads are both exact validated
  layouts. The download root is validated as a whole before any candidate from it participates: a
  known malformed-root failure rejects it with a stable warning and contributes no partial reports;
  missing expectations and conflicts remain terminal.
  A suite that is unexpected in the current selection is ignored only when a valid manifest proves
  it came from an earlier attempt of this same run and revision. See
  [Vitest CI Mapping](VITEST.md#vitest-ci-mapping).
- Mandatory `vitest-report-attempt-*` markers use two caller-visible upload attempts, each capped
  at one minute and allowed to fail independently. The shared leaf upload action sets
  `ACTIONS_ARTIFACT_UPLOAD_TIMEOUT_MS` to 30 seconds so a blob-storage request with no progress
  yields before the outer step budget; the retry runs only when the first attempt's literal
  outcome is `failure`. A final one-minute `artifact-upload-outcome.mts` gate runs when the
  producer participated and was not cancelled, succeeds when either upload succeeded, and fails
  the producer with `VITEST_REPORT_ATTEMPT_EXHAUSTED` after both attempts are exhausted. Keep the
  retry sequence in workflow callers so each network attempt owns its full timeout. Preserve the
  existing `always()` participation conditions on both upload attempts, `overwrite: true`, and the
  one-day retention contract. The retry attempt must pass `name-suffix: -retry`: a finalize-403 can
  leave the primary's unsuffixed name registered but unfinalized (a "zombie") that `overwrite: true`
  cannot see or replace, so a same-named retry would 409 instead of recovering.
  `ci/normalize-retry-artifact-directories.mts` strips the suffix back off downloaded directories
  before `readVitestReportAttempts` runs, so the marker's directory-name contract with
  `vouchington-tooling` is unaffected.
- Keep statically required producer-consumer handoffs visible to `no-mistakes`'s workflow topology model. It resolves only same-run jobs, including local reusable workflows, and deliberately does not connect `workflow_run`, remote reusable workflows, or unrelated roots. Dynamic names remain conservative; missing static producers and proven ambiguous unordered exact producers, including unconditional colliding matrix instances, are load diagnostics. `archive: false` makes the upload name path-derived, so do not expect a configured `name` to satisfy a named or pattern download; its unresolved filename can suppress a missing-producer diagnostic without inventing an edge. Conditional candidates are reported only as possible and do not create a proven ambiguity. Add durable required handoffs to the central topology policy, and inspect JSON or Mermaid with `pnpm run ci:topology`. See [CI Reference § Workflow Topology Contracts](../../docs/development/ci.md#workflow-topology-contracts) for edge fields, index queries, and resolution boundaries.
- Immediate cleanup (`ci/cleanup-run-artifacts.mjs`, exposed by the reusable `cleanup-artifacts.yml`) runs inside the eight main-branch producer workflows only from their terminal fan-in, after every required same-run artifact consumer and other terminal job has succeeded or legitimately skipped. Pull-request `CI` never receives `actions: write` for artifact cleanup: its workflow definition and helpers come from the pull-request revision, so a same-repository bot could edit any in-workflow trust gate. Pull-request artifacts therefore wait for the trusted scheduled sweep. Each main-branch caller passes its own `github.run_id`; no external `workflow_run` cleanup consumer exists, so a later attempt cannot overlap an earlier attempt's delayed cleanup. Other successful workflows wait for the scheduled sweep. The sweep considers only delete-classified artifacts whose artifact `created_at` is older than 6 hours and whose run concluded exactly `success` or `cancelled`. It does not create a grace period measured from cancellation: the next scheduled sweep performs deletion after the creation-time threshold. An unavailable/null run lookup skips only the current sweep and is retried later; a later `success`/`cancelled` result becomes eligible. `failure`, `timed_out`, `action_required`, known unknown/unrecognized, and every other known conclusion are left alone until GitHub expiration, even past the threshold — a rerun may still need sibling artifacts from the original attempt. This deliberate retention of failed-run `coverage-*` artifacts is what makes a same-run earlier-attempt suite reachable by the consumer at all, and is why it prunes provably-stale ones before inspection instead of relying on retention to have already dropped them — see [Coverage Provenance and Transport](../../docs/development/reference-ci-coverage-provenance-and-transport.md).
