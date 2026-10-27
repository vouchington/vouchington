import { randomUUID } from 'node:crypto'
import { RateLimitError } from 'openai'
import { describe, expect, it, vi } from 'vitest'
import type { Job } from 'glide-mq'
import { beginPostModerationAttempt } from '@services/post-clearance'
import { createPostModerationContent } from '@services/posts/content'
import { getPostByAny } from '@services/posts/get'
import {
  createTestUser,
  getPostModerationData,
  insertTestPost,
  setPostModerationContentSha256,
} from '@voucha/test-helpers'
import { getTestPostModerationAttemptStateForPost } from '@voucha/test-helpers/post-moderation-attempt-state'
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

async function beginOpenAttempt(postId: string): Promise<string> {
  const post = await getPostByAny(postId)
  if (!post) throw new Error('missing rate-limit fixture')
  await setPostModerationContentSha256(postId, createPostModerationContent(post).content_sha256)
  const attempt = await beginPostModerationAttempt(postId, 'openai_omni')
  return attempt!.version_id
}

function makeJob(versionId: string): Job<{ versionId: string }> {
  return { data: { versionId }, name: 'openai-moderation.post' } as Job<{ versionId: string }>
}

describe('openai moderation post job under a provider rate limit', () => {
  it('throws the provider delay and leaves the attempt open', async () => {
    const postId = await insertPendingPost()
    const versionId = await beginOpenAttempt(postId)
    const rateLimited = new RateLimitError(
      429,
      {},
      'rate limited',
      new Headers({ 'retry-after': '30' }),
    )
    requestOpenAIModeration.mockRejectedValueOnce(rateLimited)

    const thrown: unknown = await handleOpenAIModerationOmniSingleJob(makeJob(versionId)).catch(
      (err: unknown) => err,
    )

    expect(thrown).toMatchObject({ name: 'RateLimitError', delayMs: 30_000, cause: rateLimited })
    await expect(getTestPostModerationAttemptStateForPost(postId, 'openai_omni')).resolves.toEqual({
      completed_at: null,
      attempt_number: 1,
    })
    await expect(getPostModerationData(postId)).resolves.toMatchObject({
      is_flagged_by_openai_omni_moderation: null,
    })
  })

  it('leaves the attempt open when the provider fails for another reason', async () => {
    const postId = await insertPendingPost()
    const versionId = await beginOpenAttempt(postId)
    const outage = new Error('provider down')
    requestOpenAIModeration.mockRejectedValueOnce(outage)

    await expect(handleOpenAIModerationOmniSingleJob(makeJob(versionId))).rejects.toBe(outage)
    await expect(getTestPostModerationAttemptStateForPost(postId, 'openai_omni')).resolves.toEqual({
      completed_at: null,
      attempt_number: 1,
    })
    await expect(getPostModerationData(postId)).resolves.toMatchObject({
      is_flagged_by_openai_omni_moderation: null,
    })
  })
})
