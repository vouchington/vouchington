import {
  blockUser,
  muteUser,
  countHouseholdInvitationNotificationsForTest,
  createTestUserDirect,
  getTestPrivateUserById,
  unlinkTestUserIndividualForInvitationFallback,
  insertTestHousehold,
  insertTestHouseholdMembership,
} from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import { decideHouseholdInvitation } from './decision.mts'
import {
  createHouseholdInvitation,
  listHouseholdInvitations,
  listMyHouseholdInvitations,
  revokeHouseholdInvitation,
} from './invitations.mts'

describe('household invitations', () => {
  it('invites by username, deduplicates, notifies once, and accepts with the relationship', async () => {
    const owner = await createTestUserDirect()
    const invitee = await createTestUserDirect()
    const household = await insertTestHousehold(owner.id)
    const created = await createHouseholdInvitation(owner, household.id, {
      user: invitee.username!,
      relationship: 'partner',
    })
    expect(created.created).toBe(true)
    expect(created.invitation.invited_user_id).toBe(invitee.id)
    const duplicate = await createHouseholdInvitation(owner, household.id, {
      user: invitee.id,
      relationship: 'changed',
    })
    expect(duplicate).toEqual({ invitation: created.invitation, created: false })
    expect(
      await countHouseholdInvitationNotificationsForTest(invitee.id, created.invitation.id),
    ).toBe(1)
    expect(
      (await listHouseholdInvitations(owner, household.id, { limit: 25 })).results,
    ).toHaveLength(1)
    expect((await listMyHouseholdInvitations(invitee, { limit: 25 })).results).toHaveLength(1)

    const accepted = await decideHouseholdInvitation(invitee, created.invitation.id, 'accept')
    expect(accepted?.membership).toMatchObject({
      household_id: household.id,
      relationship: 'partner',
      individual: { id: invitee.individual_id },
    })
    expect((await listMyHouseholdInvitations(invitee, { limit: 25 })).results).toEqual([])
    await expect(
      decideHouseholdInvitation(invitee, created.invitation.id, 'accept'),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('preserves an existing membership when accepting a pending invitation', async () => {
    const owner = await createTestUserDirect()
    const invitee = await createTestUserDirect()
    const household = await insertTestHousehold(owner.id)
    const { invitation } = await createHouseholdInvitation(owner, household.id, {
      user: invitee.id,
      relationship: 'invited',
    })
    const existing = await insertTestHouseholdMembership({
      householdId: household.id,
      individualId: invitee.individual_id!,
      relationship: 'existing',
    })
    const accepted = await decideHouseholdInvitation(invitee, invitation.id, 'accept')
    expect(accepted?.membership).toMatchObject({ id: existing.id, relationship: 'existing' })
  })

  it('creates an individual only for a successful acceptance', async () => {
    const owner = await createTestUserDirect()
    const invitee = await createTestUserDirect()
    await unlinkTestUserIndividualForInvitationFallback(invitee.id)
    expect((await getTestPrivateUserById(invitee.id))?.individual_id).toBeNull()
    const household = await insertTestHousehold(owner.id)
    const declined = await createHouseholdInvitation(owner, household.id, {
      user: invitee.id,
    })
    await decideHouseholdInvitation(invitee, declined.invitation.id, 'decline')
    await expect(
      decideHouseholdInvitation(invitee, declined.invitation.id, 'accept'),
    ).rejects.toMatchObject({ status: 409 })
    expect((await getTestPrivateUserById(invitee.id))?.individual_id).toBeNull()

    const pending = await createHouseholdInvitation(owner, household.id, {
      user: invitee.id,
    })
    const accepted = await decideHouseholdInvitation(invitee, pending.invitation.id, 'accept')
    const individualId = (await getTestPrivateUserById(invitee.id))?.individual_id
    expect(individualId).toBeTruthy()
    expect(accepted?.membership.individual.id).toBe(individualId)
  })

  it('declines or revokes pending invitations and rejects later acceptance', async () => {
    const owner = await createTestUserDirect()
    const declinedInvitee = await createTestUserDirect()
    const revokedInvitee = await createTestUserDirect()
    const household = await insertTestHousehold(owner.id)
    const declined = await createHouseholdInvitation(owner, household.id, {
      user: declinedInvitee.id,
    })
    const revoked = await createHouseholdInvitation(owner, household.id, {
      user: revokedInvitee.id,
    })
    await decideHouseholdInvitation(declinedInvitee, declined.invitation.id, 'decline')
    await revokeHouseholdInvitation(owner, household.id, revoked.invitation.id)
    await expect(
      decideHouseholdInvitation(declinedInvitee, declined.invitation.id, 'accept'),
    ).rejects.toMatchObject({ status: 409 })
    await expect(
      decideHouseholdInvitation(revokedInvitee, revoked.invitation.id, 'accept'),
    ).rejects.toMatchObject({ status: 409 })
    await expect(
      revokeHouseholdInvitation(owner, household.id, revoked.invitation.id),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('hides invitees who blocked or muted the inviter', async () => {
    const owner = await createTestUserDirect()
    const blocker = await createTestUserDirect()
    const muter = await createTestUserDirect()
    const household = await insertTestHousehold(owner.id)
    await blockUser(blocker, owner)
    await muteUser(muter, owner)
    for (const invitee of [blocker, muter]) {
      await expect(
        createHouseholdInvitation(owner, household.id, { user: invitee.id }),
      ).rejects.toMatchObject({ status: 404 })
      expect(await listMyHouseholdInvitations(invitee, { limit: 25 })).toMatchObject({
        results: [],
      })
    }
  })

  it('guards visibility, ownership, invitee identity, membership, and suspended callers', async () => {
    const owner = await createTestUserDirect()
    const invitee = await createTestUserDirect()
    const stranger = await createTestUserDirect()
    const household = await insertTestHousehold(owner.id)
    await expect(
      createHouseholdInvitation(stranger, household.id, { user: invitee.id }),
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      createHouseholdInvitation(owner, household.id, { user: owner.id }),
    ).rejects.toMatchObject({ status: 422 })
    await expect(
      createHouseholdInvitation(owner, household.id, { user: 'missing-user' }),
    ).rejects.toMatchObject({ status: 404 })
    const { invitation } = await createHouseholdInvitation(owner, household.id, {
      user: invitee.id,
    })
    await expect(
      decideHouseholdInvitation(stranger, invitation.id, 'accept'),
    ).rejects.toMatchObject({ status: 404 })
    await insertTestHouseholdMembership({
      householdId: household.id,
      individualId: stranger.individual_id!,
    })
    await expect(
      createHouseholdInvitation(owner, household.id, { user: stranger.id }),
    ).rejects.toMatchObject({ status: 409 })
    const suspended = { ...owner, suspended_at: new Date() }
    await expect(
      createHouseholdInvitation(suspended, household.id, { user: stranger.id }),
    ).rejects.toMatchObject({ status: 403 })
  })
})
