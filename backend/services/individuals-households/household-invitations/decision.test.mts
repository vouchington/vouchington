import { describe, expect, it } from 'vitest'
import {
  blockUser,
  createTestUserDirect,
  insertTestHousehold,
  muteUser,
} from '@voucha/test-helpers'
import { withPostgresQueryFailureForTest } from '@voucha/test-helpers/postgres-query-failure'
import { getHouseholdMemberships } from '../households/household-lists.mts'
import { deleteHousehold } from '../households/households.mts'
import { decideHouseholdInvitation } from './decision.mts'
import { createHouseholdInvitation, listMyHouseholdInvitations } from './invitations.mts'

describe('household invitation acceptance transaction', () => {
  it('keeps the invitation pending and the membership absent when its insert fails', async () => {
    const owner = await createTestUserDirect()
    const invitee = await createTestUserDirect()
    const household = await insertTestHousehold(owner.id)
    const { invitation } = await createHouseholdInvitation(owner, household.id, {
      user: invitee.id,
    })

    const { error } = await withPostgresQueryFailureForTest(
      '/* decideHouseholdInvitation:insert-membership */',
      () =>
        expect(decideHouseholdInvitation(invitee, invitation.id, 'accept')).rejects.toMatchObject({
          code: '25P02',
        }),
      { command: 'INSERT' },
    )
    expect(error).toMatchObject({ code: '25P02' })
    expect((await listMyHouseholdInvitations(invitee, { limit: 25 })).results).toContainEqual(
      invitation,
    )
    const members = await getHouseholdMemberships(owner, household.id, { limit: 25 })
    expect(members.results.some(member => member.individual.id === invitee.individual_id)).toBe(
      false,
    )
    await expect(
      decideHouseholdInvitation(invitee, invitation.id, 'accept'),
    ).resolves.toMatchObject({
      membership: { individual: { id: invitee.individual_id } },
    })
  })

  it('rejects acceptance after a block or mute but still permits decline', async () => {
    const owner = await createTestUserDirect()
    const administrator = await createTestUserDirect({ administrator: true })
    const blockedInvitee = await createTestUserDirect()
    const mutedInvitee = await createTestUserDirect()
    const household = await insertTestHousehold(owner.id)
    const blocked = await createHouseholdInvitation(owner, household.id, {
      user: blockedInvitee.id,
    })
    const muted = await createHouseholdInvitation(administrator, household.id, {
      user: mutedInvitee.id,
    })
    await blockUser(owner, blockedInvitee)
    await muteUser(mutedInvitee, owner)

    for (const [invitee, invitation] of [
      [blockedInvitee, blocked.invitation],
      [mutedInvitee, muted.invitation],
    ] as const) {
      await expect(
        decideHouseholdInvitation(invitee, invitation.id, 'accept'),
      ).rejects.toMatchObject({
        status: 404,
      })
      expect((await listMyHouseholdInvitations(invitee, { limit: 25 })).results).toContainEqual(
        invitation,
      )
      await expect(
        decideHouseholdInvitation(invitee, invitation.id, 'decline'),
      ).resolves.toBeUndefined()
    }
  })

  it('returns 404 when the household and its invitation have been deleted', async () => {
    const owner = await createTestUserDirect()
    const invitee = await createTestUserDirect()
    const household = await insertTestHousehold(owner.id)
    const { invitation } = await createHouseholdInvitation(owner, household.id, {
      user: invitee.id,
    })
    await deleteHousehold(owner, household.id)
    await expect(decideHouseholdInvitation(invitee, invitation.id, 'accept')).rejects.toMatchObject(
      {
        status: 404,
      },
    )
  })
})
