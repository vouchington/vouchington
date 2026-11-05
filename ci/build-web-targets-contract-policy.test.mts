import { describe, expect, it } from 'vitest'

import {
  boundedSeconds,
  buildWebTargetsContractViolations,
  expectedMinutes,
  restoreSeconds,
  runnerParityViolations,
  timeoutViolations,
  type Deadlines,
} from './build-web-targets-contract-policy.mts'

const deadlines: Deadlines = { restore: 120, verify: 30, build: 300, killGrace: 13 }
const action = `runs:
  using: composite
  steps:
    - uses: actions/cache/restore@sha
      env:
        SEGMENT_DOWNLOAD_TIMEOUT_MINS: '1'
    - run: python3 "run-bounded.py" 30 node ci/web-build-cache-manifest.mts verify
    - run: python3 "run-bounded.py" 300 node ci/setup-web-integration.mts
`
const producer = `jobs:
  static-web:
    runs-on: ubuntu-24.04-arm
    steps:
      - uses: ./.github/actions/build-web-targets
        timeout-minutes: 9
        with:
          shared-build-cache-mode: producer
`
const consumer = `jobs:
  test:
    runs-on: ubuntu-24.04-arm
    steps:
      - uses: ./.github/actions/build-web-targets
        timeout-minutes: 9
        with:
          shared-build-cache-mode: consumer
`
const sources = new Map([
  ['.github/actions/build-web-targets/action.yml', action],
  ['.github/workflows/checks-static.yml', producer],
  ['.github/workflows/test.yml', consumer],
])

describe('build-web-targets contracts', () => {
  it('accepts matching producer and consumer workflows', () => {
    expect(buildWebTargetsContractViolations(sources)).toEqual([])
  })

  it('reports jobs that split the producer and a consumer across runner labels', () => {
    expect(
      runnerParityViolations([
        { job: 'a.yml#build', runsOn: 'label-one', mode: 'producer' },
        { job: 'b.yml#test', runsOn: 'label-two', mode: 'consumer' },
        { job: 'c.yml#test', runsOn: '${{ inputs.runner }}', mode: 'consumer' },
      ]),
    ).toEqual([
      'c.yml#test: runs-on must be one literal label, got "${{ inputs.runner }}"',
      'build-web-targets jobs span more than one runner label (label-one: a.yml#build; label-two: b.yml#test)',
    ])
  })

  it('rejects a mismatched runner in a finite workflow', () => {
    const broken = new Map(sources)
    broken.set('.github/workflows/test.yml', consumer.replace('ubuntu-24.04-arm', 'ubuntu-latest'))
    expect(buildWebTargetsContractViolations(broken)).toEqual([
      'build-web-targets jobs span more than one runner label (ubuntu-24.04-arm: checks-static.yml#static-web; ubuntu-latest: test.yml#test)',
    ])
  })

  it('counts pre-build and kill-grace time, not only the build deadline', () => {
    expect(expectedMinutes(deadlines)).toBe(9)
    expect(expectedMinutes({ ...deadlines, restore: 0, verify: 0, killGrace: 0 })).toBe(6)
    expect(expectedMinutes({ ...deadlines, verify: 45 })).toBe(10)
  })

  it('reports callers whose step ceiling is missing or does not match the deadlines', () => {
    const suffix = '(restore, verify, build and kill grace deadlines plus 60s)'
    expect(
      timeoutViolations(
        [
          { job: 'a.yml#build', timeoutMinutes: 9 },
          { job: 'b.yml#test', timeoutMinutes: 6 },
          { job: 'd.yml#test', timeoutMinutes: undefined },
        ],
        deadlines,
      ),
    ).toEqual([
      `b.yml#test: timeout-minutes is 6, expected 9 ${suffix}`,
      `d.yml#test: timeout-minutes is undefined, expected 9 ${suffix}`,
    ])
  })

  it('rejects a broken caller timeout through the whole policy', () => {
    const broken = new Map(sources)
    broken.set(
      '.github/workflows/test.yml',
      consumer.replace('timeout-minutes: 9', 'timeout-minutes: 6'),
    )
    expect(buildWebTargetsContractViolations(broken)).toEqual([
      'test.yml#test: timeout-minutes is 6, expected 9 (restore, verify, build and kill grace deadlines plus 60s)',
    ])
  })

  it('rejects a composite that leaves a step unbounded', () => {
    expect(() =>
      boundedSeconds('node ci/setup-web-integration.mts', 'node ci/setup-web-integration\\.mts'),
    ).toThrow('under run-bounded.py')
    expect(() => restoreSeconds('uses: actions/cache/restore')).toThrow('bound its cache restore')
  })
})
