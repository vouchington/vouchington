import { describe, expect, it, beforeAll, vi } from 'vitest'
import { runCommunityPromptOnPost } from '@agents/community-moderation'
import { getPostByAny } from '@services/posts/get'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityAgentPrompt,
  insertTestCommunityPostReview,
  insertTestPost,
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

describe('runCommunityPromptOnPost cost tracking', () => {
  let owner: PrivateUser

  beforeAll(async () => {
    owner = await createTestUser()
  })

  function randomSuffix(): string {
    return Math.random().toString(36).slice(2, 10)
  }

  it('records an ai_usage_records row priced at the model/tier OpenAI actually served, not requested', async () => {
    const r = randomSuffix()
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })

    const prompt = await insertTestCommunityAgentPrompt({
      communityId: community.id,
      createdById: owner.id,
      slotAllocated: true,
      onFlagAction: 'none',
    })

    const postId = await insertTestPost({
      title: `Community cost tracking test ${r}`,
      slug: `comm-cost-tracking-test-${r}`,
      markdown: 'Test post content',
      createdById: owner.id,
    })
    await insertTestCommunityPostReview({ communityId: community.id, postId })

    const post = (await getPostByAny(postId)) as Post

    // callOpenAIModeration always requests service_tier: FLEX_SERVICE_TIER. The mocked response
    // reports a dated snapshot and the *default* tier instead -- proving the ledger is priced
    // from what OpenAI served, not from what this call site asked for.
    vi.mocked(createOpenAIResponse).mockResolvedValueOnce({
      id: `resp_comm_cost_track_${r}`,
      status: 'completed',
      model: 'gpt-5.4-nano-2026-03-17',
      service_tier: 'default',
      output: [
        {
          id: 'msg_comm_cost_track',
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

    await runCommunityPromptOnPost(post, community.id, prompt.id)

    const agentSlug = `community-prompt-${prompt.id}`
    // recordAiUsage is fire-and-forget (never awaited by callOpenAIModeration) -- poll until the
    // insert commits rather than racing it with a bare read.
    const row = await pollUntilNotNull(() => findAiUsageRecordForPost(postId, agentSlug))
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
