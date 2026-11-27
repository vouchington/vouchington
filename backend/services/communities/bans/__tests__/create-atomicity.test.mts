import { beforeAll, describe, expect, it } from 'vitest'
import {
  createTestUser,
  getModeratorActionRowsForTest,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { rejectPostgresWriteForTest } from '@voucha/test-helpers/injected-failures'
import { findOpenCaseForEntity } from '@services/moderation-cases'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '../../types.mts'
import { getCommunityMember } from '../../members/get.mts'
import { banUserFromCommunity } from '../create.mts'
import { getActiveCommunityBan } from '../get.mts'

describe('banUserFromCommunity transaction atomicity', () => {
  let owner: PrivateUser
  let community: Community

  beforeAll(async () => {
    owner = await createTestUser()
    community = await insertTestCommunity({ createdById: owner.id, visibility: 'public' })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
  })

  it('rolls back ban and kick when recordModeratorAction fails inside the transaction', async () => {
    const member = await createTestUser()
    await insertTestCommunityMember({ communityId: community.id, userId: member.id })

    const restore = rejectPostgresWriteForTest(
      '/* recordModeratorAction',
      new Error('injected moderator action failure'),
      values => values.some(value => typeof value === 'string' && value.includes(member.id)),
    )
    await expect(
      banUserFromCommunity(owner, community.id, member.id, { reason: 'atomic modlog' }).finally(
        restore,
      ),
    ).rejects.toThrow('injected moderator action failure')

    expect(await getActiveCommunityBan(community.id, member.id)).toBeNull()
    expect(await getCommunityMember(community.id, member.id)).not.toBeNull()
    expect(await findOpenCaseForEntity({ entityType: 'user', entityId: member.id })).toBeNull()
    const actions = await getModeratorActionRowsForTest({
      actorId: owner.id,
      communityId: community.id,
    })
    expect(actions.filter(action => action.target_user_id === member.id)).toHaveLength(0)
  })

  it('rolls back ban, kick, and modlog when maybeResolveCase fails inside the transaction', async () => {
    const [admin, member] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
    await insertTestCommunityMember({ communityId: community.id, userId: member.id })

    const restore = rejectPostgresWriteForTest(
      '/* maybeResolveCases',
      new Error('injected case resolution failure'),
      values => values.some(value => value === admin.id),
    )
    await expect(
      banUserFromCommunity(admin, community.id, member.id, { reason: 'atomic case' }).finally(
        restore,
      ),
    ).rejects.toThrow('injected case resolution failure')

    expect(await getActiveCommunityBan(community.id, member.id)).toBeNull()
    expect(await getCommunityMember(community.id, member.id)).not.toBeNull()
    expect(await findOpenCaseForEntity({ entityType: 'user', entityId: member.id })).toBeNull()
    const actions = await getModeratorActionRowsForTest({
      actorId: admin.id,
      communityId: community.id,
    })
    expect(actions.filter(action => action.target_user_id === member.id)).toHaveLength(0)

    const ban = await banUserFromCommunity(admin, community.id, member.id, {
      reason: 'atomic case',
    })
    expect(ban.user_id).toBe(member.id)
    expect(await findOpenCaseForEntity({ entityType: 'user', entityId: member.id })).toBeNull()
    const recorded = await getModeratorActionRowsForTest({
      actorId: admin.id,
      communityId: community.id,
    })
    expect(recorded).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action_type: 'ban',
          target_user_id: member.id,
          community_id: community.id,
        }),
      ]),
    )
  })
})
