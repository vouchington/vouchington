import { randomUUID } from 'node:crypto'
import { describe, it, expect, vi } from 'vitest'
import {
  createTestUser,
  insertTestPost,
  markPostFlaggedForModeration,
  suspendTestUserGetId,
  findAiUsageRecordForPost,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { createModerationAppeal } from '@services/moderation-appeals/create'
import { getModerationAppealById } from '@services/moderation-appeals/get'
import { parseCreateModerationAppealInput } from '@services/moderation-appeals/parse'
import { runAppealResolutionAgent } from './run.mts'
import { appealResolutionRunInputForTest } from '@voucha/test-helpers/appeal-resolution-run'
import { OpenAIResponseNotCompletedError } from '@modules/openai-utils/create-response'
import type { Response } from 'openai/resources/responses/responses'
import {
  makeAgentModelCaller,
  TEST_MODEL_SELECTION,
  TEST_OPENAI_SELECTION,
} from '@voucha/test-helpers/agents/model-call-result'
import type { AgentModelCaller } from '@agents/_shared'

describe('runAppealResolutionAgent', () => {
  it('calls the model for a suspension appeal and includes suspension context', async () => {
    const suspendedUser = await createTestUser()
    await suspendTestUserGetId(suspendedUser.id, 'Test suspension reason')
    const input = parseCreateModerationAppealInput({
      target_type: 'suspension',
      appeal_reason: `Suspension appeal reason ${randomUUID()}`,
    })
    const { appeal } = await createModerationAppeal(suspendedUser, WEB_PROVENANCE, input)
    const callModel = makeAgentModelCaller({
      recommended_action: 'deny',
      public_response: 'The suspension stands.',
      internal_response: 'User violated platform rules.',
    })

    await runAppealResolutionAgent(
      await appealResolutionRunInputForTest(appeal.id),
      TEST_MODEL_SELECTION,
      callModel,
    )

    expect(callModel).toHaveBeenCalledOnce()
    const updated = await getModerationAppealById(appeal.id)
    expect(updated!.ai_drafted_at).not.toBeNull()
    expect(updated!.recommended_action).toBe('deny')
    expect(callModel.mock.calls[0][0]).toContain('Platform suspension')
  })

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
    const { appeal } = await createModerationAppeal(author, WEB_PROVENANCE, input)

    // max_output_tokens hit mid-call still bills the tokens it consumed. This proves the direct
    // call-site catch block records from the thrown OpenAIResponseNotCompletedError -- not just
    // from a successful response -- so a queued retry after this failure doesn't compound an
    // unrecorded charge with another one.
    const callModel = vi.fn<AgentModelCaller<never>>(() =>
      Promise.reject(
        new OpenAIResponseNotCompletedError('OpenAI response incomplete: max_output_tokens', {
          status: 'incomplete',
          model: 'gpt-6-luna-2026-10-01',
          service_tier: 'flex',
          usage: { input_tokens: 180, output_tokens: 35 },
          incomplete_details: { reason: 'max_output_tokens' },
        } as Response),
      ),
    )

    await expect(
      runAppealResolutionAgent(
        await appealResolutionRunInputForTest(appeal.id),
        TEST_OPENAI_SELECTION,
        callModel,
      ),
    ).rejects.toThrow('OpenAI response incomplete: max_output_tokens')

    await expect(findAiUsageRecordForPost(postId, 'appeal-resolution')).resolves.toMatchObject({
      model: 'gpt-6-luna-2026-10-01',
      service_tier_id: 'flex',
      input_tokens: 180,
      output_tokens: 35,
      pricing_status: 'priced',
    })
  })
})
