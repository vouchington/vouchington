import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActiveModeratorConfig } from '@services/moderation'
import type { Post } from '@services/posts/types'
import { createSystemUser, createTestPost } from '@voucha/test-helpers'
import { callOpenAIModeration } from './openai-moderation.mts'

describe('callOpenAIModeration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches related URLs and passes augmented input to politics-averse agent', async () => {
    const systemUser = await createSystemUser(`politics-averse-system-${randomUUID().slice(0, 8)}`)
    const post = (await createTestPost({
      title: 'Election roundup',
      markdown: 'A sourced political analysis post.',
      post_type: 'discussion',
    })) as Post

    const config = {
      moderator_id: randomUUID(),
      moderator_slug: 'politics-averse',
      on_flag_action: 'review_queue',
      is_baseline: false,
      system_user_id: systemUser.id,
      prompt: {
        id: randomUUID(),
        prompt: 'Moderate political content carefully.',
        model_name: 'gpt-5.4-nano',
        model_provider: 'openai',
      },
    } satisfies ActiveModeratorConfig

    const getEntityRelations = vi
      .fn<VitestLooseMock>()
      .mockResolvedValue([
        { object_data: { url: 'https://example.com/election-report' } },
        { object_data: { url: 'https://example.org/source-analysis' } },
      ])
    const runPoliticsAverseModeration = vi.fn<VitestLooseMock>().mockResolvedValue({
      flagged: false,
      reason: 'Sourced analysis.',
    })

    const baseInput = 'Title: Election roundup\n\nContent: A sourced political analysis post.'
    await callOpenAIModeration(baseInput, config, post, null, {
      getEntityRelations,
      runPoliticsAverseModeration,
    })

    expect(getEntityRelations).toHaveBeenCalledWith('post', post.id, 'related', 'url', {
      viewer: { kind: 'system' },
      limit: 5,
      sort: 'best',
    })
    expect(runPoliticsAverseModeration).toHaveBeenCalledWith(
      config,
      post,
      expect.stringContaining('https://example.com/election-report'),
    )
    expect(runPoliticsAverseModeration).toHaveBeenCalledWith(
      config,
      post,
      expect.stringContaining('https://example.org/source-analysis'),
    )
  })

  it('passes base input to politics-averse when there are no related URLs', async () => {
    const systemUser = await createSystemUser(`politics-averse-system-${randomUUID().slice(0, 8)}`)
    const post = (await createTestPost({
      title: 'Election roundup',
      markdown: 'A sourced political analysis post.',
      post_type: 'discussion',
    })) as Post

    const config = {
      moderator_id: randomUUID(),
      moderator_slug: 'politics-averse',
      on_flag_action: 'review_queue',
      is_baseline: false,
      system_user_id: systemUser.id,
      prompt: {
        id: randomUUID(),
        prompt: 'Moderate political content carefully.',
        model_name: 'gpt-5.4-nano',
        model_provider: 'openai',
      },
    } satisfies ActiveModeratorConfig

    const runPoliticsAverseModeration = vi.fn<VitestLooseMock>().mockResolvedValue({
      flagged: true,
      reason: 'Unsupported political claim.',
    })

    const baseInput = 'Title: Election roundup\n\nContent: A sourced political analysis post.'
    const result = await callOpenAIModeration(baseInput, config, post, null, {
      getEntityRelations: vi.fn<VitestLooseMock>().mockResolvedValue([]),
      runPoliticsAverseModeration,
    })

    expect(runPoliticsAverseModeration).toHaveBeenCalledWith(config, post, baseInput)
    // Politics-averse usage is recorded at the runToolLoop seam it delegates to, not here — this
    // result carries no model/service_tier because there is none to attribute at this call site.
    expect(result).toEqual({
      result: { flagged: true, reason: 'Unsupported political claim.' },
      usage: null,
    })
  })

  it('uses the single-call path for non-politics moderators', async () => {
    const post = (await createTestPost({
      title: 'Marketplace listing',
      markdown: 'Selling points.',
      post_type: 'discussion',
    })) as Post

    const config = makeMarketplaceConfig()

    const createOpenAIResponse = vi.fn<VitestLooseMock>().mockResolvedValue({
      id: 'resp_123',
      output: [
        {
          type: 'message',
          status: 'completed',
          content: [
            {
              type: 'output_text',
              text: '{"flagged":false,"reason":"Not marketplace."}',
            },
          ],
        },
      ],
    })

    const result = await callOpenAIModeration(
      'Title: Marketplace\n\nContent: hello',
      config,
      post,
      null,
      {
        createOpenAIResponse,
      },
    )

    expect(createOpenAIResponse).toHaveBeenCalledTimes(1)
    // The mocked response carries no usage, so no model/service_tier is attributed either —
    // there's nothing OpenAI actually billed to report.
    expect(result).toEqual({
      result: { flagged: false, reason: 'Not marketplace.' },
      usage: null,
    })
  })

  it('attributes cost to the model/tier OpenAI actually served, not what was requested', async () => {
    const post = (await createTestPost({
      title: 'Marketplace listing',
      markdown: 'Selling points.',
      post_type: 'discussion',
    })) as Post

    // Requested as gpt-5.4-nano — the response below reports different model/tier values to
    // prove the result reflects what OpenAI served, not what this call site asked for.
    const config = makeMarketplaceConfig()

    const createOpenAIResponse = vi.fn<VitestLooseMock>().mockResolvedValue({
      id: 'resp_123',
      model: 'gpt-5.4-nano-2026-03-17',
      service_tier: 'default',
      usage: { input_tokens: 120, output_tokens: 30 },
      output: [
        {
          type: 'message',
          status: 'completed',
          content: [
            {
              type: 'output_text',
              text: '{"flagged":false,"reason":"Not marketplace."}',
            },
          ],
        },
      ],
    })

    const result = await callOpenAIModeration(
      'Title: Marketplace\n\nContent: hello',
      config,
      post,
      null,
      {
        createOpenAIResponse,
      },
    )

    expect(result).toEqual({
      result: { flagged: false, reason: 'Not marketplace.' },
      usage: { input_tokens: 120, output_tokens: 30 },
      model: 'gpt-5.4-nano-2026-03-17',
      service_tier: 'default',
    })
  })

  it('omits metadata.post_id for a dry-run post with no id, rather than sending null', async () => {
    // Responses API metadata values must be strings. A dry run (agent-prompt test-runs) has no
    // real post, so post.id is null -- the request must omit the key, not send post_id: null,
    // which OpenAI rejects.
    const fakePost = {
      id: null,
      post_type: 'link',
      created_by_id: randomUUID(),
    } as unknown as Post

    const config = makeMarketplaceConfig()

    const createOpenAIResponse = vi.fn<VitestLooseMock>().mockResolvedValue({
      id: 'resp_123',
      output: [
        {
          type: 'message',
          status: 'completed',
          content: [
            {
              type: 'output_text',
              text: '{"flagged":false,"reason":"Not marketplace."}',
            },
          ],
        },
      ],
    })

    await callOpenAIModeration('Title: Marketplace\n\nContent: hello', config, fakePost, null, {
      createOpenAIResponse,
    })

    expect(createOpenAIResponse).toHaveBeenCalledTimes(1)
    const call = createOpenAIResponse.mock.calls[0][0] as { metadata: Record<string, unknown> }
    expect(call.metadata).not.toHaveProperty('post_id')
  })

  it('rejects categories with non-string entries', async () => {
    const post = (await createTestPost({
      title: 'Marketplace listing',
      markdown: 'Selling points.',
      post_type: 'discussion',
    })) as Post

    const config = makeMarketplaceConfig()

    const createOpenAIResponse = vi.fn<VitestLooseMock>().mockResolvedValue({
      id: 'resp_123',
      output: [
        {
          type: 'message',
          status: 'completed',
          content: [
            {
              type: 'output_text',
              text: '{"flagged":true,"reason":"Marketplace.","categories":["buying",1,null]}',
            },
          ],
        },
      ],
    })

    await expect(
      callOpenAIModeration('Title: Marketplace', config, post, null, { createOpenAIResponse }),
    ).rejects.toThrow('Invalid moderation results')
  })
})

function makeMarketplaceConfig(): ActiveModeratorConfig {
  return {
    moderator_id: randomUUID(),
    moderator_slug: 'marketplace',
    on_flag_action: 'review_queue',
    is_baseline: false,
    system_user_id: randomUUID(),
    prompt: {
      id: randomUUID(),
      prompt: 'Moderate marketplace content.',
      model_name: 'gpt-5.4-nano',
      model_provider: 'openai',
    },
  }
}
