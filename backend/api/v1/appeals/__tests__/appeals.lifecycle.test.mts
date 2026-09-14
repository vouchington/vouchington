import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestUserWarning,
  insertTestCommunityBan,
  insertTestCommunity,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { createModerationAppeal } from '@services/moderation-appeals/create'
import { parseCreateModerationAppealInput } from '@services/moderation-appeals/parse'
import { updateModerationAppealDraft } from '@services/moderation-appeals/update-appeal-draft'

describe('POST /api/v1/appeals — create', () => {
  let staff: PrivateUser
  let appellant: PrivateUser
  let banId: string

  beforeAll(async () => {
    staff = await createTestUser({ administrator: true })
    appellant = await createTestUser()
    const community = await insertTestCommunity({
      name: `Appeal Create Community ${crypto.randomUUID().slice(0, 8)}`,
      slug: `appeal-create-${crypto.randomUUID().slice(0, 8)}`,
      createdById: staff.id,
    })
    const ban = await insertTestCommunityBan({
      communityId: community.id,
      userId: appellant.id,
      bannedById: staff.id,
      reason: 'Violations',
    })
    banId = ban.id
  })

  it('returns 401 for unauthenticated requests', async () => {
    const request = createRequest()
    await request
      .post('/api/v1/appeals')
      .set('Content-Type', 'application/json')
      .send({ target_type: 'ban', target_id: banId, appeal_reason: 'unfair' })
      .expect(401)
  })

  it('returns 415 for wrong content-type', async () => {
    const request = createRequest()
    await request.authenticateAs(appellant)
    await request
      .post('/api/v1/appeals')
      .set('Content-Type', 'text/plain')
      .send('not json')
      .expect(415)
  })

  it('creates an appeal and returns 201 for valid ban target', async () => {
    const community = await insertTestCommunity({
      name: `Appeal New Community ${crypto.randomUUID().slice(0, 8)}`,
      slug: `appeal-new-${crypto.randomUUID().slice(0, 8)}`,
      createdById: staff.id,
    })
    const ban = await insertTestCommunityBan({
      communityId: community.id,
      userId: appellant.id,
      bannedById: staff.id,
      reason: 'Violations',
    })
    const request = createRequest()
    await request.authenticateAs(appellant)
    const response = await request
      .post('/api/v1/appeals')
      .set('Content-Type', 'application/json')
      .send({
        target_type: 'ban',
        target_id: ban.id,
        appeal_reason: `I understand the rules now ${crypto.randomUUID()}`,
      })
      .expect(res => expect([200, 201]).toContain(res.status))

    expect(response.body.appeal).toBeDefined()
    expect(response.body.appeal.community_ban_id).toBe(ban.id)
  })

  it('keeps staff-only warning context out of create and duplicate member responses', async () => {
    const internalReason = `create-private-${crypto.randomUUID()}`
    const publicMessage = `create-public-${crypto.randomUUID()}`
    const warning = await insertTestUserWarning({
      userId: appellant.id,
      issuedById: staff.id,
      reason: internalReason,
      publicMessage,
    })
    const request = createRequest()
    await request.authenticateAs(appellant)
    const body = {
      target_type: 'warning',
      target_id: warning.id,
      appeal_reason: `Create privacy ${crypto.randomUUID()}`,
    }

    const created = await request.post('/api/v1/appeals').send(body).expect(201)
    const duplicate = await request.post('/api/v1/appeals').send(body).expect(200)

    for (const response of [created, duplicate]) {
      const rawJson = JSON.stringify(response.body)
      expect(rawJson).not.toContain(internalReason)
      expect(rawJson).not.toContain('"staff_context"')
      expect(rawJson).toContain(publicMessage)
      expect(response.body.appeal.target_context.type).toBe('warning')
    }
  })
})

describe('GET /api/v1/appeals — list', () => {
  it('returns 401 for unauthenticated', async () => {
    const request = createRequest()
    await request.get('/api/v1/appeals').expect(401)
  })
})

describe('GET /api/v1/appeals/:id — single appeal', () => {
  let staff: PrivateUser
  let appellant: PrivateUser
  let otherUser: PrivateUser
  let appealId: string
  const internalReason = `detail-private-${crypto.randomUUID()}`
  const publicMessage = `detail-public-${crypto.randomUUID()}`

  beforeAll(async () => {
    staff = await createTestUser({ administrator: true })
    appellant = await createTestUser()
    otherUser = await createTestUser()
    const warning = await insertTestUserWarning({
      userId: appellant.id,
      issuedById: staff.id,
      reason: internalReason,
      publicMessage,
    })
    const input = parseCreateModerationAppealInput({
      target_type: 'warning',
      target_id: warning.id,
      appeal_reason: 'Lifecycle test appeal.',
    })
    const { appeal } = await createModerationAppeal(appellant, input)
    appealId = appeal.id
  })

  it('returns 401 for unauthenticated', async () => {
    const request = createRequest()
    await request.get(`/api/v1/appeals/${crypto.randomUUID()}`).expect(401)
  })

  it('returns 403 for non-owner non-staff', async () => {
    const request = createRequest()
    await request.authenticateAs(otherUser)
    await request.get(`/api/v1/appeals/${appealId}`).expect(403)
  })

  it('returns 200 for appeal owner', async () => {
    const request = createRequest()
    await request.authenticateAs(appellant)
    const response = await request.get(`/api/v1/appeals/${appealId}`).expect(200)
    expect(response.body.appeal.id).toBe(appealId)
    const rawJson = JSON.stringify(response.body)
    expect(rawJson).not.toContain(internalReason)
    expect(rawJson).not.toContain('"staff_context"')
    expect(rawJson).toContain(publicMessage)
  })

  it('returns 200 for staff', async () => {
    const request = createRequest()
    await request.authenticateAs(staff)
    const response = await request.get(`/api/v1/appeals/${appealId}`).expect(200)
    expect(response.body.appeal.id).toBe(appealId)
    expect(response.body.appeal.staff_context.original_decision.internal_reason).toBe(
      internalReason,
    )
  })
})

describe('PATCH /api/v1/appeals/:id — staff draft edit', () => {
  let staff: PrivateUser
  let regularUser: PrivateUser
  let appealId: string

  beforeAll(async () => {
    staff = await createTestUser({ administrator: true })
    regularUser = await createTestUser()
    const warning = await insertTestUserWarning({
      userId: regularUser.id,
      issuedById: staff.id,
      reason: 'spam',
    })
    const input = parseCreateModerationAppealInput({
      target_type: 'warning',
      target_id: warning.id,
      appeal_reason: 'Patch test appeal.',
    })
    const { appeal } = await createModerationAppeal(regularUser, input)
    appealId = appeal.id
  })

  it('returns 403 for non-staff', async () => {
    const request = createRequest()
    await request.authenticateAs(regularUser)
    await request
      .patch(`/api/v1/appeals/${appealId}`)
      .set('Content-Type', 'application/json')
      .send({ public_response: 'hello' })
      .expect(403)
  })

  it('staff can edit the draft and response is updated', async () => {
    const request = createRequest()
    await request.authenticateAs(staff)
    const response = await request
      .patch(`/api/v1/appeals/${appealId}`)
      .set('Content-Type', 'application/json')
      .send({ public_response: 'Staff appeal response', internal_notes: 'Private note' })
      .expect(200)
    expect(response.body.appeal.public_response).toBe('Staff appeal response')
  })
})

describe('POST /api/v1/appeals/:id/approval and /delivery', () => {
  let staff: PrivateUser
  let appealId: string

  beforeAll(async () => {
    staff = await createTestUser({ administrator: true })
    const appellant = await createTestUser()
    const warning = await insertTestUserWarning({
      userId: appellant.id,
      issuedById: staff.id,
      reason: 'abuse',
    })
    const input = parseCreateModerationAppealInput({
      target_type: 'warning',
      target_id: warning.id,
      appeal_reason: 'Approval test appeal.',
    })
    const { appeal } = await createModerationAppeal(appellant, input)
    appealId = appeal.id
    await updateModerationAppealDraft(staff.id, appealId, {
      publicResponse: 'Approved appeal response',
    })
  })

  it('delivery without approval returns 422', async () => {
    const request = createRequest()
    await request.authenticateAs(staff)
    await request.post(`/api/v1/appeals/${appealId}/delivery`).expect(422)
  })

  it('approval succeeds and delivery succeeds after approval', async () => {
    const request = createRequest()
    await request.authenticateAs(staff)
    const approveResponse = await request.post(`/api/v1/appeals/${appealId}/approval`).expect(200)
    expect(approveResponse.body.appeal.approved_at).not.toBeNull()

    const deliveryResponse = await request.post(`/api/v1/appeals/${appealId}/delivery`).expect(200)
    expect(deliveryResponse.body.appeal.sent_at).not.toBeNull()
  })
})
