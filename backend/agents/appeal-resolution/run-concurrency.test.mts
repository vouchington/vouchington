import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { createTestUser, insertTestUserWarning, WEB_PROVENANCE } from '@voucha/test-helpers'
import { approveModerationAppeal } from '@services/moderation-appeals/approve-appeal'
import { createModerationAppeal } from '@services/moderation-appeals/create'
import { getModerationAppealById } from '@services/moderation-appeals/get'
import { parseCreateModerationAppealInput } from '@services/moderation-appeals/parse'
import { runAppealResolutionAgent, type AppealModelCaller } from './run.mts'
import { appealResolutionRunInputForTest } from '@voucha/test-helpers/appeal-resolution-run'
import type { PrivateUser } from '@services/users/types'
import {
  makeModelCallResult,
  TEST_MODEL_SELECTION,
} from '@voucha/test-helpers/agents/model-call-result'

function makeModelResponse(
  recommendedAction: 'accept' | 'deny' | 'reduce',
  publicResponse: string,
  internalResponse: string,
) {
  return makeModelCallResult({
    recommended_action: recommendedAction,
    public_response: publicResponse,
    internal_response: internalResponse,
  })
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
    const { appeal } = await createModerationAppeal(appellant, WEB_PROVENANCE, input)
    await runAppealResolutionAgent(
      await appealResolutionRunInputForTest(appeal.id),
      TEST_MODEL_SELECTION,
      () =>
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
      await appealResolutionRunInputForTest(appeal.id, staff.id),
      TEST_MODEL_SELECTION,
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

  it('discards a model result when a newer appeal request supersedes it', async () => {
    const warning = await insertTestUserWarning({
      userId: appellant.id,
      issuedById: staff.id,
      reason: `Superseded appeal reason ${randomUUID()}`,
    })
    const input = parseCreateModerationAppealInput({
      target_type: 'warning',
      target_id: warning.id,
      appeal_reason: `Superseded appeal ${randomUUID()}`,
    })
    const { appeal } = await createModerationAppeal(appellant, WEB_PROVENANCE, input)
    const oldRunInput = await appealResolutionRunInputForTest(appeal.id)
    const modelStarted = Promise.withResolvers<void>()
    const modelReleased = Promise.withResolvers<void>()
    const oldRun = runAppealResolutionAgent(oldRunInput, TEST_MODEL_SELECTION, async () => {
      modelStarted.resolve()
      await modelReleased.promise
      return makeModelResponse('deny', 'Superseded draft.', 'Old model result.')
    })
    await modelStarted.promise
    const newRunInput = await appealResolutionRunInputForTest(appeal.id, staff.id)
    modelReleased.resolve()
    await oldRun

    const pending = await getModerationAppealById(appeal.id)
    expect(pending!.ai_draft_run_id).toBeNull()
    expect(pending!.ai_draft_requested_run_id).toBe(newRunInput.runId)

    await runAppealResolutionAgent(newRunInput, TEST_MODEL_SELECTION, () =>
      Promise.resolve(makeModelResponse('accept', 'Current draft.', 'New model result.')),
    )
    const completed = await getModerationAppealById(appeal.id)
    expect(completed!.ai_draft_run_id).toBe(newRunInput.runId)
    expect(completed!.public_response).toBe('Current draft.')
  })
})
