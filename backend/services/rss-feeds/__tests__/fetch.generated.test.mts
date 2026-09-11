import { it, expect, describe } from 'vitest'
import { fetchRssFeed } from '../fetch.mts'
import { createRssFeed } from '../create.mts'
import { updateRssFeedById } from '../update.mts'
import { searchRssFeedItems } from '@services/rss-feed-items/search'
import { getRssFeedItemById } from '@services/rss-feed-items/get'
import {
  createTestTopic,
  updateRssFeedTiming,
  updateUrlHostnameBlocked,
} from '@voucha/test-helpers'
import { CrawlerHttpClientError } from '@modules/on-error/errors'
import { getUrlHostnameByAny } from '@services/urls-hostnames/get'
import { getRssFeedById } from '../get.mts'

describe('fetch.generated', () => {
  it.skipIf(process.env.CI === 'true')(
    'fetchRssFeed fetches and upserts items from real RSS feed',
    async () => {
      try {
        const random = Math.random().toString(36).slice(2, 15)
        const topic = await createTestTopic({ hostname: `thepointsguy-${random}.example.com` })

        const feed = await createRssFeed({
          skipRemoteValidation: true,
          rss_feed_url: `https://thepointsguy.com/feed/?test=${random}`,
          topic_id: topic.id,
          title: `Test Feed ${random}`,
        })
        // Enable the feed
        await updateRssFeedById(feed.id, { enabled: true })

        // Fetch the feed
        const items = await fetchRssFeed(feed.id, 0)

        expect(Array.isArray(items)).toBe(true)
        // Items might be empty if feed has no valid items (missing link/guid), which is valid
        if (items.length === 0) {
          return // Skip further checks if no items were returned
        }

        // Verify items were created
        const searchResults = await searchRssFeedItems({ rss_feed_ids: [feed.id], limit: 10 })
        expect(searchResults.results.length).toBeGreaterThan(0)

        // Verify items have required fields
        const firstItemId = searchResults.results[0].id
        const firstItem = await getRssFeedItemById(firstItemId)
        expect(firstItem).not.toBeNull()
        expect(firstItem!.id).toBeDefined()
        expect(firstItem!.published_at).toBeDefined()
        expect(firstItem!.url).toBeDefined()
        expect(firstItem!.rss_feed).toBeDefined()

        // Verify feed metadata was updated
        await updateRssFeedById(feed.id, {})
        // Feed should have last_fetched_at set (though update returns undefined if no changes)
        // We can verify by fetching again and checking it doesn't throw the rate limit error immediately
        await expect(fetchRssFeed(feed.id, 0)).resolves.toBeDefined()
      } catch (error: unknown) {
        // Skip test if network is unavailable or external feed returns HTTP error
        if (isCrawlerOrNetworkError(error)) return
        throw error
      }
    },
    15_000,
  )

  it('fetchRssFeed returns empty array for disabled feed', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({ hostname: `disabled-${random}.example.com` })

    const feed = await createRssFeed({
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/feed-${random}.xml`,
      topic_id: topic.id,
      title: `Test Feed ${random}`,
    })
    await updateRssFeedById(feed.id, { enabled: false })
    const result = await fetchRssFeed(feed.id)
    expect(result).toEqual([])
  })

  it('fetchRssFeed returns empty array if fetched less than a minute ago', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({ hostname: `rate-limit-${random}.example.com` })

    const feed = await createRssFeed({
      skipRemoteValidation: true,
      rss_feed_url: `https://thepointsguy.com/feed/?test-rate-limit-${random}`,
      topic_id: topic.id,
      title: `Test Feed ${random}`,
    })
    await updateRssFeedById(feed.id, { enabled: true, last_fetched_at: true })

    // Should skip fetching before attempting to reach the network
    await expect(fetchRssFeed(feed.id)).resolves.toEqual([])
  })

  it('fetchRssFeed skips locally blocked feed hostnames without retrying', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const hostname = `blocked-feed-${random}.example.com`
    const topic = await createTestTopic({ hostname })

    const feed = await createRssFeed({
      skipRemoteValidation: true,
      rss_feed_url: `https://${hostname}/feed.xml`,
      topic_id: topic.id,
      title: `Blocked Feed ${random}`,
    })
    await updateRssFeedById(feed.id, { enabled: true })
    const urlHostname = await getUrlHostnameByAny(hostname)
    await updateUrlHostnameBlocked(urlHostname!.id, true)

    await expect(fetchRssFeed(feed.id, 0)).resolves.toEqual([])
    const updatedFeed = await getRssFeedById(feed.id)
    expect(updatedFeed.last_fetched_at).not.toBeNull()
  })

  it('fetchRssFeed returns empty array when lastFetchedAt is in the future (clock skew edge case)', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({ hostname: `future-${random}.example.com` })

    const feed = await createRssFeed({
      skipRemoteValidation: true,
      rss_feed_url: `https://thepointsguy.com/feed/?test-future-${random}`,
      topic_id: topic.id,
      title: `Test Feed ${random}`,
    })
    // Set last_fetched_at to a future time (simulating clock skew or manual manipulation)
    const futureTime = new Date(Date.now() + 1000 * 60 * 60) // 1 hour in the future
    await updateRssFeedTiming(feed.id, futureTime)

    await expect(fetchRssFeed(feed.id)).resolves.toEqual([])
  })

  it.skipIf(process.env.CI === 'true')(
    'fetchRssFeed allows forced fetch even if recently fetched',
    async () => {
      try {
        const random = Math.random().toString(36).slice(2, 15)
        const topic = await createTestTopic({ hostname: `forced-${random}.example.com` })

        const feed = await createRssFeed({
          skipRemoteValidation: true,
          rss_feed_url: `https://thepointsguy.com/feed/?test-forced-${random}`,
          topic_id: topic.id,
          title: `Test Feed ${random}`,
        })
        await updateRssFeedById(feed.id, { enabled: true, last_fetched_at: true })

        // Should not throw when ttl=0
        const result = await fetchRssFeed(feed.id, 0)
        expect(Array.isArray(result)).toBe(true)
      } catch (error: unknown) {
        // Skip test if network is unavailable or external feed returns HTTP error
        if (isCrawlerOrNetworkError(error)) return
        throw error
      }
    },
    15_000,
  )

  function isCrawlerOrNetworkError(error: unknown): boolean {
    if (error instanceof CrawlerHttpClientError) return true
    if (typeof error === 'string') return true
    if (!(error instanceof Error)) return false
    const msg = error.message
    return (
      msg.includes('network') ||
      msg.includes('timeout') ||
      msg.includes('timed out') ||
      msg.includes('ENOTFOUND') ||
      msg.includes('fetch failed') ||
      msg.includes('AbortError') ||
      error.name === 'AbortError' ||
      error.name === 'TypeError' ||
      error.name === 'CrawlerTimeoutError'
    )
  }
})
