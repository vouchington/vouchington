import { runIsolatedDatabaseCase } from '../../../test-helpers/vitest-isolated-database-case.mts'
import { getIsolatedDatabaseCaseMode } from '../../../test-helpers/vitest-isolated-database-cases.mts'
import {
  beginTransaction,
  addTestPostDataPointTopic,
  createTestUser,
  deleteTestPostDataPointTopics,
  getTestPostPublicationDirtyWorkForScope,
  getTestPostPublicationShadowAuditCheckpoint,
  hardDeleteTestPost,
  hasTestPostPublicationProjectionReceipt,
  insertTestPost,
  insertTestTopic,
  setTestPostPublicationShadowAuditCheckpoint,
  updateTestPostSlug,
} from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  acknowledgePostPublicationProjectionReceipts,
  acknowledgePostPublicationDirtyWork,
  claimPostPublicationDirtyWork,
  deleteOrphanPostPublicationProjectionReceipts,
  reconcilePostPublicationDirtyWork,
  recordPostPublicationChange,
} from './index.mts'
import { runPostPublicationShadowAudit } from './shadow-audit.mts'
describe('post publication shadow audit', () => {
  it('repairs a receipt left behind by a hard-deleted post', async () => {
    if (getIsolatedDatabaseCaseMode('publication-audit-orphan-repair') === 'parent') {
      await runIsolatedDatabaseCase('publication-audit-orphan-repair')
      return
    }
    const user = await createTestUser()
    if (!user) throw new Error('Expected orphan-receipt author fixture')
    const suffix = randomUUID().replaceAll('-', '')
    const prefix = `${suffix.slice(0, 8)}-${suffix.slice(8, 11)}`
    const oldSlug = `shadow-orphan-${suffix}`
    const postId = await insertTestPost({
      id: `${prefix}1-7000-8000-000000000001`,
      title: `Shadow orphan ${suffix}`,
      slug: oldSlug,
      markdown: 'Receipt fixture for a missed hard deletion.',
      createdById: user.id,
    })
    await using query = await beginTransaction()
    const work = await recordPostPublicationChange(query, {
      scope: { type: 'post', postId },
      reason: 'post_created',
    })
    await query.commit()
    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected orphan-receipt initial lease')
    const initial = await reconcilePostPublicationDirtyWork(claimed)
    await acknowledgePostPublicationProjectionReceipts(claimed, initial.posts)
    await acknowledgePostPublicationDirtyWork({
      id: claimed.id,
      generation: claimed.generation,
      leaseToken: claimed.lease_token,
    })
    await expect(hasTestPostPublicationProjectionReceipt(postId)).resolves.toBe(true)
    await hardDeleteTestPost(postId)

    const cursor = `${prefix}1-7000-8000-000000000000`
    await expect(
      runPostPublicationShadowAudit({ dryRun: true, limit: 1, cursor }),
    ).resolves.toMatchObject({
      scannedByScope: { post: 1, author: 0, community: 0, rssFeed: 0 },
      discrepanciesByScope: { post: 1, author: 0, community: 0, rssFeed: 0 },
      checkpoint: postId,
    })

    await setTestPostPublicationShadowAuditCheckpoint(cursor)
    await runPostPublicationShadowAudit({ dryRun: false, limit: 1 })
    const repairWork = await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: postId })
    if (!repairWork) throw new Error('Expected orphan-receipt repair work')
    const repairClaim = await claimPostPublicationDirtyWork(repairWork, 60)
    if (!repairClaim) throw new Error('Expected orphan-receipt repair lease')
    const repaired = await reconcilePostPublicationDirtyWork(repairClaim)

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
  }, 240_000)

  it('compares missing receipts, keeps dry runs read-only, and records a repair with truthful counts', async () => {
    if (getIsolatedDatabaseCaseMode('publication-audit-counts') === 'parent') {
      await runIsolatedDatabaseCase('publication-audit-counts')
      return
    }
    const user = await createTestUser()
    if (!user) throw new Error('Expected shadow-audit user fixture')
    const suffix = randomUUID().replaceAll('-', '')
    const prefix = `${suffix.slice(0, 8)}-${suffix.slice(8, 11)}`
    const requestedPostId = `${prefix}1-7000-8000-000000000001`
    const postId = await insertTestPost({
      id: requestedPostId,
      title: `Shadow audit ${suffix}`,
      slug: `shadow-audit-${suffix}`,
      markdown: 'Freshly captured primary-state candidate.',
      createdById: user.id,
    })

    const cursor = `${prefix}1-7000-8000-000000000000`
    await setTestPostPublicationShadowAuditCheckpoint(cursor)

    const dryRun = await runPostPublicationShadowAudit({ dryRun: true, limit: 1, cursor })

    expect(dryRun.dryRun).toBe(true)
    expect(dryRun.discrepanciesByScope).toEqual({ post: 1, author: 1, community: 0, rssFeed: 0 })
    await expect(
      getTestPostPublicationDirtyWorkForScope({ type: 'post', id: postId }),
    ).resolves.toBeUndefined()
    await expect(getTestPostPublicationShadowAuditCheckpoint()).resolves.toBe(cursor)

    const repair = await runPostPublicationShadowAudit({ dryRun: false, limit: 1 })

    expect(repair.dryRun).toBe(false)
    expect(repair.discrepanciesByScope).toEqual({ post: 1, author: 1, community: 0, rssFeed: 0 })
    expect(repair.checkpoint).toBe(postId)
    await expect(
      getTestPostPublicationDirtyWorkForScope({ type: 'post', id: postId }),
    ).resolves.toEqual(expect.objectContaining({ post_identity_id: postId }))
    await expect(getTestPostPublicationShadowAuditCheckpoint()).resolves.toBe(postId)
  }, 240_000)

  it('resets an EOF checkpoint so the next scheduled run can start over', async () => {
    if (getIsolatedDatabaseCaseMode('publication-audit-eof') === 'parent') {
      await runIsolatedDatabaseCase('publication-audit-eof')
      return
    }

    await setTestPostPublicationShadowAuditCheckpoint('ffffffff-ffff-7fff-bfff-ffffffffffff')

    const eof = await runPostPublicationShadowAudit({ dryRun: false, limit: 1 })

    expect(eof).toMatchObject({ dryRun: false, checkpoint: null })
    await expect(getTestPostPublicationShadowAuditCheckpoint()).resolves.toBeNull()
  }, 240_000)

  it('does not report a candidate whose current receipt matches primary state', async () => {
    if (getIsolatedDatabaseCaseMode('publication-audit-exact-receipt') === 'parent') {
      await runIsolatedDatabaseCase('publication-audit-exact-receipt')
      return
    }
    const user = await createTestUser()
    if (!user) throw new Error('Expected receipt-comparison user fixture')
    const suffix = randomUUID().replaceAll('-', '')
    const prefix = `${suffix.slice(0, 8)}-${suffix.slice(8, 11)}`
    const oldSlug = `shadow-audit-receipt-${suffix}`
    const postId = await insertTestPost({
      id: `${prefix}1-7000-8000-000000000001`,
      title: `Shadow audit receipt ${suffix}`,
      slug: oldSlug,
      markdown: 'Candidate with a matching durable projection receipt.',
      createdById: user.id,
    })
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
    const reconciliation = await reconcilePostPublicationDirtyWork(claimed)
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

    await setTestPostPublicationShadowAuditCheckpoint(`${prefix}1-7000-8000-000000000000`)

    const result = await runPostPublicationShadowAudit({
      dryRun: true,
      limit: 1,
      cursor: `${prefix}1-7000-8000-000000000000`,
    })

    expect(result).toMatchObject({
      dryRun: true,
      checkpoint: postId,
      discrepanciesByScope: { post: 0, author: 0, community: 0, rssFeed: 0 },
    })

    const newSlug = `shadow-audit-current-${suffix}`
    await deleteTestPostDataPointTopics(postId)
    await updateTestPostSlug(postId, newSlug)
    await runPostPublicationShadowAudit({ dryRun: false, limit: 1 })
    const repairWork = await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: postId })
    if (!repairWork) throw new Error('Expected exact shadow repair work')
    const repairClaim = await claimPostPublicationDirtyWork(repairWork, 60)
    if (!repairClaim) throw new Error('Expected exact shadow repair lease')
    const repaired = await reconcilePostPublicationDirtyWork(repairClaim)

    expect(repaired.topicIds).toContain(oldTopicId)
    expect(repaired.identityKeys).toEqual(
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
      runPostPublicationShadowAudit({
        dryRun: true,
        limit: 1,
        cursor: `${prefix}1-7000-8000-000000000000`,
      }),
    ).resolves.toMatchObject({ discrepanciesByScope: { post: 0 } })
  }, 240_000)
})
