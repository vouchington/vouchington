import { describe, expect, it } from 'vitest'
import { upsertSchedules as upsertAiAgentsSchedules } from '@queues/ai-agents/enqueues/schedules'
import { upsertSchedules as upsertBedrockEmbeddingBatchSchedules } from '@queues/bedrock-embeddings-batch/enqueues/schedules'
import { upsertSchedules as upsertBoilerplateRemovalSchedules } from '@queues/crawl-boilerplate-removal/enqueues/schedules'
import { upsertSchedules as upsertCrawlHostnameSchedules } from '@queues/crawl-hostnames/enqueues/schedules'
import { upsertSchedules as upsertCrawlReferralLinkSchedules } from '@queues/crawl-referral-links/enqueues/schedules'
import { upsertSchedules as upsertQueueMetricsSchedules } from '@queues/heartbeat/enqueues/schedules'
import { upsertSchedules as upsertImageSchedules } from '@queues/images/enqueues/schedules'
import { upsertSchedules as upsertUnfurlReferralLinkSchedules } from '@queues/unfurl-referral-links/enqueues/schedules'
import { SCHEDULE_DEFINITIONS } from './schedule-definitions.mts'
import { SCHEDULE_DEFINITIONS as IO_SCHEDULE_DEFINITIONS } from '@entrypoints/worker-io/definitions'

const cpuOnlySchedules = SCHEDULE_DEFINITIONS.filter(
  definition => !IO_SCHEDULE_DEFINITIONS.some(io => io.queueName === definition.queueName),
)

describe('worker-cpu schedule definitions', () => {
  it('each schedule definition load resolves to the expected export', async () => {
    const byQueue = (name: string) =>
      cpuOnlySchedules.find(definition => definition.queueName === name)!

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
    await expect(byQueue('bedrock-embeddings-batch').load()).resolves.toBe(
      upsertBedrockEmbeddingBatchSchedules,
    )
    await expect(byQueue('ai_agents').load()).resolves.toBe(upsertAiAgentsSchedules)
    await expect(byQueue('heartbeat').load()).resolves.toBe(upsertQueueMetricsSchedules)
  })
})
