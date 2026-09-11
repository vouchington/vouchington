import { createHash, randomUUID } from 'node:crypto'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DelayedError, type Job, type Worker } from 'glide-mq'
import {
  createTestUrlWithHostname,
  createTestUserDirect,
  insertTestRssFeedItem,
  insertTestStory,
  setTestItemStoryId,
} from '@voucha/test-helpers'
import type { DailyAiCostTotal } from '@services/ai-usage'
import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'
import { upsertSystemAdministrator } from '@services/users/system-users'
import { createStoryPost } from '@services/stories/story-posts'
import type { OpenAiSpendCapBreachContext } from '@modules/on-error/openai-spend-cap-breach'
import type { AIAgentJobData, StoryPostJobData } from '@queues/ai-agents/types'
import { processAIAgentWorkerJob } from './core.mts'

// #8773 round-15 finding: `story-post` is spend-producing by default (AI_AGENT_JOB_PRODUCES_SPEND),
// so unlike the exemptions in core.spend-cap-moderation.test.mts, evaluateOpenAiSpendCapBreach
// always runs for this job type. What varies per job is whether the breach actually defers it --
// only a job that would reach callStoryPostAgent (wouldStoryPostCallOpenAI) does. A non-force retry
// against a post that already has a summary only runs the spend-free moderation/spam/embedding
// recovery re-enqueue and must keep running through a breach.

let feedId: string
let urlId: string

function sha256(data: unknown): Buffer {
  return createHash('sha256').update(JSON.stringify(data)).digest()
}

async function makeStoryWithItem() {
  const testUser = await createTestUserDirect()
  const story = await insertTestStory({
    title: `Spend-cap story ${Math.random().toString(36).slice(2, 8)}`,
  })
  const random = Math.random().toString(36).slice(2, 10)
  const itemData = { title: `Item ${random}`, link: `https://example.com/${random}` }
  const itemId = await insertTestRssFeedItem({
    rssFeedId: feedId,
    urlId,
    guid: `spend-cap-story-post-test-${random}`,
    itemData,
    contentSha256: sha256(itemData),
  })
  await setTestItemStoryId(itemId, story.id)
  const random2 = Math.random().toString(36).slice(2, 10)
  const itemData2 = { title: `Item ${random2}`, link: `https://example.com/${random2}` }
  const itemId2 = await insertTestRssFeedItem({
    rssFeedId: feedId,
    urlId,
    guid: `spend-cap-story-post-test-2-${random2}`,
    itemData: itemData2,
    contentSha256: sha256(itemData2),
  })
  await setTestItemStoryId(itemId2, story.id)
  return { story, testUser }
}

function mockJob(postId: string, force = false): Job<AIAgentJobData> {
  return {
    data: { post_id: postId, force } as StoryPostJobData as AIAgentJobData,
    name: 'story-post',
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

describe('processAIAgentWorkerJob -- story-post spend-cap recovery exemption', () => {
  beforeAll(async () => {
    await upsertSystemAdministrator('spend-cap-story-teller')
    feedId = (await createTestRssFeed({})).id
    urlId = await createTestUrlWithHostname()
  }, 30_000)

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-16T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not defer a non-force retry once a summary already exists, during a breach', async () => {
    const { story, testUser } = await makeStoryWithItem()
    const result = await createStoryPost(story.id, testUser, {
      ai_summary_markdown: 'Already set.',
    })

    const job = mockJob(result.post.id)
    const worker = mockWorker()
    const processAIAgent = vi
      .fn<(job: Job<AIAgentJobData>) => Promise<unknown>>()
      .mockResolvedValue('ok')
    const recordOpenAiSpendCapBreach = vi.fn<(context: OpenAiSpendCapBreachContext) => void>()

    const result2 = await processAIAgentWorkerJob(job, worker, {
      waitForOpenAiSpendCapConfig: () => Promise.resolve(),
      getOpenAiSpendCapFields: () => ({ enabled: true, daily_cap_microunits: 1_000_000 }),
      getDailyAiCostTotalMicrounits: createDailyTotalLoader(5_000_000),
      recordOpenAiSpendCapBreach,
      processAIAgent,
    })

    expect(result2).toBe('ok')
    expect(processAIAgent).toHaveBeenCalledOnce()
    expect(job.moveToDelayed).not.toHaveBeenCalled()
    expect(recordOpenAiSpendCapBreach).not.toHaveBeenCalled()
  })

  it('defers an eligible (would call OpenAI) unsummarized post during a breach', async () => {
    const { story, testUser } = await makeStoryWithItem()
    const result = await createStoryPost(story.id, testUser)

    const job = mockJob(result.post.id)
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
      agentJobName: 'story-post',
      dailyTotalMicrounits: 5_000_000,
      dailyCapMicrounits: 1_000_000,
      reason: 'cap_exceeded',
    })
  })

  it('defers a forced retry even once a summary already exists, during a breach', async () => {
    const { story, testUser } = await makeStoryWithItem()
    const result = await createStoryPost(story.id, testUser, {
      ai_summary_markdown: 'Already set.',
    })

    const job = mockJob(result.post.id, true)
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
  })
})
