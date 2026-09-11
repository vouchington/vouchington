import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestModerationReport, insertTestPost } from '@voucha/test-helpers'
import { getLatestJudgementsForEntitiesBatch, insertReportJudgement } from '../judgements.mts'

describe('moderation-reports/judgements batch', () => {
  it('returns latest judgements for mixed post and comment batches sharing post_id', async () => {
    const author = await createTestUser()
    const reporter = await createTestUser()
    const rootPostId = await insertTestPost({
      createdById: author.id,
      slug: `judgement-batch-root-${randomUUID().slice(0, 8)}`,
      title: `Judgement Batch Root ${randomUUID().slice(0, 8)}`,
      markdown: 'root body',
    })
    const commentId = await insertTestPost({
      createdById: author.id,
      slug: `judgement-batch-comment-${randomUUID().slice(0, 8)}`,
      title: '',
      markdown: 'comment body',
      postType: 'comment',
      rootId: rootPostId,
      parentId: rootPostId,
    })
    const postReportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: rootPostId,
      reason: 'spam',
    })
    const commentReporter = await createTestUser()
    const commentReportId = await insertTestModerationReport({
      reporterUserId: commentReporter.id,
      entityType: 'comment',
      entityId: commentId,
      reason: 'harassment',
    })
    const postJudgement = await insertReportJudgement({
      entityType: 'post',
      entityId: rootPostId,
      triggeringReportId: postReportId,
      rerunById: null,
      recommendedAction: 'no_action',
      publicResponse: 'Post ok.',
      internalResponse: 'Post ok.',
      model: 'gpt-5.4-nano',
    })
    const commentJudgement = await insertReportJudgement({
      entityType: 'comment',
      entityId: commentId,
      triggeringReportId: commentReportId,
      rerunById: null,
      recommendedAction: 'warn',
      publicResponse: 'Comment warned.',
      internalResponse: 'Comment warned.',
      model: 'gpt-5.4-nano',
    })

    const result = await getLatestJudgementsForEntitiesBatch([
      { entityType: 'post', entityId: rootPostId },
      { entityType: 'comment', entityId: commentId },
    ])

    expect(result.get(`post:${rootPostId}`)?.id).toBe(postJudgement.id)
    expect(result.get(`comment:${commentId}`)?.id).toBe(commentJudgement.id)
  })
})
