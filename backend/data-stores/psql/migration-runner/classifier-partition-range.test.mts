import { describe, expect, it } from 'vitest'
import {
  classifierRangeFromChild,
  matchesClassifierPartitionBound,
  parseClassifierPartitionRange,
} from './classifier-partition-range.mts'

describe('classifier partition range input', () => {
  it('maps aligned UTC dates to ordered UUIDv7 boundaries', () => {
    const range = parseClassifierPartitionRange({
      fromDate: '2020-02-01',
      toDate: '2020-03-01',
      maxDefaultRows: 20,
    })
    expect(range.fromId.localeCompare(range.toId)).toBeLessThan(0)
    expect(range.nameSuffix).toBe('r_20200201_20200301')
    expect(range.maxDefaultRows).toBe(20)
  })

  it.each([
    [{ fromDate: '2020-02-30', toDate: '2020-03-01' }, 'Invalid UTC calendar date'],
    [{ fromDate: '2020-03-01', toDate: '2020-02-01' }, 'must have a later end'],
    [{ fromDate: '2020-02-01', toDate: '2020-02-01' }, 'must have a later end'],
    [
      { fromDate: '2020-02-01', toDate: '2020-03-01', maxDefaultRows: 5_001 },
      'row budget is outside',
    ],
  ] as const)('rejects invalid dates or row budgets: %j', (input, message) => {
    expect(() => parseClassifierPartitionRange(input)).toThrow(message)
  })

  it('accepts only a matching operator-owned catalog bound', () => {
    const range = parseClassifierPartitionRange({ fromDate: '2020-02-01', toDate: '2020-02-02' })
    const bound = `FOR VALUES FROM ('${range.fromId}'::uuid) TO ('${range.toId}'::uuid)`
    expect(matchesClassifierPartitionBound(bound, range.fromId, range.toId)).toBe(true)
    expect(
      classifierRangeFromChild(
        'topic_classifier_results',
        'topic_classifier_results__r_20200201_20200202',
        bound,
      ),
    ).toMatchObject({ fromId: range.fromId, toId: range.toId })
    expect(matchesClassifierPartitionBound(`${bound} OR TRUE`, range.fromId, range.toId)).toBe(
      false,
    )
    expect(
      classifierRangeFromChild(
        'topic_classifier_results',
        'topic_classifier_results__default',
        bound,
      ),
    ).toBeNull()
  })
})
