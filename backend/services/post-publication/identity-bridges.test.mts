import {
  beginTransaction,
  createTestPost,
  createTestUser,
  createTestTopic,
  createTestUrlWithHostname,
  insertTestCommunity,
  insertTestRssFeed,
  insertTestRssFeedItem,
  hardDeleteTestPublicationLiveEntity,
  readTestPublicationIdentityBridge,
  seedTestUnreferencedPublicationIdentities,
  readTestPublicationBridgeTraversalBound,
  hasTestRetainedIdentityRoot,
  acquireTestPublicationIdentityBridgeCleanupReservation,
  visitTestPublicationPostIdentityCandidates,
} from '@voucha/test-helpers'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { recordPostPublicationChange } from './capture.mts'
import { retainPostPublicationKeys } from './retained-key-writes.mts'
import { cleanupPostPublicationIdentityBridges } from './identity-bridge-cleanup.mts'
import { retainPublicationIdentityBridges } from './identity-bridges.mts'
import { preparePostPublicationIdentityBridges } from './prepare-identity-bridges.mts'
import type { PostPublicationChange } from './types.mts'
import { createTestPublicationSnapshotWork } from '@voucha/test-helpers/post-publication-fixtures'
import { materializePostPublicationIdentitySnapshot } from './identity-snapshots.mts'
import { acknowledgePostPublicationProjectionReceipts } from './receipts.mts'
import { acknowledgePostPublicationDirtyWork } from './dirty-work.mts'

describe('publication concrete identity relationships', () => {
  let cleanupReservation:
    | Awaited<ReturnType<typeof acquireTestPublicationIdentityBridgeCleanupReservation>>
    | undefined
  beforeEach(async () => {
    cleanupReservation = await acquireTestPublicationIdentityBridgeCleanupReservation()
  })
  afterEach(async () => {
    await cleanupReservation?.release()
    cleanupReservation = undefined
  })

  it('retains accepted post identity after acknowledgement and live hard deletion', async () => {
    const { work, candidate } = await createTestPublicationSnapshotWork()
    const snapshot = await materializePostPublicationIdentitySnapshot(work, candidate, 100)
    expect(snapshot.complete).toBe(true)
    candidate.identity_snapshot_id = snapshot.snapshotId
    expect(await acknowledgePostPublicationProjectionReceipts(work, [candidate])).toBe(true)
    expect(
      await acknowledgePostPublicationDirtyWork({
        id: work.id,
        generation: work.generation,
        leaseToken: work.lease_token,
      }),
    ).toBe(true)
    await hardDeleteTestPublicationLiveEntity('post', candidate.id)
    const bound = await readTestPublicationBridgeTraversalBound(100)
    for (let page = 0; page < bound; page++) {
      await cleanupPostPublicationIdentityBridges()
    }
    expect(await readTestPublicationIdentityBridge('post', candidate.id)).toEqual({
      id: candidate.id,
      live_id: null,
    })
  })
  it('orders first-created bridge families across reversed community and post captures', async () => {
    const user = await createTestUser()
    if (!user) throw new Error('Expected mixed-scope author')
    const post = await createTestPost({ user })
    const community = await insertTestCommunity({ createdById: user.id })
    expect(await readTestPublicationIdentityBridge('post', post.id)).toBeUndefined()
    const changes: PostPublicationChange[] = [
      {
        scope: { type: 'community', communityId: community.id },
        reason: 'community_publication_changed',
        impactedPostIds: [post.id],
      },
      {
        scope: { type: 'post', postId: post.id },
        reason: 'community_publication_changed',
        impactedCommunityIds: [community.id],
      },
    ]
    await Promise.all(
      changes.map(async change => {
        await using query = await beginTransaction()
        await recordPostPublicationChange(query, change)
        await query.commit()
      }),
    )
    expect(await readTestPublicationIdentityBridge('community', community.id)).toBeDefined()
  })
  it('prepares the complete scope set before reversed multi-call transactions', async () => {
    const user = await createTestUser()
    if (!user) throw new Error('Expected multi-capture author')
    const post = await createTestPost({ user })
    const community = await insertTestCommunity({ createdById: user.id })
    const changes: PostPublicationChange[] = [
      {
        scope: { type: 'community', communityId: community.id },
        reason: 'community_publication_changed',
        impactedPostIds: [post.id],
      },
      {
        scope: { type: 'post', postId: post.id },
        reason: 'community_publication_changed',
        impactedCommunityIds: [community.id],
      },
    ]
    await Promise.all(
      [changes, changes.toReversed()].map(async transactionChanges => {
        await using query = await beginTransaction()
        await preparePostPublicationIdentityBridges(query, transactionChanges)
        for (const change of transactionChanges) {
          await recordPostPublicationChange(query, change)
        }
        await query.commit()
      }),
    )
    expect(await readTestPublicationIdentityBridge('community', community.id)).toBeDefined()
  })
  it('preserves a retained post identity after hard deletion while clearing its live FK', async () => {
    const post = await createTestPost()
    await using query = await beginTransaction()
    await recordPostPublicationChange(query, {
      scope: { type: 'post', postId: post.id },
      reason: 'post_deleted',
      impactedPostIds: [post.id],
    })
    await query.commit()
    await hardDeleteTestPublicationLiveEntity('post', post.id)
    expect(await readTestPublicationIdentityBridge('post', post.id)).toEqual({
      id: post.id,
      live_id: null,
    })
    expect(await hasTestRetainedIdentityRoot('post', post.id)).toBe(true)
    const bound = await readTestPublicationBridgeTraversalBound(100)
    for (let page = 0; page < bound; page++) {
      expect((await cleanupPostPublicationIdentityBridges()).scanned).toBeLessThanOrEqual(100)
    }
    expect(await readTestPublicationIdentityBridge('post', post.id)).toBeDefined()
    expect(await hasTestRetainedIdentityRoot('post', post.id)).toBe(true)
  })
  it('preserves community and RSS item identities after their live FK targets disappear', async () => {
    const user = await createTestUser()
    if (!user) throw new Error('Expected identity bridge author')
    const community = await insertTestCommunity({ createdById: user.id })
    const post = await createTestPost({ user })
    const topic = await createTestTopic()
    const feed = await insertTestRssFeed({ topicId: topic.id, title: randomUUID() })
    const item = await insertTestRssFeedItem({
      rssFeedId: feed,
      urlId: await createTestUrlWithHostname(),
      guid: randomUUID(),
      itemData: {},
      contentSha256: Buffer.alloc(32),
    })
    await using query = await beginTransaction()
    await recordPostPublicationChange(query, {
      scope: { type: 'post', postId: post.id },
      reason: 'post_updated',
      impactedCommunityIds: [community.id],
      impactedRssFeedItemIds: [item],
    })
    await query.commit()
    await hardDeleteTestPublicationLiveEntity('community', community.id)
    await hardDeleteTestPublicationLiveEntity('rss_feed_item', item)
    expect(await readTestPublicationIdentityBridge('community', community.id)).toEqual({
      id: community.id,
      live_id: null,
    })
    expect(await readTestPublicationIdentityBridge('rss_feed_item', item)).toEqual({
      id: item,
      live_id: null,
    })
  })
  it('reclaims only unreferenced identities through bounded cyclic pages', async () => {
    const ids = await seedTestUnreferencedPublicationIdentities(101)
    expect(await visitTestPublicationPostIdentityCandidates([ids[0]!, ids.at(-1)!], 1_000)).toEqual(
      [],
    )
    expect(await readTestPublicationIdentityBridge('post', ids[0]!)).toBeUndefined()
    expect(await readTestPublicationIdentityBridge('post', ids.at(-1)!)).toBeUndefined()
  })
  it('does not erase an identity concurrently retained by another capture', async () => {
    const [id, reclaimId] = await seedTestUnreferencedPublicationIdentities(2)
    const post = await createTestPost()
    await using capture = await beginTransaction()
    await retainPublicationIdentityBridges(capture, 'post', [id!.toUpperCase(), id!, reclaimId!])
    expect(await visitTestPublicationPostIdentityCandidates([id!, reclaimId!])).toEqual([])
    expect(await readTestPublicationIdentityBridge('post', id!)).toBeDefined()
    expect(await readTestPublicationIdentityBridge('post', reclaimId!)).toBeDefined()
    const work = await recordPostPublicationChange(capture, {
      scope: { type: 'post', postId: post.id },
      reason: 'post_updated',
    })
    await retainPostPublicationKeys(capture, work.id, [{ kind: 'impact_post', uuidValue: id! }])
    await capture.commit()
    expect(await readTestPublicationIdentityBridge('post', id!)).toBeDefined()
    expect(await visitTestPublicationPostIdentityCandidates([reclaimId!])).toEqual([])
    expect(await readTestPublicationIdentityBridge('post', reclaimId!)).toBeUndefined()
  })
})
