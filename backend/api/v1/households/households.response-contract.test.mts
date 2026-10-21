import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { validateResponseContract } from '../../../test-helpers/api-fixtures/contract-schema.mts'
import type { ContractSchema } from '../../../test-helpers/api-fixtures/contract-schema-types.mts'
import type { ApiFixtureManifest } from '../../../test-helpers/api-fixtures/types.mts'

const manifest = JSON.parse(
  readFileSync(new URL('../../../../api-fixtures/v1/manifest.json', import.meta.url), 'utf8'),
) as ApiFixtureManifest
const requestContracts = JSON.parse(
  readFileSync(
    new URL('../../../../api-fixtures/v1/request-contracts.json', import.meta.url),
    'utf8',
  ),
) as { responses: Record<string, { $ref?: string }> }

const responseRef = (name: string) => ({ $ref: `#/components/schemas/${name}` })

function membershipResponseSchema(pageSchema: ContractSchema): ContractSchema {
  const root = pageSchema.root
  if (root.type !== 'object') throw new Error('membership page schema must be an object')
  const results = root.properties.results?.schema
  if (!results || results.type !== 'array')
    throw new Error('membership page results must be an array')
  return {
    definitions: pageSchema.definitions,
    root: {
      additionalProperties: false,
      properties: { membership: { required: true, schema: results.items } },
      type: 'object',
    },
  }
}

describe('household response contracts', () => {
  it('checks in one response schema for every household read and create route', () => {
    expect(requestContracts.responses['GET:/api/v1/households']).toEqual(
      responseRef('HouseholdPage'),
    )
    expect(requestContracts.responses['GET:/api/v1/households/:id']).toEqual(
      responseRef('HouseholdResponse'),
    )
    expect(requestContracts.responses['POST:/api/v1/households']).toEqual(
      responseRef('HouseholdResponse'),
    )
    expect(requestContracts.responses['GET:/api/v1/households/:id/memberships']).toEqual(
      responseRef('HouseholdMembershipPage'),
    )
    expect(requestContracts.responses['POST:/api/v1/households/:id/memberships']).toEqual(
      responseRef('HouseholdMembershipResponse'),
    )
    expect(requestContracts.responses['GET:/api/v1/me/individual']).toEqual(
      responseRef('IndividualResponse'),
    )
    expect(requestContracts.responses['PATCH:/api/v1/households/:id']).toBeUndefined()
  })

  it('validates live household bodies against the checked-in response contracts', async () => {
    const owner = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(owner)
    const created = await request.post('/api/v1/households').send({}).expect(201)
    const householdId = created.body.household.id as string
    const listed = await request.get('/api/v1/households').query({ access: 'owned' }).expect(200)
    const fetched = await request.get(`/api/v1/households/${householdId}`).expect(200)
    const individual = await request.get('/api/v1/me/individual').expect(200)
    const added = await request
      .post(`/api/v1/households/${householdId}/memberships`)
      .send({ individual_id: individual.body.individual.id, relationship: 'self' })
      .expect(201)
    const memberships = await request
      .get(`/api/v1/households/${householdId}/memberships`)
      .expect(200)

    const householdBody = manifest.backendResponseContracts['POST:/api/v1/households']!
    const householdPage = manifest.backendResponseContracts['GET:/api/v1/households']!
    const membershipPage =
      manifest.backendResponseContracts['GET:/api/v1/households/:id/memberships']!
    const individualBody = manifest.backendResponseContracts['GET:/api/v1/me/individual']!
    expect(validateResponseContract(householdBody.schema, created.body)).toEqual([])
    expect(validateResponseContract(householdBody.schema, fetched.body)).toEqual([])
    expect(validateResponseContract(householdPage.schema, listed.body)).toEqual([])
    expect(validateResponseContract(membershipPage.schema, memberships.body)).toEqual([])
    expect(validateResponseContract(individualBody.schema, individual.body)).toEqual([])
    expect(
      validateResponseContract(membershipResponseSchema(membershipPage.schema), added.body),
    ).toEqual([])
    expect(memberships.body.results).toContainEqual(added.body.membership)
  })
})
