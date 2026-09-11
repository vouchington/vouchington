import { describe, expect, it } from 'vitest'
import { upsertRssFeedItems } from '@services/rss-feed-items'
import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'
import { rssFeedNeedsChapterMetadataBackfill } from '../chapters-backfill.mts'

describe('rssFeedNeedsChapterMetadataBackfill', () => {
  it('only asks for backfill when parsed chapter metadata is missing or changed', async () => {
    const feed = await createTestRssFeed({})
    const random = Math.random().toString(36).slice(2, 15)
    const guid = `chapters-backfill-${random}`
    const item = {
      link: `https://example.com/episode-${random}`,
      guid,
      title: `Episode ${random}`,
      chapters_url: `https://cdn.example.com/episode-${random}.chapters.json`,
      chapters_type: 'application/json+chapters',
    }

    await expect(rssFeedNeedsChapterMetadataBackfill(feed.id, [item])).resolves.toBe(true)

    await upsertRssFeedItems(feed.id, [item])

    await expect(rssFeedNeedsChapterMetadataBackfill(feed.id, [item])).resolves.toBe(false)
    await expect(
      rssFeedNeedsChapterMetadataBackfill(feed.id, [
        { ...item, chapters_url: `https://cdn.example.com/episode-${random}-v2.chapters.json` },
      ]),
    ).resolves.toBe(true)
  })
})
