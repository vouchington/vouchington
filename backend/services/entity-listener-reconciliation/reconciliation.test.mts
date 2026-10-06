import { describe, expect, it } from 'vitest'
import { acquireTestPostgresAdvisoryLock } from '@voucha/test-helpers/postgres-advisory-lock'
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
  type EntityReconciliationCandidate,
  type EntityReconciliationWindow,
} from './reconciliation.mts'

/** Resume bounded runs so concurrent fixtures cannot hide this test's rows behind the run cap. */
async function* streamCompleteWindow(window: EntityReconciliationWindow) {
  let after: EntityReconciliationCandidate | undefined
  let hasMore = true
  const onComplete = (result: { hasMore: boolean }) => {
    hasMore = result.hasMore
  }
  while (hasMore) {
    hasMore = false
    for await (const batch of streamEntityReconciliationCandidateBatches(window, {
      after,
      onComplete,
    })) {
      after = batch.at(-1)
      yield batch
    }
  }
}

describe('entity-listener reconciliation', () => {
  it('resumes from the durable checkpoint with overlap and replica-lag margin', async () => {
    const lock = await acquireTestPostgresAdvisoryLock({
      namespace: 2_135_043,
      key: 1,
      timeout: '20s',
    })
    try {
      const now = new Date()
      const existing = await getEntityReconciliationWindow(3600, now)
      const completedThrough = new Date(existing.start.getTime() + 300_000 + 86_400_000)
      await advanceEntityReconciliationCheckpoint(completedThrough)
      const window = await getEntityReconciliationWindow(3600, now)
      expect(window.end).toEqual(new Date(now.getTime() - 60_000))
      expect(window.start.getTime()).toBe(completedThrough.getTime() - 300_000)
    } finally {
      await lock.release()
    }
  })

  it('streams active current-state entities in bounded batches', async () => {
    const referrer = await createTestUser()
    const user = await createTestUser()
    await setUserReferrerId(user.id, referrer.id)
    const now = new Date()
    const batches = streamCompleteWindow({
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
    const batches = streamCompleteWindow({
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
    const batches = streamCompleteWindow({
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
