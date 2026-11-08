import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestTopic,
  insertTestRssFeedDirect,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers'
import { executeTestPublicationChain } from '@voucha/test-helpers/publication-effect-chain'
import { rssFeedMaintenance } from '@queues/rss-feed-maintenance/queues'
import { hashCapturedPublicationKeys } from '@services/post-publication/captured-keys'
import { caches } from '@services/entity-cache/caches'
import { postPublicationWorkConfig } from '@services/post-publication/work-limits'
import type { PostPublicationEffectsJobData } from '@voucha/types/post-publication'
import { processApplyPostPublicationEffects } from './direct-effects.mts'

describe('topic feed continuation', () => {
  it('evaluates each page of a supplied topic set and preserves its cursor', async () => {
    await postPublicationWorkConfig.waitForInitialization()
    const restore = overrideDynamicConfigFieldsForTest(postPublicationWorkConfig, {
      capture_batch_size: 1,
    })
    onTestFinished(restore)
    const topics = await Promise.all(
      Array.from({ length: 3 }, () =>
        createTestTopic({ hostname: `topic-chain-${crypto.randomUUID()}.example.com` }),
      ),
    )
    const feeds = await Promise.all(
      topics.map(topic => insertTestRssFeedDirect({ topicId: topic.id })),
    )
    const ordered = topics
      .map((topic, index) => ({ topic: topic.id, feed: feeds[index]!.id }))
      .toSorted((a, b) => a.topic.localeCompare(b.topic))
    const seen = new Set<string>()
    const onAdded = (job: { data: unknown }) => {
      const id = (job.data as { rssFeedId?: string }).rssFeedId
      if (id && feeds.some(feed => feed.id === id)) seen.add(id)
    }
    rssFeedMaintenance.on('added', onAdded)
    const data: PostPublicationEffectsJobData = {
      changeId: crypto.randomUUID(),
      postId: null,
      scope: { type: 'topic', id: topics[0]!.id },
      reason: 'rss_feed_discoverability_changed',
      keys: [],
      keyHash: hashCapturedPublicationKeys([]),
      chunkIndex: 0,
      scopeStart: false,
      scopeTopicKeysCaptured: false,
      keyOffset: 0,
      continuation: {
        kind: 'topic_feed_discoverability',
        subjectIds: topics.map(topic => topic.id),
        subjectIndex: 0,
        after: null,
      },
    }
    try {
      const jobs = await executeTestPublicationChain(data, processApplyPostPublicationEffects)
      expect([...seen].toSorted()).toEqual(feeds.map(feed => feed.id).toSorted())
      expect(
        jobs.map(job => (job.data as PostPublicationEffectsJobData).continuation?.after),
      ).toEqual([ordered[0]!.topic, ordered[1]!.topic])
      expect(
        jobs.every(job => (job.data as PostPublicationEffectsJobData).changeId === data.changeId),
      ).toBe(true)
    } finally {
      rssFeedMaintenance.off('added', onAdded)
    }
  })
  it('invalidates every supplied feed across publication continuation pages', async () => {
    await postPublicationWorkConfig.waitForInitialization()
    const restore = overrideDynamicConfigFieldsForTest(postPublicationWorkConfig, {
      capture_batch_size: 1,
    })
    onTestFinished(restore)
    const topics = await Promise.all(
      Array.from({ length: 4 }, () =>
        createTestTopic({ hostname: `topic-pub-${crypto.randomUUID()}.example.com` }),
      ),
    )
    const feeds = await Promise.all(
      topics.map(topic => insertTestRssFeedDirect({ topicId: topic.id })),
    )
    await Promise.all(feeds.map(feed => caches.rss_feeds.set(feed.id, 'stale')))
    const selectedTopics = topics.slice(0, 3).map(topic => topic.id)
    const data: PostPublicationEffectsJobData = {
      changeId: crypto.randomUUID(),
      postId: null,
      scope: { type: 'topic', id: selectedTopics[0]! },
      reason: 'rss_feed_discoverability_changed',
      keys: [],
      keyHash: hashCapturedPublicationKeys([]),
      chunkIndex: 0,
      scopeStart: false,
      scopeTopicKeysCaptured: false,
      keyOffset: 0,
      continuation: {
        kind: 'topic_feed_publication',
        subjectIds: selectedTopics,
        subjectIndex: 0,
        after: null,
      },
    }
    await executeTestPublicationChain(data, processApplyPostPublicationEffects)
    expect(await Promise.all(feeds.slice(0, 3).map(feed => caches.rss_feeds.get(feed.id)))).toEqual(
      [null, null, null],
    )
    expect(await caches.rss_feeds.get(feeds[3]!.id)).toBe('stale')
  })
})
