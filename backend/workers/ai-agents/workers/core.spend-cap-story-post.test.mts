import { createHash } from 'node:crypto'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { DelayedError, type Job } from 'glide-mq'
import { getDayBounds } from '@ts-shared/utils/dates'
import {
  createTestUrlWithHostname,
  createTestUserDirect,
  insertTestRssFeedItem,
  insertTestStory,
  setTestItemStoryId,
} from '@voucha/test-helpers'
import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'
import { upsertSystemUser } from '@services/users/system-users'
import { prepareStoryPost } from '@services/stories/story-posts'
import type { recordSpendCapBreach as RecordSpendCapBreach } from '@modules/on-error/spend-cap-breach'
import type { AIAgentJobData, StoryPostJobData } from '@queues/ai-agents/types'
import { cleanUpSpendCapDay, spendCapDelayableJob } from '@voucha/test-helpers/ai-agents-spend-cap'
import { withReservedAiUsageDay } from '@voucha/test-helpers/with-reserved-ai-usage-day'
import { processAIAgentWorkerJob } from './core.mts'

// #8773 round-15 finding: `story-post` is spend-producing by default (AI_AGENT_JOB_PRODUCES_SPEND),
// so unlike the exemptions in core.spend-cap-moderation.test.mts, evaluateSpendCapBreach
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

function storyPostJob(postId: string, force = false): Job<AIAgentJobData> {
  return spendCapDelayableJob('story-post', {
    post_id: postId,
    force,
  } as StoryPostJobData as AIAgentJobData)
}

describe('processAIAgentWorkerJob -- story-post spend-cap recovery exemption', () => {
  beforeAll(async () => {
    await upsertSystemUser('spend-cap-story-teller')
    feedId = (await createTestRssFeed({})).id
    urlId = await createTestUrlWithHostname()
  })

  it('does not defer a non-force retry once a summary already exists, during a breach', async () => {
    await withReservedAiUsageDay(0, async () => {
      const { story, testUser } = await makeStoryWithItem()
      const prepared = await prepareStoryPost(story.id, testUser, {
        ai_summary_markdown: 'Already set.',
      })
      await prepared.finalize()

      const job = storyPostJob(prepared.response.post.id)
      const processAIAgent = vi
        .fn<(job: Job<AIAgentJobData>) => Promise<unknown>>()
        .mockResolvedValue('ok')
      const recordSpendCapBreach = vi.fn<typeof RecordSpendCapBreach>()

      await expect(
        processAIAgentWorkerJob(job, { recordSpendCapBreach, processAIAgent }),
      ).resolves.toBe('ok')

      expect(processAIAgent).toHaveBeenCalledOnce()
      expect(job.moveToDelayed).not.toHaveBeenCalled()
      expect(recordSpendCapBreach).not.toHaveBeenCalled()
    })
  })

  it('defers an eligible (would call OpenAI) unsummarized post during a breach', async () => {
    await withReservedAiUsageDay(0, async day => {
      cleanUpSpendCapDay(day)
      const { story, testUser } = await makeStoryWithItem()
      const prepared = await prepareStoryPost(story.id, testUser)
      await prepared.finalize()

      const job = storyPostJob(prepared.response.post.id)
      const processAIAgent = vi.fn<(job: Job<AIAgentJobData>) => Promise<unknown>>()
      const recordSpendCapBreach = vi.fn<typeof RecordSpendCapBreach>()

      await expect(
        processAIAgentWorkerJob(job, { recordSpendCapBreach, processAIAgent }),
      ).rejects.toThrow(DelayedError)

      expect(processAIAgent).not.toHaveBeenCalled()
      expect(job.moveToDelayed).toHaveBeenCalledExactlyOnceWith(getDayBounds(day).endMs)
      expect(recordSpendCapBreach).toHaveBeenCalledExactlyOnceWith({
        agentJobName: 'story-post',
        dailyTotalMicrounits: 1,
        dailyCapMicrounits: 0,
        reason: 'cap_exceeded',
      })
    })
  })

  it('defers a forced retry even once a summary already exists, during a breach', async () => {
    await withReservedAiUsageDay(0, async day => {
      cleanUpSpendCapDay(day)
      const { story, testUser } = await makeStoryWithItem()
      const prepared = await prepareStoryPost(story.id, testUser, {
        ai_summary_markdown: 'Already set.',
      })
      await prepared.finalize()

      const job = storyPostJob(prepared.response.post.id, true)
      const processAIAgent = vi.fn<(job: Job<AIAgentJobData>) => Promise<unknown>>()

      await expect(
        processAIAgentWorkerJob(job, {
          recordSpendCapBreach: vi.fn<typeof RecordSpendCapBreach>(),
          processAIAgent,
        }),
      ).rejects.toThrow(DelayedError)

      expect(processAIAgent).not.toHaveBeenCalled()
      expect(job.moveToDelayed).toHaveBeenCalledExactlyOnceWith(getDayBounds(day).endMs)
    })
  })
})
