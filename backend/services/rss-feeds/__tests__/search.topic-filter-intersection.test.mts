import { describe, expect, it } from 'vitest'
import { createTestTopic, WEB_PROVENANCE } from '@voucha/test-helpers'
import { createRssFeed } from '../create.mts'
import { searchRssFeeds } from '../search.mts'
import { updateRssFeedById } from '../update.mts'

describe('searchRssFeeds topic filter intersections', () => {
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
      updateRssFeedById(singularFeed.id, { enabled: true }),
      updateRssFeedById(hashtagFeed.id, { enabled: true }),
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
