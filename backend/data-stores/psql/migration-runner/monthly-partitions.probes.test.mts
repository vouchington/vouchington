import { describe, expect, it } from 'vitest'
import { createPartitionFeedbackRetirementFixture } from '@voucha/test-helpers/partition-feedback-retirement'
import type { QueryExecutor } from '../types.mts'
import { clearBoundedFeedbackReferences } from './feedback-reference-retirement.mts'
import {
  retireMonthlyDropCandidates,
  retireMonthlyPartitionCandidate,
} from './monthly-partitions.mts'

const now = new Date('2026-10-23T00:00:00.000Z')

function recordStatements(statements: string[]): QueryExecutor {
  return async input => {
    statements.push(typeof input === 'string' ? input : input.text)
    return { rows: [], rowCount: 0, command: 'CREATE', oid: 0, fields: [] }
  }
}

describe('post clearance feedback retirement', () => {
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
})
