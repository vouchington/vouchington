import { describe, expect, it } from 'vitest'
import {
  createCopyrightPartitionRetirementRecorder,
  createPartitionRetirementFailureFixture,
} from '@voucha/test-helpers/partition-retirement-failure'
import { write } from '../setup.mts'
import { COPYRIGHT_HISTORY_PARTITION_TABLES } from '../config-driven/utils/partition-config.mts'
import type { QueryExecutor } from '../types.mts'
import {
  cleanupPartitions,
  createMonthlyPartitions,
  listMonthlyDropCandidatePage,
  listMonthlyDropCandidates,
  retireMonthlyPartitionCandidate,
} from './monthly-partitions.mts'

const now = new Date('2026-10-23T00:00:00.000Z')

describe('createMonthlyPartitions', () => {
  it('creates the configured monthly partitions without dropping the RSS default child', async () => {
    const statements: string[] = []
    const writer = recordStatements(statements)

    await createMonthlyPartitions(writer)

    expect(statements.some(statement => statement.includes('CREATE'))).toBe(true)
    expect(
      statements.some(statement =>
        statement.includes('DROP TABLE IF EXISTS rss_feed_crawls__default'),
      ),
    ).toBe(false)
  })
})

describe('monthly partition retirement', () => {
  it('reads one catalog page at a time using its durable keyset position', async () => {
    const first = await listMonthlyDropCandidatePage(write, 1)
    expect(first.candidates).toHaveLength(1)
    expect(first.hasMore).toBe(true)
    expect(first.nextCursor).toBeDefined()
    const second = await listMonthlyDropCandidatePage(write, 1, first.nextCursor)
    expect(second.candidates).toHaveLength(1)
    expect(second.candidates[0]?.partition).not.toBe(first.candidates[0]?.partition)
  })

  it('discovers managed children in dependency order from the live catalog', async () => {
    const candidates = await listMonthlyDropCandidates(write)
    const chunkIndices = candidates.flatMap((candidate, index) =>
      candidate.table === 'crawl_chunks' ? [index] : [],
    )
    const crawlIndices = candidates.flatMap((candidate, index) =>
      candidate.table === 'crawls' ? [index] : [],
    )

    expect(chunkIndices.length).toBeGreaterThan(0)
    expect(crawlIndices.length).toBeGreaterThan(0)
    expect(chunkIndices.at(-1)!).toBeLessThan(crawlIndices[0]!)
    expect(candidates.every(candidate => candidate.upperBound instanceof Date)).toBe(true)
  })

  it('refuses all managed children without detaching them when the window has not elapsed', async () => {
    const outcomes = await cleanupPartitions(new Date('1900-01-01T00:00:00.000Z'))

    expect(outcomes.outcomes.length).toBeGreaterThan(0)
    expect(outcomes.outcomes.every(outcome => outcome.outcome === 'refused')).toBe(true)
    expect(outcomes.outcomes.every(outcome => outcome.reason === 'inside-retention')).toBe(true)
  })

  it('discovers bootstrapped copyright monthly children and preserves all ten inside six years', async () => {
    const tables = COPYRIGHT_HISTORY_PARTITION_TABLES.map(config => config.table)
    const candidates = await listMonthlyDropCandidates(write)
    const copyright = candidates.filter(candidate => tables.includes(candidate.table))
    expect(new Set(copyright.map(candidate => candidate.table))).toEqual(new Set(tables))
    expect(copyright.every(candidate => candidate.upperBound instanceof Date)).toBe(true)

    const outcomes = await cleanupPartitions(new Date('1900-01-01T00:00:00.000Z'))
    const copyrightOutcomes = outcomes.filter(outcome => tables.includes(outcome.table))
    expect(copyrightOutcomes).toHaveLength(copyright.length)
    expect(copyrightOutcomes.every(outcome => outcome.reason === 'inside-retention')).toBe(true)
  })

  it('routes all ten copyright children through guarded cleanup only at 72 calendar months', async () => {
    const tables = COPYRIGHT_HISTORY_PARTITION_TABLES.map(config => config.table)
    const before = createCopyrightPartitionRetirementRecorder(tables)
    const refusals = await cleanupPartitions(
      new Date('2026-02-28T23:59:59.999Z'),
      before.query,
      before.begin,
    )
    expect(refusals).toHaveLength(tables.length)
    expect(refusals.every(outcome => outcome.reason === 'inside-retention')).toBe(true)
    expect(
      before.statements.some(statement => statement.includes('retireMonthlyPartition:drop')),
    ).toBe(false)

    const boundary = createCopyrightPartitionRetirementRecorder(tables)
    const routed = await cleanupPartitions(
      new Date('2026-03-01T00:00:00.000Z'),
      boundary.query,
      boundary.begin,
    )
    expect(routed).toHaveLength(tables.length)
    expect(routed.every(outcome => outcome.outcome === 'dropped')).toBe(true)
    const holdLocks = boundary.statements.flatMap((statement, index) =>
      statement.includes('cleanupPartitions:lockHolds') ? [index] : [],
    )
    const holdChecks = boundary.statements.flatMap((statement, index) =>
      statement.includes('getPartitionDropRefusal:copyrightLegalHold') ? [index] : [],
    )
    const partyLocks = boundary.statements.flatMap((statement, index) =>
      statement.includes('cleanupPartitions:lockCopyrightParties') ? [index] : [],
    )
    const parentLocks = boundary.statements.flatMap((statement, index) =>
      statement.includes('cleanupPartitions:lockParent') ? [index] : [],
    )
    expect(partyLocks).toHaveLength(tables.length)
    expect(partyLocks.every((index, position) => index < parentLocks[position]!)).toBe(true)
    expect(holdLocks).toHaveLength(tables.length)
    expect(holdChecks).toHaveLength(tables.length)
    expect(holdLocks.every((index, position) => index < holdChecks[position]!)).toBe(true)
    expect(
      boundary.statements.filter(statement => statement.includes('retireMonthlyPartition:detach')),
    ).toHaveLength(tables.length)
    expect(
      boundary.statements.filter(statement => statement.includes('retireMonthlyPartition:drop')),
    ).toHaveLength(tables.length)
  })

  it('refuses retirement and rolls back owned writes when acquiring its lock fails', async () => {
    const partition = 'rss_feed_crawls__p_1800_01'
    const fixture = await createPartitionRetirementFailureFixture()

    await expect(
      retireMonthlyPartitionCandidate(
        {
          table: 'rss_feed_crawls',
          partition,
          upperBound: new Date('1800-02-01T00:00:00.000Z'),
        },
        now,
        fixture.begin,
      ),
    ).resolves.toEqual({
      table: 'rss_feed_crawls',
      partition,
      outcome: 'refused',
      reason: 'retirement-error',
    })
    expect(fixture.statements).toEqual([
      '/* cleanupPartitions:lockParent */ LOCK TABLE rss_feed_crawls IN ACCESS EXCLUSIVE MODE',
    ])
    await expect(fixture.readMarkdown()).resolves.toBe(fixture.originalMarkdown)
  })
})

function recordStatements(statements: string[]): QueryExecutor {
  return async input => {
    statements.push(typeof input === 'string' ? input : input.text)
    return { rows: [], rowCount: 0, command: 'CREATE', oid: 0, fields: [] }
  }
}
