#!/usr/bin/env node
// Full LCOV is the sole persisted coverage artifact family. Either upload attempt must succeed.

const STEP_OUTCOMES = new Set(['success', 'failure', 'cancelled', 'skipped'])
export function artifactUploadOutcomeExitCode(
  family: string,
  suite: string,
  first: string,
  retry: string,
): 0 | 1 | 2 {
  if (
    family !== 'full-lcov' ||
    !suite.trim() ||
    !STEP_OUTCOMES.has(first) ||
    !STEP_OUTCOMES.has(retry)
  ) {
    return 2
  }
  return first === 'success' || retry === 'success' ? 0 : 1
}

if (import.meta.main) {
  const [family = '', suite = '', first = '', retry = '', ...extra] = process.argv.slice(2)
  const exitCode =
    extra.length === 0 ? artifactUploadOutcomeExitCode(family, suite, first, retry) : 2

  if (exitCode === 1) {
    process.stderr.write(
      `::error::FULL_LCOV_EXHAUSTED suite=${suite} Neither GitHub artifact upload attempt persisted the full LCOV.\n`,
    )
  } else if (exitCode === 2) {
    process.stderr.write(
      `ARTIFACT_UPLOAD_OUTCOME_INVALID family=${family} suite=${suite} first=${first} retry=${retry}\n`,
    )
  }
  process.exitCode = exitCode
}
