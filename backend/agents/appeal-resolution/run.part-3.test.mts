import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createTestUser, insertTestUserWarning, WEB_PROVENANCE } from '@voucha/test-helpers'
import {
  approveModerationAppeal,
  createModerationAppeal,
  updateModerationAppealDraft,
} from '@services/moderation-appeals'
import { parseCreateModerationAppealInput } from '@services/moderation-appeals/parse'
import type { PrivateUser } from '@services/users/types'
import { runAppealResolutionAgent } from './run.mts'

describe('runAppealResolutionAgent terminal lifecycle', () => {
  let staff: PrivateUser
  let appellant: PrivateUser

  beforeAll(async () => {
    staff = await createTestUser()
    appellant = await createTestUser()
  })

  it('does not bill a model call when a queued manual rerun reaches an approved appeal', async () => {
    const warning = await insertTestUserWarning({
      userId: appellant.id,
      issuedById: staff.id,
      reason: `Terminal appeal warning ${randomUUID()}`,
    })
    const { appeal } = await createModerationAppeal(
      WEB_PROVENANCE,
      appellant,
      parseCreateModerationAppealInput({
        target_type: 'warning',
        target_id: warning.id,
        appeal_reason: `Terminal appeal reason ${randomUUID()}`,
      }),
    )
    await updateModerationAppealDraft(staff.id, appeal.id, {
      publicResponse: 'Approved human response.',
    })
    await approveModerationAppeal(staff.id, appeal.id)
    const callModel = vi.fn<(input: string, safetyId: string) => Promise<unknown>>()

    await runAppealResolutionAgent({ appealId: appeal.id, rerunById: staff.id }, callModel)

    expect(callModel).not.toHaveBeenCalled()
  })
})
