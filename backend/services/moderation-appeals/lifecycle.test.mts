import { describe, it, expect, beforeAll } from 'vitest'
import { createTestUser, insertTestUserWarning, WEB_PROVENANCE } from '@voucha/test-helpers'
import type { PrivateUser } from '@voucha/types/entities/user'
import { createModerationAppeal } from './create.mts'
import { parseCreateModerationAppealInput } from './parse.mts'
import { appendAppealLifecycleChange } from './lifecycle.mts'
import { getModerationAppealById } from './get.mts'
import { approveModerationAppeal } from './approve-appeal.mts'
import { updateModerationAppealDraft } from './update-appeal-draft.mts'

describe('appendAppealLifecycleChange', () => {
  let staff: PrivateUser
  let appellant: PrivateUser
  let appealId: string

  beforeAll(async () => {
    staff = await createTestUser()
    appellant = await createTestUser()

    const warning = await insertTestUserWarning({
      userId: appellant.id,
      issuedById: staff.id,
      reason: 'spam',
    })
    const input = parseCreateModerationAppealInput({
      target_type: 'warning',
      target_id: warning.id,
      appeal_reason: 'Lifecycle test appeal.',
    })
    const { appeal } = await createModerationAppeal(WEB_PROVENANCE, appellant, input)
    appealId = appeal.id
  })

  it('appends a lifecycle change and returns its id string', async () => {
    const changeId = await appendAppealLifecycleChange(appealId, 'edit', staff.id, {
      metadata: { test: true },
    })
    expect(typeof changeId).toBe('string')
    expect(changeId.length).toBeGreaterThan(0)
  })
})

describe('lifecycle change reflected in latest_lifecycle_change_id', () => {
  it('approve updates latest_lifecycle_change_id', async () => {
    const staff = await createTestUser()
    const appellant = await createTestUser()
    const warning = await insertTestUserWarning({
      userId: appellant.id,
      issuedById: staff.id,
      reason: 'abuse',
    })
    const input = parseCreateModerationAppealInput({
      target_type: 'warning',
      target_id: warning.id,
      appeal_reason: 'Approve lifecycle check.',
    })
    const { appeal: created } = await createModerationAppeal(WEB_PROVENANCE, appellant, input)
    const originalChangeId = created.latest_lifecycle_change_id

    // Set a draft first so approve has a drafted_at to read
    await updateModerationAppealDraft(staff.id, created.id, {
      publicResponse: 'Draft response',
    })
    await approveModerationAppeal(staff.id, created.id)

    const updated = await getModerationAppealById(created.id)
    expect(updated!.latest_lifecycle_change_id).not.toBeNull()
    expect(updated!.latest_lifecycle_change_id).not.toBe(originalChangeId)
  })
})
