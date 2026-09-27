import { spawnSync } from 'node:child_process'

import { describe, expect, it } from 'vitest'

import { artifactUploadOutcomeExitCode } from './artifact-upload-outcome.mts'

function runOutcome(...args: string[]) {
  return spawnSync(process.execPath, ['ci/artifact-upload-outcome.mts', ...args], {
    encoding: 'utf8',
  })
}

describe('artifactUploadOutcomeExitCode', () => {
  it.each([
    ['full-lcov', 'suite', 'success', 'skipped', 0],
    ['full-lcov', 'suite', 'failure', 'success', 0],
    ['full-lcov', 'suite', 'failure', 'failure', 1],
    ['full-lcov', 'suite', 'cancelled', 'skipped', 1],
    ['full-lcov', 'suite', 'skipped', 'skipped', 1],
    ['full-lcov', 'suite', 'unknown', 'success', 2],
    ['full-lcov', '', 'success', 'skipped', 2],
    ['coverage-pair', 'suite', 'success', 'skipped', 2],
    ['vitest-blob', 'suite', 'success', 'skipped', 2],
    ['vitest-report-attempt', 'suite', 'success', 'skipped', 2],
    ['bogus-family', 'suite', 'success', 'skipped', 2],
    ['', 'suite', 'success', 'skipped', 2],
  ] as const)(
    'classifies family=%s suite=%s first=%s retry=%s as exit %i',
    (family, suite, first, retry, expected) => {
      expect(artifactUploadOutcomeExitCode(family, suite, first, retry)).toBe(expected)
    },
  )
})

describe('artifact-upload-outcome.mts process contract', () => {
  it('exits 0 with empty stderr when either attempt succeeded', () => {
    const result = runOutcome('full-lcov', 'suite', 'success', 'skipped')
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
  })

  it('names the suite whose full LCOV neither attempt persisted', () => {
    const result = runOutcome('full-lcov', 'web-api-shard-2', 'failure', 'failure')
    expect(result.status).toBe(1)
    expect(result.stderr).toBe(
      '::error::FULL_LCOV_EXHAUSTED suite=web-api-shard-2 Neither GitHub artifact upload attempt persisted the full LCOV.\n',
    )
  })

  it('enforces the invalid-argument process contract', () => {
    for (const malformed of [
      runOutcome('full-lcov', 'suite', 'success'),
      runOutcome('full-lcov', 'suite', 'success', 'skipped', 'extra'),
      runOutcome('bogus-family', 'suite', 'success', 'skipped'),
    ]) {
      expect(malformed.status).toBe(2)
      expect(malformed.stderr).toMatch(/^ARTIFACT_UPLOAD_OUTCOME_INVALID /)
    }
  })
})
