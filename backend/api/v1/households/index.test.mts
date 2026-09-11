import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser, insertTestHouseholdMembership } from '@voucha/test-helpers'
import { randomUUID } from 'node:crypto'
describe('Households API Routes', () => {
  describe('GET /api/v1/households', () => {
    it('parses access, after, and bounded limit query parameters', async () => {
      const owner = await createTestUser()
      const request = createRequest()
      await request.authenticateAs(owner)
      await request.post('/api/v1/households').send({}).expect(201)

      const first = await request
        .get('/api/v1/households')
        .query({ access: 'owned', limit: 1 })
        .expect(200)
      expect(first.body.results).toHaveLength(1)
      expect(first.body.page_info.has_next_page).toBe(true)

      const second = await request
        .get('/api/v1/households')
        .query({ access: 'owned', limit: 1, after: first.body.page_info.end_cursor })
        .expect(200)
      expect(second.body.results).toHaveLength(1)
      expect(second.body.results[0].id).not.toBe(first.body.results[0].id)

      const memberOnly = await request
        .get('/api/v1/households')
        .query({ access: 'member' })
        .expect(200)
      expect(memberOnly.body.results).toEqual([])
    })

    it('rejects invalid access and pagination query parameters', async () => {
      const owner = await createTestUser()
      const request = createRequest()
      await request.authenticateAs(owner)

      await request.get('/api/v1/households').query({ access: 'other' }).expect(400)
      await request.get('/api/v1/households').query({ limit: 0 }).expect(400)
      await request.get('/api/v1/households').query({ after: '' }).expect(400)
    })

    it('should return 401 when not authenticated', async () => {
      const request = createRequest()
      await request.get('/api/v1/households').expect(401)
    })

    it('should return 401 when creating a household without authentication', async () => {
      const request = createRequest()
      await request.post('/api/v1/households').send({}).expect(401)
    })
  })

  describe('POST/PATCH/DELETE /api/v1/households/:id', () => {
    it('should allow owners to create, update, and delete a household', async () => {
      const owner = await createTestUser()
      const ownerRequest = createRequest()
      await ownerRequest.authenticateAs(owner!)

      const createResponse = await ownerRequest.post('/api/v1/households').send({}).expect(201)
      const householdId = createResponse.body.household.id as string

      expect(createResponse.body.household.owner_id).toBe(owner!.id)

      const getResponse = await ownerRequest.get(`/api/v1/households/${householdId}`).expect(200)
      expect(getResponse.body.household.id).toBe(householdId)

      const patchResponse = await ownerRequest
        .patch(`/api/v1/households/${householdId}`)
        .send({})
        .expect(200)
      expect(patchResponse.body.household.id).toBe(householdId)

      await ownerRequest.delete(`/api/v1/households/${householdId}`).expect(204)
      await ownerRequest.get(`/api/v1/households/${householdId}`).expect(404)
    })
  })

  describe('Household membership routes', () => {
    it('returns household not found to administrators for a missing household', async () => {
      const administrator = await createTestUser({ administrator: true })
      const request = createRequest()
      await request.authenticateAs(administrator)

      const response = await request
        .get(`/api/v1/households/${randomUUID()}/memberships`)
        .expect(404)
      expect(response.body.message).toBe('Household not found')
    })

    it('returns accurate membership page info and rejects malformed cursors', async () => {
      const owner = await createTestUser()
      const members = await Promise.all([createTestUser(), createTestUser()])
      const request = createRequest()
      await request.authenticateAs(owner)
      const createResponse = await request.post('/api/v1/households').send({}).expect(201)
      const householdId = createResponse.body.household.id as string
      await Promise.all(
        members.map(member =>
          insertTestHouseholdMembership({
            householdId,
            individualId: member!.individual_id!,
          }),
        ),
      )

      const first = await request
        .get(`/api/v1/households/${householdId}/memberships`)
        .query({ limit: 1 })
        .expect(200)
      expect(first.body.results).toHaveLength(1)
      expect(first.body.page_info.has_next_page).toBe(true)

      const second = await request
        .get(`/api/v1/households/${householdId}/memberships`)
        .query({ limit: 1, after: first.body.page_info.end_cursor })
        .expect(200)
      expect(second.body.results).toHaveLength(1)
      expect(second.body.page_info.has_next_page).toBe(false)

      await request
        .get(`/api/v1/households/${householdId}/memberships`)
        .query({ after: 'malformed' })
        .expect(400)
    })

    it('should require consent before adding another user as a household member', async () => {
      const owner = await createTestUser()
      const memberUser = await createTestUser()
      const ownerRequest = createRequest()
      const memberRequest = createRequest()

      await ownerRequest.authenticateAs(owner!)
      await memberRequest.authenticateAs(memberUser!)

      const createResponse = await ownerRequest.post('/api/v1/households').send({}).expect(201)
      const householdId = createResponse.body.household.id as string

      const memberIndividualResponse = await memberRequest.get('/api/v1/me/individual').expect(200)
      const memberIndividualId = memberIndividualResponse.body.individual.id as string

      await ownerRequest
        .post(`/api/v1/households/${householdId}/memberships`)
        .send({
          individual_id: memberIndividualId,
          relationship: 'spouse',
        })
        .expect(403)
    })

    it('should enforce owner/member access and allow owner-managed self membership', async () => {
      const owner = await createTestUser()
      const stranger = await createTestUser()
      const ownerRequest = createRequest()
      const strangerRequest = createRequest()

      await ownerRequest.authenticateAs(owner!)
      await strangerRequest.authenticateAs(stranger!)

      const createResponse = await ownerRequest.post('/api/v1/households').send({}).expect(201)
      const householdId = createResponse.body.household.id as string

      const ownerIndividualResponse = await ownerRequest.get('/api/v1/me/individual').expect(200)
      const ownerIndividualId = ownerIndividualResponse.body.individual.id as string

      const addMembershipResponse = await ownerRequest
        .post(`/api/v1/households/${householdId}/memberships`)
        .send({
          individual_id: ownerIndividualId,
          relationship: 'self',
        })
        .expect(201)

      const membershipId = addMembershipResponse.body.membership.id as string
      expect(addMembershipResponse.body.membership.individual.id).toBe(ownerIndividualId)
      expect(addMembershipResponse.body.membership.relationship).toBe('self')

      const ownerHouseholdResponse = await ownerRequest
        .get(`/api/v1/households/${householdId}`)
        .expect(200)
      expect(ownerHouseholdResponse.body.household.id).toBe(householdId)

      const membershipsResponse = await ownerRequest
        .get(`/api/v1/households/${householdId}/memberships`)
        .expect(200)
      expect(
        membershipsResponse.body.results.some(
          (membership: { individual: { id: string } }) =>
            membership.individual.id === ownerIndividualId,
        ),
      ).toBe(true)

      await strangerRequest.get(`/api/v1/households/${householdId}`).expect(403)

      await ownerRequest
        .delete(`/api/v1/households/${householdId}/memberships/${membershipId}`)
        .expect(204)
    })
  })
})
