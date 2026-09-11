import { randomUUID } from 'node:crypto'
import { describe, it, expect, vi } from 'vitest'
import type { Response } from 'openai/resources/responses/responses'
import type { ActiveModeratorConfig } from '@services/moderation'
import type { Post } from '@services/posts/types'
import { createTestPost, findAiUsageRecordForPost, pollUntilNotNull } from '@voucha/test-helpers'
import { OpenAIResponseNotCompletedError } from '@agents/_shared'
import { callOpenAIModeration } from './openai-moderation.mts'

// Split from openai-moderation.test.mts to stay under the 300-line test-file cap -- see that
// file for the rest of callOpenAIModeration's coverage.
describe('callOpenAIModeration - incomplete response cost recording', () => {
  it('records a ledger row from an incomplete response before the error propagates', async () => {
    const post = (await createTestPost({
      title: 'Marketplace listing',
      markdown: 'Selling points.',
      post_type: 'discussion',
    })) as Post

    const config = makeMarketplaceConfig()

    // max_output_tokens hit mid-call still bills the tokens it consumed. This proves the
    // call-site catch block in callOpenAIModeration records from the thrown
    // OpenAIResponseNotCompletedError -- not just from a successful response -- so a queued
    // retry after this failure doesn't compound an unrecorded charge with another one.
    const createOpenAIResponse = vi.fn<VitestLooseMock>().mockRejectedValue(
      new OpenAIResponseNotCompletedError('OpenAI response incomplete: max_output_tokens', {
        status: 'incomplete',
        model: 'gpt-5.4-nano-2026-03-17',
        service_tier: 'flex',
        usage: { input_tokens: 210, output_tokens: 45 },
        incomplete_details: { reason: 'max_output_tokens' },
      } as Response),
    )

    await expect(
      callOpenAIModeration('Title: Marketplace\n\nContent: hello', config, post, null, {
        createOpenAIResponse,
      }),
    ).rejects.toThrow('OpenAI response incomplete: max_output_tokens')

    const row = await pollUntilNotNull(() =>
      findAiUsageRecordForPost(post.id, config.moderator_slug),
    )
    if (!row) throw new Error('ai_usage_records row was not written for the failed response')
    expect(row.model).toBe('gpt-5.4-nano-2026-03-17')
    expect(row.service_tier).toBe('flex')
    expect(row.input_tokens).toBe(210)
    expect(row.output_tokens).toBe(45)
    expect(row.pricing_status).toBe('priced')
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
