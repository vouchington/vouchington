import {
  beginTransaction,
  createTestOrphanPostPublicationProjectionReceipts,
  createTestPost,
  hardDeleteTestPost,
} from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import {
  claimPostPublicationDirtyWork,
  deleteOrphanPostPublicationProjectionReceipts,
  reconcilePostPublicationDirtyWork,
  recordPostPublicationChange,
} from './public.mts'
import {
  retainPostPublicationImpactKeys,
  retainPostPublicationKeys,
  type PostPublicationRetainedKey,
} from './capture-keys.mts'
import type { TransactionQuery } from '@data-stores/psql'

describe('post publication orphan-receipt reconciliation', () => {
  it('pages orphan projection receipts before applying their effects', async () => {
    const post = await createTestPost()
    await using query = await beginTransaction()
    const work = await recordPostPublicationChange(query, {
      scope: { type: 'post', postId: post.id },
      reason: 'post_updated',
    })
    await query.commit()
    const orphanPostIds = await createTestOrphanPostPublicationProjectionReceipts(work.id, 3)
    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected orphan-receipt publication work lease')

    const firstPage = await reconcilePostPublicationDirtyWork(claimed, 2)
    expect(firstPage.orphanReceiptPostIds).toEqual(orphanPostIds.slice(0, 2))
    expect(firstPage).toMatchObject({ hasMoreOrphanReceipts: true, topicIds: [] })
    await expect(
      deleteOrphanPostPublicationProjectionReceipts(claimed, firstPage.orphanReceiptPostIds),
    ).resolves.toBe(true)

    const finalPage = await reconcilePostPublicationDirtyWork(claimed, 2)
    expect(finalPage.orphanReceiptPostIds).toEqual(orphanPostIds.slice(2))
    expect(finalPage.hasMoreOrphanReceipts).toBe(false)
  })

  it('surfaces retained post tombstones with no projection receipt for notification cleanup', async () => {
    const post = await createTestPost()
    await using query = await beginTransaction()
    const work = await recordPostPublicationChange(query, {
      scope: { type: 'post', postId: post.id },
      reason: 'post_deleted',
    })
    await retainPostPublicationImpactKeys(query, work.id, { postIds: [post.id] })
    await query.commit()
    await hardDeleteTestPost(post.id)
    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected deleted-post publication work lease')

    await expect(reconcilePostPublicationDirtyWork(claimed)).resolves.toMatchObject({
      posts: [],
      orphanReceiptPostIds: [],
      missingPostIds: [post.id],
    })
  })

  it('retains canonical UUID, text, and sitemap key families across bounded batches', async () => {
    const post = await createTestPost()
    await using query = await beginTransaction()
    const work = await recordPostPublicationChange(query, {
      scope: { type: 'post', postId: post.id },
      reason: 'post_updated',
    })
    const textKeys = Array.from({ length: 1_001 }, (_, index) => ({
      kind: 'identity_topic_alias' as const,
      textValue: `publication-key-${crypto.randomUUID()}-${index}`,
    }))
    const sitemapKeys = Array.from({ length: 1_001 }, (_, index) => ({
      kind: 'sitemap_target' as const,
      postType: 'discussion',
      day: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
    }))
    const keys: PostPublicationRetainedKey[] = [
      ...Array.from({ length: 1_001 }, () => ({
        kind: 'impact_post' as const,
        uuidValue: crypto.randomUUID(),
      })),
      ...textKeys,
      ...sitemapKeys,
    ]
    await retainPostPublicationKeys(query, work.id, keys)
    await query.commit()

    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected retained-key publication work lease')
    const page = await reconcilePostPublicationDirtyWork(claimed, 5_000)

    expect(page.missingPostIds).toHaveLength(1_001)
    expect(page.identityKeys).toContainEqual(
      expect.objectContaining({ kind: 'topic_alias', value: textKeys[0]!.textValue }),
    )
    expect(page.identityKeys.filter(key => key.kind === 'topic_alias')).toHaveLength(1_001)
    expect(page.sitemapTargets).toHaveLength(1_001)
  })

  it('serializes reverse overlapping retained-key batches without losing either complete input', async () => {
    const post = await createTestPost()
    await using setup = await beginTransaction()
    const work = await recordPostPublicationChange(setup, {
      scope: { type: 'post', postId: post.id },
      reason: 'post_updated',
    })
    await setup.commit()
    const shared = Array.from({ length: 1_001 }, () => crypto.randomUUID())
    const firstOnly = crypto.randomUUID()
    const secondOnly = crypto.randomUUID()
    const firstKeys: PostPublicationRetainedKey[] = [
      ...shared.map(uuidValue => ({ kind: 'impact_post' as const, uuidValue })),
      { kind: 'impact_post', uuidValue: firstOnly },
    ]
    const secondKeys: PostPublicationRetainedKey[] = [
      { kind: 'impact_post', uuidValue: secondOnly },
      ...shared.toReversed().map(uuidValue => ({ kind: 'impact_post' as const, uuidValue })),
    ]
    await using first = await beginTransaction()
    await using second = await beginTransaction()
    const firstDispatching = Promise.withResolvers<void>()
    const secondDispatching = Promise.withResolvers<void>()
    await Promise.all([
      retainAndCommit(first, work.id, firstKeys, firstDispatching, secondDispatching),
      retainAndCommit(second, work.id, secondKeys, secondDispatching, firstDispatching),
    ])

    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected reverse-overlap publication work lease')
    const page = await reconcilePostPublicationDirtyWork(claimed, 2_000)
    expect(page.missingPostIds).toHaveLength(1_003)
    expect(page.missingPostIds).toEqual(expect.arrayContaining([firstOnly, secondOnly]))
  })

  async function retainAndCommit(
    query: Awaited<ReturnType<typeof beginTransaction>>,
    dirtyWorkId: string,
    keys: readonly PostPublicationRetainedKey[],
    dispatching: PromiseWithResolvers<void>,
    peerDispatching: PromiseWithResolvers<void>,
  ): Promise<void> {
    await retainPostPublicationKeys(
      createBarrieredQuery(query, dispatching, peerDispatching),
      dirtyWorkId,
      keys,
    )
    await query.commit()
  }

  function createBarrieredQuery(
    query: TransactionQuery,
    dispatching: PromiseWithResolvers<void>,
    peerDispatching: PromiseWithResolvers<void>,
  ): TransactionQuery {
    let insertDispatched = false
    return Object.assign(
      async (input: string, values?: unknown[]) => {
        if (!insertDispatched && input.includes('/* fencePublicationIdentityBridgeCapture */')) {
          insertDispatched = true
          dispatching.resolve()
          await peerDispatching.promise
        }
        return query(input, values)
      },
      { client: query.client },
    ) as TransactionQuery
  }
})
