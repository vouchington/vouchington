import { randomUUID } from 'node:crypto'
import { describe, it, expect, vi } from 'vitest'
import {
  createTestUser,
  insertTestPost,
  insertTestModerationReport,
  findAiUsageRecordForPost,
  pollUntilNotNull,
} from '@voucha/test-helpers'
import { runReportJudgementAgent } from './run.mts'
import { OpenAIResponseNotCompletedError } from '@agents/_shared'
import type { Response } from 'openai/resources/responses/responses'

describe('runReportJudgementAgent', () => {
  it('records a ledger row from an incomplete response before the error propagates', async () => {
    const author = await createTestUser()
    const reporter = await createTestUser()
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `rja-incomplete-${randomUUID().slice(0, 8)}`,
      title: `RJA Incomplete ${randomUUID().slice(0, 8)}`,
      markdown: 'Post body for judgement agent failure-cost test',
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
      reason: 'spam',
    })

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
          usage: { input_tokens: 200, output_tokens: 40 },
          incomplete_details: { reason: 'max_output_tokens' },
        } as Response),
      ),
    )

    await expect(
      runReportJudgementAgent(
        { entityType: 'post', entityId: postId, triggeringReportId: reportId, rerunById: null },
        callModel,
      ),
    ).rejects.toThrow('OpenAI response incomplete: max_output_tokens')

    const row = await pollUntilNotNull(() => findAiUsageRecordForPost(postId, 'report-judgement'))
    if (!row) throw new Error('ai_usage_records row was not written for the failed response')
    expect(row.model).toBe('gpt-5.4-nano-2026-03-17')
    expect(row.service_tier).toBe('flex')
    expect(row.input_tokens).toBe(200)
    expect(row.output_tokens).toBe(40)
    expect(row.pricing_status).toBe('priced')
  })
})
