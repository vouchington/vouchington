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
  readTestPublicationConcreteSchema,
} from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { recordPostPublicationChange } from './capture.mts'
import { retainPostPublicationKeys } from './retained-key-writes.mts'
import { cleanupPostPublicationIdentityBridges } from './identity-bridge-cleanup.mts'
import {
  PUBLICATION_IDENTITY_BRIDGES,
  retainPublicationIdentityBridges,
} from './identity-bridges.mts'
import { preparePostPublicationIdentityBridges } from './prepare-identity-bridges.mts'
import type { PostPublicationChange } from './types.mts'
import { createTestPublicationSnapshotWork } from './test-fixtures.mts'
import { materializePostPublicationIdentitySnapshot } from './identity-snapshots.mts'
import { acknowledgePostPublicationProjectionReceipts } from './receipts.mts'
import { acknowledgePostPublicationDirtyWork } from './dirty-work.mts'

describe('publication concrete identity relationships', () => {
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
    const bound = await readTestPublicationBridgeTraversalBound(100)
    for (let page = 0; page < bound; page++) {
      expect((await cleanupPostPublicationIdentityBridges()).scanned).toBeLessThanOrEqual(100)
    }
    expect(await readTestPublicationIdentityBridge('post', post.id)).toBeDefined()
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
    const bound = await readTestPublicationBridgeTraversalBound(100)
    for (let page = 0; page < bound; page++) {
      const result = await cleanupPostPublicationIdentityBridges(1_000)
      expect(result.scanned).toBeLessThanOrEqual(100)
      expect(result.deleted).toBeLessThanOrEqual(result.scanned)
    }
    expect(await readTestPublicationIdentityBridge('post', ids[0]!)).toBeUndefined()
    expect(await readTestPublicationIdentityBridge('post', ids.at(-1)!)).toBeUndefined()
  })
  it('does not erase an identity concurrently retained by another capture', async () => {
    const [id, reclaimId] = await seedTestUnreferencedPublicationIdentities(2)
    const post = await createTestPost()
    await using capture = await beginTransaction()
    await retainPublicationIdentityBridges(capture, 'post', [id!.toUpperCase(), id!, reclaimId!])
    const bound = await readTestPublicationBridgeTraversalBound(100)
    for (let page = 0; page < bound; page++) {
      await cleanupPostPublicationIdentityBridges()
    }
    const work = await recordPostPublicationChange(capture, {
      scope: { type: 'post', postId: post.id },
      reason: 'post_updated',
    })
    await retainPostPublicationKeys(capture, work.id, [{ kind: 'impact_post', uuidValue: id! }])
    await capture.commit()
    expect(await readTestPublicationIdentityBridge('post', id!)).toBeDefined()
    for (let page = 0; page < bound; page++) {
      await cleanupPostPublicationIdentityBridges()
    }
    expect(await readTestPublicationIdentityBridge('post', reclaimId!)).toBeUndefined()
  })
  it('stores only concrete payload columns and requires every receipt snapshot pointer', async () => {
    const { columns, constraints, receiptIndexes } = await readTestPublicationConcreteSchema()
    expect(receiptIndexes.length).toBeGreaterThanOrEqual(2)
    expect(receiptIndexes.filter(index => !index.indexed)).toEqual([])
    expect(
      columns.filter(column =>
        ['kind', 'uuid_value', 'text_value', 'applied_identity'].includes(column.column_name),
      ),
    ).toEqual([])
    expect(columns).toContainEqual({
      table_name: 'post_publication_projection_receipts',
      column_name: 'applied_snapshot_id',
      is_nullable: 'NO',
    })
    expect(constraints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          owner: 'post_publication_identity_snapshots',
          target: 'post_publication_dirty_work',
          delete_action: 'n',
          columns: ['dirty_work_id'],
        }),
        expect.objectContaining({
          owner: 'post_publication_post_identities',
          target: 'posts',
          delete_action: 'n',
          columns: ['post_id'],
        }),
        expect.objectContaining({
          owner: 'post_publication_dirty_work_keys',
          target: 'post_publication_post_identities',
          delete_action: 'r',
          columns: ['impact_post_identity_id'],
        }),
      ]),
    )
    const bridges = Object.values(PUBLICATION_IDENTITY_BRIDGES)
    expect(constraints).toEqual(
      expect.arrayContaining([
        ...bridges.map(bridge =>
          expect.objectContaining({
            owner: bridge.table,
            target: bridge.liveTable,
            delete_action: 'n',
            columns: [bridge.liveColumn],
          }),
        ),
        ...bridges
          .filter(bridge => bridge.workColumn !== null)
          .map(bridge =>
            expect.objectContaining({
              owner: 'post_publication_dirty_work',
              target: bridge.table,
              delete_action: 'r',
              columns: [bridge.workColumn],
            }),
          ),
        ...bridges
          .filter(bridge => bridge.keyColumn !== null)
          .map(bridge =>
            expect.objectContaining({
              owner: 'post_publication_dirty_work_keys',
              target: bridge.table,
              delete_action: 'r',
              columns: [bridge.keyColumn],
            }),
          ),
      ]),
    )
    expect(constraints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          owner: 'post_publication_projection_receipts',
          target: 'post_publication_post_identities',
          delete_action: 'r',
          columns: ['post_identity_id'],
        }),
        expect.objectContaining({
          owner: 'post_publication_identity_snapshots',
          target: 'post_publication_post_identities',
          delete_action: 'r',
          columns: ['post_identity_id'],
        }),
        expect.objectContaining({
          owner: 'post_publication_projection_receipts',
          target: 'post_publication_identity_snapshots',
          delete_action: 'r',
          columns: ['applied_snapshot_id'],
        }),
      ]),
    )
  })
})
