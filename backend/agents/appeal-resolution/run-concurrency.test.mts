import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { createTestUser, insertTestUserWarning, WEB_PROVENANCE } from '@voucha/test-helpers'
import { approveModerationAppeal } from '@services/moderation-appeals/approve-appeal'
import { createModerationAppeal } from '@services/moderation-appeals/create'
import { getModerationAppealById } from '@services/moderation-appeals/get'
import { parseCreateModerationAppealInput } from '@services/moderation-appeals/parse'
import { runAppealResolutionAgent, type AppealModelCaller } from './run.mts'
import type { PrivateUser } from '@services/users/types'

function makeModelResponse(
  recommendedAction: 'accept' | 'deny' | 'reduce',
  publicResponse: string,
  internalResponse: string,
): unknown {
  return {
    id: `resp-${randomUUID()}`,
    output: [
      {
        type: 'message',
        status: 'completed',
        content: [
          {
            type: 'output_text',
            text: JSON.stringify({
              recommended_action: recommendedAction,
              public_response: publicResponse,
              internal_response: internalResponse,
            }),
          },
        ],
      },
    ],
  }
}

describe('runAppealResolutionAgent concurrency', () => {
  let staff: PrivateUser
  let appellant: PrivateUser

  beforeAll(async () => {
    staff = await createTestUser()
    appellant = await createTestUser()
  })

  it('preserves an approval that wins while a queued rerun is calling the model', async () => {
    const warning = await insertTestUserWarning({
      userId: appellant.id,
      issuedById: staff.id,
      reason: `Agent concurrency reason ${randomUUID()}`,
    })
    const input = parseCreateModerationAppealInput({
      target_type: 'warning',
      target_id: warning.id,
      appeal_reason: `Appeal concurrency reason ${randomUUID()}`,
    })
    const { appeal } = await createModerationAppeal(WEB_PROVENANCE, appellant, input)
    await runAppealResolutionAgent({ appealId: appeal.id }, () =>
      Promise.resolve(
        makeModelResponse('deny', 'Human-reviewed response.', 'Initial internal response.'),
      ),
    )

    const modelStarted = Promise.withResolvers<void>()
    const modelReleased = Promise.withResolvers<void>()
    const delayedModel: AppealModelCaller = async () => {
      modelStarted.resolve()
      await modelReleased.promise
      return makeModelResponse('reduce', 'Stale replacement.', 'Stale internal response.')
    }

    const queuedRun = runAppealResolutionAgent(
      { appealId: appeal.id, rerunById: staff.id },
      delayedModel,
    )
    await modelStarted.promise
    const approved = await approveModerationAppeal(staff.id, appeal.id)
    modelReleased.resolve()
    await queuedRun

    const updated = await getModerationAppealById(appeal.id)
    expect(updated!.approved_at).toEqual(approved.approved_at)
    expect(updated!.approved_by_id).toBe(staff.id)
    expect(updated!.public_response).toBe('Human-reviewed response.')
    expect(updated!.recommended_action).toBe('deny')
  })
})
