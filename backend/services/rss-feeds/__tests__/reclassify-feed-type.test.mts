import { it, expect, describe } from 'vitest'
import { createTestTopic, WEB_PROVENANCE } from '@voucha/test-helpers'
import { reclassifyRssFeedTypeIfNeeded } from '../reclassify-feed-type.mts'
import { createRssFeed } from '../create.mts'
import { updateRssFeedById } from '../update.mts'
import { getRssFeedById } from '../get.mts'

describe('reclassifyRssFeedTypeIfNeeded', () => {
  it('returns immediately without DB side-effects when validItems is empty', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      name: `Empty Items Guard ${random}`,
      slug: `empty-items-guard-${random}`,
      hostname: `empty-items-guard-${random}.example.com`,
    })
    const feed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/empty-items-${random}.xml`,
      topic_id: topic.id,
      title: `Empty Items Feed ${random}`,
    })
    // Force feed_type away from what classifyFeedType([]) computes ('article'), so a broken
    // early-return guard would surface as an unwanted DB write flipping feed_type back.
    await updateRssFeedById(feed.id, { feed_type: 'video' })

    await reclassifyRssFeedTypeIfNeeded(
      feed.id,
      { url: `https://example.com/empty-items-${random}.xml`, feed_type: 'video' },
      [],
    )

    const unchanged = await getRssFeedById(feed.id)
    expect(unchanged!.feed_type).toBe('video')
  }, 30_000)

  it('updates feed_type to video for a YouTube channel URL when current type differs', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      name: `YT Reclassify ${random}`,
      slug: `yt-reclassify-${random}`,
      hostname: `reclassify-yt-${random}.example.com`,
    })
    const feed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://www.youtube.com/feeds/videos.xml?channel_id=UCtest${random}`,
      topic_id: topic.id,
      title: `YT Channel ${random}`,
    })
    // Force to 'article' so the YouTube-URL override triggers an update
    await updateRssFeedById(feed.id, { feed_type: 'article' })

    await reclassifyRssFeedTypeIfNeeded(
      feed.id,
      {
        url: `https://www.youtube.com/feeds/videos.xml?channel_id=UCtest${random}`,
        feed_type: 'article',
      },
      [{ media_type: 'article' }],
    )

    const updated = await getRssFeedById(feed.id)
    expect(updated!.feed_type).toBe('video')
  }, 30_000)

  it('filters out items with unknown or undefined media_type when classifying', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      name: `Filter Media ${random}`,
      slug: `filter-media-${random}`,
      hostname: `filter-media-${random}.example.com`,
    })
    const feed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/podcast-${random}.xml`,
      topic_id: topic.id,
      title: `Podcast Feed ${random}`,
    })

    // undefined media_type items are filtered (L23 return []); remaining audio items → 'podcast'
    await reclassifyRssFeedTypeIfNeeded(
      feed.id,
      { url: `https://example.com/podcast-${random}.xml`, feed_type: 'article' },
      [{ media_type: 'audio' }, { media_type: undefined }],
    )

    const updated = await getRssFeedById(feed.id)
    expect(updated!.feed_type).toBe('podcast')
  }, 30_000)

  it('does not update when the classified type matches the current feed_type', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      name: `No Update ${random}`,
      slug: `no-update-${random}`,
      hostname: `no-update-${random}.example.com`,
    })
    const feed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/feed-${random}.xml`,
      topic_id: topic.id,
      title: `Article Feed ${random}`,
    })

    // Article items classify to 'article', which matches the feed's current type
    await reclassifyRssFeedTypeIfNeeded(
      feed.id,
      { url: `https://example.com/feed-${random}.xml`, feed_type: 'article' },
      [{ media_type: 'article' }],
    )

    const unchanged = await getRssFeedById(feed.id)
    expect(unchanged!.feed_type).toBe('article')
  }, 30_000)
})
