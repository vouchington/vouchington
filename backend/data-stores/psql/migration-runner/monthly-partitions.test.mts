import { describe, expect, it } from 'vitest'
import { write } from '../setup.mts'
import type { QueryExecutor } from '../types.mts'
import {
  cleanupPartitions,
  createMonthlyPartitions,
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

    expect(outcomes.length).toBeGreaterThan(0)
    expect(outcomes.every(outcome => outcome.outcome === 'refused')).toBe(true)
    expect(outcomes.every(outcome => outcome.reason === 'inside-retention')).toBe(true)
  })

  it('refuses a child removed after discovery when its lock can no longer be acquired', async () => {
    const partition = 'rss_feed_crawls__p_1800_01'
    const discovered = await listMonthlyDropCandidates(write)
    expect(discovered.some(candidate => candidate.partition === partition)).toBe(false)

    await expect(
      retireMonthlyPartitionCandidate(
        {
          table: 'rss_feed_crawls',
          partition,
          upperBound: new Date('1800-02-01T00:00:00.000Z'),
        },
        now,
      ),
    ).resolves.toEqual({
      table: 'rss_feed_crawls',
      partition,
      outcome: 'refused',
      reason: 'retirement-error',
    })
  })
})

function recordStatements(statements: string[]): QueryExecutor {
  return async input => {
    statements.push(typeof input === 'string' ? input : input.text)
    return { rows: [], rowCount: 0, command: 'CREATE', oid: 0, fields: [] }
  }
}
