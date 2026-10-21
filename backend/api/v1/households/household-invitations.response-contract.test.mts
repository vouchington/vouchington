import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { validateResponseContract } from '../../../test-helpers/api-fixtures/contract-schema.mts'
import type { ApiFixtureManifest } from '../../../test-helpers/api-fixtures/types.mts'

const manifest = JSON.parse(
  readFileSync(new URL('../../../../api-fixtures/v1/manifest.json', import.meta.url), 'utf8'),
) as ApiFixtureManifest

function matches(route: string, body: unknown) {
  const contract = manifest.backendResponseContracts[route]
  expect(contract).toBeDefined()
  expect(validateResponseContract(contract!.schema, body)).toEqual([])
}

describe('household invitation REST response contracts', () => {
  it('validates create, duplicate, both pending lists, acceptance, and 204 decline/revoke', async () => {
    const owner = await createTestUser()
    const invitee = await createTestUser()
    const decliner = await createTestUser()
    const revokee = await createTestUser()
    const ownerRequest = createRequest()
    await ownerRequest.authenticateAs(owner)
    const householdId = (await ownerRequest.post('/api/v1/households').send({}).expect(201)).body
      .household.id as string
    const createRoute = 'POST:/api/v1/households/:id/invitations'
    const invited = await ownerRequest
      .post(`/api/v1/households/${householdId}/invitations`)
      .send({ user: invitee.username, relationship: 'partner' })
      .expect(201)
    matches(createRoute, invited.body)
    const duplicate = await ownerRequest
      .post(`/api/v1/households/${householdId}/invitations`)
      .send({ user: invitee.id, relationship: 'ignored' })
      .expect(200)
    expect(duplicate.body).toEqual(invited.body)
    matches(createRoute, duplicate.body)

    const sent = await ownerRequest.get(`/api/v1/households/${householdId}/invitations`).expect(200)
    matches('GET:/api/v1/households/:id/invitations', sent.body)
    const inviteeRequest = createRequest()
    await inviteeRequest.authenticateAs(invitee)
    const received = await inviteeRequest.get('/api/v1/my/household-invitations').expect(200)
    matches('GET:/api/v1/my/household-invitations', received.body)
    expect(received.body.results[0]).toMatchObject({
      household_id: householdId,
      invited_by_id: owner.id,
    })
    const accepted = await inviteeRequest
      .post(`/api/v1/my/household-invitations/${invited.body.invitation.id}/acceptance`)
      .send({})
      .expect(200)
    matches('POST:/api/v1/my/household-invitations/:invitationId/acceptance', accepted.body)
    expect(accepted.body.membership).toMatchObject({
      household_id: householdId,
      relationship: 'partner',
    })

    const toDecline = await ownerRequest
      .post(`/api/v1/households/${householdId}/invitations`)
      .send({ user: decliner.id })
      .expect(201)
    const declinerRequest = createRequest()
    await declinerRequest.authenticateAs(decliner)
    const declined = await declinerRequest
      .post(`/api/v1/my/household-invitations/${toDecline.body.invitation.id}/decline`)
      .send({})
      .expect(204)
    expect(declined.text).toBe('')
    matches('POST:/api/v1/my/household-invitations/:invitationId/decline', null)

    const toRevoke = await ownerRequest
      .post(`/api/v1/households/${householdId}/invitations`)
      .send({ user: revokee.id })
      .expect(201)
    const revoked = await ownerRequest
      .delete(`/api/v1/households/${householdId}/invitations/${toRevoke.body.invitation.id}`)
      .expect(204)
    expect(revoked.text).toBe('')
    matches('DELETE:/api/v1/households/:id/invitations/:invitationId', null)
  })

  it('lets an administrator list, invite, and revoke in another owner’s household', async () => {
    const owner = await createTestUser()
    const administrator = await createTestUser({ administrator: true })
    const invitee = await createTestUser()
    const ownerRequest = createRequest()
    await ownerRequest.authenticateAs(owner)
    const householdId = (await ownerRequest.post('/api/v1/households').send({}).expect(201)).body
      .household.id as string
    const adminRequest = createRequest()
    await adminRequest.authenticateAs(administrator)
    const invited = await adminRequest
      .post(`/api/v1/households/${householdId}/invitations`)
      .send({ user: invitee.id })
      .expect(201)
    expect(
      (await adminRequest.get(`/api/v1/households/${householdId}/invitations`).expect(200)).body
        .results,
    ).toContainEqual(invited.body.invitation)
    await adminRequest
      .delete(`/api/v1/households/${householdId}/invitations/${invited.body.invitation.id}`)
      .expect(204)
  })
})
