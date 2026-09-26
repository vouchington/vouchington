#!/usr/bin/env node
// Replaces ci/coverage-transport.mts and ci/vitest-report-attempt-outcome.mts. Every family
// reduces to the identical predicate — exit 0 iff either upload attempt reports 'success' — now that
// the S3 primary coverage transport is gone (PR #11394); only each family's exhaustion marker text
// differs. Every family but full-lcov reproduces byte-for-byte the text of the script it replaced (see
// .github/workflows/reference-artifact-rerun-safety.md and ci/transient-retry/coverage-artifact-rules.mts,
// which parse the coverage-pair marker verbatim to authorize an automatic main-CI rerun).

import { fileURLToPath } from 'node:url'

const STEP_OUTCOMES = new Set(['success', 'failure', 'cancelled', 'skipped'])
const FAMILIES = new Set(['coverage-pair', 'full-lcov', 'vitest-blob', 'vitest-report-attempt'])

export type ArtifactUploadFamily =
  | 'coverage-pair'
  | 'full-lcov'
  | 'vitest-blob'
  | 'vitest-report-attempt'

function isFamily(value: string): value is ArtifactUploadFamily {
  return FAMILIES.has(value)
}

export function artifactUploadOutcomeExitCode(
  family: string,
  suite: string,
  first: string,
  retry: string,
): 0 | 1 | 2 {
  if (
    !isFamily(family) ||
    !suite.trim() ||
    !STEP_OUTCOMES.has(first) ||
    !STEP_OUTCOMES.has(retry)
  ) {
    return 2
  }
  return first === 'success' || retry === 'success' ? 0 : 1
}

// Exact wording is a log contract read asynchronously (across commits) by
// ci/transient-retry/coverage-artifact-rules.mts's coverage-pair rule — do not reword without
// updating that regex in the same change, and see the plan doc for why that coupling is deliberately
// out of scope for a routine edit.
function exhaustedMarker(
  family: ArtifactUploadFamily,
  suite: string,
  first: string,
  retry: string,
): string {
  switch (family) {
    case 'coverage-pair':
      return `::error::COVERAGE_TRANSPORT_EXHAUSTED suite=${suite} Neither S3 nor GitHub artifacts persisted the coverage pair.`
    case 'full-lcov':
      return `::error::FULL_LCOV_EXHAUSTED suite=${suite} Neither GitHub artifact upload attempt persisted the full LCOV.`
    case 'vitest-blob':
      return `::error::COVERAGE_TRANSPORT_BLOB_EXHAUSTED suite=${suite} Neither S3 nor GitHub artifacts persisted the vitest blob.`
    case 'vitest-report-attempt':
      return `VITEST_REPORT_ATTEMPT_EXHAUSTED suite=${suite} first=${first} retry=${retry}`
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [family = '', suite = '', first = '', retry = '', ...extra] = process.argv.slice(2)
  const exitCode =
    extra.length === 0 ? artifactUploadOutcomeExitCode(family, suite, first, retry) : 2

  if (exitCode === 1 && isFamily(family)) {
    process.stderr.write(`${exhaustedMarker(family, suite, first, retry)}\n`)
  } else if (exitCode === 2) {
    process.stderr.write(
      `ARTIFACT_UPLOAD_OUTCOME_INVALID family=${family} suite=${suite} first=${first} retry=${retry}\n`,
    )
  }
  process.exitCode = exitCode
}
