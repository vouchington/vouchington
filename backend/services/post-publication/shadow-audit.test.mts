import {
  beginTransaction,
  addTestPostDataPointTopic,
  deleteTestPostDataPointTopics,
  getTestPostPublicationDirtyWorkForScope,
  hardDeleteTestPost,
  hasTestPostPublicationProjectionReceipt,
  insertTestTopic,
  updateTestPostSlug,
} from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import {
  createTestShadowAuditFixtures,
  insertAuditPost,
  withTestShadowAuditCheckpoint,
} from '@voucha/test-helpers/post-publication-shadow-audit-fixtures'
import { reconcileTestPublicationThroughPostSweep } from '@voucha/test-helpers/post-publication-fixtures'
import {
  acknowledgePostPublicationProjectionReceipts,
  acknowledgePostPublicationDirtyWork,
  claimPostPublicationDirtyWork,
  deleteOrphanPostPublicationProjectionReceipts,
  recordPostPublicationChange,
} from './index.mts'
import { runPostPublicationShadowAudit } from './shadow-audit.mts'

describe('post publication shadow audit', () => {
  it('repairs a receipt left behind by a hard-deleted post', async () => {
    const { user, suffix, ids } = await createTestShadowAuditFixtures()
    const oldSlug = `shadow-orphan-${suffix}`
    const postId = await insertAuditPost(
      user.id,
      ids.postId,
      oldSlug,
      `Shadow orphan ${suffix}`,
      'Receipt fixture for a missed hard deletion.',
    )
    await using query = await beginTransaction()
    const work = await recordPostPublicationChange(query, {
      scope: { type: 'post', postId },
      reason: 'post_created',
    })
    await query.commit()
    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected orphan-receipt initial lease')
    const initial = await reconcileTestPublicationThroughPostSweep(claimed, undefined, postId)
    expect(initial.posts.map(post => post.id)).toContain(postId)
    await acknowledgePostPublicationProjectionReceipts(claimed, initial.posts)
    await acknowledgePostPublicationDirtyWork({
      id: claimed.id,
      generation: claimed.generation,
      leaseToken: claimed.lease_token,
    })
    await expect(hasTestPostPublicationProjectionReceipt(postId)).resolves.toBe(true)
    await hardDeleteTestPost(postId)

    await expect(
      runPostPublicationShadowAudit({ dryRun: true, limit: 1, postIdentityIds: [ids.postId] }),
    ).resolves.toMatchObject({
      scannedByScope: { post: 1, author: 0, community: 0, rssFeed: 0 },
      discrepanciesByScope: { post: 1, author: 0, community: 0, rssFeed: 0 },
      checkpoint: postId,
    })

    await runPostPublicationShadowAudit({
      dryRun: false,
      limit: 1,
      postIdentityIds: [ids.postId],
    })
    const repairWork = await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: postId })
    if (!repairWork) throw new Error('Expected orphan-receipt repair work')
    const repairClaim = await claimPostPublicationDirtyWork(repairWork, 60)
    if (!repairClaim) throw new Error('Expected orphan-receipt repair lease')
    const { final: repaired } = await reconcileTestPublicationThroughPostSweep(
      repairClaim,
      undefined,
      postId,
    )

    expect(repaired).toMatchObject({
      posts: [],
      orphanReceiptPostIds: [postId],
      identityKeys: expect.arrayContaining([
        expect.objectContaining({ kind: 'post_slug', value: oldSlug }),
      ]),
    })
    await expect(
      deleteOrphanPostPublicationProjectionReceipts(repairClaim, repaired.orphanReceiptPostIds),
    ).resolves.toBe(true)
    await acknowledgePostPublicationDirtyWork({
      id: repairClaim.id,
      generation: repairClaim.generation,
      leaseToken: repairClaim.lease_token,
    })
    await expect(hasTestPostPublicationProjectionReceipt(postId)).resolves.toBe(false)
  })

  it('compares missing receipts, keeps dry runs read-only, and records a repair with truthful counts', async () => {
    const { user, suffix, ids } = await createTestShadowAuditFixtures()
    const postId = await insertAuditPost(
      user.id,
      ids.postId,
      `shadow-audit-${suffix}`,
      `Shadow audit ${suffix}`,
      'Freshly captured primary-state candidate.',
    )

    const dryRun = await runPostPublicationShadowAudit({
      dryRun: true,
      limit: 1,
      postIdentityIds: [ids.postId],
    })
    expect(dryRun.dryRun).toBe(true)
    expect(dryRun.discrepanciesByScope).toEqual({ post: 1, author: 1, community: 0, rssFeed: 0 })
    await expect(
      getTestPostPublicationDirtyWorkForScope({ type: 'post', id: postId }),
    ).resolves.toBeUndefined()

    const repair = await runPostPublicationShadowAudit({
      dryRun: false,
      limit: 1,
      postIdentityIds: [ids.postId],
    })
    expect(repair.dryRun).toBe(false)
    expect(repair.discrepanciesByScope).toEqual({ post: 1, author: 1, community: 0, rssFeed: 0 })
    expect(repair.checkpoint).toBe(postId)
    await expect(
      getTestPostPublicationDirtyWorkForScope({ type: 'post', id: ids.foreignPostId }),
    ).resolves.toBeUndefined()
    await expect(
      getTestPostPublicationDirtyWorkForScope({ type: 'post', id: postId }),
    ).resolves.toEqual(expect.objectContaining({ post_identity_id: postId }))
  })

  it('resets an EOF checkpoint so the next scheduled run can start over', async () => {
    const { user, ids, suffix, postIds } = await createTestShadowAuditFixtures(2)
    for (const id of postIds) {
      await insertAuditPost(
        user.id,
        id,
        `shadow-eof-${suffix}-${id}`,
        'Owned EOF candidate',
        'Real first page before exhaustion.',
      )
    }
    await withTestShadowAuditCheckpoint(async context => {
      const owned = await context.audit({ dryRun: false, limit: 1, postIdentityIds: [ids.postId] })
      expect(owned.scannedByScope.post).toBe(1)
      expect(owned.discrepanciesByScope.post).toBe(1)
      expect(owned.checkpoint).toBe(ids.postId)
      const terminal = await context.terminalPage(user.id)
      await context.setCheckpoint(terminal.before)
      const first = await context.audit({ dryRun: false, limit: 1 })
      expect(first.scannedByScope.post).toBe(1)
      expect(first.checkpoint).toBe(terminal.ids[0])
      await expect(context.getCheckpoint()).resolves.toBe(terminal.ids[0])
      const second = await context.audit({
        dryRun: false,
        limit: 1,
        cursor: terminal.ids[0],
        postIdentityIds: terminal.ids,
      })
      expect(second.scannedByScope.post).toBe(1)
      expect(second.checkpoint).toBe(terminal.ids[1])
      await expect(context.getCheckpoint()).resolves.toBe(terminal.ids[0])
      // Global exhaustion uses the actual maximum, even when a foreign UUID is future-dated.
      await context.setCheckpoint(terminal.maximum)
      const eof = await context.audit({ dryRun: false, limit: 1 })
      expect(eof).toMatchObject({ dryRun: false, checkpoint: null, scannedByScope: { post: 0 } })
      await expect(context.getCheckpoint()).resolves.toBeNull()
    })
  })

  it('does not report a candidate whose current receipt matches primary state', async () => {
    const { user, suffix, ids } = await createTestShadowAuditFixtures()
    const oldSlug = `shadow-audit-receipt-${suffix}`
    const postId = await insertAuditPost(
      user.id,
      ids.postId,
      oldSlug,
      `Shadow audit receipt ${suffix}`,
      'Candidate with a matching durable projection receipt.',
    )
    const oldTopicId = await insertTestTopic({
      name: `Shadow receipt ${suffix}`,
      slug: `shadow-receipt-${suffix}`,
      createdById: user.id,
    })
    await addTestPostDataPointTopic(postId, oldTopicId)
    await using query = await beginTransaction()
    const work = await recordPostPublicationChange(query, {
      scope: { type: 'post', postId },
      reason: 'post_created',
    })
    await query.commit()
    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected receipt work lease')
    const reconciliation = await reconcileTestPublicationThroughPostSweep(
      claimed,
      undefined,
      postId,
    )
    expect(reconciliation.posts.map(post => post.id)).toContain(postId)
    await expect(
      acknowledgePostPublicationProjectionReceipts(claimed, reconciliation.posts),
    ).resolves.toBe(true)
    await expect(
      acknowledgePostPublicationDirtyWork({
        id: claimed.id,
        generation: claimed.generation,
        leaseToken: claimed.lease_token,
      }),
    ).resolves.toBe(true)

    const matched = await runPostPublicationShadowAudit({
      dryRun: true,
      limit: 1,
      postIdentityIds: [ids.postId],
    })
    expect(matched).toMatchObject({
      dryRun: true,
      checkpoint: postId,
      discrepanciesByScope: { post: 0, author: 0, community: 0, rssFeed: 0 },
    })

    const newSlug = `shadow-audit-current-${suffix}`
    await deleteTestPostDataPointTopics(postId)
    await updateTestPostSlug(postId, newSlug)
    await runPostPublicationShadowAudit({
      dryRun: false,
      limit: 1,
      postIdentityIds: [ids.postId],
    })
    const repairWork = await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: postId })
    if (!repairWork) throw new Error('Expected exact shadow repair work')
    const repairClaim = await claimPostPublicationDirtyWork(repairWork, 60)
    if (!repairClaim) throw new Error('Expected exact shadow repair lease')
    const repaired = await reconcileTestPublicationThroughPostSweep(repairClaim, undefined, postId)

    expect(repaired.posts.map(post => post.id)).toContain(postId)
    expect(repaired.final.topicIds).toContain(oldTopicId)
    expect(repaired.final.identityKeys).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'post_slug', value: oldSlug }),
        expect.objectContaining({ kind: 'post_slug', value: newSlug }),
      ]),
    )
    await acknowledgePostPublicationProjectionReceipts(repairClaim, repaired.posts)
    await acknowledgePostPublicationDirtyWork({
      id: repairClaim.id,
      generation: repairClaim.generation,
      leaseToken: repairClaim.lease_token,
    })
    await expect(
      runPostPublicationShadowAudit({ dryRun: true, limit: 1, postIdentityIds: [ids.postId] }),
    ).resolves.toMatchObject({ discrepanciesByScope: { post: 0 } })
  })
})
