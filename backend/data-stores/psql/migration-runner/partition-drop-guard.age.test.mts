import { describe, expect, it } from 'vitest'
import { getPartitionDropAgeRefusal } from './partition-drop-guard.mts'

describe('partition drop guard monthly retention', () => {
  it('retains each complete decision-history month for at least 72 months', () => {
    const policy = { minimumRetentionDays: null, minimumRetentionMonths: 72 }
    const reference = new Date('2026-10-28T00:00:00.000Z')
    expect(
      getPartitionDropAgeRefusal(
        {
          table: 'post_clearance_changes',
          partition: 'post_clearance_changes__p_2020_09',
          upperBound: new Date('2020-10-01T00:00:00.000Z'),
        },
        policy,
        reference,
      ),
    ).toBeNull()
    expect(
      getPartitionDropAgeRefusal(
        {
          table: 'post_clearance_changes',
          partition: 'post_clearance_changes__p_2020_10',
          upperBound: new Date('2020-11-01T00:00:00.000Z'),
        },
        policy,
        reference,
      ),
    ).toBe('inside-retention')
  })

  it('retires topic revision children only after twelve complete calendar months', () => {
    const policy = { minimumRetentionDays: null, minimumRetentionMonths: 12 }
    const referenceDate = new Date('2026-10-28T23:59:59.000Z')
    const previous = {
      table: 'topic_revisions',
      partition: 'topic_revisions__p_2025_09',
      upperBound: new Date('2025-10-01T00:00:00.000Z'),
    }
    const current = {
      ...previous,
      partition: 'topic_revisions__p_2025_10',
      upperBound: new Date('2025-11-01T00:00:00.000Z'),
    }
    expect(getPartitionDropAgeRefusal(previous, policy, referenceDate)).toBeNull()
    expect(getPartitionDropAgeRefusal(current, policy, referenceDate)).toBe('inside-retention')
    expect(
      getPartitionDropAgeRefusal(
        previous,
        { minimumRetentionDays: null, minimumRetentionMonths: Number.MAX_SAFE_INTEGER },
        referenceDate,
      ),
    ).toBe('no-declared-retention')
  })
})
