import assert from 'node:assert/strict'
import { createIndividualCardRow } from './individuals/create-card-row.mts'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestUserDirect,
  createTestTopic,
  insertTestHousehold,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers'
import { deleteTestIndividual } from '@voucha/test-helpers/entities/individuals'
import { runHouseholdAdmissionRace } from '@voucha/test-helpers/household-admission-race'
import { householdLimitsConfig } from './household-limits-config.mts'
import { createHouseholdInvitation } from './household-invitations/invitations.mts'
import { decideHouseholdInvitation } from './household-invitations/decision.mts'
import { createHousehold } from './households/households.mts'
import { getOrCreateIndividual } from './individuals/individuals.mts'

describe('household admission while a representative is missing', () => {
  it('counts owned households toward the future representative cap before binding', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(householdLimitsConfig, {
        max_households_per_individual: 1,
      }),
    )
    const user = await createTestUserDirect()
    await deleteTestIndividual(user.individual_id!)
    await expect(createHousehold(user)).rejects.toMatchObject({
      status: 409,
      code: 'INDIVIDUAL_HOUSEHOLD_LIMIT_REACHED',
    })
  })

  it.each(['create', 'accept'] as const)(
    '%s wins the shared identity fence without admitting both households',
    async winner => {
      onTestFinished(
        overrideDynamicConfigFieldsForTest(householdLimitsConfig, {
          max_households_per_individual: 2,
        }),
      )
      const owner = await createTestUserDirect()
      const invitee = await createTestUserDirect()
      await deleteTestIndividual(invitee.individual_id!)
      const target = await insertTestHousehold(owner.id)
      const { invitation } = await createHouseholdInvitation(owner, target.id, { user: invitee.id })
      const create = () => createHousehold(invitee)
      const accept = () => decideHouseholdInvitation(invitee, invitation.id, 'accept')
      const result =
        winner === 'create'
          ? await runHouseholdAdmissionRace(invitee.id, create, accept)
          : await runHouseholdAdmissionRace(invitee.id, accept, create)
      expect(result.first.status).toBe('fulfilled')
      expect(result.second).toMatchObject({
        status: 'rejected',
        reason: { status: 409, code: 'INDIVIDUAL_HOUSEHOLD_LIMIT_REACHED' },
      })
    },
  )

  it('concurrent missing-identity fallbacks reuse the same representative', async () => {
    const user = await createTestUserDirect()
    await deleteTestIndividual(user.individual_id!)
    const result = await runHouseholdAdmissionRace(
      user.id,
      () => getOrCreateIndividual(user),
      () => getOrCreateIndividual(user),
    )
    expect(result.first.status).toBe('fulfilled')
    expect(result.second.status).toBe('fulfilled')
    assert(result.first.status === 'fulfilled' && result.second.status === 'fulfilled')
    expect(result.first.value.id).toBe(result.second.value.id)
  })

  it('card creation and the central fallback share one missing representative', async () => {
    const user = await createTestUserDirect()
    const card = await createTestTopic({ user, topic_type: 'card' })
    await deleteTestIndividual(user.individual_id!)
    const result = await runHouseholdAdmissionRace(
      user.id,
      () => createIndividualCardRow(user.id, card.id),
      () => getOrCreateIndividual(user),
    )
    expect(result.first.status).toBe('fulfilled')
    expect(result.second.status).toBe('fulfilled')
    assert(result.first.status === 'fulfilled' && result.second.status === 'fulfilled')
    expect(result.first.value.individual_id).toBe(result.second.value.id)
  })
})
