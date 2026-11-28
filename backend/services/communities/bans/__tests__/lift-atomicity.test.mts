import { beforeAll, describe, expect, it } from 'vitest'
import {
  createTestUser,
  getModeratorActionRowsForTest,
  insertTestCommunity,
  insertTestCommunityBan,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { rejectPostgresWriteForTest } from '@voucha/test-helpers/injected-failures'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '../../types.mts'
import { getActiveCommunityBan, getCommunityBanById } from '../get.mts'
import { liftAllCommunityBans, liftCommunityBan } from '../lift.mts'

describe('community ban lift transaction atomicity', () => {
  let owner: PrivateUser
  let community: Community

  beforeAll(async () => {
    owner = await createTestUser()
    community = await insertTestCommunity({ createdById: owner.id, visibility: 'public' })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
  })

  it('rolls back single ban lift when recordModeratorAction fails and logs once on retry', async () => {
    const member = await createTestUser()
    const ban = await insertTestCommunityBan({
      communityId: community.id,
      userId: member.id,
      bannedById: owner.id,
    })

    const restore = rejectPostgresWriteForTest(
      '/* recordModeratorAction',
      new Error('injected lift ban modlog failure'),
      values => values.some(value => typeof value === 'string' && value.includes(member.id)),
    )
    await expect(liftCommunityBan(owner, community.id, ban.id).finally(restore)).rejects.toThrow(
      'injected lift ban modlog failure',
    )

    expect((await getCommunityBanById(ban.id))?.lifted_at).toBeNull()
    expect((await getActiveCommunityBan(community.id, member.id))?.id).toBe(ban.id)
    const actionsAfterFailure = await getModeratorActionRowsForTest({
      actorId: owner.id,
      communityId: community.id,
    })
    expect(
      actionsAfterFailure.filter(
        action => action.action_type === 'lift_ban' && action.target_user_id === member.id,
      ),
    ).toHaveLength(0)

    const lifted = await liftCommunityBan(owner, community.id, ban.id)
    expect(lifted).toEqual({
      community_id: community.id,
      user_id: member.id,
      lifted_ban_ids: [ban.id],
    })
    expect((await getCommunityBanById(ban.id))?.lifted_at).not.toBeNull()
    expect(await getActiveCommunityBan(community.id, member.id)).toBeNull()
    const actionsAfterRetry = await getModeratorActionRowsForTest({
      actorId: owner.id,
      communityId: community.id,
    })
    const liftRows = actionsAfterRetry.filter(
      action => action.action_type === 'lift_ban' && action.target_user_id === member.id,
    )
    expect(liftRows).toHaveLength(1)
    expect(liftRows[0]).toMatchObject({
      action_type: 'lift_ban',
      target_user_id: member.id,
      community_id: community.id,
    })
  })

  it('rolls back lift-all when recordModeratorAction fails and logs once on retry', async () => {
    const member = await createTestUser()
    const first = await insertTestCommunityBan({
      communityId: community.id,
      userId: member.id,
      bannedById: owner.id,
    })
    const second = await insertTestCommunityBan({
      communityId: community.id,
      userId: member.id,
      bannedById: owner.id,
    })

    const restore = rejectPostgresWriteForTest(
      '/* recordModeratorAction',
      new Error('injected lift-all modlog failure'),
      values => values.some(value => typeof value === 'string' && value.includes(member.id)),
    )
    await expect(
      liftAllCommunityBans(owner, community.id, member.id).finally(restore),
    ).rejects.toThrow('injected lift-all modlog failure')

    expect((await getCommunityBanById(first.id))?.lifted_at).toBeNull()
    expect((await getCommunityBanById(second.id))?.lifted_at).toBeNull()
    const actionsAfterFailure = await getModeratorActionRowsForTest({
      actorId: owner.id,
      communityId: community.id,
    })
    expect(
      actionsAfterFailure.filter(
        action => action.action_type === 'lift_ban' && action.target_user_id === member.id,
      ),
    ).toHaveLength(0)

    const lifted = await liftAllCommunityBans(owner, community.id, member.id)
    expect(lifted.user_id).toBe(member.id)
    expect(lifted.lifted_ban_ids).toEqual([first.id, second.id].toSorted())
    expect(await getActiveCommunityBan(community.id, member.id)).toBeNull()
    const actionsAfterRetry = await getModeratorActionRowsForTest({
      actorId: owner.id,
      communityId: community.id,
    })
    const liftRows = actionsAfterRetry.filter(
      action => action.action_type === 'lift_ban' && action.target_user_id === member.id,
    )
    expect(liftRows).toHaveLength(1)
    expect(liftRows[0]).toMatchObject({
      action_type: 'lift_ban',
      target_user_id: member.id,
      community_id: community.id,
    })
  })
})
