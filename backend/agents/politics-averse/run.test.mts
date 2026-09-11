import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActiveModeratorConfig } from '@services/moderation'
import type { Post } from '@services/posts/types'
import { createSystemUser, createTestPost } from '@voucha/test-helpers'
import { runPoliticsAverseModeration } from './run.mts'

describe('runPoliticsAverseModeration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('passes the provided input to the tool loop', async () => {
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

    const runToolLoop = vi.fn<VitestLooseMock>().mockResolvedValue({
      text: '{"flagged":true,"reason":"Unsupported political claim."}',
      iterations: 1,
      terminationReason: 'no_tool_calls',
    })

    const input = 'Title: Election roundup\n\nContent: A sourced political analysis post.'
    const result = await runPoliticsAverseModeration(config, post, input, { runToolLoop })

    expect(runToolLoop).toHaveBeenCalledTimes(1)
    expect(runToolLoop).toHaveBeenCalledWith(expect.objectContaining({ input }))
    expect(result).toEqual({
      flagged: true,
      reason: 'Unsupported political claim.',
    })
  })

  it('throws when the configured system user is missing', async () => {
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
      system_user_id: randomUUID(),
      prompt: {
        id: randomUUID(),
        prompt: 'Moderate political content carefully.',
        model_name: 'gpt-5.4-nano',
        model_provider: 'openai',
      },
    } satisfies ActiveModeratorConfig

    await expect(runPoliticsAverseModeration(config, post, 'input')).rejects.toThrow(
      `Moderator misconfigured: system user not found (${config.system_user_id})`,
    )
  })
})
