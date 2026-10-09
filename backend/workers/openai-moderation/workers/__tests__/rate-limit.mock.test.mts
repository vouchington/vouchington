import { randomUUID } from 'node:crypto'
import { RateLimitError } from 'openai'
import { describe, expect, it, vi } from 'vitest'
import type { Job, Worker } from 'glide-mq'
import {
  createTestUser,
  getTestPostModerationRetryDelayMinutes,
  insertTestPost,
} from '@voucha/test-helpers'
import {
  getTestPostModerationWorkAttemptCount,
  getTestPostModerationWorkHoldMs,
} from '@voucha/test-helpers/post-moderation-attempt-state'
import { handleOpenAIModerationOmniSingleJob } from '../../processors/openai-moderation-omni-single.mts'

const requestOpenAIModeration = vi.hoisted(() => vi.fn<VitestLooseMock>())
// The provider HTTP client is the only stub: the ledger, the processor, and the retry
// classification all run for real.
vi.mock<typeof import('@modules/openai-utils/moderate')>(
  import('@modules/openai-utils/moderate'),
  async importOriginal => ({ ...(await importOriginal()), requestOpenAIModeration }),
)

async function insertPendingPost(): Promise<string> {
  const creator = await createTestUser()
  return insertTestPost({
    title: `OpenAI rate limit ${randomUUID()}`,
    slug: `openai-rate-limit-${randomUUID()}`,
    createdById: creator.id,
    markdown: 'Rate limit worker fixture.',
    clearanceStatus: 'pending',
  })
}

function makeJob(id: string): Job<{ id: string }> {
  return { data: { id }, name: 'post' } as Job<{ id: string }>
}

describe('openai moderation post job under a provider rate limit', () => {
  it('requeues for the Retry-After without recording a ledger attempt', async () => {
    const postId = await insertPendingPost()
    const rateLimited = new RateLimitError(
      429,
      {},
      'rate limited',
      new Headers({ 'retry-after': '30' }),
    )
    requestOpenAIModeration.mockRejectedValueOnce(rateLimited)

    const thrown: unknown = await handleOpenAIModerationOmniSingleJob(
      makeJob(postId),
      {} as Worker,
    ).catch((err: unknown) => err)

    expect(thrown).toMatchObject({ name: 'RateLimitError', delayMs: 30_000, cause: rateLimited })
    expect(await getTestPostModerationWorkAttemptCount(postId, 'openai_omni')).toBe(0)
    const holdMs = await getTestPostModerationWorkHoldMs(postId, 'openai_omni')
    expect(holdMs).toBeGreaterThan(25_000)
    expect(holdMs).toBeLessThanOrEqual(30_000)
  })

  it('still records a failed attempt for any other provider failure', async () => {
    const postId = await insertPendingPost()
    const outage = new Error('provider down')
    requestOpenAIModeration.mockRejectedValueOnce(outage)

    await expect(handleOpenAIModerationOmniSingleJob(makeJob(postId), {} as Worker)).rejects.toBe(
      outage,
    )

    expect(await getTestPostModerationWorkAttemptCount(postId, 'openai_omni')).toBe(1)
    expect(await getTestPostModerationRetryDelayMinutes(postId, 'openai_omni')).toBe(5)
  })
})
