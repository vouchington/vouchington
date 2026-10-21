import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, withCapturedTestQueries } from '@voucha/test-helpers'
import {
  callStructuredMcpTool,
  expectMcpToolFunctionThrows,
  optionArgs,
  type McpContractCaller,
} from '@voucha/test-helpers/mcp-tool-contract'

const READ = ['households:read'] as const
const caller = (user: Awaited<ReturnType<typeof createTestUser>>): McpContractCaller => ({
  ...user,
  membership_plan: null,
})
const readHouseholds = (user: McpContractCaller, option: string, args: Record<string, unknown>) =>
  callStructuredMcpTool(user, 'read_my_households', optionArgs(option, args), READ)

describe('read_my_households REST twins — real DB', () => {
  it('lists owned households with the REST cursor and reads the same individual', async () => {
    const owner = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(owner)
    await request.post('/api/v1/households').send({}).expect(201)
    await request.post('/api/v1/households').send({}).expect(201)

    const rest = await request
      .get('/api/v1/households')
      .query({ access: 'owned', limit: 1 })
      .expect(200)
    const tool = await readHouseholds(caller(owner), 'list', { access: 'owned', limit: 1 })
    expect(tool).toEqual(rest.body)
    const after = (tool.page_info as { end_cursor: string }).end_cursor
    expect(
      await readHouseholds(caller(owner), 'list', { access: 'owned', limit: 1, after }),
    ).toEqual(
      (
        await request
          .get('/api/v1/households')
          .query({ access: 'owned', limit: 1, after })
          .expect(200)
      ).body,
    )
    expect(await readHouseholds(caller(owner), 'my_individual', {})).toEqual(
      (await request.get('/api/v1/me/individual').expect(200)).body,
    )
    expect(owner.individual_id).toBeTruthy()
    const { result, queries } = await withCapturedTestQueries(() =>
      readHouseholds(caller(owner), 'my_individual', {}),
    )
    expect(result.individual).toMatchObject({ id: owner.individual_id })
    expect(queries.some(query => /\b(?:INSERT|UPDATE)\b/iu.test(query.text))).toBe(false)
  })

  it('gets a household and its memberships with the same REST body', async () => {
    const owner = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(owner)
    const household = (await request.post('/api/v1/households').send({}).expect(201)).body.household
    const household_id = household.id as string
    expect(await readHouseholds(caller(owner), 'get', { household_id })).toEqual(
      (await request.get(`/api/v1/households/${household_id}`).expect(200)).body,
    )
    expect(await readHouseholds(caller(owner), 'memberships', { household_id, limit: 1 })).toEqual(
      (
        await request
          .get(`/api/v1/households/${household_id}/memberships`)
          .query({ limit: 1 })
          .expect(200)
      ).body,
    )
  })

  it('hides a household from a nonmember just like REST', async () => {
    const owner = await createTestUser()
    const stranger = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(owner)
    const household_id = (await request.post('/api/v1/households').send({}).expect(201)).body
      .household.id as string
    await request.authenticateAs(stranger)
    await request.get(`/api/v1/households/${household_id}`).expect(404)
    await expectMcpToolFunctionThrows(
      caller(stranger),
      'read_my_households',
      optionArgs('get', { household_id }),
      { status: 404, message: 'Household not found' },
    )
  })

  it('allows an administrator to read another household and its memberships', async () => {
    const owner = await createTestUser()
    const admin = await createTestUser({ administrator: true })
    const request = createRequest()
    await request.authenticateAs(owner)
    const household_id = (await request.post('/api/v1/households').send({}).expect(201)).body
      .household.id as string
    await request.authenticateAs(admin)
    expect(await readHouseholds(caller(admin), 'get', { household_id })).toEqual(
      (await request.get(`/api/v1/households/${household_id}`).expect(200)).body,
    )
    expect(await readHouseholds(caller(admin), 'memberships', { household_id })).toEqual(
      (await request.get(`/api/v1/households/${household_id}/memberships`).expect(200)).body,
    )
  })
})
