import { describe, expect, it } from 'vitest'

import { assessSourceRunState, type ExpectedSourceRun } from './source-run-assessment.mts'
import { SOURCE_RUN_STATE_FIXTURES } from './source-run-state-fixtures.mts'

const expected: ExpectedSourceRun = {
  conclusion: 'failure',
  repository: 'jonathanong/filaments',
  runAttempt: 1,
  runId: 30_503_060_858,
}

const RUN_STARTED_AT = '2026-08-01T00:00:00.000Z'
const RUN_STARTED_AT_MS = Date.parse(RUN_STARTED_AT)
const NOW = RUN_STARTED_AT_MS + 60_000

const currentRun = {
  conclusion: 'failure',
  id: 30_503_060_858,
  repository: { full_name: 'jonathanong/filaments' },
  run_attempt: 1,
  run_started_at: RUN_STARTED_AT,
  status: 'completed',
}

describe('assessSourceRunState', () => {
  it.each(SOURCE_RUN_STATE_FIXTURES.map(fixture => [fixture.name, fixture] as const))(
    'assesses %s',
    (_name, { response, expected: fixtureExpected, now, result }) => {
      expect(assessSourceRunState(response, fixtureExpected, now)).toEqual(result)
    },
  )

  it.each([
    ['queued later attempt', { ...currentRun, run_attempt: 2, status: 'queued', conclusion: null }],
    [
      'in-progress later attempt',
      { ...currentRun, run_attempt: 2, status: 'in_progress', conclusion: null },
    ],
    ['successful later attempt', { ...currentRun, run_attempt: 2, conclusion: 'success' }],
    ['failed later attempt', { ...currentRun, run_attempt: 2 }],
    [
      'same attempt no longer completed',
      { ...currentRun, status: 'in_progress', conclusion: null },
    ],
    ['changed conclusion', { ...currentRun, conclusion: 'cancelled' }],
  ])('rejects a %s', async (_caseName, response) => {
    expect(assessSourceRunState(response, expected, NOW).current).toBe(false)
  })

  it.each([
    null,
    {},
    { ...currentRun, id: '30503060858' },
    { ...currentRun, id: -1 },
    { ...currentRun, run_attempt: '1' },
    { ...currentRun, run_attempt: 0 },
    { ...currentRun, repository: {} },
    { ...currentRun, repository: { full_name: '' } },
    { ...currentRun, run_started_at: undefined },
    { ...currentRun, run_started_at: 'not-a-date' },
  ])('fails closed for malformed API response %#', response => {
    expect(assessSourceRunState(response, expected, NOW)).toEqual({
      current: false,
      reason: 'malformed-response',
    })
  })

  it.each([
    { ...expected, repository: '' },
    { ...expected, runAttempt: 0 },
    { ...expected, runId: Number.NaN },
    { ...expected, conclusion: 'success' },
  ])('fails closed for invalid expected source state %#', invalidExpected => {
    expect(assessSourceRunState(currentRun, invalidExpected, NOW)).toEqual({
      current: false,
      reason: 'invalid-input',
    })
  })

  it('suppresses the exact regression that opened #9124/#9112', () => {
    // Source run 30766703240 (Main CI backend, attempt 4 last started 2026-08-02) was still being
    // replayed by the now-deleted usage-limit-retry.yml poller more than 48h later; the
    // id/attempt/conclusion guard alone let it through as "current" every time.
    const regressionRun = {
      conclusion: 'failure',
      id: 30_766_703_240,
      repository: { full_name: 'jonathanong/filaments' },
      run_attempt: 4,
      run_started_at: '2026-08-02T00:00:00.000Z',
      status: 'completed',
    }
    const regressionExpected: ExpectedSourceRun = {
      conclusion: 'failure',
      repository: 'jonathanong/filaments',
      runAttempt: 4,
      runId: 30_766_703_240,
    }
    const rerunFourDaysLater = Date.parse('2026-08-06T00:00:00.000Z')

    expect(assessSourceRunState(regressionRun, regressionExpected, rerunFourDaysLater)).toEqual({
      current: false,
      reason: 'stale-source-run',
    })
  })
})
