import { MAX_SOURCE_RUN_AGE_MS } from './source-run-assessment.mts'

if (
  !Number.isSafeInteger(MAX_SOURCE_RUN_AGE_MS) ||
  MAX_SOURCE_RUN_AGE_MS <= 0 ||
  MAX_SOURCE_RUN_AGE_MS % 3_600_000 !== 0
) {
  throw new Error(
    `MAX_SOURCE_RUN_AGE_MS must be a positive whole number of hours; got ${MAX_SOURCE_RUN_AGE_MS}`,
  )
}

const MAX_SOURCE_RUN_AGE_SECONDS = MAX_SOURCE_RUN_AGE_MS / 1000
const MAX_SOURCE_RUN_AGE_HOURS = MAX_SOURCE_RUN_AGE_MS / 3_600_000

/** fix-main.yml's no-checkout jobs that splice in {@link SOURCE_RUN_GUARD_SHELL}. */
export const SOURCE_RUN_GUARD_JOB_NAMES = ['escalate'] as const

/**
 * Canonical no-checkout revalidation guard for the fix-main.yml jobs named in
 * {@link SOURCE_RUN_GUARD_JOB_NAMES}, plus fix-dependabot.yml's `revalidate-dispatch` and
 * `escalate` jobs. Those jobs never check out the repository, so they cannot import
 * ci/source-run-state.mts directly and instead splice this shell verbatim into a `run: |` step
 * (see ci/source-run-guard-shell.test.mts for the per-site equality lock).
 *
 * Mirrors assessSourceRunState's bucketing and check order from ci/source-run-assessment.mts:
 * fetch failure and a repository or run-id mismatch fail closed (exit 1, the source run cannot be
 * trusted at all); a changed attempt/status/conclusion or a stale run suppress (exit 0,
 * `current=false`, quietly skip as superseded); otherwise the guard writes `current=true`.
 *
 * The age bound is generated from MAX_SOURCE_RUN_AGE_MS, not hand-copied, so this and the TS
 * module cannot drift out of sync the way the pre-convergence inline bash could.
 */
export const SOURCE_RUN_GUARD_SHELL = `set -euo pipefail
fail_closed() {
  echo "current=false" >> "$GITHUB_OUTPUT"
  echo "::error::$1"
  exit 1
}
suppress_stale() {
  echo "current=false" >> "$GITHUB_OUTPUT"
  echo "::notice::$1"
  exit 0
}

# The age check happens inside jq (fromdateiso8601/now) rather than shell \`date\` arithmetic:
# \`date -d\`/\`date -j\` differ between GNU and BSD, and workflow scripts must also run on macOS.
# \`fromdateiso8601\` is resolved by gojq, the jq processor \`gh\` bundles for --jq, not the host's
# system jq — so no separate jq install/version floor applies. This whole step is generated from
# ci/source-run-guard-shell.mts, which interpolates MAX_SOURCE_RUN_AGE_MS from
# ci/source-run-assessment.mts, so the bound below cannot drift out of sync with the TS module.
# Freshness is measured from \`run_started_at\`, not \`created_at\`: \`created_at\` is fixed at the
# run's original creation and does not move on a manual re-run, while \`run_started_at\` resets to
# when the matching attempt actually started — using \`created_at\` would fail-closed-suppress a
# same-attempt re-run that completed seconds ago just because the run was first created over 48h
# earlier. A missing/malformed run_started_at makes fromdateiso8601 error, which lands here as a
# fetch failure (fail_closed), matching the module's malformed-response handling.
if ! source_state="$(
  gh api "repos/$GITHUB_REPOSITORY/actions/runs/$SOURCE_RUN_ID" \\
    --jq '[.repository.full_name, .id, .run_attempt, .status, .conclusion,
           ((now - (.run_started_at | fromdateiso8601)) <= (${MAX_SOURCE_RUN_AGE_SECONDS}))] | @tsv'
)"; then
  fail_closed "Could not fetch source workflow run $SOURCE_RUN_ID"
fi

IFS=$'\\t' read -r actual_repo actual_id actual_attempt actual_status actual_conclusion actual_fresh \\
  <<< "$source_state"

# Case-insensitive, portable comparison (no \${var,,}: workflow scripts must also run on macOS,
# whose /bin/bash is 3.2, which predates bash 4's lowercase parameter expansion).
actual_repo_lower="$(printf '%s' "$actual_repo" | LC_ALL=C tr '[:upper:]' '[:lower:]')"
expected_repo_lower="$(printf '%s' "$GITHUB_REPOSITORY" | LC_ALL=C tr '[:upper:]' '[:lower:]')"
if [[ "$actual_repo_lower" != "$expected_repo_lower" ]]; then
  fail_closed "Source workflow run resolved to a different repository; refusing to act"
fi
if [[ "$actual_id" != "$SOURCE_RUN_ID" ]]; then
  fail_closed "Source workflow run id changed; refusing to act on a different run"
fi
if [[ "$actual_attempt" != "$SOURCE_RUN_ATTEMPT" ||
      "$actual_status" != "completed" ||
      "$actual_conclusion" != "$SOURCE_RUN_CONCLUSION" ]]; then
  suppress_stale "Source workflow run changed; skipping as superseded"
fi
if [[ "$actual_fresh" != "true" ]]; then
  suppress_stale "Source workflow run is older than ${MAX_SOURCE_RUN_AGE_HOURS}h; skipping as superseded"
fi

echo "current=true" >> "$GITHUB_OUTPUT"
`
