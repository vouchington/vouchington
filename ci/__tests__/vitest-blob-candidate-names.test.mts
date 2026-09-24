import { spawnSync } from 'node:child_process'

import { describe, expect, it } from 'vitest'

import {
  VITEST_REPORT_EXPECTATIONS_VERSION,
  deriveVitestBlobCandidateNames,
  parseVitestReportExpectationsContext,
  runVitestBlobCandidateNamesCli,
  type VitestReportExpectationsContext,
} from '../vitest-blob-candidate-names.mts'

function context(
  attempt: number,
  suites: readonly { suite: string; minimumAttempt: number }[],
): VitestReportExpectationsContext {
  return { version: VITEST_REPORT_EXPECTATIONS_VERSION, attempt, suites }
}

function runCli(env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, ['ci/vitest-blob-candidate-names.mts'], {
    encoding: 'utf8',
    env,
  })
}

describe('deriveVitestBlobCandidateNames', () => {
  it('derives every attempt from minimumAttempt through the current attempt, with and without -retry', () => {
    const names = deriveVitestBlobCandidateNames(
      context(3, [
        { suite: 'suite-a', minimumAttempt: 2 },
        { suite: 'suite-b', minimumAttempt: 2 },
      ]),
    )
    expect(names).toEqual([
      'vitest-blob-suite-a-attempt-2',
      'vitest-blob-suite-a-attempt-2-retry',
      'vitest-blob-suite-a-attempt-3',
      'vitest-blob-suite-a-attempt-3-retry',
      'vitest-blob-suite-b-attempt-2',
      'vitest-blob-suite-b-attempt-2-retry',
      'vitest-blob-suite-b-attempt-3',
      'vitest-blob-suite-b-attempt-3-retry',
    ])
  })

  it('preserves a split partial rerun: only the second suite is bounded to the newer attempt', () => {
    const names = deriveVitestBlobCandidateNames(
      context(2, [
        { suite: 'suite-a', minimumAttempt: 1 },
        { suite: 'suite-b', minimumAttempt: 2 },
      ]),
    )
    expect(names).toEqual([
      'vitest-blob-suite-a-attempt-1',
      'vitest-blob-suite-a-attempt-1-retry',
      'vitest-blob-suite-a-attempt-2',
      'vitest-blob-suite-a-attempt-2-retry',
      'vitest-blob-suite-b-attempt-2',
      'vitest-blob-suite-b-attempt-2-retry',
    ])
  })

  it('never produces a stale attempt below minimumAttempt', () => {
    const names = deriveVitestBlobCandidateNames(
      context(3, [{ suite: 'suite-a', minimumAttempt: 3 }]),
    )
    expect(names).toEqual(['vitest-blob-suite-a-attempt-3', 'vitest-blob-suite-a-attempt-3-retry'])
  })

  it('returns no candidates for zero suites', () => {
    expect(deriveVitestBlobCandidateNames(context(4, []))).toEqual([])
  })
})

describe('parseVitestReportExpectationsContext', () => {
  // The exact-key set, suite name pattern, minimumAttempt/attempt bounds, sort order, and
  // uniqueness are already strictly validated immediately upstream (the
  // `merge-vitest-report-expectations` jq step in ci-tests-processing.yml) and again downstream
  // (vouchington-tooling's `parseContext` inside `prepare-vitest-reports`). This module only
  // re-checks what it needs to safely derive names from the value.
  const valid = {
    version: VITEST_REPORT_EXPECTATIONS_VERSION,
    attempt: 2,
    suites: [{ suite: 'suite-a', minimumAttempt: 1 }],
  }

  it('accepts a well-formed context', () => {
    expect(parseVitestReportExpectationsContext(valid)).toEqual(valid)
  })

  it('tolerates values the upstream/downstream validators reject but derivation does not need', () => {
    // Extra keys, an out-of-range minimumAttempt, and an unsorted/duplicated suite list are all
    // rejected upstream or downstream but would not make derivation itself misbehave here.
    expect(() =>
      parseVitestReportExpectationsContext({
        ...valid,
        extra: true,
        suites: [
          { suite: 'suite-b', minimumAttempt: 1 },
          { suite: 'suite-a', minimumAttempt: 1 },
          { suite: 'suite-a', minimumAttempt: 5 },
        ],
      }),
    ).not.toThrow()
  })

  it.each([
    ['non-object value', 'not-an-object', /expected an object/],
    ['array value', [], /expected an object/],
    [
      'wrong version',
      { ...valid, version: 'vitest-report-expectations:v1' },
      /Unsupported Vitest report expectations version/,
    ],
    ['attempt given as a string', { ...valid, attempt: '2' }, /attempt must be a number/],
    [
      'missing attempt',
      { version: valid.version, suites: valid.suites },
      /attempt must be a number/,
    ],
    ['non-array suites', { ...valid, suites: 'nope' }, /suites must be an array/],
    [
      'suite entry missing minimumAttempt',
      { ...valid, suites: [{ suite: 'suite-a' }] },
      /expected \{suite: string, minimumAttempt: number\}/,
    ],
    [
      'suite entry missing suite',
      { ...valid, suites: [{ minimumAttempt: 1 }] },
      /expected \{suite: string, minimumAttempt: number\}/,
    ],
    [
      'minimumAttempt given as a string',
      { ...valid, suites: [{ suite: 'suite-a', minimumAttempt: '1' }] },
      /expected \{suite: string, minimumAttempt: number\}/,
    ],
  ])('rejects %s', (_name, malformed, message) => {
    expect(() => parseVitestReportExpectationsContext(malformed)).toThrowError(message)
  })
})

describe('runVitestBlobCandidateNamesCli', () => {
  it('derives candidates from VITEST_REPORT_EXPECTATIONS alone', () => {
    const names = runVitestBlobCandidateNamesCli([], {
      VITEST_REPORT_EXPECTATIONS: JSON.stringify({
        version: VITEST_REPORT_EXPECTATIONS_VERSION,
        attempt: 2,
        suites: [{ suite: 'suite-a', minimumAttempt: 2 }],
      }),
    })
    expect(names).toEqual(['vitest-blob-suite-a-attempt-2', 'vitest-blob-suite-a-attempt-2-retry'])
  })

  it('rejects unexpected positional arguments', () => {
    expect(() => runVitestBlobCandidateNamesCli(['unexpected'], {})).toThrowError(/Usage:/)
  })

  it('rejects malformed JSON', () => {
    expect(() =>
      runVitestBlobCandidateNamesCli([], { VITEST_REPORT_EXPECTATIONS: '{not json' }),
    ).toThrowError(/not valid JSON/)
  })

  it('requires VITEST_REPORT_EXPECTATIONS', () => {
    expect(() => runVitestBlobCandidateNamesCli([], {})).toThrowError(
      /VITEST_REPORT_EXPECTATIONS is required/,
    )
  })
})

describe('vitest-blob-candidate-names.mts process contract', () => {
  it('exits 0 and prints one candidate name per line', () => {
    const result = runCli({
      PATH: process.env.PATH,
      VITEST_REPORT_EXPECTATIONS: JSON.stringify({
        version: VITEST_REPORT_EXPECTATIONS_VERSION,
        attempt: 1,
        suites: [{ suite: 'suite-a', minimumAttempt: 1 }],
      }),
    })
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toBe(
      'vitest-blob-suite-a-attempt-1\nvitest-blob-suite-a-attempt-1-retry\n',
    )
  })

  it('exits 0 and prints nothing for zero suites', () => {
    const result = runCli({
      PATH: process.env.PATH,
      VITEST_REPORT_EXPECTATIONS: JSON.stringify({
        version: VITEST_REPORT_EXPECTATIONS_VERSION,
        attempt: 1,
        suites: [],
      }),
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toBe('')
  })

  it('exits 2 with a diagnostic on missing environment', () => {
    const result = runCli({ PATH: process.env.PATH })
    expect(result.status).toBe(2)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain('VITEST_REPORT_EXPECTATIONS is required')
  })
})
