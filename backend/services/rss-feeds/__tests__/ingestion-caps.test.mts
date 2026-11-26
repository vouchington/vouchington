import { describe, expect, it, onTestFinished } from 'vitest'
import { buildBoundedRssFeedItemsFromFeed } from '@services/crawler-rss/clean'
import { normalizePodcastChapters } from '@services/rss-feed-items/chapters-normalize'
import { rssFeedItemIngestionConfig } from '@services/rss-feed-items/processing-limits'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { extractFeedCategories } from '../podcast-extractors.mts'
import { rssFeedsWorkConfig } from '../work-limits.mts'

describe('RSS ingestion limits', () => {
  it('admits only the first valid item at a lower configured fetch limit', async () => {
    await rssFeedItemIngestionConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(rssFeedItemIngestionConfig, { fetch_max_items: 1 }),
    )

    const result = buildBoundedRssFeedItemsFromFeed({
      items: [{ link: 'https://example.com/first' }, { link: 'https://example.com/second' }],
    })

    expect(result.items.map(item => item.guid)).toEqual(['https://example.com/first'])
    expect(result.stats).toMatchObject({ itemCap: 1, itemTruncatedCount: 1 })
  })

  it('reports dropped distinct categories at a lower configured category limit', async () => {
    await rssFeedItemIngestionConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(rssFeedItemIngestionConfig, { item_max_categories: 1 }),
    )

    const result = buildBoundedRssFeedItemsFromFeed({
      items: [{ link: 'https://example.com/article', categories: [' Travel ', 'travel', 'Food'] }],
    })

    expect(result.items[0]?.categories).toEqual(['Travel'])
    expect(result.stats).toMatchObject({ categoryCap: 1, categoryTruncatedCount: 1 })
  })

  it('returns the earliest chapters and keeps the next chapter as an end boundary', async () => {
    await rssFeedItemIngestionConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(rssFeedItemIngestionConfig, {
        podcast_chapters_max_count: 1,
      }),
    )

    const chapters = normalizePodcastChapters([
      { startTime: 10, title: 'Second' },
      { startTime: 0, title: 'First' },
    ])

    expect(chapters).toMatchObject([{ title: 'First', start_seconds: 0, end_seconds: 10 }])
  })

  it('caps the distinct categories extracted from nested podcast metadata', async () => {
    await rssFeedsWorkConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(rssFeedsWorkConfig, { podcast_max_categories: 2 }),
    )

    expect(
      extractFeedCategories({
        itunes: {
          categories: [
            { text: 'News', categories: [{ text: 'News' }, { text: 'Tech' }] },
            { text: 'Sports' },
          ],
        },
      }),
    ).toEqual(['news', 'tech'])
  })
})
