import { randomUUID, randomInt } from 'node:crypto'
import { insertTestReconciliationRevisionClocks } from '@voucha/test-helpers/entities/reconciliation-revisions'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { entityReconciliationConfig } from './work-limits.mts'
import { describe, expect, it } from 'vitest'
import {
  createTestPost,
  createTestUser,
  createTestUserDirect,
  createTestUserWithAge,
  createTestUserWithId,
  deleteTestPost,
  setUserReferrerId,
} from '@voucha/test-helpers'
import { createPostRevision } from '@services/post-revisions'
import {
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
  it('uses a fixed lookback ending before the replica margin', () => {
    const now = new Date('2026-10-17T12:00:00Z')
    const window = getEntityReconciliationWindow(now)
    expect(window.end).toEqual(new Date(now.getTime() - 60000))
    expect(window.start).toEqual(new Date(now.getTime() - 60000 - 86400000))
  })

  it('scans only changes inside its configured lookback and recovers an expanded window', async () => {
    const now = new Date(Date.UTC(2200, 0, 1) + randomInt(0, 1000000000))
    const actor = await createTestUser()
    const post = await createTestPost()
    const older = await insertTestReconciliationRevisionClocks(
      post.id,
      actor.id,
      now.getTime() - 120000,
    )
    const recent = await insertTestReconciliationRevisionClocks(
      post.id,
      actor.id,
      now.getTime() - 30000,
    )
    const restore = overrideDynamicConfigFieldsForTest(entityReconciliationConfig, {
      lookback_seconds: 60,
      replica_margin_seconds: 1,
    })
    try {
      const included: string[] = []
      for await (const batch of streamCompleteWindow(getEntityReconciliationWindow(now))) {
        included.push(...batch.flatMap(row => (row.changeId ? [row.changeId] : [])))
      }
      expect(included).toEqual(expect.arrayContaining(recent.map(row => row.id)))
      expect(included).not.toEqual(expect.arrayContaining(older.map(row => row.id)))
      const restoreExpanded = overrideDynamicConfigFieldsForTest(entityReconciliationConfig, {
        lookback_seconds: 180,
      })
      try {
        const recovered: string[] = []
        for await (const batch of streamCompleteWindow(getEntityReconciliationWindow(now))) {
          recovered.push(...batch.flatMap(row => (row.changeId ? [row.changeId] : [])))
        }
        expect(recovered).toEqual(expect.arrayContaining([...older, ...recent].map(row => row.id)))
      } finally {
        restoreExpanded()
      }
    } finally {
      restore()
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

  it('marks only users created inside the window as needing creation recovery', async () => {
    const created = await createTestUserDirect()
    // Created ten minutes ago, then written to inside the window like a vote-weight recalculation.
    const updated = await createTestUserWithAge(600_000)
    await setUserReferrerId(updated.id, created.id)
    const now = new Date()
    const batches = streamCompleteWindow({
      start: new Date(now.getTime() - 60_000),
      end: new Date(now.getTime() + 60_000),
    })
    const flags = new Map<string, boolean | undefined>()
    for await (const batch of batches) {
      for (const candidate of batch) {
        if (candidate.entityType === 'user')
          flags.set(candidate.entityId, candidate.createdInWindow)
      }
    }
    expect(flags.get(created.id)).toBe(true)
    expect(flags.get(updated.id)).toBe(false)
  })

  it('never infers creation from an id that is not a UUIDv7', async () => {
    // A UUIDv4 whose leading bytes sort after every UUIDv7 window start, whatever the account's age.
    const legacyId = `ffffffff${randomUUID().slice(8)}`
    await createTestUserWithId(legacyId, `legacy-${legacyId.slice(-12)}`)
    const now = new Date()
    const batches = streamCompleteWindow({
      start: new Date(now.getTime() - 60_000),
      end: new Date(now.getTime() + 60_000),
    })
    let candidate: EntityReconciliationCandidate | undefined
    for await (const batch of batches) {
      candidate ??= batch.find(item => item.entityId === legacyId)
    }
    expect(candidate).toMatchObject({ entityType: 'user', createdInWindow: false })
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
