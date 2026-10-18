import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestUserWarning } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { redactModerationAppeal } from '@services/moderation-appeals/redaction'
import { updateModerationAppealDraft } from '@services/moderation-appeals/update-appeal-draft'
import { approveModerationAppeal } from '@services/moderation-appeals/approve-appeal'
import { sendApprovedModerationAppealResolution } from '@services/moderation-appeals/send-appeal-resolution'

const privateFields = [
  'ai_draft_requested_run_id',
  'ai_draft_run_id',
  'case_id',
  'appellant_user_id',
  'appeal_reason',
  'recommended_action',
  'ai_public_response',
  'ai_internal_response',
  'model',
  'ai_drafted_at',
  'internal_notes',
  'drafted_at',
  'edited_at',
  'edited_by_id',
  'approved_by_id',
  'resolved_by_id',
  'latest_lifecycle_change_id',
  'staff_context',
]

function expectPrivateFieldsAbsent(value: Record<string, unknown>) {
  for (const key of privateFields) expect(value).not.toHaveProperty(key)
}

describe('member appeal response projections', () => {
  let staff: PrivateUser
  let member: PrivateUser

  beforeAll(async () => {
    staff = await createTestUser({ administrator: true })
    member = await createTestUser()
  })

  async function createOwnedAppeal() {
    const warning = await insertTestUserWarning({
      userId: member.id,
      issuedById: staff.id,
      reason: `private-warning-${crypto.randomUUID()}`,
      publicMessage: 'Public warning explanation',
    })
    const requestBody = {
      target_type: 'warning',
      target_id: warning.id,
      appeal_reason: `Private appeal reason ${crypto.randomUUID()}`,
    }
    const request = createRequest()
    await request.authenticateAs(member)
    const created = await request.post('/api/v1/appeals').send(requestBody).expect(201)
    const appealId = created.body.appeal.id
    expect(created.body.isDuplicate).toBe(false)
    expectPrivateFieldsAbsent(created.body.appeal)
    return { appealId, requestBody }
  }

  it('preserves member submission and duplicate envelopes without staff fields', async () => {
    const { appealId, requestBody } = await createOwnedAppeal()
    const request = createRequest()
    await request.authenticateAs(member)
    const duplicate = await request.post('/api/v1/appeals').send(requestBody).expect(200)
    expect(duplicate.body).toMatchObject({ isDuplicate: true, appeal: { id: appealId } })
    expectPrivateFieldsAbsent(duplicate.body.appeal)
    expect(duplicate.body.appeal.public_response).toBeNull()
  })

  it('retains the private staff submission shape for creation and duplicate responses', async () => {
    const issuer = await createTestUser({ administrator: true })
    const warning = await insertTestUserWarning({
      userId: staff.id,
      issuedById: issuer.id,
      reason: `private-staff-warning-${crypto.randomUUID()}`,
      publicMessage: 'Public staff warning explanation',
    })
    const body = {
      target_type: 'warning',
      target_id: warning.id,
      appeal_reason: `Private staff appeal reason ${crypto.randomUUID()}`,
    }
    const request = createRequest()
    await request.authenticateAs(staff)
    const created = await request.post('/api/v1/appeals').send(body).expect(201)
    expect(created.body.isDuplicate).toBe(false)
    expect(created.body.appeal).toMatchObject({
      case_id: expect.any(String),
      appellant_user_id: staff.id,
      appeal_reason: body.appeal_reason,
    })
    const duplicate = await request.post('/api/v1/appeals').send(body).expect(200)
    expect(duplicate.body).toMatchObject({
      isDuplicate: true,
      appeal: {
        id: created.body.appeal.id,
        case_id: created.body.appeal.case_id,
        appellant_user_id: staff.id,
        appeal_reason: body.appeal_reason,
      },
    })
  })

  it('uses the exact redactor for member list/detail while retaining the staff shape', async () => {
    const { appealId, requestBody } = await createOwnedAppeal()
    const staffRequest = createRequest()
    await staffRequest.authenticateAs(staff)
    const staffDetail = await staffRequest.get(`/api/v1/appeals/${appealId}`).expect(200)
    expect(staffDetail.body.appeal).toHaveProperty('case_id', expect.any(String))
    expect(staffDetail.body.appeal).toHaveProperty('appeal_reason', requestBody.appeal_reason)
    const expected = redactModerationAppeal(staffDetail.body.appeal)
    const request = createRequest()
    await request.authenticateAs(member)
    const detail = await request.get(`/api/v1/appeals/${appealId}`).expect(200)
    const list = await request.get('/api/v1/appeals?status=pending&limit=100').expect(200)
    expect(detail.body.appeal).toEqual(expected)
    expect(list.body.appeals.find((appeal: { id: string }) => appeal.id === appealId)).toEqual(
      expected,
    )
    expectPrivateFieldsAbsent(detail.body.appeal)
  })

  it('rejects another member detail and excludes the appeal from their list', async () => {
    const { appealId } = await createOwnedAppeal()
    const unrelatedMember = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(unrelatedMember)
    await request.get(`/api/v1/appeals/${appealId}`).expect(403)
    const list = await request.get('/api/v1/appeals?status=pending&limit=100').expect(200)
    expect(list.body.appeals.map((appeal: { id: string }) => appeal.id)).not.toContain(appealId)
  })

  it('withholds an approved response until delivery without changing its identity', async () => {
    const { appealId } = await createOwnedAppeal()
    await updateModerationAppealDraft(staff.id, appealId, {
      publicResponse: 'Human-approved public response',
      internalNotes: 'Private staff notes',
    })
    await approveModerationAppeal(staff.id, appealId)
    const request = createRequest()
    await request.authenticateAs(member)
    const unsent = await request.get(`/api/v1/appeals/${appealId}`).expect(200)
    expect(unsent.body.appeal).toMatchObject({ id: appealId, sent_at: null, public_response: null })
    await sendApprovedModerationAppealResolution(staff.id, appealId)
    const sent = await request.get(`/api/v1/appeals/${appealId}`).expect(200)
    expect(sent.body.appeal).toMatchObject({
      id: appealId,
      public_response: 'Human-approved public response',
    })
    expect(sent.body.appeal.sent_at).toEqual(expect.any(String))
    expectPrivateFieldsAbsent(sent.body.appeal)
  })
})
