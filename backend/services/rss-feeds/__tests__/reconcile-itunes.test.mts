import { it, expect, describe } from 'vitest'
import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'
import { persistFeedMetadataAndReconcileLanguage } from '../reconcile-item-language.mts'
import { getPodcastShow } from '../podcast-show.mts'
import { getRssFeedCategories } from '../categories.mts'

describe('persistFeedMetadataAndReconcileLanguage (integration)', () => {
  it('upserts podcast show metadata and categories when itunes data is present', async () => {
    const feed = await createTestRssFeed({})
    const parsedFeed: Record<string, unknown> = {
      itunes: {
        author: 'NPR',
        owner: { name: 'NPR Podcasts', email: 'podcasts@npr.org' },
        image: { href: 'https://example.com/cover.jpg' },
        explicit: 'no',
        type: 'episodic',
        categories: [{ text: 'Business' }, { text: 'News' }],
      },
    }

    // oldTitle=null with no title in parsedFeed → no title update; null language unchanged → no language update
    await persistFeedMetadataAndReconcileLanguage(feed.id, parsedFeed, null, null)

    const show = await getPodcastShow(feed.id)
    expect(show).not.toBeNull()
    expect(show?.itunes_author).toBe('NPR')
    expect(show?.itunes_owner_name).toBe('NPR Podcasts')
    expect(show?.cover_art_url).toBe('https://example.com/cover.jpg')
    expect(show?.is_explicit).toBe(false)

    const categories = await getRssFeedCategories(feed.id)
    const texts = categories.map(c => c.category_text)
    expect(texts).toContain('business')
    expect(texts).toContain('news')
  }, 30_000)

  it('skips podcast show upsert when itunes data is absent', async () => {
    const feed = await createTestRssFeed({})

    await persistFeedMetadataAndReconcileLanguage(feed.id, {}, null, null)

    const show = await getPodcastShow(feed.id)
    expect(show).toBeNull()
    const categories = await getRssFeedCategories(feed.id)
    expect(categories).toHaveLength(0)
  }, 30_000)
})
