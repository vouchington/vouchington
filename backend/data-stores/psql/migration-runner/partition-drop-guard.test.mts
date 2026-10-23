import { describe, expect, it } from 'vitest'
import type { QueryExecutor } from '../types.mts'
import { getPartitionDropRefusal, getPartitionDropStatusRefusals } from './partition-drop-guard.mts'
import {
  guardAndRetireMonthlyPartition,
  retirePartitionsSequentially,
} from './monthly-partitions.mts'

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
    const transaction = (async (statement: string) => {
      statements.push(statement)
      return {
        rows:
          statement.includes('getPartitionDropRefusal:inFlight') && inFlight ? [{ found: 1 }] : [],
      }
    }) as unknown as QueryExecutor
    const oldCandidate = {
      table: 'rss_feed_crawls',
      partition: 'rss_feed_crawls__p_2025_01',
      upperBound: new Date('2025-02-01'),
    }
    const policy = { minimumRetentionDays: 30, inFlightPredicates: ['id IS NOT NULL'] }
    await expect(
      guardAndRetireMonthlyPartition(transaction, oldCandidate, policy, now),
    ).resolves.toBe('in-flight')
    expect(statements.map(statement => statement.match(/\/\* ([^*]+) \*\//)?.[1])).toEqual([
      'cleanupPartitions:lockParent',
      'cleanupPartitions:lockCandidate',
      'getPartitionDropRefusal:inFlight',
    ])
    statements.length = 0
    inFlight = false
    await expect(
      guardAndRetireMonthlyPartition(transaction, oldCandidate, policy, now),
    ).resolves.toBeNull()
    expect(statements.map(statement => statement.match(/\/\* ([^*]+) \*\//)?.[1])).toEqual([
      'cleanupPartitions:lockParent',
      'cleanupPartitions:lockCandidate',
      'getPartitionDropRefusal:inFlight',
      'retireMonthlyPartition:detach',
      'retireMonthlyPartition:drop',
    ])
  })

  it('finishes one partition transaction before starting the next', async () => {
    const firstStarted = Promise.withResolvers<void>()
    const finishFirst = Promise.withResolvers<void>()
    const started: string[] = []
    const second = { ...candidate, partition: 'crawls__p_2026_02' }
    const running = retirePartitionsSequentially([candidate, second], async partition => {
      started.push(partition.partition)
      if (partition.partition === candidate.partition) {
        firstStarted.resolve()
        await finishFirst.promise
      }
      return { table: partition.table, partition: partition.partition, outcome: 'refused' }
    })
    try {
      await firstStarted.promise
      expect(started).toEqual([candidate.partition])
    } finally {
      finishFirst.resolve()
    }
    await expect(running).resolves.toHaveLength(2)
    expect(started).toEqual([candidate.partition, second.partition])
  })
})
