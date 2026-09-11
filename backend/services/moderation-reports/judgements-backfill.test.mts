import { describe, it, expect } from 'vitest'
import {
  createTestUser,
  insertTestPost,
  insertTestModerationReport,
  insertTestReportJudgement,
} from '@voucha/test-helpers'
import crypto from 'node:crypto'
import {
  type MissingJudgementEntity,
  streamEntitiesMissingJudgementBatches,
} from './judgements-backfill.mts'

async function collectAll(
  gen: AsyncGenerator<MissingJudgementEntity[], void, unknown>,
): Promise<MissingJudgementEntity[]> {
  const results: MissingJudgementEntity[] = []
  for await (const batch of gen) {
    results.push(...batch)
  }
  return results
}

describe('streamEntitiesMissingJudgementBatches', () => {
  it('includes a post entity with a report and no judgement', async () => {
    const author = await createTestUser()
    const reporter = await createTestUser()
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `backfill-missing-post-${crypto.randomUUID().slice(0, 8)}`,
      title: `Backfill Post ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'body',
    })
    await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
    })

    const results = await collectAll(streamEntitiesMissingJudgementBatches())
    const found = results.find(r => r.entityId === postId)
    expect(found).toBeDefined()
    expect(found!.entityType).toBe('post')
    expect(found!.triggeringReportId).toEqual(expect.any(String))
  })

  it('excludes a post entity that already has a judgement', async () => {
    const author = await createTestUser()
    const reporter = await createTestUser()
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `backfill-judged-post-${crypto.randomUUID().slice(0, 8)}`,
      title: `Backfill Judged Post ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'body',
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
    })
    await insertTestReportJudgement({
      entityType: 'post',
      entityId: postId,
      triggeringReportId: reportId,
    })

    const results = await collectAll(streamEntitiesMissingJudgementBatches())
    const found = results.find(r => r.entityId === postId)
    expect(found).toBeUndefined()
  })

  it('returns entity_type comment for posts with post_type=comment', async () => {
    const author = await createTestUser()
    const reporter = await createTestUser()
    const rootPostId = await insertTestPost({
      createdById: author.id,
      slug: `backfill-root-${crypto.randomUUID().slice(0, 8)}`,
      title: `Backfill Root ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'root body',
    })
    const commentId = await insertTestPost({
      createdById: author.id,
      slug: `backfill-comment-${crypto.randomUUID().slice(0, 8)}`,
      title: `Backfill Comment ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'comment body',
      postType: 'comment',
      rootId: rootPostId,
      parentId: rootPostId,
    })
    await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'comment',
      entityId: commentId,
    })

    const results = await collectAll(streamEntitiesMissingJudgementBatches())
    const found = results.find(r => r.entityId === commentId)
    expect(found).toBeDefined()
    expect(found!.entityType).toBe('comment')
  })

  it('returns the most recent report as triggeringReportId', async () => {
    const author = await createTestUser()
    const reporter1 = await createTestUser()
    const reporter2 = await createTestUser()
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `backfill-trigger-${crypto.randomUUID().slice(0, 8)}`,
      title: `Backfill Trigger Post ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'body',
    })
    // Insert two reports sequentially; the second is inserted later and thus newer
    await insertTestModerationReport({
      reporterUserId: reporter1.id,
      entityType: 'post',
      entityId: postId,
    })
    const latestReportId = await insertTestModerationReport({
      reporterUserId: reporter2.id,
      entityType: 'post',
      entityId: postId,
    })

    const results = await collectAll(streamEntitiesMissingJudgementBatches())
    const found = results.find(r => r.entityId === postId)
    expect(found).toBeDefined()
    expect(found!.triggeringReportId).toBe(latestReportId)
  })

  it('includes a user entity with a report and no judgement', async () => {
    const targetUser = await createTestUser()
    const reporter = await createTestUser()
    await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'user',
      entityId: targetUser.id,
    })

    const results = await collectAll(streamEntitiesMissingJudgementBatches())
    const found = results.find(r => r.entityId === targetUser.id && r.entityType === 'user')
    expect(found).toBeDefined()
  })
})
