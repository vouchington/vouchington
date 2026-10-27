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
})
