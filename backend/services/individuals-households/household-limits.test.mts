import { beforeAll, onTestFinished, describe, expect, it } from 'vitest'
import { beginTransaction } from '@data-stores/psql'
import { deleteTestIndividual } from '@voucha/test-helpers/entities/individuals'
import {
  createTestUserDirect,
  createTestUsersDirect,
  insertTestHousehold,
  insertTestHouseholdMembership,
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

  it('admits exactly the free member slots when transactions race for them', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(householdLimitsConfig, { max_members_per_household: 3 }),
    )
    const owner = await createTestUserDirect()
    const joiners = await createTestUsersDirect(5)
    const household = await createHousehold(owner)
    const results = await Promise.allSettled(
      joiners.map(async joiner => {
        await using transaction = await beginTransaction()
        const inserted = await insertHouseholdMember(
          { householdId: household.id, individualId: joiner.individual_id!, relationship: null },
          { query: transaction },
        )
        await transaction.commit()
        return inserted
      }),
    )
    const admitted = results.filter(result => result.status === 'fulfilled')
    const refused = results.flatMap(result => (result.status === 'rejected' ? [result.reason] : []))
    // The owner's own membership holds one of the three slots.
    expect(admitted).toHaveLength(2)
    expect(refused).toHaveLength(3)
    for (const error of refused) {
      expect(error).toMatchObject({ status: 409, code: 'HOUSEHOLD_MEMBER_LIMIT_REACHED' })
    }
  })

  it('admits one of two concurrent joins when one individual slot is left', async () => {
    const owners = await createTestUsersDirect(5)
    const joiner = await createTestUserDirect()
    // Signup holds slot 1; three more memberships leave exactly one of the five slots free.
    for (const owner of owners.slice(0, 3)) {
      const household = await insertTestHousehold(owner.id)
      await insertTestHouseholdMembership({
        householdId: household.id,
        individualId: joiner.individual_id!,
      })
    }
    const targets = await Promise.all([
      insertTestHousehold(owners[3]!.id),
      insertTestHousehold(owners[4]!.id),
    ])
    const results = await Promise.allSettled(
      targets.map(async target => {
        await using transaction = await beginTransaction()
        const inserted = await insertHouseholdMember(
          { householdId: target.id, individualId: joiner.individual_id!, relationship: null },
          { query: transaction },
        )
        await transaction.commit()
        return inserted
      }),
    )
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const refused = results.flatMap(result => (result.status === 'rejected' ? [result.reason] : []))
    expect(refused).toHaveLength(1)
    expect(refused[0]).toMatchObject({ status: 409, code: 'INDIVIDUAL_HOUSEHOLD_LIMIT_REACHED' })
  })
})
