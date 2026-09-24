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
  const valid = {
    version: VITEST_REPORT_EXPECTATIONS_VERSION,
    attempt: 2,
    suites: [{ suite: 'suite-a', minimumAttempt: 1 }],
  }

  it('accepts a well-formed context', () => {
    expect(parseVitestReportExpectationsContext(valid, 2)).toEqual(valid)
  })

  it.each([
    ['non-object value', 'not-an-object', /expected exactly \{version, attempt, suites\}/],
    ['array value', [], /expected exactly \{version, attempt, suites\}/],
    [
      'unexpected extra key',
      { ...valid, extra: true },
      /expected exactly \{version, attempt, suites\}/,
    ],
    [
      'wrong version',
      { ...valid, version: 'vitest-report-expectations:v1' },
      /Unsupported Vitest report expectations version/,
    ],
    [
      'attempt mismatched with GITHUB_RUN_ATTEMPT',
      { ...valid, attempt: 3 },
      /does not match GITHUB_RUN_ATTEMPT/,
    ],
    ['attempt given as a string', { ...valid, attempt: '2' }, /does not match GITHUB_RUN_ATTEMPT/],
    ['non-array suites', { ...valid, suites: 'nope' }, /suites must be an array/],
    [
      'suite entry missing a required key',
      { ...valid, suites: [{ suite: 'suite-a' }] },
      /expected exactly \{suite, minimumAttempt\}/,
    ],
    [
      'suite name failing VITEST_SUITE_PATTERN',
      { ...valid, suites: [{ suite: 'Suite_A', minimumAttempt: 1 }] },
      /invalid suite name/,
    ],
    [
      'minimumAttempt above the current attempt',
      { ...valid, suites: [{ suite: 'suite-a', minimumAttempt: 3 }] },
      /invalid minimumAttempt/,
    ],
    [
      'minimumAttempt below 1',
      { ...valid, suites: [{ suite: 'suite-a', minimumAttempt: 0 }] },
      /invalid minimumAttempt/,
    ],
    [
      'minimumAttempt given as a string',
      { ...valid, suites: [{ suite: 'suite-a', minimumAttempt: '1' }] },
      /invalid minimumAttempt/,
    ],
    [
      'minimumAttempt given as a non-integer number',
      { ...valid, suites: [{ suite: 'suite-a', minimumAttempt: 1.5 }] },
      /invalid minimumAttempt/,
    ],
    [
      'duplicate suite names',
      {
        ...valid,
        suites: [
          { suite: 'suite-a', minimumAttempt: 1 },
          { suite: 'suite-a', minimumAttempt: 2 },
        ],
      },
      /duplicate suite names/,
    ],
    [
      'unsorted suite names',
      {
        ...valid,
        suites: [
          { suite: 'suite-b', minimumAttempt: 1 },
          { suite: 'suite-a', minimumAttempt: 1 },
        ],
      },
      /suites must be sorted/,
    ],
  ])('rejects %s', (_name, malformed, message) => {
    expect(() => parseVitestReportExpectationsContext(malformed, 2)).toThrowError(message)
  })
})

describe('runVitestBlobCandidateNamesCli', () => {
  it('derives candidates from VITEST_REPORT_EXPECTATIONS and GITHUB_RUN_ATTEMPT', () => {
    const names = runVitestBlobCandidateNamesCli([], {
      GITHUB_RUN_ATTEMPT: '2',
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
      runVitestBlobCandidateNamesCli([], {
        GITHUB_RUN_ATTEMPT: '1',
        VITEST_REPORT_EXPECTATIONS: '{not json',
      }),
    ).toThrowError(/not valid JSON/)
  })

  it('requires GITHUB_RUN_ATTEMPT', () => {
    expect(() =>
      runVitestBlobCandidateNamesCli([], { VITEST_REPORT_EXPECTATIONS: '{}' }),
    ).toThrowError(/GITHUB_RUN_ATTEMPT is required/)
  })

  it.each([
    ['zero', '0'],
    ['leading zero', '01'],
    ['negative', '-1'],
    ['non-numeric', 'abc'],
    ['fractional', '1.5'],
  ])('rejects a %s GITHUB_RUN_ATTEMPT', (_name, rawAttempt) => {
    expect(() =>
      runVitestBlobCandidateNamesCli([], {
        GITHUB_RUN_ATTEMPT: rawAttempt,
        VITEST_REPORT_EXPECTATIONS: '{}',
      }),
    ).toThrowError(/GITHUB_RUN_ATTEMPT must be a positive integer/)
  })
})

describe('vitest-blob-candidate-names.mts process contract', () => {
  it('exits 0 and prints one candidate name per line', () => {
    const result = runCli({
      PATH: process.env.PATH,
      GITHUB_RUN_ATTEMPT: '1',
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
      GITHUB_RUN_ATTEMPT: '1',
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
    expect(result.stderr).toContain('GITHUB_RUN_ATTEMPT is required')
  })
})
