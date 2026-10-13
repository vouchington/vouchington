import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ai_agents } from '@queues/ai-agents/queues'
import { bedrock_embeddings_nova_multimodal_v1_single } from '@queues/bedrock-embeddings/queues'
import { EMBEDDINGS_NOVA_MULTIMODAL_V1_SINGLE_QUEUE_NAME } from '@queues/bedrock-embeddings/config'
import { LANGUAGE_DETECTION_DEFAULTS, PRIORITY_DEFAULT } from '@queues/language-detection/config'
import { language_detection } from '@queues/language-detection/queues'
import { notifications } from '@queues/notifications/queues'
import { enqueueRssFeedItemPostUpsertJobsWithCompletion } from './upsert-enqueues.mts'
import { rssFeedItemsWorkConfig } from './work-limits.mts'
import { getQueueBacklogDepthCached } from '@data-stores/valkey-glide-mq/get-queue-stats-cached'
import {
  BEDROCK_BATCH_MAX_VALUES,
  bedrockEmbeddingsBatchConfig,
} from '@services/bedrock-embeddings/batch/config'
import {
  closeScopedDynamicConfigContext,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers/dynamic-config'

describe('RSS feed item post-upsert enqueue fanout', () => {
  let restoreBacklogThreshold: (() => void) | undefined

  beforeAll(async () => {
    await bedrockEmbeddingsBatchConfig.waitForInitialization()
    bedrockEmbeddingsBatchConfig.unsubscribe()
  })

  beforeEach(async () => {
    await getQueueBacklogDepthCached(EMBEDDINGS_NOVA_MULTIMODAL_V1_SINGLE_QUEUE_NAME, 0)
    restoreBacklogThreshold = overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, {
      backlog_threshold: BEDROCK_BATCH_MAX_VALUES.backlog_threshold,
    })
  })

  afterEach(async () => {
    restoreBacklogThreshold?.()
    restoreBacklogThreshold = undefined
    await getQueueBacklogDepthCached(EMBEDDINGS_NOVA_MULTIMODAL_V1_SINGLE_QUEUE_NAME, 0)
  })

  afterAll(async () => {
    await closeScopedDynamicConfigContext([bedrockEmbeddingsBatchConfig, rssFeedItemsWorkConfig])
  })

  it('enqueues embedding, autotagger, notification, and language detection jobs', async () => {
    const itemId = randomUUID()
    const guid = `guid-${randomUUID()}`
    const item = {
      content_sha256: Buffer.from(randomUUID().replaceAll('-', ''), 'hex'),
      feedItem: {
        categories: ['integration-category'],
        guid,
        link: `https://example.com/${itemId}`,
      },
      url_id: randomUUID(),
    }

    const { rows: result, languageDetectionEnqueue } =
      await enqueueRssFeedItemPostUpsertJobsWithCompletion(
        [item],
        [],
        [
          {
            guid,
            has_embedding: false,
            id: itemId,
            published_at: new Date(),
            story_id: null,
            url_id: item.url_id,
          },
        ],
      )

    expect(result).toEqual([{ has_embedding: false, id: itemId }])
    await languageDetectionEnqueue
    const [embeddingJobs, aiAgentJobs, notificationJobs, languageDetectionJobs] = await Promise.all(
      [
        bedrock_embeddings_nova_multimodal_v1_single.searchJobs({
          name: 'rss_feed_item',
          data: { rss_feed_item_id: itemId },
        }),
        ai_agents.searchJobs({
          name: 'autotagger-rss-feed-item',
          data: { rss_feed_item_id: itemId },
        }),
        notifications.searchJobs({
          name: 'processReconcileRssFeedItemNotifications',
          data: { rssFeedItemId: itemId },
        }),
        language_detection.searchJobs({ name: 'rss_feed_item', data: { id: itemId } }),
      ],
    )
    expect({
      aiAgent: aiAgentJobs.length > 0,
      embedding: embeddingJobs.length > 0,
      languageDetection: languageDetectionJobs.length > 0,
      notification: notificationJobs.length > 0,
    }).toEqual({ aiAgent: true, embedding: true, languageDetection: true, notification: true })
  })

  it('enqueues notification and language detection jobs for source-linked existing rows', async () => {
    const itemId = randomUUID()
    const guid = `guid-${randomUUID()}`
    const row = { guid, has_embedding: true, id: itemId }
    const { rows: result, languageDetectionEnqueue } =
      await enqueueRssFeedItemPostUpsertJobsWithCompletion([], [row], [], {
        languageDetectionRows: [row],
      })

    expect(result).toEqual([{ has_embedding: true, id: itemId }])
    await languageDetectionEnqueue
    const [notificationJobs, languageDetectionJobs] = await Promise.all([
      notifications.searchJobs({
        name: 'processReconcileRssFeedItemNotifications',
        data: { rssFeedItemId: itemId },
      }),
      language_detection.searchJobs({ name: 'rss_feed_item', data: { id: itemId } }),
    ])
    expect({
      languageDetection: languageDetectionJobs.length > 0,
      notification: notificationJobs.length > 0,
    }).toEqual({ languageDetection: true, notification: true })
  })

  it('bulk-enqueues language detection for every row with the per-item options, across chunks', async () => {
    const restoreBatchSize = overrideDynamicConfigFieldsForTest(rssFeedItemsWorkConfig, {
      enqueue_batch_size: 2,
    })
    try {
      const rows = Array.from({ length: 3 }, () => ({
        guid: `guid-${randomUUID()}`,
        has_embedding: true,
        id: randomUUID(),
      }))
      const { languageDetectionEnqueue } = await enqueueRssFeedItemPostUpsertJobsWithCompletion(
        [],
        rows,
        [],
        { languageDetectionRows: rows },
      )
      await languageDetectionEnqueue

      for (const row of rows) {
        const jobs = await language_detection.searchJobs({
          name: 'rss_feed_item',
          data: { id: row.id },
        })
        expect(jobs).toHaveLength(1)
        expect(jobs[0]?.opts).toMatchObject({
          priority: PRIORITY_DEFAULT,
          deduplication: {
            id: `language_detection_rss_feed_item_${row.id}`,
            mode: 'debounce',
            ttl: LANGUAGE_DETECTION_DEFAULTS.deduplicationTtlMs,
          },
        })
      }
    } finally {
      restoreBatchSize()
    }
  })

  it('narrows fanout to source-linked existing rows while returning all rows', async () => {
    const fanoutItemId = randomUUID()
    const skippedItemId = randomUUID()
    const fanoutRow = { guid: `guid-${randomUUID()}`, has_embedding: true, id: fanoutItemId }
    const skippedRow = { guid: `guid-${randomUUID()}`, has_embedding: true, id: skippedItemId }
    const { rows: result, languageDetectionEnqueue } =
      await enqueueRssFeedItemPostUpsertJobsWithCompletion([], [fanoutRow, skippedRow], [], {
        existingRowsForFanout: [fanoutRow],
        languageDetectionRows: [fanoutRow],
      })

    expect(result).toEqual([
      { has_embedding: true, id: fanoutItemId },
      { has_embedding: true, id: skippedItemId },
    ])

    await languageDetectionEnqueue
    const [notificationJobs, skippedNotificationJobs, languageDetectionJobs] = await Promise.all([
      notifications.searchJobs({
        name: 'processReconcileRssFeedItemNotifications',
        data: { rssFeedItemId: fanoutItemId },
      }),
      notifications.searchJobs({
        name: 'processReconcileRssFeedItemNotifications',
        data: { rssFeedItemId: skippedItemId },
      }),
      language_detection.searchJobs({ name: 'rss_feed_item', data: { id: fanoutItemId } }),
    ])
    expect({
      languageDetection: languageDetectionJobs.length > 0,
      skippedNotification: skippedNotificationJobs.length > 0,
      sourceNotification: notificationJobs.length > 0,
    }).toEqual({ languageDetection: true, skippedNotification: false, sourceNotification: true })
  })
})
