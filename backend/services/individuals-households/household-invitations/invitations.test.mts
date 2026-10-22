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
import { describe, expect, it, vi } from 'vitest'
import * as notifications from '@services/notifications'
import { listNotifications } from '@services/notifications/list'
import { withPostgresQueryFailureForTest } from '@voucha/test-helpers/postgres-query-failure'
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
    expect(created.invitation).toMatchObject({
      invited_user_id: invitee.id,
      invited_by_id: owner.id,
      invited_user: { id: invitee.id, username: invitee.username },
      invited_by: { id: owner.id, username: owner.username },
      household_owner: { id: owner.id, username: owner.username },
    })
    const duplicate = await createHouseholdInvitation(owner, household.id, {
      user: invitee.id,
      relationship: 'changed',
    })
    expect(duplicate).toEqual({ invitation: created.invitation, created: false })
    expect(
      await countHouseholdInvitationNotificationsForTest(invitee.id, created.invitation.id),
    ).toBe(1)
    expect((await listHouseholdInvitations(owner, household.id, { limit: 25 })).results).toEqual([
      created.invitation,
    ])
    expect((await listMyHouseholdInvitations(invitee, { limit: 25 })).results).toEqual([
      created.invitation,
    ])

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

  it('embeds distinct owner and inviter usernames and preserves a null invitee username', async () => {
    const owner = await createTestUserDirect()
    const administrator = await createTestUserDirect({ administrator: true })
    const invitee = await createTestUserDirect({ noUsername: true })
    const household = await insertTestHousehold(owner.id)
    const { invitation } = await createHouseholdInvitation(administrator, household.id, {
      user: invitee.id,
    })
    expect(invitation).toMatchObject({
      invited_user: { id: invitee.id, username: null },
      invited_by: { id: administrator.id, username: administrator.username },
      household_owner: { id: owner.id, username: owner.username },
    })
    expect((await listHouseholdInvitations(owner, household.id, { limit: 25 })).results).toEqual([
      invitation,
    ])
    expect((await listMyHouseholdInvitations(invitee, { limit: 25 })).results).toEqual([invitation])
  })

  it('accepts a relationship of 33 supplementary Unicode code points', async () => {
    const owner = await createTestUserDirect()
    const invitee = await createTestUserDirect()
    const secondInvitee = await createTestUserDirect()
    const household = await insertTestHousehold(owner.id)
    const relationship = '😀'.repeat(33)
    const { invitation } = await createHouseholdInvitation(owner, household.id, {
      user: invitee.id,
      relationship,
    })
    expect(invitation.relationship).toBe(relationship)
    const maxRelationship = '😀'.repeat(64)
    expect(
      (
        await createHouseholdInvitation(owner, household.id, {
          user: secondInvitee.id,
          relationship: maxRelationship,
        })
      ).invitation.relationship,
    ).toBe(maxRelationship)
    await expect(
      createHouseholdInvitation(owner, household.id, {
        user: secondInvitee.id,
        relationship: '😀'.repeat(65),
      }),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('stores an empty or whitespace-only invitation relationship as null', async () => {
    const owner = await createTestUserDirect()
    const invitee = await createTestUserDirect()
    const secondInvitee = await createTestUserDirect()
    const household = await insertTestHousehold(owner.id)
    const { invitation } = await createHouseholdInvitation(owner, household.id, {
      user: invitee.id,
      relationship: '',
    })
    expect(invitation.relationship).toBeNull()
    const whitespace = await createHouseholdInvitation(owner, household.id, {
      user: secondInvitee.id,
      relationship: '   ',
    })
    expect(whitespace.invitation.relationship).toBeNull()
  })

  it('enqueues push only after commit and never for a rolled-back invitation', async () => {
    const owner = await createTestUserDirect()
    const invitee = await createTestUserDirect()
    const rolledBackInvitee = await createTestUserDirect()
    const household = await insertTestHousehold(owner.id)
    const durableAtEnqueue: boolean[] = []
    const push = vi.spyOn(notifications, 'enqueueCommunityLifecycleNotificationPush')
    push.mockImplementation(async rows => {
      for (const row of rows) {
        const stored = await listNotifications(row.userId)
        durableAtEnqueue.push(Boolean(stored.notifications[row.notificationId]))
      }
    })
    try {
      const created = await createHouseholdInvitation(owner, household.id, { user: invitee.id })
      expect(created.created).toBe(true)
      expect(durableAtEnqueue).toEqual([true])

      const { error } = await withPostgresQueryFailureForTest(
        '/* createHouseholdInvitationNotifications */',
        () =>
          expect(
            createHouseholdInvitation(owner, household.id, { user: rolledBackInvitee.id }),
          ).rejects.toMatchObject({ code: '25P02' }),
        { command: 'INSERT' },
      )
      expect(error).toMatchObject({ code: '25P02' })
      expect(durableAtEnqueue).toEqual([true])
      expect((await listMyHouseholdInvitations(rolledBackInvitee, { limit: 25 })).results).toEqual(
        [],
      )
    } finally {
      push.mockRestore()
    }
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
    }
  })

  it('applies the household owner block state to administrator invitations', async () => {
    const owner = await createTestUserDirect()
    const blocker = await createTestUserDirect()
    const administrator = await createTestUserDirect({ administrator: true })
    const household = await insertTestHousehold(owner.id)
    await blockUser(blocker, owner)
    await expect(
      createHouseholdInvitation(administrator, household.id, { user: blocker.id }),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('rejects an administrator inviting the household owner', async () => {
    const owner = await createTestUserDirect()
    const administrator = await createTestUserDirect({ administrator: true })
    const household = await insertTestHousehold(owner.id)
    await expect(
      createHouseholdInvitation(administrator, household.id, { user: owner.id }),
    ).rejects.toMatchObject({ status: 409 })
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
