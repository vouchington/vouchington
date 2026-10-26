import { describe, expect, it, onTestFinished } from 'vitest'
import { countTestFeedSources } from '../../test-helpers/publication-test-queries.mts'
import {
  countTestPosts,
  countTestPendingCategoryReconciliations,
} from '../../test-helpers/rss-hard-delete-queries.mts'
import {
  createRandomString,
  createTestTopic,
  createTestUser,
  hardDeleteTestPosts,
  insertTestStoryCategoryPublicationBatch,
  insertTestUrlDirect,
  overrideDynamicConfigFieldsForTest,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { postPublicationWorkConfig } from '@services/post-publication/work-limits'
import { createRssFeed } from './create.mts'
import { hardDeleteRssFeedById } from './delete.mts'
import { hardDeleteRssFeedSourcePage } from './hard-delete-source-page.mts'
import { addRssFeedItemSource } from '@voucha/test-helpers/entities/rss-feed-items'

describe('resumable RSS feed source removal', () => {
  it('removes only the deleted feed edge when another feed still publishes the same story item', async () => {
    const user = await createTestUser()
    const nonce = createRandomString(10)
    const topic = await createTestTopic({ hostname: `shared-item-${nonce}.example.com` })
    const secondTopic = await createTestTopic({
      hostname: `shared-item-second-${nonce}.example.com`,
    })
    const first = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://shared-item-${nonce}.example.com/first.xml`,
      topic_id: topic.id,
      title: 'First shared source',
    })
    const second = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://shared-item-${nonce}.example.com/second.xml`,
      topic_id: secondTopic.id,
      title: 'Second shared source',
    })
    const url = await insertTestUrlDirect(user.id, `https://shared-item-${nonce}.example.com/story`)
    if (!url) throw new Error('Expected shared story URL')
    const { postIds, itemIds } = await insertTestStoryCategoryPublicationBatch({
      count: 1,
      categoryText: `shared-item-${nonce}`,
      createdById: user.id,
      rssFeedId: first.id,
      topicId: topic.id,
      urlId: url.id,
    })
    onTestFinished(() => hardDeleteTestPosts(postIds))
    await addRssFeedItemSource(second.id, itemIds[0]!)
    expect(await countTestFeedSources(first.id)).toBe(1)
    expect(await countTestFeedSources(second.id)).toBe(1)

    await hardDeleteRssFeedById(first.id)
    const page = await hardDeleteRssFeedSourcePage(first.id)
    expect(page.keys).toEqual(
      expect.arrayContaining([
        { kind: 'impact_rss_feed_item', uuidValue: itemIds[0] },
        { kind: 'impact_post', uuidValue: postIds[0] },
      ]),
    )
    expect(
      page.keys.some(key => key.kind === 'identity_rss_feed' || key.kind === 'impact_topic'),
    ).toBe(false)
    expect(await countTestFeedSources(first.id)).toBe(0)
    expect(await countTestFeedSources(second.id)).toBe(1)
    expect(await countTestPosts(postIds)).toBe(1)
    expect(await countTestPendingCategoryReconciliations(postIds)).toBe(1)
  })

  it('captures each committed page while preserving shared story posts', async () => {
    const restore = overrideDynamicConfigFieldsForTest(postPublicationWorkConfig, {
      rss_feed_hard_delete_capture_batch_size: 2,
    })
    onTestFinished(restore)
    const user = await createTestUser()
    const nonce = createRandomString(10)
    const topic = await createTestTopic({
      user,
      hostname: `rss-delete-page-${nonce}.example.com`,
    })
    const feed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://rss-delete-page-${nonce}.example.com/feed.xml`,
      topic_id: topic.id,
      title: 'Resumable RSS feed deletion',
    })
    const url = await insertTestUrlDirect(user.id, `https://example.com/rss-delete-${nonce}`)
    if (!url) throw new Error('Expected RSS item URL')
    const { postIds } = await insertTestStoryCategoryPublicationBatch({
      count: 3,
      categoryText: `rss-delete-${nonce}`,
      createdById: user.id,
      rssFeedId: feed.id,
      topicId: topic.id,
      urlId: url.id,
    })
    onTestFinished(() => hardDeleteTestPosts(postIds))

    await expect(hardDeleteRssFeedById(feed.id)).resolves.toBe(true)
    const first = await hardDeleteRssFeedSourcePage(feed.id)
    expect(first.removed).toBe(2)
    expect(first.hasMore).toBe(true)
    expect(
      first.keys.some(key => key.kind === 'identity_rss_feed' || key.kind === 'impact_topic'),
    ).toBe(false)
    expect(first.keys.filter(key => key.kind === 'impact_post')).toHaveLength(2)
    const second = await hardDeleteRssFeedSourcePage(feed.id)
    expect(second.removed).toBe(1)
    expect(second.hasMore).toBe(false)
    expect(second.keys.filter(key => key.kind === 'impact_post')).toHaveLength(1)

    const [remainingSources, survivingPosts, pendingCategories] = await Promise.all([
      countTestFeedSources(feed.id),
      countTestPosts(postIds),
      countTestPendingCategoryReconciliations(postIds),
    ])
    expect(remainingSources).toBe(0)
    expect(survivingPosts).toBe(3)
    expect(pendingCategories).toBe(3)
  })
})
