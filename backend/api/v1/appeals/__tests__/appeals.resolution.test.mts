import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestUserWarning } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { createModerationAppeal } from '@services/moderation-appeals/create'
import { parseCreateModerationAppealInput } from '@services/moderation-appeals/parse'
import { resolveModerationAppealReduce } from '@services/moderation-appeals/resolve'
import { approveModerationAppeal } from '@services/moderation-appeals/approve-appeal'
import { updateModerationAppealDraft } from '@services/moderation-appeals/update-appeal-draft'
import { deliverModerationAppealForTest } from '@services/moderation-appeals/resolution.test-helpers'

async function createWarningAppeal(appellant: PrivateUser, staff: PrivateUser, reason: string) {
  const warning = await insertTestUserWarning({
    userId: appellant.id,
    issuedById: staff.id,
    reason: 'spam',
  })
  const input = parseCreateModerationAppealInput({
    target_type: 'warning',
    target_id: warning.id,
    appeal_reason: reason,
  })
  const { appeal } = await createModerationAppeal(appellant, input)
  return appeal
}

describe('POST /api/v1/appeals/:id/resolution — resolve an appeal', () => {
  let staff: PrivateUser
  let regularUser: PrivateUser

  beforeAll(async () => {
    staff = await createTestUser({ administrator: true })
    regularUser = await createTestUser()
  })

  it('returns 403 for non-staff', async () => {
    const appeal = await createWarningAppeal(
      regularUser,
      staff,
      `Resolution forbidden test ${crypto.randomUUID()}`,
    )
    const request = createRequest()
    await request.authenticateAs(regularUser)
    await request
      .post(`/api/v1/appeals/${appeal.id}/resolution`)
      .set('Content-Type', 'application/json')
      .send({ action: 'accept' })
      .expect(403)
  })

  it('returns 422 for invalid action', async () => {
    const appeal = await createWarningAppeal(
      regularUser,
      staff,
      `Invalid action test ${crypto.randomUUID()}`,
    )
    const request = createRequest()
    await request.authenticateAs(staff)
    await request
      .post(`/api/v1/appeals/${appeal.id}/resolution`)
      .set('Content-Type', 'application/json')
      .send({ action: 'invalid_action' })
      .expect(422)
  })

  it('staff can accept an appeal', async () => {
    const appellant = await createTestUser()
    const appeal = await createWarningAppeal(
      appellant,
      staff,
      `Accept resolution test ${crypto.randomUUID()}`,
    )
    await deliverModerationAppealForTest(staff.id, appeal.id)
    const request = createRequest()
    await request.authenticateAs(staff)
    const response = await request
      .post(`/api/v1/appeals/${appeal.id}/resolution`)
      .set('Content-Type', 'application/json')
      .send({ action: 'accept' })
      .expect(200)
    expect(response.body.appeal.resolution_action).toBe('accept')
    expect(response.body.appeal.status).toBe('resolved')
  })

  it('staff can reduce an appeal', async () => {
    const appellant = await createTestUser()
    const appeal = await createWarningAppeal(
      appellant,
      staff,
      `Reduce resolution test ${crypto.randomUUID()}`,
    )
    await deliverModerationAppealForTest(staff.id, appeal.id)
    const request = createRequest()
    await request.authenticateAs(staff)
    const response = await request
      .post(`/api/v1/appeals/${appeal.id}/resolution`)
      .set('Content-Type', 'application/json')
      .send({ action: 'reduce' })
      .expect(200)
    expect(response.body.appeal.resolution_action).toBe('reduce')
    expect(response.body.appeal.status).toBe('resolved')
  })

  it('staff can deny an appeal', async () => {
    const appellant = await createTestUser()
    const appeal = await createWarningAppeal(
      appellant,
      staff,
      `Deny resolution test ${crypto.randomUUID()}`,
    )
    await deliverModerationAppealForTest(staff.id, appeal.id)
    const request = createRequest()
    await request.authenticateAs(staff)
    const response = await request
      .post(`/api/v1/appeals/${appeal.id}/resolution`)
      .set('Content-Type', 'application/json')
      .send({ action: 'deny' })
      .expect(200)
    expect(response.body.appeal.resolution_action).toBe('deny')
    expect(response.body.appeal.status).toBe('dismissed')
  })

  it('returns 422 before the response is delivered', async () => {
    const appellant = await createTestUser()
    const appeal = await createWarningAppeal(
      appellant,
      staff,
      `Undelivered resolution test ${crypto.randomUUID()}`,
    )
    const request = createRequest()
    await request.authenticateAs(staff)
    await request
      .post(`/api/v1/appeals/${appeal.id}/resolution`)
      .set('Content-Type', 'application/json')
      .send({ action: 'accept' })
      .expect(422)
  })
})

describe('POST /api/v1/appeals/:id/resolution-drafts — rerun AI', () => {
  let staff: PrivateUser
  let regularUser: PrivateUser

  beforeAll(async () => {
    staff = await createTestUser({ administrator: true })
    regularUser = await createTestUser()
  })

  it('returns 403 for non-staff', async () => {
    const appeal = await createWarningAppeal(
      regularUser,
      staff,
      `Rerun AI forbidden test ${crypto.randomUUID()}`,
    )
    const request = createRequest()
    await request.authenticateAs(regularUser)
    await request.post(`/api/v1/appeals/${appeal.id}/resolution-drafts`).expect(403)
  })

  it('returns 202 with queued status for staff', async () => {
    const appellant = await createTestUser()
    const appeal = await createWarningAppeal(
      appellant,
      staff,
      `Rerun AI success test ${crypto.randomUUID()}`,
    )
    const request = createRequest()
    await request.authenticateAs(staff)
    const response = await request
      .post(`/api/v1/appeals/${appeal.id}/resolution-drafts`)
      .expect(202)
    expect(response.body.queued).toBe(true)
    expect(response.body.rerun_by_id).toBe(staff.id)
  })

  it('returns 422 after the resolution has been sent', async () => {
    const appellant = await createTestUser()
    const appeal = await createWarningAppeal(
      appellant,
      staff,
      `Rerun sent rejection ${crypto.randomUUID()}`,
    )
    await deliverModerationAppealForTest(staff.id, appeal.id)

    const request = createRequest()
    await request.authenticateAs(staff)
    await request.post(`/api/v1/appeals/${appeal.id}/resolution-drafts`).expect(422)
  })

  it('returns 422 after the resolution draft has been approved', async () => {
    const appellant = await createTestUser()
    const appeal = await createWarningAppeal(
      appellant,
      staff,
      `Rerun approved rejection ${crypto.randomUUID()}`,
    )
    await updateModerationAppealDraft(staff.id, appeal.id, {
      publicResponse: 'Approved response',
    })
    await approveModerationAppeal(staff.id, appeal.id)

    const request = createRequest()
    await request.authenticateAs(staff)
    await request.post(`/api/v1/appeals/${appeal.id}/resolution-drafts`).expect(422)
  })

  it('returns 422 after the appeal has been resolved', async () => {
    const appellant = await createTestUser()
    const appeal = await createWarningAppeal(
      appellant,
      staff,
      `Rerun resolved rejection ${crypto.randomUUID()}`,
    )
    await deliverModerationAppealForTest(staff.id, appeal.id)
    await resolveModerationAppealReduce(staff.id, appeal.id)

    const request = createRequest()
    await request.authenticateAs(staff)
    await request.post(`/api/v1/appeals/${appeal.id}/resolution-drafts`).expect(422)
  })
})
