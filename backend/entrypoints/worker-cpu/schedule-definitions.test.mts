import { describe, expect, it } from 'vitest'
import { upsertSchedules as upsertAiAgentsSchedules } from '@queues/ai-agents/enqueues/schedules'
import { upsertSchedules as upsertBedrockEmbeddingBatchSchedules } from '@queues/bedrock-embeddings-batch/enqueues/schedules'
import { upsertSchedules as upsertBoilerplateRemovalSchedules } from '@queues/crawl-boilerplate-removal/enqueues/schedules'
import { upsertSchedules as upsertCrawlHostnameSchedules } from '@queues/crawl-hostnames/enqueues/schedules'
import { upsertSchedules as upsertCrawlReferralLinkSchedules } from '@queues/crawl-referral-links/enqueues/schedules'
import { upsertSchedules as upsertQueueMetricsSchedules } from '@queues/heartbeat/enqueues/schedules'
import { upsertSchedules as upsertImageSchedules } from '@queues/images/enqueues/schedules'
import { upsertSchedules as upsertOpenAiModerationSchedules } from '@queues/openai-moderation/enqueues/schedules'
import { upsertSchedules as upsertUnfurlReferralLinkSchedules } from '@queues/unfurl-referral-links/enqueues/schedules'
import { upsertSchedules as upsertWikipediaRecommenderSchedules } from '@queues/wikipedia-recommender/enqueues/schedules'
import { CPU_ONLY_SCHEDULE_DEFINITIONS } from './schedule-definitions.mts'

describe('worker-cpu CPU_ONLY_SCHEDULE_DEFINITIONS load functions', () => {
  it('each schedule definition load resolves to the expected export', async () => {
    const byQueue = (name: string) =>
      CPU_ONLY_SCHEDULE_DEFINITIONS.find(definition => definition.queueName === name)!

    await expect(byQueue('crawl_hostnames').load()).resolves.toBe(upsertCrawlHostnameSchedules)
    await expect(byQueue('crawl_html_boilerplate_removal').load()).resolves.toBe(
      upsertBoilerplateRemovalSchedules,
    )
    await expect(byQueue('crawl_referral_links').load()).resolves.toBe(
      upsertCrawlReferralLinkSchedules,
    )
    await expect(byQueue('unfurl_referral_links').load()).resolves.toBe(
      upsertUnfurlReferralLinkSchedules,
    )
    await expect(byQueue('images').load()).resolves.toBe(upsertImageSchedules)
    await expect(byQueue('openai_moderation_omni_single').load()).resolves.toBe(
      upsertOpenAiModerationSchedules,
    )
    await expect(byQueue('bedrock-embeddings-batch').load()).resolves.toBe(
      upsertBedrockEmbeddingBatchSchedules,
    )
    await expect(byQueue('wikipedia-recommender').load()).resolves.toBe(
      upsertWikipediaRecommenderSchedules,
    )
    await expect(byQueue('ai_agents').load()).resolves.toBe(upsertAiAgentsSchedules)
    await expect(byQueue('heartbeat').load()).resolves.toBe(upsertQueueMetricsSchedules)
  })
})
