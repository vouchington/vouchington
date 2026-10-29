import { describe, expect, it } from 'vitest'
import { createPartitionFeedbackRetirementFixture } from '@voucha/test-helpers/partition-feedback-retirement'
import { createPartitionRetirementFailureFixture } from '@voucha/test-helpers/partition-retirement-failure'
import { sentryCaptureExceptionMock } from '../../../test-helpers/vitest.setup.sentry-mock.mts'
import { write } from '../setup.mts'
import type { QueryExecutor } from '../types.mts'
import { clearBoundedFeedbackReferences } from './feedback-reference-retirement.mts'
import { listMonthlyDropCandidates } from './monthly-partition-candidates.mts'
import {
  cleanupPartitions,
  createMonthlyPartitions,
  retireMonthlyPartitionCandidate,
  retireMonthlyDropCandidates,
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

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid feedback batch size %s before SQL',
    async batchSize => {
      const statements: string[] = []
      await expect(
        clearBoundedFeedbackReferences(
          recordStatements(statements),
          {
            table: 'post_clearance_changes',
            partition: 'post_clearance_changes__p_2099_01',
            upperBound: new Date('2099-02-01T00:00:00.000Z'),
          },
          batchSize,
        ),
      ).rejects.toThrow(RangeError)
      expect(statements).toEqual([])
    },
  )

  it('uses the caller bounded page size for feedback unlinking', async () => {
    const statements: { sql: string; params: unknown[] | undefined }[] = []
    const query = (async (sql: string, params?: unknown[]) => {
      statements.push({ sql, params })
      return { rows: [], rowCount: 0 }
    }) as unknown as QueryExecutor
    const candidate = {
      table: 'post_clearance_changes',
      partition: 'post_clearance_changes__p_2020_01',
      upperBound: new Date('2020-02-01T00:00:00.000Z'),
    }
    expect(await clearBoundedFeedbackReferences(query, candidate, 7)).toBe(false)
    expect(statements[0]?.sql).toContain('LIMIT $3')
    expect(statements[0]?.params?.[2]).toBe(7)
    expect(statements[1]?.sql).toContain('LIMIT 1')
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

  it('processes at most one eligible clearance partition per run', async () => {
    const attempted: string[] = []
    const candidates = [
      {
        table: 'post_clearance_changes',
        partition: 'post_clearance_changes__p_2020_01',
        upperBound: new Date('2020-02-01T00:00:00.000Z'),
      },
      {
        table: 'post_clearance_changes',
        partition: 'post_clearance_changes__p_2020_02',
        upperBound: new Date('2020-03-01T00:00:00.000Z'),
      },
      {
        table: 'community_post_review_changes',
        partition: 'community_post_review_changes__p_2020_01',
        upperBound: new Date('2020-02-01T00:00:00.000Z'),
      },
    ]
    const outcomes = await retireMonthlyDropCandidates(candidates, now, 500, async candidate => {
      attempted.push(candidate.partition)
      return { table: candidate.table, partition: candidate.partition, outcome: 'dropped' }
    })
    expect(attempted).toEqual([candidates[0]!.partition, candidates[2]!.partition])
    expect(outcomes[1]).toMatchObject({
      outcome: 'refused',
      reason: 'feedback-references-pending',
    })
  })

  it('moves past a held oldest month and spends one feedback page on the next eligible month', async () => {
    const months = [1, 2, 3].map(month => ({
      table: 'post_clearance_changes',
      partition: `post_clearance_changes__p_2020_0${month}`,
      upperBound: new Date(Date.UTC(2020, month, 1)),
    }))
    const attempted: string[] = []
    const feedbackStatements: string[] = []
    const query = (async (statement: string) => {
      feedbackStatements.push(statement)
      return { rows: [], rowCount: 0 }
    }) as unknown as QueryExecutor
    const outcomes = await retireMonthlyDropCandidates(months, now, 7, async candidate => {
      attempted.push(candidate.partition)
      if (candidate.partition === months[0]!.partition)
        return { ...candidate, outcome: 'refused', reason: 'legal-hold' }
      await clearBoundedFeedbackReferences(query, candidate, 7)
      return { ...candidate, outcome: 'dropped' }
    })

    expect(attempted).toEqual([months[0]!.partition, months[1]!.partition])
    expect(outcomes.map(outcome => [outcome.outcome, outcome.reason])).toEqual([
      ['refused', 'legal-hold'],
      ['dropped', undefined],
      ['refused', 'feedback-references-pending'],
    ])
    expect(
      feedbackStatements.filter(statement =>
        statement.includes('cleanupPartitions:clearFeedbackReferences'),
      ),
    ).toHaveLength(1)
  })

  it('does not attempt another feedback page after an uncertain retirement error', async () => {
    const candidates = [1, 2].map(month => ({
      table: 'post_clearance_changes',
      partition: `post_clearance_changes__p_2020_0${month}`,
      upperBound: new Date(Date.UTC(2020, month, 1)),
    }))
    const attempted: string[] = []
    const outcomes = await retireMonthlyDropCandidates(candidates, now, 7, async candidate => {
      attempted.push(candidate.partition)
      return { ...candidate, outcome: 'refused', reason: 'retirement-error' }
    })

    expect(attempted).toEqual([candidates[0]!.partition])
    expect(outcomes[1]).toMatchObject({ reason: 'feedback-references-pending' })
  })

  it('commits one feedback page and leaves a pending partition attached', async () => {
    const fixture = await createPartitionFeedbackRetirementFixture(false)
    try {
      const candidate = {
        table: 'post_clearance_changes',
        partition: 'post_clearance_changes__p_2099_01',
        upperBound: new Date('2099-02-01T00:00:00.000Z'),
      }
      expect(await fixture.readMarkdown()).toBe(fixture.originalMarkdown)
      await expect(
        retireMonthlyPartitionCandidate(
          candidate,
          new Date('2200-01-01T00:00:00.000Z'),
          1,
          fixture.begin,
        ),
      ).resolves.toMatchObject({ outcome: 'refused', reason: 'feedback-references-pending' })
      expect(await fixture.readMarkdown()).toBe(fixture.marker)
      expect(
        fixture.statements.filter(statement => statement.includes('clearFeedbackReferences')),
      ).toHaveLength(1)
      expect(
        fixture.statements.some(statement => statement.includes('remainingFeedbackReferences')),
      ).toBe(true)
      expect(
        fixture.statements.every(statement => !/\b(?:DETACH|DROP TABLE)\b/u.test(statement)),
      ).toBe(true)
    } finally {
      await fixture.cleanup()
    }
  })

  it('refuses a legal hold before touching feedback references', async () => {
    const fixture = await createPartitionFeedbackRetirementFixture(true)
    try {
      await expect(
        retireMonthlyPartitionCandidate(
          {
            table: 'post_clearance_changes',
            partition: 'post_clearance_changes__p_2099_01',
            upperBound: new Date('2099-02-01T00:00:00.000Z'),
          },
          new Date('2200-01-01T00:00:00.000Z'),
          1,
          fixture.begin,
        ),
      ).resolves.toMatchObject({ outcome: 'refused', reason: 'legal-hold' })
      expect(await fixture.readMarkdown()).toBe(fixture.originalMarkdown)
      expect(
        fixture.statements.some(statement => statement.includes('clearFeedbackReferences')),
      ).toBe(false)
      expect(
        fixture.statements.every(statement => !/\b(?:DETACH|DROP TABLE)\b/u.test(statement)),
      ).toBe(true)
    } finally {
      await fixture.cleanup()
    }
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
