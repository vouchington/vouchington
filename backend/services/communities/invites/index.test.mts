import { it, expect, beforeAll, describe } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityInvite,
  readAllQueueJobs,
  updateTestUserUiLocale,
} from '@voucha/test-helpers'
import { emails } from '@queues/emails/queues'
import { createInvite, getCommunityInviteRecipientUiLocale } from './create.mts'
import { redeemInviteCode } from './redeem.mts'
import { revokeInvite } from './revoke.mts'
import { getCommunityMember } from '../members/get.mts'
import { archiveCommunity } from '../archive.mts'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '../types.mts'

describe('index', () => {
  let owner: PrivateUser
  let community: Community

  beforeAll(async () => {
    owner = await createTestUser()
    community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
  })

  describe('createInvite', () => {
    it('owner can invite by username', async () => {
      const invitee = await createTestUser()
      const invite = await createInvite(owner.id, community.id, { username: invitee.username! })
      expect(invite.community_id).toBe(community.id)
      expect(invite.invited_user_id).toBe(invitee.id)
      expect(invite.invited_by_id).toBe(owner.id)
      expect(invite.accepted_at).toBeNull()
    })

    it('owner can invite by email', async () => {
      const invite = await createInvite(owner.id, community.id, {
        email: 'tests+test-invite@voucha.ai',
      })
      expect(invite.invited_email).toBe('tests+test-invite@voucha.ai')
    })

    it('includes invited registered user locale in queued email jobs', async () => {
      const invitee = await createTestUser()
      await updateTestUserUiLocale(invitee.id, 'fr')
      await createInvite(owner.id, community.id, { email: invitee.email_address! })
      await expect
        .poll(async () => {
          const jobs = await readAllQueueJobs(emails)
          return jobs.some(job => {
            const data = job.data as {
              input?: { emailAddress?: string; uiLocale?: string | null }
            }
            return (
              job.name === 'processSendCommunityInviteEmail' &&
              data.input?.emailAddress === invitee.email_address &&
              data.input?.uiLocale === 'fr'
            )
          })
        })
        .toBe(true)
    })

    it('falls back when recipient locale lookup fails', async () => {
      for (const error of [new Error('lookup unavailable'), 'lookup unavailable']) {
        await expect(
          getCommunityInviteRecipientUiLocale('tests+lookup-failure@voucha.ai', () =>
            Promise.reject(error),
          ),
        ).resolves.toBeNull()
      }
    })

    it('rejects invite when both username and email provided', async () => {
      const invitee = await createTestUser()
      await expect(
        createInvite(owner.id, community.id, {
          username: invitee.username!,
          email: 'tests+test@voucha.ai',
        }),
      ).rejects.toMatchObject({ status: 422 })
    })

    it('rejects invite for non-existent user', async () => {
      await expect(
        createInvite(owner.id, community.id, { username: 'nonexistent-user-xyz' }),
      ).rejects.toMatchObject({ status: 404 })
    })

    it('rejects invite for already-member', async () => {
      const existing = await createTestUser()
      await insertTestCommunityMember({ communityId: community.id, userId: existing.id })
      await expect(
        createInvite(owner.id, community.id, { username: existing.username! }),
      ).rejects.toMatchObject({ status: 409 })
    })

    it('non-member cannot invite', async () => {
      const stranger = await createTestUser()
      const invitee = await createTestUser()
      await expect(
        createInvite(stranger.id, community.id, { username: invitee.username! }),
      ).rejects.toMatchObject({ status: 403 })
    })

    it('regular member cannot invite when member_invites_allowed_at is null', async () => {
      const restrictedCommunity = await insertTestCommunity({
        createdById: owner.id,
        member_invites_allowed_at: null,
      })
      const member = await createTestUser()
      await insertTestCommunityMember({
        communityId: restrictedCommunity.id,
        userId: owner.id,
        role: 'owner',
      })
      await insertTestCommunityMember({
        communityId: restrictedCommunity.id,
        userId: member.id,
        role: 'member',
      })
      const invitee = await createTestUser()
      await expect(
        createInvite(member.id, restrictedCommunity.id, { username: invitee.username! }),
      ).rejects.toMatchObject({ status: 403 })
    })

    it('rejects archived communities', async () => {
      const archivedCommunity = await insertTestCommunity({ createdById: owner.id })
      await insertTestCommunityMember({
        communityId: archivedCommunity.id,
        userId: owner.id,
        role: 'owner',
      })
      await archiveCommunity(archivedCommunity.id, null)

      const invitee = await createTestUser()
      await expect(
        createInvite(owner.id, archivedCommunity.id, { username: invitee.username! }),
      ).rejects.toMatchObject({ status: 403 })
    }, 60_000)
  })

  describe('redeemInviteCode', () => {
    it('user can redeem a valid invite code and become a member', async () => {
      const invitee = await createTestUser()
      const invite = await insertTestCommunityInvite({
        communityId: community.id,
        invitedById: owner.id,
        invitedUserId: invitee.id,
      })

      const redeemed = await redeemInviteCode(invitee.id, invite.code)
      expect(redeemed.accepted_at).not.toBeNull()
      expect(redeemed.accepted_by_user_id).toBe(invitee.id)

      const membership = await getCommunityMember(community.id, invitee.id)
      expect(membership).not.toBeNull()
      expect(membership!.role).toBe('member')
      expect(membership!.approved_by_id).toBe(owner.id)
    })

    it('does not mark member-created invites as moderator approval', async () => {
      const member = await createTestUser()
      const invitee = await createTestUser()
      await insertTestCommunityMember({
        communityId: community.id,
        userId: member.id,
        role: 'member',
      })
      const invite = await insertTestCommunityInvite({
        communityId: community.id,
        invitedById: member.id,
        invitedUserId: invitee.id,
      })

      await redeemInviteCode(invitee.id, invite.code)

      const membership = await getCommunityMember(community.id, invitee.id)
      expect(membership).not.toBeNull()
      expect(membership!.approved_by_id).toBeNull()
    })

    it('rejects redeeming an already-used code', async () => {
      const invitee = await createTestUser()
      const invite = await insertTestCommunityInvite({
        communityId: community.id,
        invitedById: owner.id,
        invitedUserId: invitee.id,
      })
      await redeemInviteCode(invitee.id, invite.code)

      const another = await createTestUser()
      await expect(redeemInviteCode(another.id, invite.code)).rejects.toMatchObject({ status: 404 })
    })

    it('rejects invalid invite code', async () => {
      const user = await createTestUser()
      await expect(redeemInviteCode(user.id, 'deadbeef')).rejects.toMatchObject({ status: 404 })
    })

    it('rejects redeeming invite for an archived community', async () => {
      const archivedComm = await insertTestCommunity({ createdById: owner.id })
      await insertTestCommunityMember({
        communityId: archivedComm.id,
        userId: owner.id,
        role: 'owner',
      })
      const invitee = await createTestUser()
      const invite = await insertTestCommunityInvite({
        communityId: archivedComm.id,
        invitedById: owner.id,
        invitedUserId: invitee.id,
      })
      await archiveCommunity(archivedComm.id, null)
      await expect(redeemInviteCode(invitee.id, invite.code)).rejects.toMatchObject({ status: 403 })
    }, 60_000)

    it('rejects redeem if already a member', async () => {
      const existingMember = await createTestUser()
      await insertTestCommunityMember({ communityId: community.id, userId: existingMember.id })
      const invite = await insertTestCommunityInvite({
        communityId: community.id,
        invitedById: owner.id,
        invitedUserId: existingMember.id,
      })
      await expect(redeemInviteCode(existingMember.id, invite.code)).rejects.toMatchObject({
        status: 409,
      })
    })
  })

  describe('revokeInvite', () => {
    it('owner can revoke a pending invite', async () => {
      const invitee = await createTestUser()
      const invite = await insertTestCommunityInvite({
        communityId: community.id,
        invitedById: owner.id,
        invitedUserId: invitee.id,
      })
      await revokeInvite(owner.id, invite.id)

      // Redeeming the code should now fail
      await expect(redeemInviteCode(invitee.id, invite.code)).rejects.toMatchObject({ status: 404 })
    })

    it('non-mod cannot revoke', async () => {
      const member = await createTestUser()
      await insertTestCommunityMember({ communityId: community.id, userId: member.id })
      const invitee = await createTestUser()
      const invite = await insertTestCommunityInvite({
        communityId: community.id,
        invitedById: owner.id,
        invitedUserId: invitee.id,
      })
      await expect(revokeInvite(member.id, invite.id)).rejects.toMatchObject({ status: 403 })
    })

    it('rejects archived communities', async () => {
      const archivedCommunity = await insertTestCommunity({ createdById: owner.id })
      await insertTestCommunityMember({
        communityId: archivedCommunity.id,
        userId: owner.id,
        role: 'owner',
      })
      const invitee = await createTestUser()
      const invite = await insertTestCommunityInvite({
        communityId: archivedCommunity.id,
        invitedById: owner.id,
        invitedUserId: invitee.id,
      })
      await archiveCommunity(archivedCommunity.id, null)

      await expect(revokeInvite(owner.id, invite.id)).rejects.toMatchObject({ status: 403 })
    }, 60_000)
  })
})
