import { createTestUserDirect, insertTestHouseholdMembership } from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  addHouseholdMembership,
  createHousehold,
  deleteHousehold,
  getHousehold,
  removeHouseholdMembership,
} from './households.mts'
import { getHouseholdMemberships } from './household-lists.mts'

const preciseTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/

describe('household membership writes', () => {
  it('returns the list membership and keeps a relationship when a retry omits it', async () => {
    const owner = await createTestUserDirect()
    const household = await createHousehold(owner)
    const created = await addHouseholdMembership(
      owner,
      household.id,
      owner.individual_id!,
      'spouse',
    )
    const retried = await addHouseholdMembership(owner, household.id, owner.individual_id!)
    const blank = await addHouseholdMembership(owner, household.id, owner.individual_id!, '')
    expect(retried.relationship).toBe('spouse')
    expect(blank.relationship).toBe('spouse')

    const renamed = await addHouseholdMembership(owner, household.id, owner.individual_id!, 'child')
    expect(renamed.id).toBe(created.id)
    expect(renamed.relationship).toBe('child')
    expect(renamed.updated_at).toMatch(preciseTimestamp)
    expect(renamed.individual).toMatchObject({
      id: owner.individual_id,
      user_id: owner.id,
      username: owner.username,
    })
    expect(typeof renamed.individual.updated_at).toBe('string')

    const page = await getHouseholdMemberships(owner, household.id, { limit: 25 })
    expect(page.results).toContainEqual(renamed)
  })

  it('returns 404 for a hidden household and 403 when a member cannot manage it', async () => {
    const owner = await createTestUserDirect()
    const member = await createTestUserDirect()
    const stranger = await createTestUserDirect()
    const household = await createHousehold(owner)
    const membership = await addHouseholdMembership(
      owner,
      household.id,
      owner.individual_id!,
      'self',
    )
    await insertTestHouseholdMembership({
      householdId: household.id,
      individualId: member.individual_id!,
    })
    const missingId = randomUUID()

    await expect(getHousehold(stranger, household.id)).rejects.toMatchObject({
      status: 404,
      message: 'Household not found',
    })
    await expect(getHousehold(member, household.id)).resolves.toMatchObject({ id: household.id })
    await expect(getHousehold(stranger, missingId)).rejects.toMatchObject({
      status: 404,
      message: 'Household not found',
    })
    await expect(
      addHouseholdMembership(member, household.id, member.individual_id!),
    ).rejects.toMatchObject({ status: 403, message: 'Only household owner can add members' })
    await expect(
      addHouseholdMembership(stranger, household.id, stranger.individual_id!),
    ).rejects.toMatchObject({ status: 404, message: 'Household not found' })
    await expect(
      addHouseholdMembership(owner, missingId, owner.individual_id!),
    ).rejects.toMatchObject({ status: 404, message: 'Household not found' })
    await expect(
      removeHouseholdMembership(member, household.id, membership.id),
    ).rejects.toMatchObject({ status: 403, message: 'Only household owner can remove members' })
    await expect(
      removeHouseholdMembership(stranger, household.id, membership.id),
    ).rejects.toMatchObject({ status: 404, message: 'Household not found' })
    await expect(removeHouseholdMembership(owner, missingId, membership.id)).rejects.toMatchObject({
      status: 404,
      message: 'Household not found',
    })
    await expect(deleteHousehold(member, household.id)).rejects.toMatchObject({
      status: 404,
      message: 'Household not found',
    })
    await expect(deleteHousehold(stranger, household.id)).rejects.toMatchObject({
      status: 404,
      message: 'Household not found',
    })
    await expect(deleteHousehold(owner, missingId)).rejects.toMatchObject({
      status: 404,
      message: 'Household not found',
    })
    await deleteHousehold(owner, household.id)
    await expect(getHousehold(owner, household.id)).rejects.toMatchObject({ status: 404 })
  })

  it('requires a logged-in user before deleting a household or membership', async () => {
    const id = randomUUID()
    await expect(deleteHousehold(null, id)).rejects.toMatchObject({
      status: 401,
      message: 'User not logged in',
    })
    await expect(removeHouseholdMembership(null, id, id)).rejects.toMatchObject({
      status: 401,
      message: 'User not logged in',
    })
  })
})
