import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  createPostLLMModerator,
  createOpenAIPostLLMModerationPrompt,
  updatePostLLMModerator,
  updateOpenAIPostLLMModerationPrompt,
} from '@services/moderation'
import { runModeratorOnPost } from '@agents/moderation'
import { createPost } from '@services/posts'
import {
  createTestUser,
  createSystemUser,
  insertTestCommunity,
  insertTestCommunityMember,
  findAiUsageRecordForPost,
  pollUntilNotNull,
} from '@voucha/test-helpers'
import type { Post } from '@services/posts/types'
import type { PrivateUser } from '@services/users/types'
import { createOpenAIResponse } from '@modules/openai-utils/create-response'

vi.mock<typeof import('@modules/openai-utils/create-response')>(
  import('@modules/openai-utils/create-response'),
  async importOriginal => ({
    ...(await importOriginal()),
    createOpenAIResponse: vi.fn<VitestLooseMock>(),
  }),
)

describe('runModeratorOnPost cost tracking', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('records a ledger row priced at the model/tier OpenAI actually served, not requested', async () => {
    const random = randomUUID().slice(0, 8)
    const systemUser = await createSystemUser(`cost-track-sys-${random}`)
    const moderator = await createPostLLMModerator(user, systemUser, `cost-track-${random}`)
    await updatePostLLMModerator(user, moderator.id, { active: true })
    const prompt = await createOpenAIPostLLMModerationPrompt(
      user,
      'openai',
      'gpt-5.4-nano',
      `Cost tracking test prompt ${random}`,
      moderator.id,
    )
    await updateOpenAIPostLLMModerationPrompt(user, prompt.id, { active: true })

    const community = await insertTestCommunity({
      createdById: user.id,
      slug: `cost-track-community-${random}`,
    })
    await insertTestCommunityMember({ communityId: community.id, userId: user.id, role: 'owner' })

    const post = (await createPost(user, {
      title: `Cost tracking test post ${random}`,
      markdown: `Test content ${random}`,
      post_type: 'discussion',
      community_id: community.id,
    })) as Post

    // createPostModerationResponse always requests service_tier: FLEX_SERVICE_TIER. The mocked
    // response reports a dated snapshot and the *default* tier instead -- proving the ledger is
    // priced from what OpenAI served, not from what this call site asked for.
    vi.mocked(createOpenAIResponse).mockResolvedValueOnce({
      id: `resp_cost_track_${randomUUID()}`,
      status: 'completed',
      model: 'gpt-5.4-nano-2026-03-17',
      service_tier: 'default',
      output: [
        {
          id: 'msg_cost_track',
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [
            {
              type: 'output_text',
              text: '{"flagged":false,"reason":"Safe content."}',
              annotations: [],
              logprobs: [],
            },
          ],
        },
      ],
      output_text: '{"flagged":false,"reason":"Safe content."}',
      usage: { input_tokens: 150, output_tokens: 75 },
    })

    const result = await runModeratorOnPost(post, moderator.slug, {
      promptId: prompt.id,
      communityId: community.id,
    })

    expect(result.skipped).toBe(false)
    expect(result.moderator_slug).toBe(moderator.slug)
    expect(vi.mocked(createOpenAIResponse)).toHaveBeenCalledOnce()

    // recordAiUsage is fire-and-forget (never awaited by runModeratorOnPost) -- poll until the
    // insert commits rather than racing it with a bare read.
    const row = await pollUntilNotNull(() => findAiUsageRecordForPost(post.id, moderator.slug))
    if (!row) throw new Error('ai_usage_records row was not written')

    expect(row.model).toBe('gpt-5.4-nano-2026-03-17')
    expect(row.service_tier).toBe('default')
    expect(row.input_tokens).toBe(150)
    expect(row.output_tokens).toBe(75)
    expect(row.cached_input_tokens).toBe(0)
    expect(row.pricing_status).toBe('priced')
    // gpt-5.4-nano DEFAULT (not flex, despite flex being requested): 150 in * 200_000/1M +
    // 75 out * 1_250_000/1M = 30 + 93.75 = 123.75, rounds half-up to 124. The flex price for the
    // same usage would be 62 -- if this ever regresses to pricing off the requested tier instead
    // of the response's, this assertion catches it.
    expect(row.cost_microunits).toBe('124')
  })
})
