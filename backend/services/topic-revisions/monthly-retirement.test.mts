import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestTopic } from '@voucha/test-helpers'
import {
  cleanupPartitions,
  createMonthlyPartitions,
  listMonthlyDropCandidates,
  retireMonthlyPartitionCandidate,
} from '@data-stores/psql/migration-runner/monthly-partitions'
import { getTopicRevisionsForTest } from '@voucha/test-helpers/entities/topic-revisions'
import {
  createTestTopicRevisionRetirementChild,
  withTestRawTopicRevisionWriter,
  withTestTopicRevisionWriter,
  readTestTopicRevisionChild,
  readTestTopicMarkdown,
  seedTestHistoricalTopicRevision,
} from '@voucha/test-helpers/partition-monthly-topic-revisions'
import { createTopicRevision, getLatestTopicContentUpdate } from './index.mts'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'

describe('monthly topic revisions', () => {
  it('refuses retirement before taking the history lock while a topic writer is active', async () => {
    const admin = await createTestUser({ administrator: true })
    const suffix = crypto.randomUUID()
    const topicId = await insertTestTopic({
      name: `Active topic writer ${suffix}`,
      slug: `active-topic-writer-${suffix}`,
      createdById: admin.id,
    })
    await withTestTopicRevisionWriter(topicId, admin.id, async () => {
      const captureOffset = sentryCaptureExceptionMock.mock.calls.length
      const outcome = await retireMonthlyPartitionCandidate(
        {
          table: 'topic_revisions',
          partition: 'topic_revisions__p_1999_12',
          upperBound: new Date('2000-01-01T00:00:00.000Z'),
        },
        new Date('2013-01-15T00:00:00.000Z'),
      )
      expect(outcome).toMatchObject({ outcome: 'refused', reason: 'retirement-error' })
      expect(
        sentryCaptureExceptionMock.mock.calls.slice(captureOffset).some(([reported]) => {
          const error = reported as Error & { cause?: { code?: string } }
          return error.cause?.code === '55P03'
        }),
      ).toBe(true)
    })
    expect(await getLatestTopicContentUpdate(topicId)).toMatchObject({
      updated_by: { id: admin.id },
    })
  })

  it('refuses retirement without waiting on a raw writer holding the history parent', async () => {
    const admin = await createTestUser({ administrator: true })
    const suffix = crypto.randomUUID()
    const topicId = await insertTestTopic({
      name: `Raw topic history writer ${suffix}`,
      slug: `raw-topic-history-writer-${suffix}`,
      createdById: admin.id,
    })
    const revisionId = await withTestRawTopicRevisionWriter(topicId, admin.id, async () => {
      const captureOffset = sentryCaptureExceptionMock.mock.calls.length
      const outcome = await retireMonthlyPartitionCandidate(
        {
          table: 'topic_revisions',
          partition: 'topic_revisions__p_1999_12',
          upperBound: new Date('2000-01-01T00:00:00.000Z'),
        },
        new Date('2013-01-15T00:00:00.000Z'),
      )
      expect(outcome).toMatchObject({ outcome: 'refused', reason: 'retirement-error' })
      expect(
        sentryCaptureExceptionMock.mock.calls.slice(captureOffset).some(([reported]) => {
          const error = reported as Error & { cause?: { code?: string } }
          return error.cause?.code === '55P03'
        }),
      ).toBe(true)
    })
    expect(await readTestTopicRevisionChild(revisionId)).toMatch(/^topic_revisions__p_/)
  })

  it('routes a new revision to a bootstrap monthly child and permits later partition creation', async () => {
    const admin = await createTestUser({ administrator: true })
    const suffix = crypto.randomUUID()
    const topicId = await insertTestTopic({
      name: `Topic revision monthly ${suffix}`,
      slug: `topic-revision-monthly-${suffix}`,
      createdById: admin.id,
    })
    const revision = await createTopicRevision(
      topicId,
      'update',
      { markdown: { before: '', after: 'Current content' } },
      admin.id,
    )
    expect(await readTestTopicRevisionChild(revision.id)).toBe(
      `topic_revisions__p_${revision.created_at.getUTCFullYear()}_${String(
        revision.created_at.getUTCMonth() + 1,
      ).padStart(2, '0')}`,
    )
    expect(
      (await listMonthlyDropCandidates()).filter(candidate => candidate.table === 'topic_revisions')
        .length,
    ).toBeGreaterThanOrEqual(4)
    await expect(createMonthlyPartitions()).resolves.toBeUndefined()
  })

  it('drops an eligible whole child including the latest revision while topic attribution survives', async () => {
    const admin = await createTestUser({ administrator: true })
    const suffix = crypto.randomUUID()
    const topicId = await insertTestTopic({
      name: `Retired topic revision ${suffix}`,
      slug: `retired-topic-revision-${suffix}`,
      createdById: admin.id,
    })
    const fixture = await createTestTopicRevisionRetirementChild()
    try {
      await seedTestHistoricalTopicRevision(topicId, admin.id)
      expect(await getTopicRevisionsForTest(topicId)).toHaveLength(1)
      const candidates = await listMonthlyDropCandidates()
      expect(candidates.some(candidate => candidate.partition === fixture.partition)).toBe(true)

      const result = await cleanupPartitions(new Date('2013-01-15T00:00:00.000Z'), { limit: 50 })
      expect(result.outcomes).toContainEqual({
        table: 'topic_revisions',
        partition: fixture.partition,
        outcome: 'dropped',
      })
      expect(await getTopicRevisionsForTest(topicId)).toHaveLength(0)
      expect(await readTestTopicMarkdown(topicId)).toBe('Historical content')
      expect(await getLatestTopicContentUpdate(topicId)).toMatchObject({
        updated_by: { id: admin.id },
        updated_at: new Date('1999-12-15T00:00:00.000Z'),
      })
    } finally {
      await fixture.cleanup()
    }
  })
})
