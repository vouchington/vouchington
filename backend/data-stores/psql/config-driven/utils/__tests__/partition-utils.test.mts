import { describe, expect, it } from 'vitest'
import {
  generateMonthlyPartitions,
  getUtcDayUuidv7Bounds,
  isMonthlyPartitionExpired,
  parseMonthlyPartitionName,
  timestampToUuidv7LowerBound,
} from '../partition-utils.mts'

describe('timestampToUuidv7LowerBound', () => {
  it.each([1.5, Number.NaN])('rejects non-integral timestamp %s', timestamp => {
    expect(() => timestampToUuidv7LowerBound(timestamp)).toThrow('Timestamp must be a safe integer')
  })
})

describe('getUtcDayUuidv7Bounds', () => {
  it('returns UUIDv7 lower bounds for the UTC day range', () => {
    expect(getUtcDayUuidv7Bounds('2026-03-04')).toEqual({
      startBound: '019cb624-f000-7000-8000-000000000000',
      endBound: '019cbb4b-4c00-7000-8000-000000000000',
    })
  })
})

describe('generateMonthlyPartitions', () => {
  it('creates explicit past/current/future partitions without a default partition', () => {
    const sql = generateMonthlyPartitions({
      baseDate: new Date('2026-03-15T00:00:00.000Z'),
      tables: [
        {
          table: 'conversation_message_agentic_runs',
          pastMonths: 1,
          futureMonths: 1,
        },
      ],
    })

    expect(sql).toContain('conversation_message_agentic_runs__p_2026_02')
    expect(sql).toContain('conversation_message_agentic_runs__p_2026_03')
    expect(sql).toContain('conversation_message_agentic_runs__p_2026_04')
    expect(sql).not.toContain('__p_default')
  })
})

describe('parseMonthlyPartitionName', () => {
  it('parses managed monthly partition names', () => {
    expect(parseMonthlyPartitionName('conversation_message_agentic_runs__p_2026_03')).toEqual({
      table: 'conversation_message_agentic_runs',
      year: 2026,
      month: 3,
    })
  })

  it('returns null for non-monthly partition names', () => {
    expect(parseMonthlyPartitionName('conversation_message_agentic_runs__p_default')).toBeNull()
  })
})

describe('isMonthlyPartitionExpired', () => {
  it('treats a partition as expired once its upper bound is older than the cutoff', () => {
    expect(
      isMonthlyPartitionExpired({ year: 2026, month: 1 }, new Date('2026-02-15T00:00:00.000Z')),
    ).toBe(true)

    expect(
      isMonthlyPartitionExpired({ year: 2026, month: 2 }, new Date('2026-02-15T00:00:00.000Z')),
    ).toBe(false)
  })
})
