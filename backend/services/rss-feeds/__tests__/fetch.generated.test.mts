import { it, expect, describe } from 'vitest'
import { fetchRssFeed } from '../fetch.mts'
import { createRssFeed } from '../create.mts'
import { updateRssFeedById } from '../update.mts'
import {
  createTestTopic,
  getRssFeedDeletedAt,
  updateRssFeedTiming,
  updateUrlHostnameBlocked,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { CrawlerHttpClientError } from '@modules/on-error/errors'
import { getUrlHostnameByAny } from '@services/urls-hostnames/get'
import { getRssFeedById } from '../get.mts'

describe('fetch.generated', () => {
  it('fetchRssFeed soft-deletes the feed when example.com returns HTTP 404', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({ hostname: `rss-404-${random}.example.com` })
    const feed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/feed.xml?test=${random}`,
      topic_id: topic.id,
      title: `Test Feed ${random}`,
    })
    await updateRssFeedById(feed.id, { is_enabled: true })

    let caught: unknown
    try {
      await fetchRssFeed(feed.id, 0)
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(CrawlerHttpClientError)
    expect(caught).toMatchObject({ status: 404 })
    expect(await getRssFeedDeletedAt(feed.id)).toBeInstanceOf(Date)
  })

  it('fetchRssFeed returns empty array for disabled feed', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({ hostname: `disabled-${random}.example.com` })

    const feed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/feed-${random}.xml`,
      topic_id: topic.id,
      title: `Test Feed ${random}`,
    })
    await updateRssFeedById(feed.id, { is_enabled: false })
    const result = await fetchRssFeed(feed.id)
    expect(result).toEqual([])
  })

  it('fetchRssFeed returns empty array if fetched less than a minute ago', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({ hostname: `rate-limit-${random}.example.com` })

    const feed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://example.net/feed/?test-rate-limit-${random}`,
      topic_id: topic.id,
      title: `Test Feed ${random}`,
    })
    await updateRssFeedById(feed.id, { is_enabled: true, last_fetched_at: true })

    // Should skip fetching before attempting to reach the network
    await expect(fetchRssFeed(feed.id)).resolves.toEqual([])
  })

  it('fetchRssFeed skips locally blocked feed hostnames without retrying', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const hostname = `blocked-feed-${random}.example.com`
    const topic = await createTestTopic({ hostname })

    const feed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://${hostname}/feed.xml`,
      topic_id: topic.id,
      title: `Blocked Feed ${random}`,
    })
    await updateRssFeedById(feed.id, { is_enabled: true })
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
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://example.org/feed/?test-future-${random}`,
      topic_id: topic.id,
      title: `Test Feed ${random}`,
    })
    // Set last_fetched_at to a future time (simulating clock skew or manual manipulation)
    const futureTime = new Date(Date.now() + 1000 * 60 * 60) // 1 hour in the future
    await updateRssFeedTiming(feed.id, futureTime)

    await expect(fetchRssFeed(feed.id)).resolves.toEqual([])
  })

  it('fetchRssFeed still requests example.net when a forced fetch bypasses the recent-fetch skip', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({ hostname: `forced-${random}.example.com` })
    const feed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://example.net/feed.xml?test-forced-${random}`,
      topic_id: topic.id,
      title: `Test Feed ${random}`,
    })
    await updateRssFeedById(feed.id, { is_enabled: true, last_fetched_at: true })

    let caught: unknown
    try {
      await fetchRssFeed(feed.id, 0)
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(CrawlerHttpClientError)
    expect(caught).toMatchObject({ status: 404 })
    expect(await getRssFeedDeletedAt(feed.id)).toBeInstanceOf(Date)
  })
})
