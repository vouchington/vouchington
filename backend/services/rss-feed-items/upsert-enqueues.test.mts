import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ai_agents } from '@queues/ai-agents/queues'
import { bedrock_embeddings_nova_multimodal_v1_single } from '@queues/bedrock-embeddings/queues'
import { language_detection } from '@queues/language-detection/queues'
import { notifications } from '@queues/notifications/queues'
import { readAllQueueJobs } from '@voucha/test-helpers'
import { enqueueRssFeedItemPostUpsertJobs } from './upsert-enqueues.mts'
import { clearQueueStatsCacheForTesting } from '@services/queue-monitoring'
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

  beforeEach(() => {
    clearQueueStatsCacheForTesting()
    restoreBacklogThreshold = overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, {
      backlog_threshold: BEDROCK_BATCH_MAX_VALUES.backlog_threshold,
    })
  })

  afterEach(() => {
    restoreBacklogThreshold?.()
    restoreBacklogThreshold = undefined
    clearQueueStatsCacheForTesting()
  })

  afterAll(async () => {
    await closeScopedDynamicConfigContext([bedrockEmbeddingsBatchConfig])
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

    const result = await enqueueRssFeedItemPostUpsertJobs(
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

    await expect
      .poll(async () => {
        const [embeddingJobs, aiAgentJobs, notificationJobs, languageDetectionJobs] =
          await Promise.all([
            bedrock_embeddings_nova_multimodal_v1_single.getJobs('waiting'),
            readAllQueueJobs(ai_agents),
            notifications.getJobs('waiting'),
            readAllQueueJobs(language_detection),
          ])

        return {
          aiAgent: aiAgentJobs.some(
            job =>
              job.name === 'autotagger-rss-feed-item' &&
              (job.data as { rss_feed_item_id?: string }).rss_feed_item_id === itemId,
          ),
          embedding: embeddingJobs.some(
            job =>
              job.name === 'rss_feed_item' &&
              (job.data as { rss_feed_item_id?: string }).rss_feed_item_id === itemId,
          ),
          languageDetection: languageDetectionJobs.some(
            job => job.name === 'rss_feed_item' && (job.data as { id?: string }).id === itemId,
          ),
          notification: notificationJobs.some(
            job =>
              job.name === 'processReconcileRssFeedItemNotifications' &&
              (job.data as { rssFeedItemId?: string }).rssFeedItemId === itemId,
          ),
        }
      })
      .toEqual({
        aiAgent: true,
        embedding: true,
        languageDetection: true,
        notification: true,
      })
  })

  it('enqueues notification and language detection jobs for source-linked existing rows', async () => {
    const itemId = randomUUID()
    const guid = `guid-${randomUUID()}`
    const row = { guid, has_embedding: true, id: itemId }
    const result = await enqueueRssFeedItemPostUpsertJobs([], [row], [], {
      languageDetectionRows: [row],
    })

    expect(result).toEqual([{ has_embedding: true, id: itemId }])

    await expect
      .poll(async () => {
        const [notificationJobs, languageDetectionJobs] = await Promise.all([
          notifications.getJobs('waiting'),
          readAllQueueJobs(language_detection),
        ])

        return {
          languageDetection: languageDetectionJobs.some(
            job => job.name === 'rss_feed_item' && (job.data as { id?: string }).id === itemId,
          ),
          notification: notificationJobs.some(
            job =>
              job.name === 'processReconcileRssFeedItemNotifications' &&
              (job.data as { rssFeedItemId?: string }).rssFeedItemId === itemId,
          ),
        }
      })
      .toEqual({ languageDetection: true, notification: true })
  })

  it('narrows fanout to source-linked existing rows while returning all rows', async () => {
    const fanoutItemId = randomUUID()
    const skippedItemId = randomUUID()
    const fanoutRow = { guid: `guid-${randomUUID()}`, has_embedding: true, id: fanoutItemId }
    const skippedRow = { guid: `guid-${randomUUID()}`, has_embedding: true, id: skippedItemId }
    const result = await enqueueRssFeedItemPostUpsertJobs([], [fanoutRow, skippedRow], [], {
      existingRowsForFanout: [fanoutRow],
      languageDetectionRows: [fanoutRow],
    })

    expect(result).toEqual([
      { has_embedding: true, id: fanoutItemId },
      { has_embedding: true, id: skippedItemId },
    ])

    await expect
      .poll(async () => {
        const [notificationJobs, languageDetectionJobs] = await Promise.all([
          notifications.getJobs('waiting'),
          readAllQueueJobs(language_detection),
        ])

        return {
          languageDetection: languageDetectionJobs.some(
            job =>
              job.name === 'rss_feed_item' && (job.data as { id?: string }).id === fanoutItemId,
          ),
          skippedNotification: notificationJobs.some(
            job =>
              job.name === 'processReconcileRssFeedItemNotifications' &&
              (job.data as { rssFeedItemId?: string }).rssFeedItemId === skippedItemId,
          ),
          sourceNotification: notificationJobs.some(
            job =>
              job.name === 'processReconcileRssFeedItemNotifications' &&
              (job.data as { rssFeedItemId?: string }).rssFeedItemId === fanoutItemId,
          ),
        }
      })
      .toEqual({
        languageDetection: true,
        skippedNotification: false,
        sourceNotification: true,
      })
  })
})
