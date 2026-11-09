import { insertHackerNewsRelatedUrlsForTest } from '@voucha/test-helpers/hacker-news-related-urls'
import { hasHackerNewsLookupForTest } from '@voucha/test-helpers/hacker-news-references'
import { upsertRssFeedItems } from '@services/rss-feed-items/upsert'
import { insertTestUrlDirect } from '@voucha/test-helpers/entities/urls'
import { randomUUID } from 'node:crypto'
import { beforeAll, afterAll, describe, expect, it, onTestFinished, vi } from 'vitest'
import type { Job, Worker } from 'glide-mq'
import {
  createTestPost,
  createTestUrlWithHostname,
  createTestUser,
  insertHackerNewsReferencesForTest,
  insertTestRssFeedDirect,
} from '@voucha/test-helpers'
import {
  getPostHackerNewsFlagStateForTest,
  getRssHackerNewsFlagStateForTest,
} from '@voucha/test-helpers/hacker-news-flag-state'
import {
  ageHackerNewsUrlForTest,
  corruptRssHackerNewsFlagForTest,
  expireHackerNewsUrlForTest,
  restoreHackerNewsUrlAgeForTest,
} from '@voucha/test-helpers/hacker-news-flag-repair'
import { waitForRealGlideEvent } from '@voucha/test-helpers/real-glide-terminal-deadline'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  hackerNewsFlagsConfig,
  FLAG_JOB,
  REPAIR_JOB,
  getHackerNewsFlagsOrdering,
} from '@queues/hacker-news-flags/config'
import { hackerNewsFlagsQueue } from '@queues/hacker-news-flags/queues'
import { hackerNewsQueueConfig } from '@queues/hacker-news/config'
import { hackerNewsVisibilityConfig } from '@services/urls/hacker-news-visibility-config'
import { replaceHackerNewsReferences } from '@services/urls/hacker-news-references-write'
import { setCanonicalUrl } from '@services/urls/set-canonical'
import { createHackerNewsFlagsWorker } from './workers.mts'
let hackerNewsFlags: Worker

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async original => original())

describe('Hacker News flag queue', () => {
  beforeAll(async () => {
    hackerNewsFlags = await createHackerNewsFlagsWorker({ promotionInterval: 1 })
  })

  afterAll(async () => {
    await hackerNewsFlags.close(true)
    await hackerNewsFlagsQueue.close()
  })
  it('fans out first and last references with both owner switches off', async () => {
    await Promise.all([
      hackerNewsFlagsConfig.waitForInitialization(),
      hackerNewsQueueConfig.waitForInitialization(),
      hackerNewsVisibilityConfig.waitForInitialization(),
    ])
    onTestFinished(overrideDynamicConfigFieldsForTest(hackerNewsFlagsConfig, { batch_size: 1 }))
    onTestFinished(
      overrideDynamicConfigFieldsForTest(hackerNewsQueueConfig, { lookups_enabled: false }),
    )
    onTestFinished(
      overrideDynamicConfigFieldsForTest(hackerNewsVisibilityConfig, { references_visible: false }),
    )
    const user = await createTestUser()
    const urlId = await createTestUrlWithHostname()
    const posts = await Promise.all([
      createTestPost({ user, post_type: 'link', url_id: urlId }),
      createTestPost({ user, post_type: 'link', url_id: urlId }),
    ])
    const related = await createTestPost({ user })
    await insertHackerNewsRelatedUrlsForTest(related.id, user.id, [{ urlId, up: 1 }])
    posts.push(related)
    const feed = await insertTestRssFeedDirect({})
    const rssLink = `https://hn-flag-${randomUUID()}.example.com/story`
    const rssUrl = await insertTestUrlDirect(null, rssLink)
    if (!rssUrl) throw new Error('Expected RSS URL')
    const [item] = await upsertRssFeedItems(feed.id, [
      { guid: randomUUID(), link: rssLink, title: 'HN' },
    ])
    if (!item) throw new Error('Expected RSS item')
    for (const count of [1, 0]) {
      const done = completedUrl(urlId)
      await replaceHackerNewsReferences([
        { urlId, storyCount: count, commentCount: 0, stories: [], comments: [] },
      ])
      await done
      const rssDone = completedUrl(rssUrl.id)
      await replaceHackerNewsReferences([
        { urlId: rssUrl.id, storyCount: count, commentCount: 0, stories: [], comments: [] },
      ])
      await rssDone
      expect(await getRssHackerNewsFlagStateForTest(item.id)).toEqual({
        stored: count > 0,
        expected: count > 0,
      })
      expect(
        await Promise.all(posts.map(post => getPostHackerNewsFlagStateForTest(post.id))),
      ).toEqual(posts.map(() => ({ stored: count > 0, expected: count > 0 })))
    }
  })
  it('propagates canonical changes to both URL groups', async () => {
    await hackerNewsQueueConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(hackerNewsQueueConfig, { lookups_enabled: false }),
    )
    const user = await createTestUser()
    const [source, target] = await Promise.all([
      createTestUrlWithHostname(),
      createTestUrlWithHostname(),
    ])
    const post = await createTestPost({ user, post_type: 'link', url_id: source })
    const alias = await createTestUrlWithHostname()
    await setCanonicalUrl(alias, source)
    const aliasedPost = await createTestPost({ user, post_type: 'link', url_id: alias })
    await insertHackerNewsReferencesForTest({ url_id: target, story_count: 1, comment_count: 0 })
    const done = completedUrl(target)
    await setCanonicalUrl(source, target)
    await done
    expect(
      await Promise.all([post, aliasedPost].map(row => getPostHackerNewsFlagStateForTest(row.id))),
    ).toEqual([
      { stored: true, expected: true },
      { stored: true, expected: true },
    ])
  })
  it('clears flags when retention removes the last references', async () => {
    const user = await createTestUser()
    const urlId = await createTestUrlWithHostname()
    const post = await createTestPost({ user, post_type: 'link', url_id: urlId })
    const first = completedUrl(urlId)
    await replaceHackerNewsReferences([
      { urlId, storyCount: 1, commentCount: 0, stories: [], comments: [] },
    ])
    await first
    expect(await getPostHackerNewsFlagStateForTest(post.id)).toEqual({
      stored: true,
      expected: true,
    })
    const outside = await createTestUrlWithHostname()
    await insertHackerNewsReferencesForTest({ url_id: outside, story_count: 1, comment_count: 0 })
    await ageHackerNewsUrlForTest(outside)
    onTestFinished(async () => restoreHackerNewsUrlAgeForTest(outside))
    const expired = completedUrl(urlId)
    await expireHackerNewsUrlForTest(urlId)
    await expired
    expect(await hasHackerNewsLookupForTest(outside)).toBe(true)
    expect(await getPostHackerNewsFlagStateForTest(post.id)).toEqual({
      stored: false,
      expected: false,
    })
  })
  it('repairs an owned RSS flag through the real retained repair job', async () => {
    await Promise.all([
      hackerNewsQueueConfig.waitForInitialization(),
      hackerNewsVisibilityConfig.waitForInitialization(),
    ])
    onTestFinished(
      overrideDynamicConfigFieldsForTest(hackerNewsQueueConfig, { lookups_enabled: false }),
    )
    onTestFinished(
      overrideDynamicConfigFieldsForTest(hackerNewsVisibilityConfig, { references_visible: false }),
    )
    const feed = await insertTestRssFeedDirect({})
    const link = `https://hn-repair-${randomUUID()}.example.com/story`
    const url = await insertTestUrlDirect(null, link)
    if (!url) throw new Error('Expected RSS URL')
    await insertHackerNewsReferencesForTest({ url_id: url.id, story_count: 1, comment_count: 0 })
    const [item] = await upsertRssFeedItems(feed.id, [{ guid: randomUUID(), link, title: 'HN' }])
    if (!item) throw new Error('Expected RSS item')
    await corruptRssHackerNewsFlagForTest(item.id)
    // The immediate predecessor scopes this real keyset page to the single owned UUID.
    const hex = (BigInt(`0x${item.id.replaceAll('-', '')}`) - 1n).toString(16).padStart(32, '0')
    const afterId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
    const id = `hn-repair-test__${randomUUID()}`
    const done = completion(job => job.id === id)
    await hackerNewsFlagsQueue.add(
      REPAIR_JOB,
      { kind: 'repair', phase: 'rss', afterId, upperId: item.id },
      { jobId: id, ordering: getHackerNewsFlagsOrdering('repair'), removeOnComplete: true },
    )
    await done
    expect(await getRssHackerNewsFlagStateForTest(item.id)).toEqual({
      stored: true,
      expected: true,
    })
  })
})
function completedUrl(urlId: string): Promise<void> {
  return completion(
    job => job.name === FLAG_JOB && job.data.kind === 'url' && job.id.includes(urlId),
  )
}
function completion(matches: (job: Job) => boolean): Promise<void> {
  const pending = Promise.withResolvers<void>()
  const complete = (job: Job) => {
    if (matches(job)) pending.resolve()
  }
  const fail = (job: Job | undefined, error: Error) => {
    if (job && matches(job)) pending.reject(error)
  }
  hackerNewsFlags.on('completed', complete)
  hackerNewsFlags.on('failed', fail)
  return waitForRealGlideEvent(pending.promise, 'Hacker News flag upkeep completion').finally(
    () => {
      hackerNewsFlags.off('completed', complete)
      hackerNewsFlags.off('failed', fail)
    },
  )
}
