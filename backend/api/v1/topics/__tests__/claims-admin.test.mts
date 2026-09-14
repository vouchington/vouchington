import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestTopic } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { createTopicClaim } from '@services/topic-claims/create'
import { adminVerifyTopicClaim } from '@services/topic-claims/admin-verify'

describe('GET /api/v1/my/topic-claims', () => {
  let regularUser: PrivateUser

  beforeAll(async () => {
    regularUser = await createTestUser()
  })

  it('returns 401 for unauthenticated', async () => {
    const request = createRequest()
    await request.get('/api/v1/my/topic-claims').expect(401)
  })

  it('returns empty list for user with no claims', async () => {
    const request = createRequest()
    await request.authenticateAs(regularUser)
    const response = await request.get('/api/v1/my/topic-claims').expect(200)
    expect(Array.isArray(response.body.claims)).toBe(true)
  })

  it('returns claims for user who has made claims', async () => {
    const claimUser = await createTestUser()
    const creator = await createTestUser()
    const myTopicId = await insertTestTopic({
      name: `My Claims Topic ${crypto.randomUUID().slice(0, 8)}`,
      slug: `my-claims-topic-${crypto.randomUUID().slice(0, 8)}`,
      createdById: creator.id,
    })
    await createTopicClaim(claimUser.id, { topicId: myTopicId, claimedRole: 'Owner', evidence: '' })

    const request = createRequest()
    await request.authenticateAs(claimUser)
    const response = await request.get('/api/v1/my/topic-claims').expect(200)
    expect(response.body.claims.length).toBeGreaterThan(0)
    expect(
      response.body.claims.every(
        (c: { claimant_user_id: string }) => c.claimant_user_id === claimUser.id,
      ),
    ).toBe(true)
  })
})

describe('GET /api/v1/admin/topic-claims', () => {
  let staffUser: PrivateUser
  let regularUser: PrivateUser

  beforeAll(async () => {
    staffUser = await createTestUser({ administrator: true })
    regularUser = await createTestUser()
  })

  it('returns 401 for unauthenticated', async () => {
    const request = createRequest()
    await request.get('/api/v1/admin/topic-claims').expect(401)
  })

  it('returns 403 for non-staff', async () => {
    const request = createRequest()
    await request.authenticateAs(regularUser)
    await request.get('/api/v1/admin/topic-claims').expect(403)
  })

  it('returns pending claims for staff', async () => {
    const staffRequest = createRequest()
    await staffRequest.authenticateAs(staffUser)
    const response = await staffRequest.get('/api/v1/admin/topic-claims').expect(200)
    expect(Array.isArray(response.body.claims)).toBe(true)
  })
})

describe('POST /api/v1/admin/topic-claims/:id/verification and rejection and revocation', () => {
  let staffUser: PrivateUser
  let regularUser: PrivateUser

  beforeAll(async () => {
    staffUser = await createTestUser({ administrator: true })
    regularUser = await createTestUser()
  })

  it('returns 403 for non-staff on verification', async () => {
    const request = createRequest()
    await request.authenticateAs(regularUser)
    await request.post(`/api/v1/admin/topic-claims/${crypto.randomUUID()}/verification`).expect(403)
  })

  it('verifies a claim as staff', async () => {
    const claimant = await createTestUser()
    const creator = await createTestUser()
    const topicId = await insertTestTopic({
      name: `Admin Verify Topic ${crypto.randomUUID().slice(0, 8)}`,
      slug: `admin-verify-topic-${crypto.randomUUID().slice(0, 8)}`,
      createdById: creator.id,
    })
    const { claim } = await createTopicClaim(claimant.id, {
      topicId,
      claimedRole: 'Issuer',
      evidence: '',
    })

    const request = createRequest()
    await request.authenticateAs(staffUser)
    const response = await request
      .post(`/api/v1/admin/topic-claims/${claim.id}/verification`)
      .expect(200)
    expect(response.body.claim.verified_at).not.toBeNull()
  })

  it('rejects a claim as staff and returns 422 without rejection_reason', async () => {
    const request = createRequest()
    await request.authenticateAs(staffUser)
    await request
      .post(`/api/v1/admin/topic-claims/${crypto.randomUUID()}/rejection`)
      .set('Content-Type', 'application/json')
      .send({})
      .expect(422)
  })

  it('rejects a claim as staff with rejection_reason', async () => {
    const claimant = await createTestUser()
    const creator = await createTestUser()
    const topicId = await insertTestTopic({
      name: `Admin Reject Topic ${crypto.randomUUID().slice(0, 8)}`,
      slug: `admin-reject-topic-${crypto.randomUUID().slice(0, 8)}`,
      createdById: creator.id,
    })
    const { claim } = await createTopicClaim(claimant.id, {
      topicId,
      claimedRole: 'Issuer',
      evidence: '',
    })

    const request = createRequest()
    await request.authenticateAs(staffUser)
    const response = await request
      .post(`/api/v1/admin/topic-claims/${claim.id}/rejection`)
      .set('Content-Type', 'application/json')
      .send({ rejection_reason: 'Insufficient evidence provided.' })
      .expect(200)
    expect(response.body.claim.rejected_at).not.toBeNull()
  })

  it('revokes a verified claim as staff', async () => {
    const claimant = await createTestUser()
    const creator = await createTestUser()
    const topicId = await insertTestTopic({
      name: `Admin Revoke Topic ${crypto.randomUUID().slice(0, 8)}`,
      slug: `admin-revoke-topic-${crypto.randomUUID().slice(0, 8)}`,
      createdById: creator.id,
    })
    const { claim } = await createTopicClaim(claimant.id, {
      topicId,
      claimedRole: 'Issuer',
      evidence: '',
    })
    await adminVerifyTopicClaim(staffUser.id, claim.id)

    const request = createRequest()
    await request.authenticateAs(staffUser)
    const response = await request
      .post(`/api/v1/admin/topic-claims/${claim.id}/revocation`)
      .set('Content-Type', 'application/json')
      .send({ revocation_reason: 'Ownership transferred.' })
      .expect(200)
    expect(response.body.claim.revoked_at).not.toBeNull()
  })

  it('returns 422 for revocation without revocation_reason', async () => {
    const request = createRequest()
    await request.authenticateAs(staffUser)
    await request
      .post(`/api/v1/admin/topic-claims/${crypto.randomUUID()}/revocation`)
      .set('Content-Type', 'application/json')
      .send({})
      .expect(422)
  })
})
