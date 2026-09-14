import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestModerationAppeal,
  insertTestUserWarning,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

const REQUIRED_APPEAL_FIELDS = [
  'id',
  'case_id',
  'appellant_id',
  'user_warning_id',
  'community_ban_id',
  'post_id',
  'user_suspension_id',
  'community_id',
  'post_removal_kind',
  'appeal_reason',
  'status',
  'recommended_action',
  'ai_public_response',
  'ai_internal_response',
  'model',
  'ai_drafted_at',
  'public_response',
  'internal_notes',
  'drafted_at',
  'edited_at',
  'edited_by_id',
  'approved_at',
  'approved_by_id',
  'sent_at',
  'resolved_at',
  'resolved_by_id',
  'resolution_action',
  'latest_lifecycle_change_id',
  'created_at',
  'updated_at',
] as const

const APPEAL_FIELDS = [...REQUIRED_APPEAL_FIELDS, 'is_overdue', 'target_context', 'staff_context']

function expectCanonicalAppeal(
  value: Record<string, unknown>,
  expected: { id: string; caseId: string; status: string },
): void {
  const fields = Object.keys(value)
  expect(fields).toEqual(expect.arrayContaining([...REQUIRED_APPEAL_FIELDS]))
  expect(fields.every(field => APPEAL_FIELDS.includes(field))).toBe(true)
  expect(value).toMatchObject({
    id: expected.id,
    case_id: expected.caseId,
    status: expected.status,
    created_at: expect.any(String),
    latest_lifecycle_change_id: expect.any(String),
    target_context: expect.any(Object),
    staff_context: expect.any(Object),
  })
}

describe('moderation appeal mutation responses', () => {
  let staff: PrivateUser
  let appellant: PrivateUser

  beforeAll(async () => {
    const users = await Promise.all([createTestUser({ administrator: true }), createTestUser()])
    staff = users[0]!
    appellant = users[1]!
  })

  it('returns a canonical appeal with the current lifecycle after every mutation', async () => {
    const warning = await insertTestUserWarning({
      userId: appellant.id,
      issuedById: staff.id,
      reason: 'spam',
    })
    const appeal = await insertTestModerationAppeal({
      appellantId: appellant.id,
      userWarningId: warning.id,
      appealReason: `Canonical mutations ${crypto.randomUUID()}`,
    })
    const request = createRequest()
    await request.authenticateAs(staff)

    const patchResponse = await request
      .patch(`/api/v1/appeals/${appeal.id}`)
      .set('Content-Type', 'application/json')
      .send({ public_response: 'Canonical response', internal_notes: 'Canonical notes' })
      .expect(200)
    expectCanonicalAppeal(patchResponse.body.appeal, {
      id: appeal.id,
      caseId: appeal.case_id,
      status: 'pending',
    })
    const editedLifecycleId = patchResponse.body.appeal.latest_lifecycle_change_id
    expect(editedLifecycleId).not.toBe(appeal.latest_lifecycle_change_id)

    const approvalResponse = await request.post(`/api/v1/appeals/${appeal.id}/approval`).expect(200)
    expectCanonicalAppeal(approvalResponse.body.appeal, {
      id: appeal.id,
      caseId: appeal.case_id,
      status: 'pending',
    })
    const approvedLifecycleId = approvalResponse.body.appeal.latest_lifecycle_change_id
    expect(approvedLifecycleId).not.toBe(editedLifecycleId)

    const deliveryResponse = await request.post(`/api/v1/appeals/${appeal.id}/delivery`).expect(200)
    expectCanonicalAppeal(deliveryResponse.body.appeal, {
      id: appeal.id,
      caseId: appeal.case_id,
      status: 'pending',
    })
    const sentLifecycleId = deliveryResponse.body.appeal.latest_lifecycle_change_id
    expect(sentLifecycleId).not.toBe(approvedLifecycleId)

    const resolutionResponse = await request
      .post(`/api/v1/appeals/${appeal.id}/resolution`)
      .set('Content-Type', 'application/json')
      .send({ action: 'accept' })
      .expect(200)
    expectCanonicalAppeal(resolutionResponse.body.appeal, {
      id: appeal.id,
      caseId: appeal.case_id,
      status: 'resolved',
    })
    expect(resolutionResponse.body.appeal.latest_lifecycle_change_id).not.toBe(sentLifecycleId)
  })
})
