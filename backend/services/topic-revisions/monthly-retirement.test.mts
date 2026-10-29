import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestTopic } from '@voucha/test-helpers'
import { listMonthlyDropCandidates } from '@data-stores/psql/migration-runner/monthly-partition-candidates'
import { readTestTopicRevisionChild } from '@voucha/test-helpers/entities/topic-revisions'
import { createTopicRevision } from './index.mts'

describe('monthly topic revisions', () => {
  it('routes a new revision to a bootstrap monthly child', async () => {
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
      (await listMonthlyDropCandidates()).candidates.filter(
        candidate => candidate.table === 'topic_revisions',
      ).length,
    ).toBeGreaterThanOrEqual(4)
  })
})
