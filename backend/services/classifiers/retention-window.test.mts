import { describe, expect, it } from 'vitest'
import { getMinUuidv7ForDate } from '@modules/utils/ids'
import {
  assertClassifierBatchWithinRetention,
  assertClassifierWindowWithinRetention,
  classifierRetentionCutoff,
  isClassifierBatchWithinRetention,
} from './retention-window.mts'

describe('classifier retention boundary', () => {
  it('rejects batches and reports before the cutoff while accepting its exact lower bound', () => {
    const now = new Date('2026-10-23T12:00:00.000Z')
    const cutoff = classifierRetentionCutoff(now)
    const before = new Date(cutoff.getTime() - 1)

    expect(() => assertClassifierBatchWithinRetention(getMinUuidv7ForDate(before), now)).toThrow(
      RangeError,
    )
    expect(() => assertClassifierWindowWithinRetention(before, now)).toThrow(RangeError)
    expect(() =>
      assertClassifierBatchWithinRetention(getMinUuidv7ForDate(cutoff), now),
    ).not.toThrow()
    expect(() =>
      assertClassifierBatchWithinRetention(getMinUuidv7ForDate(cutoff).toUpperCase(), now),
    ).not.toThrow()
    expect(() => assertClassifierWindowWithinRetention(cutoff, now)).not.toThrow()
    expect(isClassifierBatchWithinRetention(getMinUuidv7ForDate(before), now)).toBe(false)
    expect(isClassifierBatchWithinRetention(getMinUuidv7ForDate(cutoff), now)).toBe(true)
  })
})
