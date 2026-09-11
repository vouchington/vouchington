import { it, expect, describe } from 'vitest'
import { buildBoundedRssFeedItemsFromFeed, buildRssFeedItemsFromFeed } from './clean.mts'
import {
  chunkArray,
  RSS_FEED_FETCH_MAX_ITEMS,
  RSS_FEED_ITEM_MAX_CATEGORIES,
} from '@services/rss-feed-items/processing-limits'
import {
  itemCategories,
  itemContentEncoded,
  itemGuid,
  itemLink,
} from '@services/rss-feed-items/clean-helpers'
import type { ParsedFeed } from './types.mts'

describe('buildBoundedRssFeedItemsFromFeed', () => {
  it('caps valid feed items and reports item truncation stats', () => {
    const feed: ParsedFeed = {
      items: Array.from({ length: RSS_FEED_FETCH_MAX_ITEMS + 3 }, (_, index) => ({
        link: `https://example.com/item-${index}`,
        guid: `guid-${index}`,
      })),
    }

    const result = buildBoundedRssFeedItemsFromFeed(feed)

    expect(result.items).toHaveLength(RSS_FEED_FETCH_MAX_ITEMS)
    expect(result.items[0].guid).toBe('guid-0')
    expect(result.items.at(-1)!.guid).toBe(`guid-${RSS_FEED_FETCH_MAX_ITEMS - 1}`)
    expect(result.stats).toMatchObject({
      totalParsedItems: RSS_FEED_FETCH_MAX_ITEMS + 3,
      validItemsBeforeCap: RSS_FEED_FETCH_MAX_ITEMS + 3,
      returnedItems: RSS_FEED_FETCH_MAX_ITEMS,
      itemCap: RSS_FEED_FETCH_MAX_ITEMS,
      itemTruncatedCount: 3,
    })
  })

  it('normalizes, dedupes, and caps item categories', () => {
    const duplicateCategory = 'Travel'
    const categories = [
      ` ${duplicateCategory} `,
      duplicateCategory.toLowerCase(),
      ...Array.from({ length: RSS_FEED_ITEM_MAX_CATEGORIES + 5 }, (_, index) => ({
        name: `Category ${index}`,
      })),
    ]
    const feed: ParsedFeed = {
      items: [
        {
          link: 'https://example.com/category-heavy',
          guid: 'category-heavy',
          categories,
        },
      ],
    }

    const result = buildBoundedRssFeedItemsFromFeed(feed)

    expect(result.items[0].categories).toHaveLength(RSS_FEED_ITEM_MAX_CATEGORIES)
    expect(result.items[0].categories![0]).toBe(duplicateCategory)
    expect(result.items[0].categories).not.toContain(duplicateCategory.toLowerCase())
    expect(result.stats.categoryTruncatedItemCount).toBe(1)
    expect(result.stats.categoryTruncatedCount).toBe(6)
  })

  it('keeps legacy item building unbounded without exporting infinite stats', () => {
    const feed: ParsedFeed = {
      items: [
        {
          link: 'https://example.com/legacy',
          guid: 'legacy-guid',
        },
      ],
    }

    const bounded = buildBoundedRssFeedItemsFromFeed(feed, undefined, {
      maxItems: Number.POSITIVE_INFINITY,
    })

    expect(buildRssFeedItemsFromFeed(feed)).toHaveLength(1)
    expect(bounded.stats.itemCap).toBe(1)
    expect(Number.isFinite(bounded.stats.itemCap)).toBe(true)
    expect(bounded.stats.itemTruncatedCount).toBe(0)
  })

  it('normalizes feed helper fallback fields', () => {
    expect(itemGuid({ guid: { value: ' guid-value ' } })).toBe('guid-value')
    expect(itemGuid({ id: ' fallback-id ' })).toBe('fallback-id')
    expect(itemLink({ url: ' https://example.com/url ' })).toBe(' https://example.com/url ')
    expect(itemLink({ links: [{ href: 'https://example.com/atom' }] })).toBe(
      'https://example.com/atom',
    )
    expect(itemLink({ links: [{}] })).toBeNull()
    expect(itemContentEncoded({ content: { encoded: 'encoded-content' } })).toBe('encoded-content')
    expect(
      itemCategories({
        categories: [{ name: ' Named ' }, 'Plain', { name: 1 }, ' '],
      }),
    ).toEqual([' Named ', 'Plain'])
  })

  it('rejects invalid chunk sizes', () => {
    expect(() => chunkArray([1], 0)).toThrow('chunk size must be a positive integer')
  })
})
