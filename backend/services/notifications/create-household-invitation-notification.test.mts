import {
  createTestUserDirect,
  insertTestHousehold,
  insertTestHouseholdInvitation,
} from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import { createHouseholdInvitationNotifications } from './create-household-invitation-notification.mts'

describe('household invitation notification scope', () => {
  it('rejects an invitation from another household or for another recipient', async () => {
    const owner = await createTestUserDirect()
    const invitee = await createTestUserDirect()
    const otherInvitee = await createTestUserDirect()
    const household = await insertTestHousehold(owner.id)
    const otherHousehold = await insertTestHousehold(owner.id)
    const invitationId = await insertTestHouseholdInvitation({
      householdId: household.id,
      invitedUserId: invitee.id,
      invitedById: owner.id,
    })

    await expect(
      createHouseholdInvitationNotifications(
        [{ userId: invitee.id, householdId: otherHousehold.id, invitationId }],
        {},
      ),
    ).rejects.toMatchObject({ code: '23503' })
    await expect(
      createHouseholdInvitationNotifications(
        [{ userId: otherInvitee.id, householdId: household.id, invitationId }],
        {},
      ),
    ).rejects.toMatchObject({ code: '23503' })
  })
})
