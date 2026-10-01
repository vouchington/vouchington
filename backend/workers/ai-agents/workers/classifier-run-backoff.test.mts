import { describe, expect, it } from 'vitest'
import { StructuredDecisionError } from '@modules/structured-decisions'
import {
  CLASSIFIER_RUN_ATTEMPTS,
  CLASSIFIER_RUN_BACKOFF,
  CLASSIFIER_RUN_RETRY_AFTER_CEILING_MS,
} from '@queues/ai-agents/config'
import { classifierRunBackoffMs } from './classifier-run-backoff.mts'

const MINUTE = 60_000
const noJitter = () => 0
const fullJitter = () => 1

function providerError(retryAfterMs?: number): StructuredDecisionError {
  return new StructuredDecisionError('provider-error', 'HTTP 503', 503, {
    failure: { retryClass: 'transient', ...(retryAfterMs === undefined ? {} : { retryAfterMs }) },
  })
}

describe('classifierRunBackoffMs', () => {
  it('doubles from the 30 second base for each retry', () => {
    const waits = Array.from({ length: CLASSIFIER_RUN_ATTEMPTS - 1 }, (_, index) =>
      classifierRunBackoffMs(index + 1, providerError(), noJitter),
    )
    expect(waits).toEqual([
      30_000,
      MINUTE,
      2 * MINUTE,
      4 * MINUTE,
      8 * MINUTE,
      16 * MINUTE,
      32 * MINUTE,
    ])
    expect(waits.reduce((sum, wait) => sum + wait, 0)).toBe(63.5 * MINUTE)
  })

  it('adds up to the jitter fraction on top, never below the exponential wait', () => {
    expect(classifierRunBackoffMs(1, providerError(), fullJitter)).toBe(
      30_000 * (1 + CLASSIFIER_RUN_BACKOFF.jitter),
    )
    expect(classifierRunBackoffMs(3, providerError(), () => 0.5)).toBe(
      120_000 * (1 + CLASSIFIER_RUN_BACKOFF.jitter / 2),
    )
  })

  it('honours a longer Retry-After and ignores a shorter one', () => {
    expect(classifierRunBackoffMs(1, providerError(5 * MINUTE), noJitter)).toBe(5 * MINUTE)
    expect(classifierRunBackoffMs(4, providerError(10_000), noJitter)).toBe(4 * MINUTE)
  })

  it('caps a Retry-After at the ceiling', () => {
    expect(classifierRunBackoffMs(1, providerError(6 * 60 * MINUTE), noJitter)).toBe(
      CLASSIFIER_RUN_RETRY_AFTER_CEILING_MS,
    )
  })

  it('waits the exponential delay for an error with no Retry-After or from elsewhere', () => {
    expect(classifierRunBackoffMs(2, new Error('worker unavailable'), noJitter)).toBe(MINUTE)
    expect(classifierRunBackoffMs(2, providerError(), noJitter)).toBe(MINUTE)
  })

  it('uses real randomness by default, within the jitter band', () => {
    const wait = classifierRunBackoffMs(1, providerError())
    expect(wait).toBeGreaterThanOrEqual(30_000)
    expect(wait).toBeLessThanOrEqual(30_000 * (1 + CLASSIFIER_RUN_BACKOFF.jitter))
  })
})
