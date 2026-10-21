import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  countTestHouseholdSpendingEntries,
  createTestUser,
  insertTestHouseholdSpendingEntry,
  insertTestSpendingCategory,
} from '@voucha/test-helpers'
import {
  callRejectedMcpTool,
  callStructuredMcpTool,
  optionArgs,
  type McpContractCaller,
} from '@voucha/test-helpers/mcp-tool-contract'

const WRITE = ['households:read', 'households:write'] as const
const plus = (user: Awaited<ReturnType<typeof createTestUser>>): McpContractCaller => ({
  ...user,
  membership_plan: 'plus',
})
const writeHouseholds = (user: McpContractCaller, option: string, args: Record<string, unknown>) =>
  callStructuredMcpTool(user, 'manage_my_households', optionArgs(option, args), WRITE)

describe('manage_my_households REST twins — real DB', () => {
  it('creates, adds its owner, removes that membership, and deletes the household', async () => {
    const owner = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(owner)
    const rest = await request.post('/api/v1/households').send({}).expect(201)
    const tool = await writeHouseholds(plus(owner), 'create', {})
    expect(tool.household).toMatchObject({ owner_user_id: rest.body.household.owner_user_id })
    const household_id = (tool.household as { id: string }).id
    const individual_id = (await request.get('/api/v1/me/individual').expect(200)).body.individual
      .id as string
    const added = await writeHouseholds(plus(owner), 'add_member', {
      household_id,
      individual_id,
      relationship: 'self',
    })
    const membership = added.membership as { id: string; relationship: string }
    expect(membership.relationship).toBe('self')
    expect(
      (await request.get(`/api/v1/households/${household_id}/memberships`).expect(200)).body
        .results,
    ).toContainEqual(membership)
    expect(
      await writeHouseholds(plus(owner), 'remove_member', {
        household_id,
        membership_id: membership.id,
      }),
    ).toEqual({ success: true })
    const category = await insertTestSpendingCategory({ createdById: owner.id })
    await insertTestHouseholdSpendingEntry({
      householdId: household_id,
      spendingCategoryId: category,
    })
    expect(await countTestHouseholdSpendingEntries(household_id)).toBe(1)
    expect(await writeHouseholds(plus(owner), 'delete', { household_id })).toEqual({
      success: true,
    })
    expect(await countTestHouseholdSpendingEntries(household_id)).toBe(0)
    await request.get(`/api/v1/households/${household_id}`).expect(404)
  })

  it('denies a visible nonowner and adding another user without an invitation', async () => {
    const owner = await createTestUser()
    const other = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(owner)
    const household_id = (await request.post('/api/v1/households').send({}).expect(201)).body
      .household.id as string
    expect(
      await callRejectedMcpTool(
        plus(owner),
        'manage_my_households',
        optionArgs('add_member', { household_id, individual_id: other.individual_id }),
        WRITE,
      ),
    ).toContain('Cannot add another user to a household without an invitation')
    await request.authenticateAs(other)
    await request
      .post(`/api/v1/households/${household_id}/memberships`)
      .send({ individual_id: other.individual_id })
      .expect(404)
    expect(
      await callRejectedMcpTool(
        plus(other),
        'manage_my_households',
        optionArgs('add_member', { household_id, individual_id: other.individual_id }),
        WRITE,
      ),
    ).toContain('Household not found')
  })

  it('honors administrator bypass for another household, another user, and membership removal', async () => {
    const owner = await createTestUser()
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(owner)
    const household_id = (await request.post('/api/v1/households').send({}).expect(201)).body
      .household.id as string
    const added = await writeHouseholds(plus(admin), 'add_member', {
      household_id,
      individual_id: member.individual_id,
    })
    const membership_id = (added.membership as { id: string }).id
    await request.authenticateAs(admin)
    expect(
      (await request.get(`/api/v1/households/${household_id}/memberships`).expect(200)).body
        .results,
    ).toContainEqual(added.membership)
    expect(
      await writeHouseholds(plus(admin), 'remove_member', { household_id, membership_id }),
    ).toEqual({ success: true })
    expect(await writeHouseholds(plus(admin), 'delete', { household_id })).toEqual({
      success: true,
    })
  })
})
