import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  assertNoScenarioFailures,
  continueAfterFailure,
  getScenarioFailures,
  resetScenarioFailures,
} from './scenario-failures.mts'

describe('continueAfterFailure', () => {
  afterEach(() => {
    resetScenarioFailures()
    vi.restoreAllMocks()
  })

  it('runs every scenario and reports each failure in one error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const ran: string[] = []

    await continueAfterFailure('first', async () => {
      ran.push('first')
      throw new Error('first broke')
    })
    await continueAfterFailure('second', async () => {
      ran.push('second')
    })
    await continueAfterFailure('third', async () => {
      ran.push('third')
      throw new Error('third broke')
    })

    expect(ran).toEqual(['first', 'second', 'third'])
    expect(getScenarioFailures().map(failure => failure.scenario)).toEqual(['first', 'third'])
    expect(() => assertNoScenarioFailures()).toThrow(
      '2 EXPLAIN scenario failure(s) [first, third] and 0 run check failure(s)',
    )
  })

  it('reports run check errors with no scenario failure', () => {
    expect(() => assertNoScenarioFailures([new Error('manifest mismatch')])).toThrow(
      '0 EXPLAIN scenario failure(s) [] and 1 run check failure(s)',
    )
  })

  it('passes when nothing failed', async () => {
    await continueAfterFailure('only', async () => {})

    expect(() => assertNoScenarioFailures()).not.toThrow()
  })
})
