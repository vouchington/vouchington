import { describe, it, expect } from 'vitest'
import { processFeedEntry } from './process-feed-entry.mts'
import { dispatchKagiSmallWeb } from './sync.mts'
import { getExistingRssFeedUrls } from './get-existing-feed-urls.mts'
import { getTopicByAny } from '@services/topics/get'
import { getRssFeedByTopicId } from '@services/rss-feeds/get'
import type { ParsedFeedEntry } from './parse.mts'

const randomSuffix = () => Math.random().toString(36).slice(2, 10)

describe('processFeedEntry', () => {
  it('creates topic, hostname link, and RSS feed for a web entry', async () => {
    const suffix = randomSuffix()
    const hostname = `kagi-test-${suffix}.example.com`
    const entry: ParsedFeedEntry = {
      feedUrl: `https://${hostname}/feed.xml`,
      name: hostname,
      slug: `kagi-test-${suffix}-example-com`,
      sourceType: 'web',
    }

    const result = await processFeedEntry(entry)

    expect(result.created).toBe(true)
    expect(result.topicId).not.toBeNull()
    const topic = await getTopicByAny(result.topicId!)
    expect(topic).not.toBeNull()
    expect(topic!.name).toBe(hostname)
    expect(topic!.topic_type).toBe('rss_feed')
    expect(topic!.hostname_id).not.toBeNull()

    const feed = await getRssFeedByTopicId(result.topicId!)
    expect(feed).not.toBeNull()
    expect(feed!.title).toBe(hostname)
  })

  it('creates topic with per-channel hostname for YouTube entries', async () => {
    const suffix = randomSuffix()
    const channelId = `UC_kagi_test_${suffix}`
    const entry: ParsedFeedEntry = {
      feedUrl: `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
      name: `Test Channel ${suffix}`,
      slug: `test-channel-${suffix}-${channelId.toLowerCase().replace(/[^a-z0-9-]/g, '')}`,
      sourceType: 'youtube',
    }

    const result = await processFeedEntry(entry)

    expect(result.created).toBe(true)
    expect(result.topicId).not.toBeNull()
    const topic = await getTopicByAny(result.topicId!)
    expect(topic).not.toBeNull()
    expect(topic!.name).toBe(`Test Channel ${suffix}`)
    expect(topic!.topic_type).toBe('rss_feed')
    expect(topic!.hostname_id).not.toBeNull()

    const feed = await getRssFeedByTopicId(result.topicId!)
    expect(feed).not.toBeNull()
  })

  it('is idempotent — returns created=false if feed already exists', async () => {
    const suffix = randomSuffix()
    const hostname = `kagi-idempotent-${suffix}.example.com`
    const entry: ParsedFeedEntry = {
      feedUrl: `https://${hostname}/feed.xml`,
      name: hostname,
      slug: `kagi-idempotent-${suffix}-example-com`,
      sourceType: 'web',
    }

    const result1 = await processFeedEntry(entry)
    const result2 = await processFeedEntry(entry)

    expect(result1.topicId).toBe(result2.topicId)
    expect(result1.created).toBe(true)
    expect(result2.created).toBe(false)
  })
})

describe('getExistingRssFeedUrls', () => {
  it('returns a set of existing feed URLs', async () => {
    const suffix = randomSuffix()
    const hostname = `kagi-existing-${suffix}.example.com`
    const feedUrl = `https://${hostname}/feed.xml`

    const entry: ParsedFeedEntry = {
      feedUrl,
      name: hostname,
      slug: `kagi-existing-${suffix}-example-com`,
      sourceType: 'web',
    }
    await processFeedEntry(entry)

    const urls = await getExistingRssFeedUrls()
    expect(urls.has(feedUrl)).toBe(true)
  })
})

describe('dispatchKagiSmallWeb', () => {
  it('returns disabled when kagi import is not enabled', async () => {
    const result = await dispatchKagiSmallWeb()
    expect(result.disabled).toBe(true)
    expect(result.enqueued).toBe(0)
  })
})
