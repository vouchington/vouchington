import { describe, expect, it } from 'vitest'
import { createPartitionRetirementFailureFixture } from '@voucha/test-helpers/partition-retirement-failure'
import { sentryCaptureExceptionMock } from '../../../test-helpers/vitest.setup.sentry-mock.mts'
import { write } from '../setup.mts'
import type { QueryExecutor } from '../types.mts'
import { listMonthlyDropCandidates } from './monthly-partition-candidates.mts'
import {
  cleanupPartitions,
  createMonthlyPartitions,
  retireMonthlyPartitionCandidate,
  retirePartitionsSequentially,
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

const sweepCandidate = {
  table: 'crawls',
  partition: 'crawls__p_2026_01',
  upperBound: new Date('2026-02-01T00:00:00.000Z'),
}

describe('monthly partition retirement', () => {
  it('finishes one partition transaction before starting the next', async () => {
    const firstStarted = Promise.withResolvers<void>()
    const finishFirst = Promise.withResolvers<void>()
    const started: string[] = []
    const second = { ...sweepCandidate, partition: 'crawls__p_2026_02' }
    const running = retirePartitionsSequentially([sweepCandidate, second], async partition => {
      started.push(partition.partition)
      if (partition.partition === sweepCandidate.partition) {
        firstStarted.resolve()
        await finishFirst.promise
      }
      return { table: partition.table, partition: partition.partition, outcome: 'refused' }
    })
    try {
      await firstStarted.promise
      expect(started).toEqual([sweepCandidate.partition])
    } finally {
      finishFirst.resolve()
    }
    await expect(running).resolves.toHaveLength(2)
    expect(started).toEqual([sweepCandidate.partition, second.partition])
  })

  it('reads one catalog page at a time using its durable keyset position', async () => {
    const first = await listMonthlyDropCandidates(write, 1)
    expect(first.candidates).toHaveLength(1)
    expect(first.hasMore).toBe(true)
    expect(first.nextCursor).toBeDefined()
    const second = await listMonthlyDropCandidates(write, 1, first.nextCursor)
    expect(second.candidates).toHaveLength(1)
    expect(second.candidates[0]?.partition).not.toBe(first.candidates[0]?.partition)
  })

  it('discovers managed children in dependency order from the live catalog', async () => {
    const { candidates } = await listMonthlyDropCandidates(write)
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
    const page = await cleanupPartitions(new Date('1900-01-01T00:00:00.000Z'), {
      feedbackBatchSize: 500,
    })

    expect(page.outcomes.length).toBeGreaterThan(0)
    expect(page.outcomes.every(outcome => outcome.outcome === 'refused')).toBe(true)
    expect(page.outcomes.every(outcome => outcome.reason === 'inside-retention')).toBe(true)
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
        500,
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
  it('treats a NOWAIT lock conflict as a normal refusal without reporting it', async () => {
    const partition = 'topic_revisions__p_1999_12'
    const fixture = await createPartitionRetirementFailureFixture({
      lockStatementPrefix: '/* cleanupPartitions:lockReference */',
      failure: Object.assign(new Error('lock unavailable'), { code: '55P03' }),
    })
    const captureOffset = sentryCaptureExceptionMock.mock.calls.length

    await expect(
      retireMonthlyPartitionCandidate(
        {
          table: 'topic_revisions',
          partition,
          upperBound: new Date('2000-01-01T00:00:00.000Z'),
        },
        new Date('2013-01-15T00:00:00.000Z'),
        500,
        fixture.begin,
      ),
    ).resolves.toEqual({
      table: 'topic_revisions',
      partition,
      outcome: 'refused',
      reason: 'lock-contention',
    })
    expect(fixture.statements).toEqual([
      '/* cleanupPartitions:lockReference */ LOCK TABLE topics, users IN ACCESS EXCLUSIVE MODE NOWAIT',
    ])
    expect(sentryCaptureExceptionMock.mock.calls).toHaveLength(captureOffset)
    await expect(fixture.readMarkdown()).resolves.toBe(fixture.originalMarkdown)
  })
})

function recordStatements(statements: string[]): QueryExecutor {
  return async input => {
    statements.push(typeof input === 'string' ? input : input.text)
    return { rows: [], rowCount: 0, command: 'CREATE', oid: 0, fields: [] }
  }
}
