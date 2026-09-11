import { randomUUID } from 'node:crypto'
import { describe, it, expect, vi } from 'vitest'
import {
  createTestUser,
  insertTestPost,
  markPostFlaggedForModeration,
  findAiUsageRecordForPost,
  pollUntilNotNull,
} from '@voucha/test-helpers'
import { createModerationAppeal } from '@services/moderation-appeals/create'
import { parseCreateModerationAppealInput } from '@services/moderation-appeals/parse'
import { runAppealResolutionAgent } from './run.mts'
import { OpenAIResponseNotCompletedError } from '@agents/_shared'
import type { Response } from 'openai/resources/responses/responses'

describe('runAppealResolutionAgent', () => {
  it('records a ledger row from an incomplete response before the error propagates', async () => {
    const author = await createTestUser()
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `appeal-incomplete-${randomUUID().slice(0, 8)}`,
      title: `Appeal Incomplete ${randomUUID().slice(0, 8)}`,
      markdown: 'Post content for appeal-resolution failure-cost test.',
    })
    // Post must be rejected (removed) before it can be appealed
    await markPostFlaggedForModeration(postId)
    const input = parseCreateModerationAppealInput({
      target_type: 'removal',
      target_id: postId,
      appeal_reason: `Failure cost appeal reason ${randomUUID()}`,
    })
    const { appeal } = await createModerationAppeal(author, input)

    // max_output_tokens hit mid-call still bills the tokens it consumed. This proves the direct
    // call-site catch block records from the thrown OpenAIResponseNotCompletedError -- not just
    // from a successful response -- so a queued retry after this failure doesn't compound an
    // unrecorded charge with another one.
    const callModel = vi.fn<(input: string, safetyId: string) => Promise<unknown>>(() =>
      Promise.reject(
        new OpenAIResponseNotCompletedError('OpenAI response incomplete: max_output_tokens', {
          status: 'incomplete',
          model: 'gpt-5.4-nano-2026-03-17',
          service_tier: 'flex',
          usage: { input_tokens: 180, output_tokens: 35 },
          incomplete_details: { reason: 'max_output_tokens' },
        } as Response),
      ),
    )

    await expect(runAppealResolutionAgent({ appealId: appeal.id }, callModel)).rejects.toThrow(
      'OpenAI response incomplete: max_output_tokens',
    )

    const row = await pollUntilNotNull(() => findAiUsageRecordForPost(postId, 'appeal-resolution'))
    if (!row) throw new Error('ai_usage_records row was not written for the failed response')
    expect(row.model).toBe('gpt-5.4-nano-2026-03-17')
    expect(row.service_tier).toBe('flex')
    expect(row.input_tokens).toBe(180)
    expect(row.output_tokens).toBe(35)
    expect(row.pricing_status).toBe('priced')
  })
})
