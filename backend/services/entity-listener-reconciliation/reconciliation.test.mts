import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestPost,
  createTestUser,
  deleteTestPost,
  setUserReferrerId,
} from '@voucha/test-helpers'
import { createPostRevision } from '@services/post-revisions'
import {
  advanceEntityReconciliationCheckpoint,
  getEntityReconciliationWindow,
  streamEntityReconciliationCandidateBatches,
} from './reconciliation.mts'

describe('entity-listener reconciliation', () => {
  it('resumes from the durable checkpoint with overlap and replica-lag margin', async () => {
    const now = new Date()
    const completedThrough = new Date(now.getTime() - 120_000)
    const checkpointName = `entity-listeners-test-${randomUUID()}`
    await advanceEntityReconciliationCheckpoint(completedThrough, checkpointName)
    const window = await getEntityReconciliationWindow(3600, now, checkpointName)
    expect(window.end).toEqual(new Date(now.getTime() - 60_000))
    expect(window.start.getTime()).toBe(completedThrough.getTime() - 300_000)
  })

  it('streams active current-state entities in bounded batches', async () => {
    const referrer = await createTestUser()
    const user = await createTestUser()
    await setUserReferrerId(user.id, referrer.id)
    const now = new Date()
    const batches = streamEntityReconciliationCandidateBatches({
      start: new Date(now.getTime() - 60_000),
      end: new Date(now.getTime() + 60_000),
    })
    let found = false
    for await (const batch of batches) {
      expect(batch.length).toBeLessThanOrEqual(500)
      found ||= batch.some(
        candidate => candidate.entityId === user.id && candidate.referrerId === referrer.id,
      )
    }
    expect(found).toBe(true)
  })

  it('streams soft-deleted posts through the deletion reconciliation path', async () => {
    const post = await createTestPost()
    await createPostRevision(
      post.id,
      'delete',
      { deleted_at: { before: null, after: 'now' } },
      null,
    )
    await deleteTestPost(post.id)
    const now = new Date()
    const batches = streamEntityReconciliationCandidateBatches({
      start: new Date(now.getTime() - 60_000),
      end: new Date(now.getTime() + 60_000),
    })
    let found = false
    for await (const batch of batches) {
      found ||= batch.some(
        candidate => candidate.entityId === post.id && candidate.entityType === 'post_deleted',
      )
    }
    expect(found).toBe(true)
  })

  it('derives replay semantics from append-only post revisions', async () => {
    const post = await createTestPost()
    const revision = await createPostRevision(
      post.id,
      'update',
      {
        markdown: { before: 'old', after: 'new' },
        structured_data: { before: { topic_ids: ['topic-1'] }, after: { topic_ids: [] } },
        review_topic_ratings: { before: ['topic-2'], after: [] },
      },
      null,
    )
    const now = new Date()
    const batches = streamEntityReconciliationCandidateBatches({
      start: new Date(now.getTime() - 60_000),
      end: new Date(now.getTime() + 60_000),
    })
    let candidate
    for await (const batch of batches) {
      candidate = batch.find(item => item.changeId === revision.id)
      if (candidate) break
    }
    expect(candidate).toMatchObject({
      entityType: 'post_updated',
      entityId: post.id,
      changeId: revision.id,
      contentChanged: true,
    })
  })
})
