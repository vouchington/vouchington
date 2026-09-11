import assert from 'node:assert/strict'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { processBacklogDispatcher } from '../processors.mts'
import { bedrock_embeddings_batch } from '@queues/bedrock-embeddings-batch/queues'
import { bedrock_embeddings_nova_multimodal_v1_single } from '@queues/bedrock-embeddings/queues'
import { enqueueBulkCreateRssFeedItemEmbeddings } from '@queues/bedrock-embeddings/enqueues'
import { QUEUE_NAME } from '@queues/bedrock-embeddings-batch/config'
import { EMBEDDINGS_NOVA_MULTIMODAL_V1_SINGLE_QUEUE_NAME } from '@queues/bedrock-embeddings/config'
import { clearQueueStatsCacheForTesting } from '@services/queue-monitoring'
import { bedrockEmbeddingsBatchConfig } from '@services/bedrock-embeddings/batch/config'
import {
  overrideDynamicConfigFieldsForTest,
  closeScopedDynamicConfigContext,
} from '@voucha/test-helpers/dynamic-config'

const enqueueSingleItems = async (count: number, runId: string) => {
  if (count === 0) return
  // Each item uses a unique deduplication id (enqueueBulk debounces on
  // rss_feed_item_id), so unique IDs keep every job distinct and let the test
  // control queue depth precisely. No real RSS feed item rows are required —
  // the jobs sit in `waiting` because the bedrock-embeddings worker is not
  // started in this test setup.
  const items = Array.from({ length: count }, (_, i) => ({
    rss_feed_item_id: `backlog-test-${runId}-${i}`,
  }))
  await enqueueBulkCreateRssFeedItemEmbeddings(items)
}

const findCreationDispatcherJob = async () => {
  const [waiting, active] = await Promise.all([
    bedrock_embeddings_batch.getJobs('waiting'),
    bedrock_embeddings_batch.getJobs('active'),
  ])
  return [...waiting, ...active].find(job => job.name === 'creation_dispatcher')
}

describe('processBacklogDispatcher', () => {
  beforeAll(async () => {
    assert.equal(
      EMBEDDINGS_NOVA_MULTIMODAL_V1_SINGLE_QUEUE_NAME,
      'bedrock_embeddings_nova_multimodal_v1_single',
    )
    assert.equal(QUEUE_NAME, 'bedrock-embeddings-batch')
    await bedrockEmbeddingsBatchConfig.waitForInitialization()
    bedrockEmbeddingsBatchConfig.unsubscribe()
  })

  beforeEach(async () => {
    // Clear the in-process queue-stats cache before obliterating so that the
    // next enqueueBulkCreateRssFeedItemEmbeddings call performs a fresh fetch
    // against the truly-empty queue. Without this, a stale cache entry from a
    // previous test file (backend-data-stores runs with isolate: false) can
    // make isSingleQueueBackedUp() return true, causing the enqueue to
    // short-circuit and leaving the queue at depth 0.
    clearQueueStatsCacheForTesting()
    await bedrock_embeddings_nova_multimodal_v1_single.obliterate({ force: true })
    await bedrock_embeddings_batch.obliterate({ force: true })
  })

  afterEach(async () => {
    overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, { backlog_threshold: 1000 })
  })

  afterAll(async () => {
    clearQueueStatsCacheForTesting()
    await bedrock_embeddings_nova_multimodal_v1_single.obliterate({ force: true })
    await bedrock_embeddings_batch.obliterate({ force: true })
    await closeScopedDynamicConfigContext([bedrockEmbeddingsBatchConfig])
  })

  it('does not trigger when single-queue depth is below threshold', async () => {
    overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, { backlog_threshold: 5 })
    const runId = `below-${crypto.randomUUID()}`
    await enqueueSingleItems(4, runId)

    const result = await processBacklogDispatcher()

    expect(result.triggered).toBe(false)
    expect(result.threshold).toBe(5)
    expect(result.depth).toBe(4)
    expect(await findCreationDispatcherJob()).toBeUndefined()
  })

  it('triggers creation_dispatcher when depth meets threshold', async () => {
    overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, { backlog_threshold: 5 })
    const runId = `at-${crypto.randomUUID()}`
    await enqueueSingleItems(5, runId)

    const result = await processBacklogDispatcher()

    expect(result.triggered).toBe(true)
    expect(result.threshold).toBe(5)
    expect(result.depth).toBe(5)
    expect(await findCreationDispatcherJob()).toBeDefined()
  })

  it('triggers creation_dispatcher when depth exceeds threshold', async () => {
    overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, { backlog_threshold: 3 })
    const runId = `above-${crypto.randomUUID()}`
    await enqueueSingleItems(7, runId)

    const result = await processBacklogDispatcher()

    expect(result.triggered).toBe(true)
    expect(result.threshold).toBe(3)
    expect(result.depth).toBe(7)
    expect(await findCreationDispatcherJob()).toBeDefined()
  })

  it('uses the default threshold of 1000 when no override is set', async () => {
    const result = await processBacklogDispatcher()

    expect(result.threshold).toBe(1000)
    expect(result.triggered).toBe(false)
    expect(await findCreationDispatcherJob()).toBeUndefined()
  })

  it('falls back to default threshold when override is zero or negative', async () => {
    overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, { backlog_threshold: 0 })
    const zero = await processBacklogDispatcher()
    expect(zero.threshold).toBe(1000)

    overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, { backlog_threshold: -50 })
    const negative = await processBacklogDispatcher()
    expect(negative.threshold).toBe(1000)
  })
})
