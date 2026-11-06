import { sentryCaptureMessageMock } from '@voucha/test-helpers/vitest.setup.sentry-mock'
import { createHash } from 'node:crypto'
import { beforeAll, describe, expect, it, vi } from 'vitest'

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
import { getPostByAny } from '@services/posts/get'

import { cleanUpSpendCapDay } from '@voucha/test-helpers/ai-agents-spend-cap'
import { withReservedAiUsageDay } from '@voucha/test-helpers/with-reserved-ai-usage-day'
import { startAIAgentWorkerForTest } from '@voucha/test-helpers/ai-agent-worker-lifecycle'
import { installAIAgentProviderFixtures } from '@voucha/test-helpers/ai-agent-worker-fixtures'

vi.hoisted(() => {
  const url = new URL(process.env.VALKEY_URL || 'redis://localhost:6379')
  url.pathname = String(crypto.getRandomValues(new Uint32Array(1))[0] || 1)
  vi.stubEnv('VALKEY_WORKER_QUEUE_URL', url.toString())
})

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

      // Creation already committed; explicit admission below replaces finalize's automatic job.
      const provider = installAIAgentProviderFixtures()
      const runtime = await startAIAgentWorkerForTest()
      const outcome = await runtime.run('story-post', {
        post_id: prepared.response.post.id,
        force: false,
      })
      expect(outcome.kind).toBe('completed')
      expect(outcome.result).toBeNull()
      expect(prepared.response.post.post_type).toBe('story')
      expect(
        (await getPostByAny(prepared.response.post.id, { readOnly: false }))?.ai_summary_markdown,
      ).toBe('Already set.')
      expect(outcome.moveToDelayed).not.toHaveBeenCalled()
      expect(provider.generateJson).not.toHaveBeenCalled()
      expect(sentryCaptureMessageMock).not.toHaveBeenCalledWith(
        'ai_spend_cap_breach',
        expect.anything(),
      )
      await runtime.close()
    })
  })

  it('keeps a summarized story provider-free during a breach when force is omitted', async () => {
    await withReservedAiUsageDay(0, async () => {
      const { story, testUser } = await makeStoryWithItem()
      const prepared = await prepareStoryPost(story.id, testUser, {
        ai_summary_markdown: 'Already set.',
      })
      const provider = installAIAgentProviderFixtures()
      const runtime = await startAIAgentWorkerForTest()
      try {
        const outcome = await runtime.run('story-post', { post_id: prepared.response.post.id })
        expect(outcome.kind).toBe('completed')
        expect(outcome.result).toBeNull()
        expect(prepared.response.post.post_type).toBe('story')
        expect(
          (await getPostByAny(prepared.response.post.id, { readOnly: false }))?.ai_summary_markdown,
        ).toBe('Already set.')
        expect(outcome.moveToDelayed).not.toHaveBeenCalled()
        expect(provider.generateJson).not.toHaveBeenCalled()
        expect(sentryCaptureMessageMock).not.toHaveBeenCalledWith(
          'ai_spend_cap_breach',
          expect.anything(),
        )
      } finally {
        await runtime.close()
      }
    })
  })

  it('defers an eligible (would call OpenAI) unsummarized post during a breach', async () => {
    await withReservedAiUsageDay(0, async day => {
      cleanUpSpendCapDay(day)
      const { story, testUser } = await makeStoryWithItem()
      const prepared = await prepareStoryPost(story.id, testUser)

      const provider = installAIAgentProviderFixtures()
      const runtime = await startAIAgentWorkerForTest()
      const outcome = await runtime.run('story-post', {
        post_id: prepared.response.post.id,
        force: false,
      })
      expect(outcome.kind).toBe('delayed')
      expect(provider.generateJson).not.toHaveBeenCalled()
      expect(outcome.moveToDelayed).toHaveBeenCalledExactlyOnceWith(getDayBounds(day).endMs)
      expect(
        sentryCaptureMessageMock.mock.calls.filter(
          ([message]) => message === 'ai_spend_cap_breach',
        ),
      ).toHaveLength(1)
      expect(sentryCaptureMessageMock).toHaveBeenCalledWith('ai_spend_cap_breach', {
        level: 'warning',
        tags: {
          reason: 'ai_spend_cap_breach',
          agent_job_name: 'story-post',
          breach_reason: 'cap_exceeded',
        },
        extra: { dailyTotalMicrounits: 1, dailyCapMicrounits: 0 },
      })
      await runtime.close()
    })
  })

  it('defers a forced retry even once a summary already exists, during a breach', async () => {
    await withReservedAiUsageDay(0, async day => {
      cleanUpSpendCapDay(day)
      const { story, testUser } = await makeStoryWithItem()
      const prepared = await prepareStoryPost(story.id, testUser, {
        ai_summary_markdown: 'Already set.',
      })

      installAIAgentProviderFixtures()
      const runtime = await startAIAgentWorkerForTest()
      const outcome = await runtime.run('story-post', {
        post_id: prepared.response.post.id,
        force: true,
      })
      expect(outcome.kind).toBe('delayed')
      expect(outcome.moveToDelayed).toHaveBeenCalledExactlyOnceWith(getDayBounds(day).endMs)
      await runtime.close()
    })
  })
})
