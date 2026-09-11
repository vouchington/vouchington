import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  enqueueCreateTopicEmbedding,
  enqueueCreatePostEmbedding,
  enqueueBulkCreateRssFeedItemEmbeddings,
} from './enqueues.mts'
import { bedrock_embeddings_nova_multimodal_v1_single } from './queues.mts'
import { EMBEDDINGS_NOVA_MULTIMODAL_V1_SINGLE_QUEUE_NAME } from './config.mts'
import { clearQueueStatsCacheForTesting } from '@services/queue-monitoring'
import { bedrockEmbeddingsBatchConfig } from '@services/bedrock-embeddings/batch/config'
import {
  overrideDynamicConfigFieldsForTest,
  closeScopedDynamicConfigContext,
} from '@voucha/test-helpers/dynamic-config'

const enqueueBacklogItems = async (count: number, runId: string): Promise<void> => {
  if (count === 0) return
  // Uses the public bulk enqueue function. Since the queue is obliterated in beforeEach
  // (depth=0), the skip guard never fires during seeding regardless of the threshold value.
  // The caller must call clearQueueStatsCacheForTesting() after this helper so that the
  // next enqueue call sees the real post-seed depth rather than the cached depth=0.
  const items = Array.from({ length: count }, (_, i) => ({
    rss_feed_item_id: `enqueue-skip-test-${runId}-${i}`,
  }))
  await enqueueBulkCreateRssFeedItemEmbeddings(items)
}

describe('bedrock-embeddings enqueues', () => {
  // One init/close for all nested describe blocks
  beforeAll(async () => {
    await bedrockEmbeddingsBatchConfig.waitForInitialization()
    bedrockEmbeddingsBatchConfig.unsubscribe()
  })

  afterAll(async () => {
    await closeScopedDynamicConfigContext([bedrockEmbeddingsBatchConfig])
  })

  describe('enqueueCreateTopicEmbedding — backlog skip guard', () => {
    beforeEach(async () => {
      clearQueueStatsCacheForTesting()
      await bedrock_embeddings_nova_multimodal_v1_single.obliterate({ force: true })
    })

    afterEach(async () => {
      overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, { backlog_threshold: 1000 })
    })

    afterAll(async () => {
      clearQueueStatsCacheForTesting()
      await bedrock_embeddings_nova_multimodal_v1_single.obliterate({ force: true })
    })

    it('enqueues normally when depth is below the threshold', async () => {
      overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, { backlog_threshold: 5 })
      const runId = `below-${randomUUID()}`
      await enqueueBacklogItems(4, runId)
      clearQueueStatsCacheForTesting()

      const topicId = `topic-${randomUUID()}`
      await enqueueCreateTopicEmbedding(topicId)

      const waiting = await bedrock_embeddings_nova_multimodal_v1_single.getJobs('waiting')
      const topicJob = waiting.find(j => (j.data as Record<string, unknown>).id === topicId)
      expect(topicJob).toBeDefined()
    })

    it('skips enqueueing when depth is at the threshold', async () => {
      overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, { backlog_threshold: 5 })
      const runId = `at-${randomUUID()}`
      await enqueueBacklogItems(5, runId)
      clearQueueStatsCacheForTesting()

      const topicId = `topic-${randomUUID()}`
      await enqueueCreateTopicEmbedding(topicId)

      const waiting = await bedrock_embeddings_nova_multimodal_v1_single.getJobs('waiting')
      const topicJob = waiting.find(j => (j.data as Record<string, unknown>).id === topicId)
      expect(topicJob).toBeUndefined()
    })

    it('skips enqueueing when depth exceeds the threshold', async () => {
      overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, { backlog_threshold: 3 })
      const runId = `above-${randomUUID()}`
      await enqueueBacklogItems(7, runId)
      clearQueueStatsCacheForTesting()

      const topicId = `topic-${randomUUID()}`
      await enqueueCreateTopicEmbedding(topicId)

      const waiting = await bedrock_embeddings_nova_multimodal_v1_single.getJobs('waiting')
      const topicJob = waiting.find(j => (j.data as Record<string, unknown>).id === topicId)
      expect(topicJob).toBeUndefined()
    })

    it('uses the default threshold of 1000 when no override is set', async () => {
      clearQueueStatsCacheForTesting()

      // Empty queue → depth 0 → well below default 1000 → should enqueue
      const topicId = `topic-${randomUUID()}`
      await enqueueCreateTopicEmbedding(topicId)

      const waiting = await bedrock_embeddings_nova_multimodal_v1_single.getJobs('waiting')
      const topicJob = waiting.find(j => (j.data as Record<string, unknown>).id === topicId)
      expect(topicJob).toBeDefined()
    })

    it('falls back to default 1000 when override is zero or negative', async () => {
      overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, { backlog_threshold: 0 })
      clearQueueStatsCacheForTesting()

      // depth=0 < default 1000 → still enqueues (fallback)
      const topicId = `topic-${randomUUID()}`
      await enqueueCreateTopicEmbedding(topicId)

      const waiting = await bedrock_embeddings_nova_multimodal_v1_single.getJobs('waiting')
      const topicJob = waiting.find(j => (j.data as Record<string, unknown>).id === topicId)
      expect(topicJob).toBeDefined()
    })
  })

  describe('enqueueCreatePostEmbedding — backlog skip guard', () => {
    beforeEach(async () => {
      clearQueueStatsCacheForTesting()
      await bedrock_embeddings_nova_multimodal_v1_single.obliterate({ force: true })
    })

    afterEach(async () => {
      overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, { backlog_threshold: 1000 })
    })

    afterAll(async () => {
      clearQueueStatsCacheForTesting()
      await bedrock_embeddings_nova_multimodal_v1_single.obliterate({ force: true })
    })

    it('enqueues normally when below threshold', async () => {
      overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, { backlog_threshold: 5 })
      clearQueueStatsCacheForTesting()

      const postId = `post-${randomUUID()}`
      await enqueueCreatePostEmbedding(postId)

      const waiting = await bedrock_embeddings_nova_multimodal_v1_single.getJobs('waiting')
      const postJob = waiting.find(j => (j.data as Record<string, unknown>).id === postId)
      expect(postJob).toBeDefined()
    })

    it('skips when at threshold', async () => {
      overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, { backlog_threshold: 3 })
      const runId = `post-above-${randomUUID()}`
      await enqueueBacklogItems(3, runId)
      clearQueueStatsCacheForTesting()

      const postId = `post-${randomUUID()}`
      await enqueueCreatePostEmbedding(postId)

      const waiting = await bedrock_embeddings_nova_multimodal_v1_single.getJobs('waiting')
      const postJob = waiting.find(j => (j.data as Record<string, unknown>).id === postId)
      expect(postJob).toBeUndefined()
    })
  })

  describe('enqueueBulkCreateRssFeedItemEmbeddings — backlog skip guard', () => {
    beforeEach(async () => {
      clearQueueStatsCacheForTesting()
      await bedrock_embeddings_nova_multimodal_v1_single.obliterate({ force: true })
    })

    afterEach(async () => {
      overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, { backlog_threshold: 1000 })
    })

    afterAll(async () => {
      clearQueueStatsCacheForTesting()
      await bedrock_embeddings_nova_multimodal_v1_single.obliterate({ force: true })
    })

    it('enqueues normally when below threshold', async () => {
      overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, { backlog_threshold: 5 })
      clearQueueStatsCacheForTesting()

      const itemId = `rss-${randomUUID()}`
      await enqueueBulkCreateRssFeedItemEmbeddings([{ rss_feed_item_id: itemId }])

      const waiting = await bedrock_embeddings_nova_multimodal_v1_single.getJobs('waiting')
      const rssJob = waiting.find(
        j => (j.data as Record<string, unknown>).rss_feed_item_id === itemId,
      )
      expect(rssJob).toBeDefined()
    })

    it('skips entire bulk batch when at threshold', async () => {
      overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, { backlog_threshold: 2 })
      const runId = `rss-above-${randomUUID()}`
      await enqueueBacklogItems(2, runId)
      clearQueueStatsCacheForTesting()

      const itemId = `rss-${randomUUID()}`
      await enqueueBulkCreateRssFeedItemEmbeddings([{ rss_feed_item_id: itemId }])

      const waiting = await bedrock_embeddings_nova_multimodal_v1_single.getJobs('waiting')
      const rssJob = waiting.find(
        j => (j.data as Record<string, unknown>).rss_feed_item_id === itemId,
      )
      expect(rssJob).toBeUndefined()
    })
  })

  describe('queue stats cache TTL', () => {
    beforeEach(async () => {
      clearQueueStatsCacheForTesting()
      await bedrock_embeddings_nova_multimodal_v1_single.obliterate({ force: true })
      assert.equal(
        EMBEDDINGS_NOVA_MULTIMODAL_V1_SINGLE_QUEUE_NAME,
        'bedrock_embeddings_nova_multimodal_v1_single',
      )
    })

    afterEach(async () => {
      clearQueueStatsCacheForTesting()
      overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, { backlog_threshold: 1000 })
    })

    it('uses cached queue depth for a second call within the TTL window', async () => {
      overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, { backlog_threshold: 5 })
      const runId = `cache-ttl-${randomUUID()}`
      // First call: queue is empty (below threshold) → cache records depth=0
      const topicId1 = `topic-${randomUUID()}`
      await enqueueCreateTopicEmbedding(topicId1)

      // Now flood the queue beyond threshold WITHOUT clearing cache
      await enqueueBacklogItems(10, runId)
      // Do NOT call clearQueueStatsCacheForTesting() — cache still says depth=0

      // Second call: should use cached depth=0 → enqueues despite real depth=11
      const topicId2 = `topic-${randomUUID()}`
      await enqueueCreateTopicEmbedding(topicId2)

      const waiting = await bedrock_embeddings_nova_multimodal_v1_single.getJobs('waiting')
      const job2 = waiting.find(j => (j.data as Record<string, unknown>).id === topicId2)
      expect(job2).toBeDefined()
    })
  })
})
