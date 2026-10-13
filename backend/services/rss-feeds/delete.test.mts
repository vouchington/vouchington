import { it, expect, beforeAll, describe, onTestFinished, vi } from 'vitest'
import {
  claimPostPublicationDirtyWork,
  lockPostPublicationRssFeedScopes,
  reconcilePostPublicationDirtyWork,
} from '@services/post-publication'
import * as topicAliasPublication from '@services/post-publication/capture-topic-alias'
import {
  softDeleteRssFeedById,
  hardDeleteRssFeedById,
  hardDeleteRssFeedByIdAsCurrentUser,
} from './delete.mts'
import { getRssFeedById } from './get.mts'
import {
  beginTransaction,
  addCategoryToRssFeedItem,
  addTopicAliasCategoryToRssFeedItem,
  createRandomString,
  createTopHashtagAliasForTest,
  createTestTopic,
  createTestUser,
  getRssFeedDeletedAt,
  getTestPostPublicationDirtyWorkForScope,
  hardDeleteTestPosts,
  insertTestStoryCategoryPublicationBatch,
  insertTestRssFeedItem,
  insertTestUrlDirect,
  listTestPostPublicationImpactTopicIds,
  listTestPostPublicationImpactPostIds,
  overrideDynamicConfigFieldsForTest,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { postPublicationWorkConfig } from '@services/post-publication/work-limits'
import { createRssFeed } from './create.mts'
import type { PrivateUser } from '@services/users/types'

describe('delete', () => {
  let adminUser: PrivateUser
  let nonAdminUser: PrivateUser

  beforeAll(async () => {
    adminUser = await createTestUser({ administrator: true })
    nonAdminUser = await createTestUser({ administrator: false })
  })

  async function createFeed(label: string) {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({ hostname: `delete-test-${label}-${random}.example.com` })
    return createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://delete-test-${label}-${random}.example.com/feed.xml`,
      topic_id: topic.id,
      title: `Delete Test ${label} ${random}`,
    })
  }

  it('softDeleteRssFeedById sets deleted_at and returns true', async () => {
    const feed = await createFeed('soft')

    const deleted = await softDeleteRssFeedById(feed.id)
    expect(deleted).toBe(true)

    const deletedAt = await getRssFeedDeletedAt(feed.id)
    expect(deletedAt).not.toBeNull()
  })

  it('softDeleteRssFeedById returns false on second call (idempotent)', async () => {
    const feed = await createFeed('soft-idem')

    const first = await softDeleteRssFeedById(feed.id)
    expect(first).toBe(true)

    const second = await softDeleteRssFeedById(feed.id)
    expect(second).toBe(false)
  })

  it('hardDeleteRssFeedById removes the row', async () => {
    const feed = await createFeed('hard')

    const deleted = await hardDeleteRssFeedById(feed.id)
    expect(deleted).toBe(true)

    const row = await getRssFeedById(feed.id)
    expect(row).toBeNull()
  })

  it('retains category topics before feed source rows cascade', async () => {
    const feed = await createFeed('hard-category')
    const topic = await createTestTopic({ user: adminUser })
    const url = await insertTestUrlDirect(
      adminUser.id,
      `https://example.com/${createRandomString(10)}`,
    )
    if (!url) throw new Error('Expected categorized RSS item URL')
    const itemId = await insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId: url.id,
      guid: createRandomString(16),
      itemData: { title: 'Publication category source' },
      contentSha256: Buffer.alloc(32),
    })
    await addCategoryToRssFeedItem(itemId, topic.id)

    await hardDeleteRssFeedById(feed.id)

    const work = await getTestPostPublicationDirtyWorkForScope({ type: 'rss_feed', id: feed.id })
    await expect(listTestPostPublicationImpactTopicIds(work!.id)).resolves.toContain(topic.id)
    const claimed = await claimPostPublicationDirtyWork(work!, 60)
    if (!claimed) throw new Error('Expected hard-delete publication work lease')
    const reconciliation = await reconcilePostPublicationDirtyWork(claimed)
    expect(reconciliation.rssFeedItemIds).toContain(itemId)
  })

  it('retains category hashtag aliases before feed source rows cascade', async () => {
    const feed = await createFeed('hard-hashtag-category')
    const topic = await createTestTopic({ user: adminUser })
    const aliasId = await createTopHashtagAliasForTest(topic.id, `feed-${createRandomString(8)}`)
    const url = await insertTestUrlDirect(
      adminUser.id,
      `https://example.com/${createRandomString(10)}`,
    )
    if (!url) throw new Error('Expected categorized RSS item URL')
    const itemId = await insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId: url.id,
      guid: createRandomString(16),
      itemData: { title: 'Publication hashtag category source' },
      contentSha256: Buffer.alloc(32),
    })
    await addTopicAliasCategoryToRssFeedItem(itemId, aliasId)

    await expect(hardDeleteRssFeedById(feed.id)).resolves.toBe(true)

    await expect(
      getTestPostPublicationDirtyWorkForScope({ type: 'topic_alias', id: aliasId }),
    ).resolves.toMatchObject({ topic_alias_identity_id: aliasId, reasons: ['post_topics_changed'] })
  })

  it('locks category aliases before waiting on the feed lifecycle', async () => {
    expect.hasAssertions()
    const feed = await createFeed('hard-alias-lock')
    const topic = await createTestTopic({ user: adminUser })
    const aliasId = await createTopHashtagAliasForTest(topic.id, `feed-${createRandomString(8)}`)
    const url = await insertTestUrlDirect(
      adminUser.id,
      `https://example.com/${createRandomString(10)}`,
    )
    if (!url) throw new Error('Expected category alias lock URL')
    const itemId = await insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId: url.id,
      guid: createRandomString(16),
      itemData: { title: 'Publication alias lock source' },
      contentSha256: Buffer.alloc(32),
    })
    await addTopicAliasCategoryToRssFeedItem(itemId, aliasId)
    const feedLocked = Promise.withResolvers<void>()
    const releaseFeed = Promise.withResolvers<void>()
    const aliasesLocked = Promise.withResolvers<void>()
    void feedLocked.promise.catch(() => {})
    void aliasesLocked.promise.catch(() => {})
    const actors: Promise<PromiseSettledResult<unknown>[]>[] = []
    let restoreAliasSpy: (() => void) | undefined
    let cleanup: Promise<unknown[]> | undefined
    let cleanupHandled = false
    function drain(): Promise<unknown[]> {
      return (cleanup ??= (async () => {
        releaseFeed.resolve()
        const settled = (await Promise.all(actors)).flat()
        const restored = await Promise.allSettled([
          Promise.resolve().then(() => restoreAliasSpy?.()),
        ])
        return [...settled, ...restored].flatMap(result =>
          result.status === 'rejected' ? [result.reason] : [],
        )
      })())
    }
    onTestFinished(async () => {
      if (cleanupHandled) return
      const errors = await drain()
      if (errors.length) throw new AggregateError(errors, 'RSS deletion actors failed')
    })
    async function holdFeedPublicationScope(): Promise<void> {
      await using query = await beginTransaction()
      await lockPostPublicationRssFeedScopes(query, [feed.id])
      feedLocked.resolve()
      await releaseFeed.promise
      await query.commit()
    }
    const lockAliases = topicAliasPublication.lockTopicAliasPublicationScopes
    let outcome: { ok: true } | { ok: false; error: unknown }
    try {
      const holder = holdFeedPublicationScope()
      actors.push(Promise.allSettled([holder]))
      void holder.catch(feedLocked.reject)
      await feedLocked.promise
      const aliasSpy = vi.spyOn(topicAliasPublication, 'lockTopicAliasPublicationScopes')
      restoreAliasSpy = () => aliasSpy.mockRestore()
      aliasSpy.mockImplementation(async (query, topicAliasIds) => {
        await lockAliases(query, topicAliasIds)
        if (topicAliasIds.includes(aliasId)) aliasesLocked.resolve()
      })
      const deletion = hardDeleteRssFeedById(feed.id)
      actors.push(Promise.allSettled([deletion]))
      void deletion.catch(aliasesLocked.reject)
      await aliasesLocked.promise
      await expect(contendForTopicAliasPublicationScope()).rejects.toMatchObject({
        code: '55P03',
      })
      releaseFeed.resolve()
      await holder
      await expect(deletion).resolves.toBe(true)
      outcome = { ok: true }
    } catch (err) {
      outcome = { ok: false, error: err }
    }
    const errors = (await drain()).filter(err => outcome.ok || !Object.is(err, outcome.error))
    cleanupHandled = true
    if (!outcome.ok) {
      if (errors.length) throw new AggregateError([outcome.error, ...errors], 'RSS cleanup failed')
      throw outcome.error
    }
    if (errors.length) throw new AggregateError(errors, 'RSS cleanup failed')

    async function contendForTopicAliasPublicationScope(): Promise<void> {
      await using query = await beginTransaction()
      await query(`SET LOCAL lock_timeout = '50ms'`)
      await lockAliases(query, [aliasId])
      await query.commit()
    }
  })

  it('retains the feed topic before the feed row is deleted', async () => {
    const feed = await createFeed('hard-owning-topic')

    await expect(hardDeleteRssFeedById(feed.id)).resolves.toBe(true)

    const work = await getTestPostPublicationDirtyWorkForScope({ type: 'rss_feed', id: feed.id })
    if (!work) throw new Error('Expected RSS feed publication work')
    await expect(listTestPostPublicationImpactTopicIds(work.id)).resolves.toContain(
      feed.topic_id as string,
    )
  })

  it('retains every bounded page of high-fanout post impacts before a feed cascade', async () => {
    const restoreConfig = overrideDynamicConfigFieldsForTest(postPublicationWorkConfig, {
      rss_feed_hard_delete_capture_batch_size: 2,
    })
    onTestFinished(restoreConfig)
    const feed = await createFeed('hard-batch')
    const topic = await createTestTopic({ user: adminUser })
    const url = await insertTestUrlDirect(
      adminUser.id,
      `https://example.com/${createRandomString(10)}`,
    )
    if (!url) throw new Error('Expected RSS batch item URL')
    const { postIds } = await insertTestStoryCategoryPublicationBatch({
      count: 3,
      categoryText: 'publication-batch',
      createdById: adminUser.id,
      rssFeedId: feed.id,
      topicId: topic.id,
      urlId: url.id,
    })
    onTestFinished(() => hardDeleteTestPosts(postIds))

    await expect(hardDeleteRssFeedById(feed.id)).resolves.toBe(true)
    const work = await getTestPostPublicationDirtyWorkForScope({ type: 'rss_feed', id: feed.id })
    if (!work) throw new Error('Expected RSS feed publication work')
    await expect(listTestPostPublicationImpactPostIds(work.id)).resolves.toEqual(postIds.toSorted())
    await expect(listTestPostPublicationImpactTopicIds(work.id)).resolves.toEqual(
      [feed.topic_id as string, topic.id].toSorted(),
    )
  }, 30_000)

  it('hardDeleteRssFeedByIdAsCurrentUser throws 403 for non-admin', async () => {
    const feed = await createFeed('hard-auth-fail')

    await expect(hardDeleteRssFeedByIdAsCurrentUser(nonAdminUser, feed.id)).rejects.toMatchObject({
      status: 403,
    })

    // Feed should still exist
    const row = await getRssFeedById(feed.id)
    expect(row).not.toBeNull()
  })

  it('hardDeleteRssFeedByIdAsCurrentUser succeeds for admin', async () => {
    const feed = await createFeed('hard-auth-ok')

    const deleted = await hardDeleteRssFeedByIdAsCurrentUser(adminUser, feed.id)
    expect(deleted).toBe(true)

    const row = await getRssFeedById(feed.id)
    expect(row).toBeNull()
  })
})
