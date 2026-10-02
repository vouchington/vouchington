import { it, expect, beforeAll, describe, onTestFinished, vi } from 'vitest'
import {
  claimPostPublicationDirtyWork,
  lockPostPublicationRssFeedScopes,
  lockTopicAliasPublicationScopes,
  reconcilePostPublicationDirtyWork,
} from '@services/post-publication'
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
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
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
    ).resolves.toMatchObject({ topic_alias_id: aliasId, reasons: ['post_topics_changed'] })
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
    async function holdFeedPublicationScope(): Promise<void> {
      await using query = await beginTransaction()
      await lockPostPublicationRssFeedScopes(query, [feed.id])
      feedLocked.resolve()
      await releaseFeed.promise
      await query.commit()
    }
    const holder = holdFeedPublicationScope()
    await feedLocked.promise
    const deletion = hardDeleteRssFeedById(feed.id)
    try {
      await vi.waitFor(async () => {
        await expect(contendForTopicAliasPublicationScope()).rejects.toMatchObject({
          code: '55P03',
        })
      })
    } finally {
      releaseFeed.resolve()
    }
    await holder
    await expect(deletion).resolves.toBe(true)

    async function contendForTopicAliasPublicationScope(): Promise<void> {
      await using query = await beginTransaction()
      await query(`SET LOCAL lock_timeout = '50ms'`)
      await lockTopicAliasPublicationScopes(query, [aliasId])
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
    const feed = await createFeed('hard-batch')
    const topic = await createTestTopic({ user: adminUser })
    const url = await insertTestUrlDirect(
      adminUser.id,
      `https://example.com/${createRandomString(10)}`,
    )
    if (!url) throw new Error('Expected RSS batch item URL')
    const { postIds } = await insertTestStoryCategoryPublicationBatch({
      count: 1_001,
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
  }, 60_000)

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
