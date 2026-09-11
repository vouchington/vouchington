import { randomUUID } from 'node:crypto'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DelayedError, type Job, type Worker } from 'glide-mq'
import {
  insertTestRssFeedItem,
  createRandomString,
  setupTestAutotaggerAgent,
} from '@voucha/test-helpers'
import type { DailyAiCostTotal } from '@services/ai-usage'
import { insertRssFeedItemAutotaggingResult } from '@services/autotagger'
import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'
import { setRssFeedDiscoverabilityAsSystem } from '@services/rss-feeds'
import { addUrl } from '@services/urls/upsert'
import type { OpenAiSpendCapBreachContext } from '@modules/on-error/openai-spend-cap-breach'
import type { AIAgentJobData } from '@queues/ai-agents/types'
import { processAIAgentWorkerJob } from './core.mts'

// #8773 round-14 finding 2: `autotagger-rss-feed-item` is spend-producing by default
// (AI_AGENT_JOB_PRODUCES_SPEND), so unlike the exemptions in core.spend-cap-moderation.test.mts,
// evaluateOpenAiSpendCapBreach always runs for this job type. What varies per item is whether the
// breach actually defers the job -- only an item that would reach callOpenAIAutotagger
// (wouldAutotagRssFeedItemCallOpenAI) does. An already-tagged or non-discoverable item only runs
// the spend-free collaborative-topic pass and must keep running through a breach.

let testRssFeedId: string
let activePromptId: string

async function insertFixtureItem(rssFeedId: string): Promise<string> {
  const guid = `spend-cap-autotagger-${createRandomString(12)}`
  const urlEntry = await addUrl(
    null,
    `https://spend-cap-autotagger-${createRandomString(8)}.example.com/item`,
  )
  return insertTestRssFeedItem({
    rssFeedId,
    urlId: urlEntry!.id,
    guid,
    itemData: { link: 'https://example.com', guid, title: 'RSS Item Title' },
    contentSha256: Buffer.alloc(32),
  })
}

function mockJob(rssFeedItemId: string): Job<AIAgentJobData> {
  return {
    data: { rss_feed_item_id: rssFeedItemId } as AIAgentJobData,
    name: 'autotagger-rss-feed-item',
    id: randomUUID(),
    reportTokens: vi.fn<(count: number) => Promise<void>>(),
    moveToDelayed: vi
      .fn<(timestamp: number, nextStep?: string) => Promise<never>>()
      .mockImplementation(async timestamp => {
        throw new DelayedError(timestamp)
      }),
  } as unknown as Job<AIAgentJobData>
}

function mockWorker(): Worker {
  return { rateLimit: vi.fn<(ms: number) => Promise<void>>() } as unknown as Worker
}

function createDailyTotalLoader(totalMicrounits: number): () => Promise<DailyAiCostTotal> {
  return () => Promise.resolve({ totalMicrounits, hasUnpricedRows: false, day: '2026-08-16' })
}

describe('processAIAgentWorkerJob -- autotagger-rss-feed-item per-item spend-cap exemption', () => {
  beforeAll(async () => {
    const activePrompt = await setupTestAutotaggerAgent()
    activePromptId = activePrompt.id

    const feed = await createTestRssFeed({})
    testRssFeedId = feed.id
  }, 30_000)

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-16T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not defer an already-tagged item during a breach', async () => {
    const itemId = await insertFixtureItem(testRssFeedId)
    await insertRssFeedItemAutotaggingResult(itemId, Buffer.alloc(32), activePromptId, [])

    const job = mockJob(itemId)
    const worker = mockWorker()
    const processAIAgent = vi
      .fn<(job: Job<AIAgentJobData>) => Promise<unknown>>()
      .mockResolvedValue('ok')
    const recordOpenAiSpendCapBreach = vi.fn<(context: OpenAiSpendCapBreachContext) => void>()

    const result = await processAIAgentWorkerJob(job, worker, {
      waitForOpenAiSpendCapConfig: () => Promise.resolve(),
      getOpenAiSpendCapFields: () => ({ enabled: true, daily_cap_microunits: 1_000_000 }),
      getDailyAiCostTotalMicrounits: createDailyTotalLoader(5_000_000),
      recordOpenAiSpendCapBreach,
      processAIAgent,
    })

    expect(result).toBe('ok')
    expect(processAIAgent).toHaveBeenCalledOnce()
    expect(job.moveToDelayed).not.toHaveBeenCalled()
    expect(recordOpenAiSpendCapBreach).not.toHaveBeenCalled()
  })

  it('does not defer a non-discoverable item during a breach', async () => {
    const nonDiscoverableFeed = await createTestRssFeed({})
    await setRssFeedDiscoverabilityAsSystem({
      rssFeedId: nonDiscoverableFeed.id,
      enabled: false,
      reason: 'test: non-discoverable fixture',
    })
    const itemId = await insertFixtureItem(nonDiscoverableFeed.id)

    const job = mockJob(itemId)
    const worker = mockWorker()
    const processAIAgent = vi
      .fn<(job: Job<AIAgentJobData>) => Promise<unknown>>()
      .mockResolvedValue('ok')
    const recordOpenAiSpendCapBreach = vi.fn<(context: OpenAiSpendCapBreachContext) => void>()

    const result = await processAIAgentWorkerJob(job, worker, {
      waitForOpenAiSpendCapConfig: () => Promise.resolve(),
      getOpenAiSpendCapFields: () => ({ enabled: true, daily_cap_microunits: 1_000_000 }),
      getDailyAiCostTotalMicrounits: createDailyTotalLoader(5_000_000),
      recordOpenAiSpendCapBreach,
      processAIAgent,
    })

    expect(result).toBe('ok')
    expect(processAIAgent).toHaveBeenCalledOnce()
    expect(job.moveToDelayed).not.toHaveBeenCalled()
    expect(recordOpenAiSpendCapBreach).not.toHaveBeenCalled()
  })

  it('defers an eligible (would call OpenAI) item during a breach', async () => {
    const itemId = await insertFixtureItem(testRssFeedId)

    const job = mockJob(itemId)
    const worker = mockWorker()
    const processAIAgent = vi.fn<(job: Job<AIAgentJobData>) => Promise<unknown>>()
    const recordOpenAiSpendCapBreach = vi.fn<(context: OpenAiSpendCapBreachContext) => void>()
    const registerOpenAiSpendCapRecheck = vi.fn<() => Promise<boolean>>().mockResolvedValue(true)

    await expect(
      processAIAgentWorkerJob(job, worker, {
        waitForOpenAiSpendCapConfig: () => Promise.resolve(),
        getOpenAiSpendCapFields: () => ({ enabled: true, daily_cap_microunits: 1_000_000 }),
        getDailyAiCostTotalMicrounits: createDailyTotalLoader(5_000_000),
        recordOpenAiSpendCapBreach,
        registerOpenAiSpendCapRecheck,
        processAIAgent,
      }),
    ).rejects.toThrow(DelayedError)

    expect(processAIAgent).not.toHaveBeenCalled()
    expect(job.moveToDelayed).toHaveBeenCalledExactlyOnceWith(expect.any(Number))
    expect(recordOpenAiSpendCapBreach).toHaveBeenCalledExactlyOnceWith({
      agentJobName: 'autotagger-rss-feed-item',
      dailyTotalMicrounits: 5_000_000,
      dailyCapMicrounits: 1_000_000,
      reason: 'cap_exceeded',
    })
  })
})
