import { describe, expect, it } from 'vitest'
import { listTestMonthlyDropCandidates } from '@voucha/test-helpers/monthly-partition-candidates'
import { write } from '../setup.mts'
import type { QueryExecutor } from '../types.mts'
import {
  getMonthlyPartitionUpperBound,
  getPartitionDropAgeRefusal,
  getPartitionDropRefusal,
  getPartitionDropStatusRefusals,
} from './partition-drop-guard.mts'
import { guardAndRetireMonthlyPartition } from './guard-and-retire-monthly-partition.mts'

const now = new Date('2026-10-23T00:00:00.000Z')
const candidate = {
  table: 'crawls',
  partition: 'crawls__p_2026_01',
  upperBound: new Date('2026-02-01T00:00:00.000Z'),
}

function queryWithResults(results: Record<string, boolean>): QueryExecutor {
  return (async (statement: string) => {
    const match = /getPartitionDropRefusal:(\w+)/.exec(statement)
    return { rows: match && results[match[1]!] ? [{ '?column?': 1 }] : [] }
  }) as unknown as QueryExecutor
}

describe('partition drop guard', () => {
  it('derives an upper bound only for the requested monthly parent', () => {
    expect(getMonthlyPartitionUpperBound('crawls', 'crawls__p_2026_01')).toEqual(
      new Date('2026-02-01T00:00:00.000Z'),
    )
    expect(getMonthlyPartitionUpperBound('rss_feed_crawls', 'crawls__p_2026_01')).toBeNull()
  })

  it('rejects an invalid status probe limit', async () => {
    await expect(getPartitionDropStatusRefusals(write, [], {}, now, 0)).rejects.toThrow(
      'maxProbes must be a positive safe integer',
    )
  })

  it('reports age refusal or an eligible child without probes when policy has no row checks', async () => {
    const statuses = await getPartitionDropStatusRefusals(
      write,
      [
        {
          ...candidate,
          partition: 'crawls__p_2026_10',
          upperBound: new Date('2026-11-01T00:00:00.000Z'),
        },
        { ...candidate, partition: 'crawls__p_2025_01', upperBound: new Date('2025-02-01') },
      ],
      { crawls: { minimumRetentionDays: 30 } },
      now,
      1,
    )

    expect(statuses.get('crawls__p_2026_10')).toBe('inside-retention')
    expect(statuses.get('crawls__p_2025_01')).toBeNull()
  })

  it('agrees between the live batch preview and direct legal-hold recheck', async () => {
    const monthly = (await listTestMonthlyDropCandidates(write)).find(
      entry => entry.table === 'rss_feed_crawls',
    )
    expect(monthly).toBeDefined()
    const policy = { minimumRetentionDays: 0, legalHoldAccountColumn: 'id' }
    const referenceDate = new Date('2100-01-01T00:00:00.000Z')

    const status = await getPartitionDropStatusRefusals(
      write,
      [monthly!],
      { rss_feed_crawls: policy },
      referenceDate,
      1,
    )
    const direct = await getPartitionDropRefusal(write, monthly!, policy, referenceDate)
    expect(status.get(monthly!.partition)).toBe(direct)
  })

  it('refuses a missing minimum or a partition without an upper bound', async () => {
    const query = queryWithResults({})
    await expect(getPartitionDropRefusal(query, candidate, undefined, now)).resolves.toBe(
      'no-declared-retention',
    )
    await expect(
      getPartitionDropRefusal(
        query,
        { ...candidate, upperBound: null },
        { minimumRetentionDays: 30 },
        now,
      ),
    ).resolves.toBe('no-declared-retention')
  })

  it('allows the exact retention boundary and refuses one millisecond newer', async () => {
    const query = queryWithResults({})
    const boundary = new Date(now.getTime() - 30 * 86_400_000)
    const policy = { minimumRetentionDays: 30 }
    await expect(
      getPartitionDropRefusal(query, { ...candidate, upperBound: boundary }, policy, now),
    ).resolves.toBeNull()
    await expect(
      getPartitionDropRefusal(
        query,
        { ...candidate, upperBound: new Date(boundary.getTime() + 1) },
        policy,
        now,
      ),
    ).resolves.toBe('inside-retention')
  })

  it('keeps every month until its exclusive upper bound has aged 72 calendar months', () => {
    const policy = { minimumRetentionDays: 2192, minimumRetentionMonths: 72 }
    const february = { ...candidate, upperBound: new Date('2020-03-01T00:00:00.000Z') }
    expect(getPartitionDropAgeRefusal(february, policy, new Date('2026-02-28T23:59:59.999Z'))).toBe(
      'inside-retention',
    )
    expect(
      getPartitionDropAgeRefusal(february, policy, new Date('2026-03-01T00:00:00.000Z')),
    ).toBeNull()
    const december = { ...candidate, upperBound: new Date('2020-01-01T00:00:00.000Z') }
    expect(getPartitionDropAgeRefusal(december, policy, new Date('2025-12-31T23:59:59.999Z'))).toBe(
      'inside-retention',
    )
    expect(
      getPartitionDropAgeRefusal(december, policy, new Date('2026-01-01T00:00:00.000Z')),
    ).toBeNull()
  })

  it('refuses a held account and unfinished work before detach', async () => {
    const oldCandidate = { ...candidate, upperBound: new Date('2025-01-01T00:00:00.000Z') }
    const policy = {
      minimumRetentionDays: 30,
      legalHoldAccountColumn: 'account_user_id',
      inFlightPredicates: ['completed_at IS NULL'],
    }
    await expect(
      getPartitionDropRefusal(queryWithResults({ legalHold: true }), oldCandidate, policy, now),
    ).resolves.toBe('legal-hold')
    await expect(
      getPartitionDropRefusal(queryWithResults({ inFlight: true }), oldCandidate, policy, now),
    ).resolves.toBe('in-flight')
    await expect(
      getPartitionDropRefusal(queryWithResults({}), oldCandidate, policy, now),
    ).resolves.toBeNull()
  })

  it('refuses a raw evidence child until its bounded fold has removed every row', async () => {
    const oldCandidate = {
      table: 'ai_usage_records',
      partition: 'ai_usage_records__p_2025_01',
      upperBound: new Date('2025-02-01T00:00:00.000Z'),
    }
    const policy = { minimumRetentionDays: 180, mustBeEmpty: true }
    await expect(
      getPartitionDropRefusal(queryWithResults({ nonempty: true }), oldCandidate, policy, now),
    ).resolves.toBe('in-flight')
    await expect(
      getPartitionDropRefusal(queryWithResults({}), oldCandidate, policy, now),
    ).resolves.toBeNull()
  })

  it('checks eligible partition statuses in one query with index-stopping probes', async () => {
    const statements: string[] = []
    const query = (async (statement: string) => {
      statements.push(statement)
      return {
        rows: [
          { partition_name: 'crawls__p_2025_01', reason: 'in-flight' },
          ...(statement.includes("'crawls__p_2025_02'::text")
            ? [{ partition_name: 'crawls__p_2025_02', reason: null }]
            : []),
        ],
      }
    }) as unknown as QueryExecutor
    const statuses = await getPartitionDropStatusRefusals(
      query,
      [
        { ...candidate, partition: 'crawls__p_2025_01', upperBound: new Date('2025-02-01') },
        { ...candidate, partition: 'crawls__p_2025_02', upperBound: new Date('2025-03-01') },
      ],
      { crawls: { minimumRetentionDays: 30, inFlightPredicates: ['completed_at IS NULL'] } },
      now,
      2,
    )
    expect(statements).toHaveLength(1)
    expect(statements[0]).toContain('LIMIT 1')
    expect(statuses.get('crawls__p_2025_01')).toBe('in-flight')
    expect(statuses.get('crawls__p_2025_02')).toBeNull()
    const capped = await getPartitionDropStatusRefusals(
      query,
      [
        { ...candidate, partition: 'crawls__p_2025_01', upperBound: new Date('2025-02-01') },
        { ...candidate, partition: 'crawls__p_2025_02', upperBound: new Date('2025-03-01') },
      ],
      { crawls: { minimumRetentionDays: 30, inFlightPredicates: ['completed_at IS NULL'] } },
      now,
      1,
    )
    expect(capped.get('crawls__p_2025_02')).toBe('check-pending')
  })

  it('locks and checks the child on one transaction before detach', async () => {
    const statements: string[] = []
    let inFlight = true
    let legalHold = false
    const transaction = (async (statement: string) => {
      statements.push(statement)
      return {
        rows:
          (statement.includes('getPartitionDropRefusal:inFlight') && inFlight) ||
          (statement.includes('getPartitionDropRefusal:legalHold') && legalHold)
            ? [{ found: 1 }]
            : [],
      }
    }) as unknown as QueryExecutor
    const oldCandidate = {
      table: 'rss_feed_crawls',
      partition: 'rss_feed_crawls__p_2025_01',
      upperBound: new Date('2025-02-01'),
    }
    const policy = { minimumRetentionDays: 30, inFlightPredicates: ['id IS NOT NULL'] }
    await expect(
      guardAndRetireMonthlyPartition(transaction, oldCandidate, policy, now, 500),
    ).resolves.toBe('in-flight')
    expect(statements.map(statement => statement.match(/\/\* ([^*]+) \*\//)?.[1])).toEqual([
      'cleanupPartitions:lockParent',
      'cleanupPartitions:lockCandidate',
      'getPartitionDropRefusal:inFlight',
    ])
    expect(statements[0]).toContain('IN ACCESS EXCLUSIVE MODE')
    statements.length = 0
    await expect(
      guardAndRetireMonthlyPartition(
        transaction,
        oldCandidate,
        { ...policy, legalHoldAccountColumn: 'id' },
        new Date('1900-01-01T00:00:00.000Z'),
        500,
      ),
    ).resolves.toBe('inside-retention')
    expect(statements).toEqual([
      '/* cleanupPartitions:lockParent */ LOCK TABLE rss_feed_crawls IN ACCESS EXCLUSIVE MODE',
      '/* cleanupPartitions:lockCandidate */ LOCK TABLE rss_feed_crawls__p_2025_01 IN ACCESS EXCLUSIVE MODE',
      '/* cleanupPartitions:lockHolds */ LOCK TABLE user_legal_preservation_holds IN SHARE MODE',
    ])
    statements.length = 0
    legalHold = true
    await expect(
      guardAndRetireMonthlyPartition(
        transaction,
        oldCandidate,
        { ...policy, legalHoldAccountColumn: 'id' },
        now,
        500,
      ),
    ).resolves.toBe('legal-hold')
    expect(statements.map(statement => statement.match(/\/\* ([^*]+) \*\//)?.[1])).toEqual([
      'cleanupPartitions:lockParent',
      'cleanupPartitions:lockCandidate',
      'cleanupPartitions:lockHolds',
      'getPartitionDropRefusal:legalHold',
    ])
    statements.length = 0
    legalHold = false
    inFlight = false
    await expect(
      guardAndRetireMonthlyPartition(transaction, oldCandidate, policy, now, 500),
    ).resolves.toBeNull()
    expect(statements.map(statement => statement.match(/\/\* ([^*]+) \*\//)?.[1])).toEqual([
      'cleanupPartitions:lockParent',
      'cleanupPartitions:lockCandidate',
      'getPartitionDropRefusal:inFlight',
      'retireMonthlyPartition:detach',
      'retireMonthlyPartition:drop',
    ])
  })
})
