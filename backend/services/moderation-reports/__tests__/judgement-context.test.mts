import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestModerationReport, insertTestPost } from '@voucha/test-helpers'
import {
  getReportJudgementContextForEntity,
  getReportJudgementContextsForEntitiesBatch,
} from '../judgement-context.mts'

describe('moderation-reports/judgement-context', () => {
  it('captures report count, reason severity, and note context', async () => {
    const author = await createTestUser()
    const reporter = await createTestUser()
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `judgement-context-${randomUUID().slice(0, 8)}`,
      title: `Judgement Context ${randomUUID().slice(0, 8)}`,
      markdown: 'body',
    })
    await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
      reason: 'spam',
      note: 'first',
    })

    const first = await getReportJudgementContextForEntity('post', postId)
    const otherReporter = await createTestUser()
    await insertTestModerationReport({
      reporterUserId: otherReporter.id,
      entityType: 'post',
      entityId: postId,
      reason: 'illegal_content',
      note: 'second',
    })

    const second = await getReportJudgementContextForEntity('post', postId)
    expect(second.reportCount).toBe(2)
    expect(second.maxReasonRank).toBeGreaterThan(first.maxReasonRank)
    expect(second.contextHash).not.toBe(first.contextHash)
    expect(second.noteHash).not.toBe(first.noteHash)
  })

  it('returns report context for mixed post and comment batches sharing post_id', async () => {
    const author = await createTestUser()
    const postReporter = await createTestUser()
    const commentReporter = await createTestUser()
    const rootPostId = await insertTestPost({
      createdById: author.id,
      slug: `judgement-context-root-${randomUUID().slice(0, 8)}`,
      title: `Judgement Context Root ${randomUUID().slice(0, 8)}`,
      markdown: 'root body',
    })
    const commentId = await insertTestPost({
      createdById: author.id,
      slug: `judgement-context-comment-${randomUUID().slice(0, 8)}`,
      title: '',
      markdown: 'comment body',
      postType: 'comment',
      rootId: rootPostId,
      parentId: rootPostId,
    })
    await insertTestModerationReport({
      reporterUserId: postReporter.id,
      entityType: 'post',
      entityId: rootPostId,
      reason: 'spam',
      note: 'post report',
    })
    await insertTestModerationReport({
      reporterUserId: commentReporter.id,
      entityType: 'comment',
      entityId: commentId,
      reason: 'harassment',
      note: 'comment report',
    })

    const contexts = await getReportJudgementContextsForEntitiesBatch([
      { entityType: 'post', entityId: rootPostId },
      { entityType: 'comment', entityId: commentId },
    ])

    expect(contexts.get(`post:${rootPostId}`)?.reportCount).toBe(1)
    expect(contexts.get(`post:${rootPostId}`)?.maxReasonRank).toBe(2)
    expect(contexts.get(`comment:${commentId}`)?.reportCount).toBe(1)
    expect(contexts.get(`comment:${commentId}`)?.maxReasonRank).toBe(4)
  })

  it('returns every entity kind in one batch, with an empty context for an unreported entity', async () => {
    const author = await createTestUser()
    const reportedUser = await createTestUser()
    const reporter = await createTestUser()
    const reportedPostId = await insertTestPost({
      createdById: author.id,
      slug: `judgement-context-kinds-${randomUUID().slice(0, 8)}`,
      title: `Judgement Context Kinds ${randomUUID().slice(0, 8)}`,
      markdown: 'body',
    })
    const unreportedPostId = await insertTestPost({
      createdById: author.id,
      slug: `judgement-context-quiet-${randomUUID().slice(0, 8)}`,
      title: `Judgement Context Quiet ${randomUUID().slice(0, 8)}`,
      markdown: 'body',
    })
    await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: reportedPostId,
      reason: 'spam',
    })
    await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'user',
      entityId: reportedUser.id,
      reason: 'harassment',
    })

    const contexts = await getReportJudgementContextsForEntitiesBatch([
      { entityType: 'post', entityId: reportedPostId },
      { entityType: 'user', entityId: reportedUser.id },
      { entityType: 'post', entityId: unreportedPostId },
    ])

    expect(contexts.get(`post:${reportedPostId}`)?.reportCount).toBe(1)
    expect(contexts.get(`user:${reportedUser.id}`)?.reportCount).toBe(1)
    expect(contexts.get(`post:${unreportedPostId}`)).toMatchObject({
      reportCount: 0,
      maxReasonRank: 0,
    })
  })
})
