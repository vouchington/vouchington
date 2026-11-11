import { describe, expect, it } from 'vitest'
import { createTestTopic, WEB_PROVENANCE } from '@voucha/test-helpers'
import { createRssFeed } from '../create.mts'
import { searchRssFeeds } from '../search.mts'
import { updateRssFeedById } from '../update.mts'
import { softDeleteRssFeedById } from '../delete.mts'

describe('searchRssFeeds topic filter intersections', () => {
  it('finds the live feed when a deleted feed retains the same descendant topic', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({ hostname: `replacement-feed-${random}.example.com` })
    const deletedFeed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/deleted-feed-${random}.xml`,
      topic_id: topic.id,
    })
    await softDeleteRssFeedById(deletedFeed.id)
    const liveFeed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/live-feed-${random}.xml`,
      topic_id: topic.id,
    })
    await updateRssFeedById(liveFeed.id, { is_enabled: true })

    const results = await searchRssFeeds({ topic_id: topic.id, include_descendants: true })

    expect(results.map(feed => feed.id)).toEqual([liveFeed.id])
  })

  it('intersects explicit topic filters with hashtag topics', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const [singularTopic, hashtagTopic] = await Promise.all([
      createTestTopic({ hostname: `singular-topic-${random}.example.com` }),
      createTestTopic({ hostname: `hashtag-topic-${random}.example.com` }),
    ])
    const [singularFeed, hashtagFeed] = await Promise.all([
      createRssFeed({
        provenance: WEB_PROVENANCE,
        skipRemoteValidation: true,
        rss_feed_url: `https://example.com/singular-topic-${random}.xml`,
        topic_id: singularTopic.id,
      }),
      createRssFeed({
        provenance: WEB_PROVENANCE,
        skipRemoteValidation: true,
        rss_feed_url: `https://example.com/hashtag-topic-${random}.xml`,
        topic_id: hashtagTopic.id,
      }),
    ])
    await Promise.all([
      updateRssFeedById(singularFeed.id, { is_enabled: true }),
      updateRssFeedById(hashtagFeed.id, { is_enabled: true }),
    ])

    const results = await searchRssFeeds({
      topic_ids: [singularTopic.id],
      hashtag_topic_ids: [hashtagTopic.id],
    })

    expect(results.map(feed => feed.id)).not.toContain(singularFeed.id)
    expect(results.map(feed => feed.id)).not.toContain(hashtagFeed.id)

    const overlapping = await searchRssFeeds({
      topic_ids: [singularTopic.id],
      hashtag_topic_ids: [singularTopic.id],
    })
    expect(overlapping.map(feed => feed.id)).toContain(singularFeed.id)
    expect(overlapping.map(feed => feed.id)).not.toContain(hashtagFeed.id)
  })
})
