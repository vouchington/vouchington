import { beforeAll, onTestFinished, describe, expect, it } from 'vitest'
import { deleteTestIndividual } from '@voucha/test-helpers/entities/individuals'
import { commitHouseholdAdmissionForTest } from '@voucha/test-helpers/household-admission'
import {
  createTestUserDirect,
  insertTestHousehold,
  countOwnedHouseholdsForTestUser,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers'
import { householdLimitsConfig } from './household-limits-config.mts'
import { createHouseholdInvitation } from './household-invitations/invitations.mts'
import { decideHouseholdInvitation } from './household-invitations/decision.mts'
import { insertHouseholdMember } from './household-limits.mts'
import { addHouseholdMembership, createHousehold } from './households/households.mts'
import { getOrCreateIndividual } from './individuals/individuals.mts'

describe('household admission limits', () => {
  beforeAll(async () => {
    await householdLimitsConfig.waitForInitialization()
  })

  it('refuses another owned household when the owned cap is 1', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(householdLimitsConfig, { max_households_per_user: 1 }),
    )
    const user = await createTestUserDirect()
    await expect(createHousehold(user)).rejects.toMatchObject({
      status: 409,
      code: 'HOUSEHOLD_LIMIT_REACHED',
    })
  })

  it('updates an existing membership at the member cap and refuses a new member', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(householdLimitsConfig, {
        max_members_per_household: 1,
      }),
    )
    const owner = await createTestUserDirect()
    const invitee = await createTestUserDirect()
    const household = await createHousehold(owner)
    const created = await addHouseholdMembership(owner, household.id, owner.individual_id!, 'self')
    const updated = await addHouseholdMembership(
      owner,
      household.id,
      owner.individual_id!,
      'spouse',
    )
    expect(updated.id).toBe(created.id)
    expect(updated.relationship).toBe('spouse')

    const { invitation } = await createHouseholdInvitation(owner, household.id, {
      user: invitee.id,
    })
    await expect(decideHouseholdInvitation(invitee, invitation.id, 'accept')).rejects.toMatchObject(
      { status: 409, code: 'HOUSEHOLD_MEMBER_LIMIT_REACHED' },
    )
  })

  it('refuses a second household for an individual when that cap is 1', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(householdLimitsConfig, {
        max_households_per_individual: 1,
      }),
    )
    const owner = await createTestUserDirect()
    const invitee = await createTestUserDirect()
    // Signup already fills an individual cap of 1, so the extra household skips admission.
    const household = await insertTestHousehold(owner.id)
    const { invitation } = await createHouseholdInvitation(owner, household.id, {
      user: invitee.id,
    })
    await expect(decideHouseholdInvitation(invitee, invitation.id, 'accept')).rejects.toMatchObject(
      { status: 409, code: 'INDIVIDUAL_HOUSEHOLD_LIMIT_REACHED' },
    )
  })

  it('refuses a created household when the owner individual cap is full and keeps no row', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(householdLimitsConfig, {
        max_households_per_individual: 1,
      }),
    )
    const user = await createTestUserDirect()
    await expect(createHousehold(user)).rejects.toMatchObject({
      status: 409,
      code: 'INDIVIDUAL_HOUSEHOLD_LIMIT_REACHED',
    })
    expect(await countOwnedHouseholdsForTestUser(user.id)).toBe(1)
  })

  it('concurrent missing-identity fallbacks reuse the same representative', async () => {
    const user = await createTestUserDirect()
    await deleteTestIndividual(user.individual_id!)
    const [first, second] = await Promise.all([
      getOrCreateIndividual(user),
      getOrCreateIndividual(user),
    ])
    expect(first.id).toBe(second.id)
  })

  it('treats a concurrent duplicate membership as already joined', async () => {
    const owner = await createTestUserDirect()
    const joiner = await createTestUserDirect()
    const household = await insertTestHousehold(owner.id)
    const results = await Promise.all([
      commitHouseholdAdmissionForTest(query =>
        insertHouseholdMember(
          { householdId: household.id, individualId: joiner.individual_id!, relationship: null },
          { query },
        ),
      ),
      commitHouseholdAdmissionForTest(query =>
        insertHouseholdMember(
          { householdId: household.id, individualId: joiner.individual_id!, relationship: null },
          { query },
        ),
      ),
    ])
    expect(results.toSorted((left, right) => Number(left) - Number(right))).toEqual([false, true])
  })
})
