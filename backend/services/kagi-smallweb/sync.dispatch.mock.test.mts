import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { kagiSmallWebImportConfig } from './import-config.mts'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { numberedLine } from './feed-list-lines.mts'
import { sortAndDiff } from './feed-list-sort.mts'
import { createFeedListDirectory, removeFeedListDirectory } from './feed-list-temp-file.mts'
import { processFeedEntry } from './process-feed-entry.mts'
import { dispatchKagiSmallWeb } from './sync.mts'
import { FEED_LIST_SOURCES } from './sources.mts'
import {
  KAGI_SMALLWEB_PROCESS_FEED_JOB,
  type KagiFeedJobData,
} from '@queues/background/enqueues/kagi-smallweb-jobs'
import { kagiSmallWeb } from '@queues/kagi-smallweb/queues'
import { observeTestPostgresClientQueries, readAllQueueJobs } from '@voucha/test-helpers'
import { getTopicByAny } from '@services/topics/get'
import { getRssFeedByTopicId } from '@services/rss-feeds/get'
import { findExistingFeedByUrl } from '@services/rss-feeds/find-existing-feed'
import type { ParsedFeedEntry } from './parse.mts'

const fetchSpy = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock<typeof import('undici')>(import('undici'), async () => {
  const actual = await vi.importActual<typeof import('undici')>('undici')
  return { ...actual, fetch: fetchSpy }
})

const feedListBodies = new Map<string, string>()

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

describe('dispatchKagiSmallWeb', () => {
  it('returns disabled when kagi import is not enabled', async () => {
    const result = await dispatchKagiSmallWeb()
    expect(result.disabled).toBe(true)
    expect(result.enqueued).toBe(0)
  })
})

describe('dispatchKagiSmallWeb owned feed lists', () => {
  beforeEach(() => {
    feedListBodies.clear()
    for (const source of FEED_LIST_SOURCES) feedListBodies.set(source.url, '')
    fetchSpy.mockReset()
    fetchSpy.mockImplementation(async (url: string) => {
      const body = feedListBodies.get(url)
      if (body === undefined) throw new Error(`Unexpected Kagi list request: ${url}`)
      return new Response(body)
    })
    overrideDynamicConfigFieldsForTest(kagiSmallWebImportConfig, { enabled: true })
  })
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
    feedListBodies.set(FEED_LIST_SOURCES[0]!.url, entries.map(entry => entry.feedUrl).join('\n'))
    // This owned predecessor sorts before a–e, including the already-present control.
    const first = await dispatchKagiSmallWeb(`https://kagi-page-${suffix}-0.example.com/feed.xml`)
    try {
      expect(first).toMatchObject({
        enqueued: 1,
        total: 5,
        hasMore: true,
        nextCursor: sorted[1]!.feedUrl,
      })
      expect(await enqueuedUrls()).toEqual([sorted[0]!.feedUrl])
      if (!first.feedListDir) throw new Error('Expected the owned feed-list directory')
      const second = await dispatchKagiSmallWeb(sorted[1]!.feedUrl, undefined, first.feedListDir)
      expect(second).toMatchObject({
        enqueued: 2,
        total: 3,
        hasMore: true,
        nextCursor: sorted[3]!.feedUrl,
      })

      const last = await dispatchKagiSmallWeb(sorted[3]!.feedUrl, undefined, first.feedListDir)
      expect(last).toEqual({ enqueued: 1, total: 1 })

      expect((await enqueuedUrls()).toSorted()).toEqual(
        sorted.filter(entry => entry !== sorted[1]).map(entry => entry.feedUrl),
      )
    } finally {
      if (first.feedListDir) await removeFeedListDirectory(first.feedListDir)
    }
  })

  it('keeps the later entry when a URL is listed twice', async () => {
    const suffix = randomSuffix()
    const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=UCkagilast${suffix}`
    const later: ParsedFeedEntry = {
      feedUrl,
      name: 'Later name',
      slug: `later-name-uckagilast${suffix}`,
      sourceType: 'youtube',
    }
    feedListBodies.set(
      FEED_LIST_SOURCES[2]!.url,
      `${feedUrl} # Earlier name\n${feedUrl} # Later name`,
    )
    const result = await dispatchKagiSmallWeb(`https://kagi-last-${suffix}.example.com/feed.xml`)
    expect(result).toEqual({ enqueued: 1, total: 1 })
    const jobs = (await readAllQueueJobs(kagiSmallWeb))
      .filter(job => job.name === KAGI_SMALLWEB_PROCESS_FEED_JOB.name)
      .map(job => job.data as KagiFeedJobData)
      .filter(data => data.feedUrl === feedUrl)
    expect(jobs).toEqual([later])
  })

  it('does not enqueue a second job when the same page is replayed', async () => {
    const suffix = randomSuffix()
    const entry: ParsedFeedEntry = {
      feedUrl: `https://kagi-replay-${suffix}.example.com/feed.xml`,
      name: `Kagi Replay ${suffix}`,
      slug: `kagi-replay-${suffix}`,
      sourceType: 'web',
    }
    feedListBodies.set(FEED_LIST_SOURCES[0]!.url, entry.feedUrl)
    const cursor = `https://kagi-replay-${suffix}.example.com/`
    await dispatchKagiSmallWeb(cursor)
    await dispatchKagiSmallWeb(cursor)
    const jobs = (await readAllQueueJobs(kagiSmallWeb)).filter(
      job =>
        job.name === KAGI_SMALLWEB_PROCESS_FEED_JOB.name &&
        (job.data as KagiFeedJobData).feedUrl === entry.feedUrl,
    )
    expect(jobs).toHaveLength(1)
  })

  it('copies current feed URLs from the reader', async () => {
    const observed = await observeTestPostgresClientQueries(() =>
      dispatchKagiSmallWeb(`https://kagi-reader-${randomSuffix()}.example.com/feed.xml`),
    )
    const membership = observed.queries.filter(query => query.text.includes('copyExistingFeedUrls'))
    expect(membership.map(query => query.pool)).toEqual(['read'])
  })

  it('discards the reader connection when the membership file cannot be written', async () => {
    const directory = await createFeedListDirectory()
    try {
      const numbered = join(directory, 'numbered')
      await writeFile(
        numbered,
        numberedLine(
          {
            feedUrl: 'https://kagi-fail.example.com/feed.xml',
            name: 'Failing feed',
            slug: 'kagi-fail',
            sourceType: 'web',
          },
          1,
        ),
      )
      // A directory at the membership path makes the file write fail after the COPY starts.
      await mkdir(join(directory, 'membership'))
      await expect(sortAndDiff(numbered, directory)).rejects.toMatchObject({ code: 'EISDIR' })
      // The reader pool still serves the next membership COPY.
      await rm(join(directory, 'membership'), { recursive: true })
      await expect(sortAndDiff(numbered, directory)).resolves.toBeUndefined()
    } finally {
      await removeFeedListDirectory(directory)
    }
  })

  it('distinguishes a new URL from an existing URL with one fewer query backslash', async () => {
    const suffix = randomUUID()
    const prefix = `https://kagi-copy-${suffix}.example.com/feed.xml?q=`
    const existing: ParsedFeedEntry = {
      feedUrl: `${prefix}\\a`,
      name: `Existing backslash feed ${suffix}`,
      slug: `kagi-copy-${suffix}-existing`,
      sourceType: 'web',
    }
    const candidate: ParsedFeedEntry = {
      ...existing,
      feedUrl: `${prefix}\\\\a`,
      name: `New backslash feed ${suffix}`,
      slug: `kagi-copy-${suffix}-candidate`,
    }
    const seeded = await processFeedEntry(existing)
    const persisted = await findExistingFeedByUrl(existing.feedUrl)
    expect({ seeded, persisted }).toMatchObject({
      seeded: { created: true, topicId: expect.any(String) },
      persisted: { resolved_feed_url: existing.feedUrl, topic_id: seeded.topicId },
    })

    feedListBodies.set(FEED_LIST_SOURCES[0]!.url, `${existing.feedUrl}\n${candidate.feedUrl}`)
    const result = await dispatchKagiSmallWeb(`https://kagi-copy-${suffix}.example.com/feed.xml`)
    expect(result).toEqual({ enqueued: 1, total: 2 })
    const urls = new Set([existing.feedUrl, candidate.feedUrl])
    const jobs = (await readAllQueueJobs(kagiSmallWeb))
      .filter(job => job.name === KAGI_SMALLWEB_PROCESS_FEED_JOB.name)
      .map(job => (job.data as KagiFeedJobData).feedUrl)
      .filter(url => urls.has(url))
    expect(jobs).toEqual([candidate.feedUrl])
  })
})
