import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { kagiSmallWebImportConfig } from './import-config.mts'
import { describe, it, expect } from 'vitest'
import { processFeedEntry } from './process-feed-entry.mts'
import { createHash } from 'node:crypto'
import { dispatchKagiSmallWeb, dispatchKagiSmallWebPage } from './sync.mts'
import {
  KAGI_SMALLWEB_PROCESS_FEED_JOB,
  type KagiFeedJobData,
} from '@queues/background/enqueues/kagi-smallweb-jobs'
import { kagiSmallWeb } from '@queues/kagi-smallweb/queues'
import { readAllQueueJobs } from '@voucha/test-helpers'
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

    overrideDynamicConfigFieldsForTest(kagiSmallWebImportConfig, { candidate_batch_size: 1 })
    const urls = await getExistingRssFeedUrls([
      `https://missing-${suffix}.example.com/feed`,
      feedUrl,
    ])
    expect(urls.size).toBe(1)
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

describe('dispatchKagiSmallWebPage', () => {
  it('enqueues bounded pages, continues from the last URL, and covers every new entry once', async () => {
    overrideDynamicConfigFieldsForTest(kagiSmallWebImportConfig, { candidate_batch_size: 2 })
    const suffix = randomSuffix()
    const entries: ParsedFeedEntry[] = ['e', 'b', 'd', 'a', 'c'].map(letter => ({
      feedUrl: `https://kagi-page-${suffix}-${letter}.example.com/feed.xml`,
      name: `Kagi Page ${suffix} ${letter}`,
      slug: `kagi-page-${suffix}-${letter}`,
      sourceType: 'web',
    }))
    const sorted = entries.toSorted((a, b) => (a.feedUrl < b.feedUrl ? -1 : 1))
    // One of the entries already exists, so its page enqueues one job fewer than its size.
    await processFeedEntry(sorted[1]!)
    const urls = new Set(sorted.map(entry => entry.feedUrl))
    const enqueuedUrls = async () =>
      (await readAllQueueJobs(kagiSmallWeb))
        .filter(job => job.name === KAGI_SMALLWEB_PROCESS_FEED_JOB.name)
        .map(job => (job.data as KagiFeedJobData).feedUrl)
        .filter(url => urls.has(url))
    const continuationId = (cursor: string) =>
      `kagi_smallweb_sync__${createHash('sha256').update(cursor).digest('hex')}`

    const first = await dispatchKagiSmallWebPage(entries)
    expect(first).toEqual({ enqueued: 1, total: 5, hasMore: true })
    expect(await enqueuedUrls()).toEqual([sorted[0]!.feedUrl])
    const firstContinuation = await kagiSmallWeb.getJob(continuationId(sorted[1]!.feedUrl))
    expect(firstContinuation?.data).toEqual({ cursor: sorted[1]!.feedUrl })

    const second = await dispatchKagiSmallWebPage(entries, sorted[1]!.feedUrl)
    expect(second).toEqual({ enqueued: 2, total: 3, hasMore: true })

    const last = await dispatchKagiSmallWebPage(entries, sorted[3]!.feedUrl)
    expect(last).toEqual({ enqueued: 1, total: 1 })

    expect((await enqueuedUrls()).toSorted()).toEqual(
      sorted.filter(entry => entry !== sorted[1]).map(entry => entry.feedUrl),
    )
    await firstContinuation?.remove()
    await (await kagiSmallWeb.getJob(continuationId(sorted[3]!.feedUrl)))?.remove()
  })
})
