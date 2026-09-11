import { it, expect, beforeAll, describe } from 'vitest'

import {
  createTestUser,
  createTestUserDirect,
  insertTestCommunity,
  insertTestCommunityMember,
  readAllQueueJobs,
} from '@voucha/test-helpers'

import { joinCommunity } from '../join.mts'

import { archiveCommunity } from '../../archive.mts'

import { leaveCommunity } from '../leave.mts'

import { updateMemberRole } from '../update-role.mts'

import { removeMember } from '../remove.mts'

import { getCommunityMember, searchCommunityMembers } from '../get.mts'

import { decodeCursor, encodeCursor, isNameCursor } from '@modules/pagination'

import { emails } from '@queues/emails/queues'

import { getSiteUrl } from '@modules/utils'

import type { PrivateUser } from '@services/users/types'

import type { Community } from '../../types.mts'
import { listNotifications } from '@services/notifications/list'

describe('index', () => {
  let owner: PrivateUser

  let publicCommunity: Community

  let privateCommunity: Community

  beforeAll(async () => {
    owner = await createTestUser()
    ;[publicCommunity, privateCommunity] = await Promise.all([
      insertTestCommunity({ createdById: owner.id, visibility: 'public' }),
      insertTestCommunity({ createdById: owner.id, visibility: 'private' }),
    ])
    // Add owner as member in both
    await Promise.all([
      insertTestCommunityMember({
        communityId: publicCommunity.id,
        userId: owner.id,
        role: 'owner',
      }),
      insertTestCommunityMember({
        communityId: privateCommunity.id,
        userId: owner.id,
        role: 'owner',
      }),
    ])
  })

  describe('updateMemberRole', () => {
    it('owner can promote a member to moderator', async () => {
      const user = await createTestUser()
      await insertTestCommunityMember({
        communityId: publicCommunity.id,
        userId: user.id,
        role: 'member',
      })
      await updateMemberRole(owner.id, publicCommunity.id, user.id, 'moderator')
      const updated = await getCommunityMember(publicCommunity.id, user.id)
      expect(updated?.role).toBe('moderator')
      const response = await listNotifications(user.id)
      expect(Object.values(response.notifications)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            entity_type: 'community_role_change',
            body: 'Your community role changed from member to moderator.',
          }),
        ]),
      )
    })

    it('does not notify when assigning the existing role', async () => {
      const user = await createTestUser()
      await insertTestCommunityMember({
        communityId: publicCommunity.id,
        userId: user.id,
        role: 'moderator',
      })
      await updateMemberRole(owner.id, publicCommunity.id, user.id, 'moderator')
      expect(Object.values((await listNotifications(user.id)).notifications)).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ entity_type: 'community_role_change' })]),
      )
    })

    it('non-owner cannot change roles', async () => {
      const mod = await createTestUser()
      const member = await createTestUser()
      await insertTestCommunityMember({
        communityId: publicCommunity.id,
        userId: mod.id,
        role: 'moderator',
      })
      await insertTestCommunityMember({
        communityId: publicCommunity.id,
        userId: member.id,
        role: 'member',
      })
      await expect(
        updateMemberRole(mod.id, publicCommunity.id, member.id, 'moderator'),
      ).rejects.toMatchObject({ status: 403 })
    })

    it('rejects changing roles in an archived community', async () => {
      const target = await createTestUser()
      const archivedCommunity = await insertTestCommunity({
        createdById: owner.id,
        slug: `members-role-archived-${Date.now()}`,
      })
      await Promise.all([
        insertTestCommunityMember({
          communityId: archivedCommunity.id,
          userId: owner.id,
          role: 'owner',
        }),
        insertTestCommunityMember({
          communityId: archivedCommunity.id,
          userId: target.id,
          role: 'member',
        }),
      ])
      await archiveCommunity(archivedCommunity.id, owner.id)

      await expect(
        updateMemberRole(owner.id, archivedCommunity.id, target.id, 'moderator'),
      ).rejects.toMatchObject({ status: 403, message: 'Community is archived' })
    })

    it('owner cannot change their own role', async () => {
      await expect(
        updateMemberRole(owner.id, publicCommunity.id, owner.id, 'moderator'),
      ).rejects.toMatchObject({ status: 422 })
    })

    // Prompt-slot-deactivation side effect tests relocated to
    // @services/community-agent-prompts/deactivate-on-membership-change.test.mts — see that file's
    // header comment for why (avoids recreating the communities<->community-agent-prompts cycle).

    it('queues a role-change email with direction "promoted" when promoting a member with an email address', async () => {
      const user = await createTestUser()
      await insertTestCommunityMember({
        communityId: publicCommunity.id,
        userId: user.id,
        role: 'member',
      })
      await updateMemberRole(owner.id, publicCommunity.id, user.id, 'moderator')

      await expect
        .poll(async () => {
          const jobs = await readAllQueueJobs(emails)
          return jobs.some(job => {
            const data = job.data as {
              input?: { emailAddress?: string; userId?: string }
              variables?: {
                communityName?: string
                communityUrl?: string
                newRole?: string
                direction?: string
              }
            }
            return (
              job.name === 'processSendCommunityRoleChangeEmail' &&
              data.input?.userId === user.id &&
              data.input?.emailAddress === undefined &&
              data.variables?.communityName === publicCommunity.name &&
              data.variables?.communityUrl === getSiteUrl(`/communities/${publicCommunity.slug}`) &&
              data.variables?.newRole === 'moderator' &&
              data.variables?.direction === 'promoted'
            )
          })
        })
        .toBe(true)
    })

    it('queues a role-change email with direction "demoted" when demoting a moderator with an email address', async () => {
      const user = await createTestUser()
      await insertTestCommunityMember({
        communityId: publicCommunity.id,
        userId: user.id,
        role: 'moderator',
      })
      await updateMemberRole(owner.id, publicCommunity.id, user.id, 'member')

      expect(Object.values((await listNotifications(user.id)).notifications)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            entity_type: 'community_role_change',
            body: 'Your community role changed from moderator to member.',
          }),
        ]),
      )

      await expect
        .poll(async () => {
          const jobs = await readAllQueueJobs(emails)
          return jobs.some(job => {
            const data = job.data as {
              input?: { emailAddress?: string; userId?: string }
              variables?: { newRole?: string; direction?: string }
            }
            return (
              job.name === 'processSendCommunityRoleChangeEmail' &&
              data.input?.userId === user.id &&
              data.input?.emailAddress === undefined &&
              data.variables?.newRole === 'member' &&
              data.variables?.direction === 'demoted'
            )
          })
        })
        .toBe(true)
    })

    it('queues a user-targeted role-change email when the target user has no email address', async () => {
      const user = await createTestUserDirect()
      await insertTestCommunityMember({
        communityId: publicCommunity.id,
        userId: user.id,
        role: 'member',
      })
      await updateMemberRole(owner.id, publicCommunity.id, user.id, 'moderator')

      await expect
        .poll(async () => {
          const jobs = await readAllQueueJobs(emails)
          return jobs.some(job => {
            const data = job.data as { input?: { emailAddress?: string; userId?: string } }
            return (
              job.name === 'processSendCommunityRoleChangeEmail' &&
              data.input?.userId === user.id &&
              data.input?.emailAddress === undefined
            )
          })
        })
        .toBe(true)
    })
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof joinCommunity)
  void (0 as unknown as typeof archiveCommunity)
  void (0 as unknown as typeof leaveCommunity)
  void (0 as unknown as typeof removeMember)
  void (0 as unknown as typeof searchCommunityMembers)
  // keep generated shard import bindings live for typecheck
  void (0 as unknown as typeof decodeCursor)
  void (0 as unknown as typeof encodeCursor)
  void (0 as unknown as typeof isNameCursor)
})
