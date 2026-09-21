import { randomUUID } from 'node:crypto'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { runAutotaggerOnPost } from '../run.mts'
import type { Post } from '@services/posts/types'
import {
  createTestUserDirect,
  insertTestPost,
  insertTestCommunity,
  setupTestAutotaggerAgent,
  findAiUsageRecordForPost,
  pollUntilNotNull,
} from '@voucha/test-helpers'
import { OpenAIResponseNotCompletedError } from '@modules/openai-utils/create-response'
import { createOpenRouterResponse } from '@modules/openrouter-utils'
import type { Response } from 'openai/resources/responses/responses'

vi.mock<typeof import('@modules/openrouter-utils')>(
  import('@modules/openrouter-utils'),
  async importOriginal => ({
    ...(await importOriginal()),
    createOpenRouterResponse: vi.fn<VitestLooseMock>(),
  }),
)

describe('runAutotaggerOnPost cost tracking', () => {
  let testUserId: string

  beforeAll(async () => {
    await setupTestAutotaggerAgent()
    const testUser = await createTestUserDirect()
    testUserId = testUser!.id
  }, 30_000)

  // The mocked createOpenRouterResponse is shared module state across every test in this file --
  // reset call history and queued resolutions so one test's mock setup can't leak into the next.
  beforeEach(() => {
    vi.mocked(createOpenRouterResponse).mockReset()
  })

  it('records a ledger row priced at the model/tier OpenAI actually served, not requested', async () => {
    const random = randomUUID().slice(0, 8)
    const postId = await insertTestPost({
      title: `Autotagger cost tracking test post ${random}`,
      slug: `autotagger-cost-track-${random}`,
      createdById: testUserId,
      markdown: `Test content ${random}`,
    })
    const post: Partial<Post> = {
      id: postId,
      title: `Autotagger cost tracking test post ${random}`,
      markdown: `Test content ${random}`,
    }

    // callOpenAIAutotagger requests service_tier: 'flex' (openai-autotagger.mts). The mocked
    // response reports a dated snapshot and the *default* tier instead, with no tool calls so the
    // loop terminates after one iteration -- proving both that the ledger is priced from what
    // OpenAI served (not requested), and that this is exercised through the generalized
    // runToolLoop seam (recordToolLoopUsage), distinct from the direct-call seam moderation's
    // cost-tracking test covers.
    vi.mocked(createOpenRouterResponse).mockResolvedValueOnce({
      id: `resp_autotagger_cost_track_${randomUUID()}`,
      status: 'completed',
      model: 'gpt-5.4-nano-2026-03-17',
      service_tier: 'default',
      output: [
        {
          id: 'msg_autotagger_cost_track',
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [
            {
              type: 'output_text',
              text: 'No topics apply.',
              annotations: [],
              logprobs: [],
            },
          ],
        },
      ],
      output_text: 'No topics apply.',
      usage: { input_tokens: 200, output_tokens: 40 },
    })

    const result = await runAutotaggerOnPost(post as Post)

    expect(result).not.toBeNull()
    expect(result!.skipped).toBe(false)
    expect(result!.topics_added).toEqual([])
    expect(vi.mocked(createOpenRouterResponse)).toHaveBeenCalledOnce()

    // recordToolLoopUsage is fire-and-forget (never awaited by runToolLoop) -- poll until the
    // insert commits rather than racing it with a bare read.
    const row = await pollUntilNotNull(() => findAiUsageRecordForPost(postId, 'autotagger'))
    if (!row) throw new Error('ai_usage_records row was not written')

    expect(row.model).toBe('gpt-5.4-nano-2026-03-17')
    expect(row.service_tier).toBe('default')
    expect(row.input_tokens).toBe(200)
    expect(row.output_tokens).toBe(40)
    expect(row.cached_input_tokens).toBe(0)
    expect(row.pricing_status).toBe('priced')
    // gpt-5.4-nano DEFAULT (not flex, despite flex being requested): 200 in * 200_000/1M +
    // 40 out * 1_250_000/1M = 40 + 50 = 90. The flex price for the same usage would be 45 -- if
    // this ever regresses to pricing off the requested tier instead of the response's, this
    // assertion catches it.
    expect(row.cost_microunits).toBe('90')
  })

  it('attributes ledger rows to the post community, not null', async () => {
    const random = randomUUID().slice(0, 8)
    const community = await insertTestCommunity({ createdById: testUserId })
    const postId = await insertTestPost({
      title: `Autotagger community cost tracking test post ${random}`,
      slug: `autotagger-community-cost-track-${random}`,
      createdById: testUserId,
      markdown: `Test content ${random}`,
      communityId: community.id,
    })
    const post: Partial<Post> = {
      id: postId,
      title: `Autotagger community cost tracking test post ${random}`,
      markdown: `Test content ${random}`,
      community_id: community.id,
    }

    vi.mocked(createOpenRouterResponse).mockResolvedValueOnce({
      id: `resp_autotagger_community_cost_track_${randomUUID()}`,
      status: 'completed',
      model: 'gpt-5.4-nano-2026-03-17',
      service_tier: 'flex',
      output: [
        {
          id: 'msg_autotagger_community_cost_track',
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [
            {
              type: 'output_text',
              text: 'No topics apply.',
              annotations: [],
              logprobs: [],
            },
          ],
        },
      ],
      output_text: 'No topics apply.',
      usage: { input_tokens: 200, output_tokens: 40 },
    })

    const result = await runAutotaggerOnPost(post as Post)

    expect(result).not.toBeNull()
    expect(vi.mocked(createOpenRouterResponse)).toHaveBeenCalledOnce()

    const row = await pollUntilNotNull(() => findAiUsageRecordForPost(postId, 'autotagger'))
    if (!row) throw new Error('ai_usage_records row was not written')

    expect(row.community_id).toBe(community.id)
  })

  it('records a ledger row from an incomplete response before the error propagates', async () => {
    const random = randomUUID().slice(0, 8)
    const postId = await insertTestPost({
      title: `Autotagger failure cost tracking test post ${random}`,
      slug: `autotagger-failure-cost-track-${random}`,
      createdById: testUserId,
      markdown: `Test content ${random}`,
    })
    const post: Partial<Post> = {
      id: postId,
      title: `Autotagger failure cost tracking test post ${random}`,
      markdown: `Test content ${random}`,
    }

    // max_output_tokens hit mid-tool-loop still bills the tokens it consumed. This proves
    // callRecordingFailedUsage records from the thrown OpenAIResponseNotCompletedError -- not
    // just from a successful response -- so a queued retry after this failure doesn't compound
    // an unrecorded charge with another one.
    vi.mocked(createOpenRouterResponse).mockRejectedValueOnce(
      new OpenAIResponseNotCompletedError('OpenAI response incomplete: max_output_tokens', {
        status: 'incomplete',
        model: 'gpt-5.4-nano-2026-03-17',
        service_tier: 'flex',
        usage: { input_tokens: 300, output_tokens: 50 },
        incomplete_details: { reason: 'max_output_tokens' },
      } as Response),
    )

    const result = await runAutotaggerOnPost(post as Post)

    expect(result).not.toBeNull()
    expect(result!.error).toContain('OpenAI response incomplete: max_output_tokens')

    const row = await pollUntilNotNull(() => findAiUsageRecordForPost(postId, 'autotagger'))
    if (!row) throw new Error('ai_usage_records row was not written for the failed response')

    expect(row.model).toBe('gpt-5.4-nano-2026-03-17')
    expect(row.service_tier).toBe('flex')
    expect(row.input_tokens).toBe(300)
    expect(row.output_tokens).toBe(50)
    expect(row.pricing_status).toBe('priced')
  })
})
