import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestHouseholdMembership } from '@voucha/test-helpers'

describe('household visibility routes', () => {
  it('returns 404 for a hidden household and 403 when a member cannot manage it', async () => {
    const owner = await createTestUser()
    const member = await createTestUser()
    const stranger = await createTestUser()
    const ownerRequest = createRequest()
    const memberRequest = createRequest()
    const strangerRequest = createRequest()
    await ownerRequest.authenticateAs(owner)
    await memberRequest.authenticateAs(member)
    await strangerRequest.authenticateAs(stranger)

    const created = await ownerRequest.post('/api/v1/households').send({}).expect(201)
    const householdId = created.body.household.id as string
    const ownerIndividual = await ownerRequest.get('/api/v1/me/individual').expect(200)
    const added = await ownerRequest
      .post(`/api/v1/households/${householdId}/memberships`)
      .send({ individual_id: ownerIndividual.body.individual.id, relationship: 'self' })
      .expect(201)
    const membershipId = added.body.membership.id as string
    const memberIndividual = await memberRequest.get('/api/v1/me/individual').expect(200)
    await insertTestHouseholdMembership({
      householdId,
      individualId: member.individual_id!,
    })
    const missingId = randomUUID()

    await memberRequest.get(`/api/v1/households/${householdId}`).expect(200)
    const hidden = await strangerRequest.get(`/api/v1/households/${householdId}`).expect(404)
    expect(hidden.body.message).toBe('Household not found')
    await ownerRequest.get(`/api/v1/households/${missingId}`).expect(404)
    await strangerRequest.get(`/api/v1/households/${missingId}/memberships`).expect(404)

    await memberRequest
      .post(`/api/v1/households/${householdId}/memberships`)
      .send({ individual_id: memberIndividual.body.individual.id })
      .expect(403)
    await strangerRequest
      .post(`/api/v1/households/${householdId}/memberships`)
      .send({ individual_id: memberIndividual.body.individual.id })
      .expect(404)
    await ownerRequest
      .post(`/api/v1/households/${missingId}/memberships`)
      .send({ individual_id: ownerIndividual.body.individual.id })
      .expect(404)

    await memberRequest
      .delete(`/api/v1/households/${householdId}/memberships/${membershipId}`)
      .expect(403)
    await strangerRequest
      .delete(`/api/v1/households/${householdId}/memberships/${membershipId}`)
      .expect(404)
    await ownerRequest
      .delete(`/api/v1/households/${missingId}/memberships/${membershipId}`)
      .expect(404)
    await memberRequest.delete(`/api/v1/households/${householdId}`).expect(404)
    await strangerRequest.delete(`/api/v1/households/${householdId}`).expect(404)
    await ownerRequest.delete(`/api/v1/households/${householdId}`).expect(204)
  })

  it('lets an administrator read and delete another household and 404s when it is missing', async () => {
    const owner = await createTestUser()
    const administrator = await createTestUser({ administrator: true })
    const ownerRequest = createRequest()
    const adminRequest = createRequest()
    await ownerRequest.authenticateAs(owner)
    await adminRequest.authenticateAs(administrator)
    const created = await ownerRequest.post('/api/v1/households').send({}).expect(201)
    const householdId = created.body.household.id as string

    await adminRequest.get(`/api/v1/households/${householdId}`).expect(200)
    await adminRequest.get(`/api/v1/households/${randomUUID()}`).expect(404)
    await adminRequest.delete(`/api/v1/households/${householdId}`).expect(204)
  })
})
