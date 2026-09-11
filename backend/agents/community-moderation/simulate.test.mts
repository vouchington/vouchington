import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { simulateCommunityPromptOnPosts } from './simulate.mts'
import type { CommunityAgentPrompt } from '@services/community-agent-prompts'
import type { CommunityAgentPromptSimulationPost } from '@services/community-agent-prompts/simulations'
import {
  createTestUser,
  insertTestCommunity,
  findAiUsageRecordForAgent,
  pollUntilNotNull,
} from '@voucha/test-helpers'
import type { Response } from 'openai/resources/responses/responses'
import { OpenAIResponseNotCompletedError } from '@agents/_shared'

const createResponse = vi.fn<VitestLooseMock>()

describe('simulateCommunityPromptOnPosts', () => {
  beforeEach(() => {
    createResponse.mockReset()
  })

  it('returns parsed results and calls OpenAI once for the sampled posts', async () => {
    createResponse.mockResolvedValueOnce(
      makeTextResponse(
        JSON.stringify({
          results: [
            { post_id: 'post-1', flagged: true, reason: 'Matches rule' },
            { post_id: 'post-2', flagged: false, reason: '' },
          ],
        }),
      ) as never,
    )

    const results = await simulateCommunityPromptOnPosts(makePrompt(), makePosts(), {
      currentUserId: 'user-1',
      promptOverride: 'Custom prompt',
      createResponse,
    })

    expect(results).toEqual([
      { post_id: 'post-1', flagged: true, reason: 'Matches rule' },
      { post_id: 'post-2', flagged: false, reason: '' },
    ])
    expect(createResponse).toHaveBeenCalledOnce()
    const call = createResponse.mock.calls[0][0] as Record<string, unknown>
    expect(call.model).toBe('gpt-5.4-nano')
    expect(call.safety_identifier).toBe('user-1')
    expect(call.instructions).toContain('Custom prompt')
    expect(String(call.input)).toContain('post-1')
  })

  it('returns empty results without calling OpenAI when there is no sample', async () => {
    const results = await simulateCommunityPromptOnPosts(makePrompt(), [], {
      currentUserId: 'user-1',
      createResponse,
    })

    expect(results).toEqual([])
    expect(createResponse).not.toHaveBeenCalled()
  })

  it('caps each sampled post input before batching the simulation request', async () => {
    createResponse.mockResolvedValueOnce(
      makeTextResponse(
        JSON.stringify({ results: [{ post_id: 'post-long', flagged: false, reason: '' }] }),
      ) as never,
    )
    const posts: CommunityAgentPromptSimulationPost[] = [
      {
        ...makePosts()[0],
        id: 'post-long',
        markdown: `${'x'.repeat(5000)}tail-marker`,
      },
    ]

    await simulateCommunityPromptOnPosts(makePrompt(), posts, {
      currentUserId: 'user-1',
      createResponse,
    })

    const call = createResponse.mock.calls[0][0] as { input: string }
    const parsed = JSON.parse(call.input) as { posts: Array<{ content: string }> }
    expect(parsed.posts[0].content.length).toBeLessThanOrEqual(4000)
    expect(parsed.posts[0].content).not.toContain('tail-marker')
  })

  it('throws when the model omits a sampled post result', async () => {
    createResponse.mockResolvedValueOnce(
      makeTextResponse(
        JSON.stringify({ results: [{ post_id: 'post-1', flagged: true, reason: '' }] }),
      ) as never,
    )

    await expect(
      simulateCommunityPromptOnPosts(makePrompt(), makePosts(), {
        currentUserId: 'user-1',
        createResponse,
      }),
    ).rejects.toThrow('one result per post')
  })

  it('throws when the model returns an invalid sampled post result', async () => {
    createResponse.mockResolvedValueOnce(
      makeTextResponse(
        JSON.stringify({ results: [{ post_id: 'unknown-post', flagged: true, reason: '' }] }),
      ) as never,
    )

    await expect(
      simulateCommunityPromptOnPosts(makePrompt(), makePosts(), {
        currentUserId: 'user-1',
        createResponse,
      }),
    ).rejects.toThrow('Invalid community prompt simulation result')
  })

  it('throws a structured error when the model returns null JSON', async () => {
    createResponse.mockResolvedValueOnce(makeTextResponse('null') as never)

    await expect(
      simulateCommunityPromptOnPosts(makePrompt(), makePosts(), {
        currentUserId: 'user-1',
        createResponse,
      }),
    ).rejects.toThrow('Invalid community prompt simulation results')
  })

  it('records usage from a failed/incomplete response before rethrowing', async () => {
    // A moderator's retry after this failure is the only chance to attribute the charge -- the
    // call-site catch block must record from the thrown OpenAIResponseNotCompletedError, not
    // just from a successful response.
    const random = randomUUID().slice(0, 8)
    const user = await createTestUser()
    const community = await insertTestCommunity({
      createdById: user.id,
      slug: `sim-cost-track-${random}`,
    })
    const prompt: CommunityAgentPrompt = {
      ...makePrompt(),
      id: `prompt-${random}`,
      community_id: community.id,
    }

    createResponse.mockRejectedValueOnce(
      new OpenAIResponseNotCompletedError('OpenAI response incomplete: max_output_tokens', {
        status: 'incomplete',
        model: 'gpt-5.4-nano-2026-03-17',
        service_tier: 'flex',
        usage: { input_tokens: 210, output_tokens: 33 },
        incomplete_details: { reason: 'max_output_tokens' },
      } as Response),
    )

    await expect(
      simulateCommunityPromptOnPosts(prompt, makePosts(), {
        currentUserId: 'user-1',
        createResponse,
      }),
    ).rejects.toThrow('OpenAI response incomplete: max_output_tokens')

    const row = await pollUntilNotNull(() =>
      findAiUsageRecordForAgent(`community-prompt-${prompt.id}`, {
        inputTokens: 210,
        outputTokens: 33,
      }),
    )
    if (!row) throw new Error('ai_usage_records row was not written for the failed response')
    expect(row.model).toBe('gpt-5.4-nano-2026-03-17')
    expect(row.service_tier).toBe('flex')
    expect(row.community_id).toBe(community.id)
    expect(row.pricing_status).toBe('priced')
  })
})

function makePrompt(): CommunityAgentPrompt {
  return {
    id: 'prompt-1',
    community_id: 'community-1',
    created_by_id: 'user-1',
    agent_id: 'agent-1',
    prompt: 'Flag spam',
    model_name: 'gpt-5.4-nano',
    model_provider: 'openai',
    slot_allocated: false,
    on_flag_action: 'unpublish',
    activated_at: null,
    deactivated_at: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    deleted_at: null,
    deleted_by_id: null,
  }
}

function makePosts(): CommunityAgentPromptSimulationPost[] {
  return [
    {
      id: 'post-1',
      title: 'First post',
      declared_language: null,
      lingua_rs_detected_language: null,
      markdown: 'First body',
      post_type: 'discussion',
      created_by_id: 'user-1',
      approved_at: new Date('2026-01-02T00:00:00Z'),
      content_excerpt: 'First post First body',
    },
    {
      id: 'post-2',
      title: 'Second post',
      declared_language: null,
      lingua_rs_detected_language: null,
      markdown: 'Second body',
      post_type: 'discussion',
      created_by_id: 'user-2',
      approved_at: new Date('2026-01-03T00:00:00Z'),
      content_excerpt: 'Second post Second body',
    },
  ]
}

function makeTextResponse(text: string) {
  return {
    id: 'resp-1',
    output: [{ type: 'message', status: 'completed', content: [{ type: 'output_text', text }] }],
  }
}
