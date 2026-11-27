import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  getModeratorActionRowsForTest,
  getTestPrivateUserById,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import {
  countTestCommunityRestrictions,
  getTestCommunityRestriction,
} from '@voucha/test-helpers/entities/community-restrictions'
import { rejectPostgresWriteForTest } from '@voucha/test-helpers/injected-failures'
import { loadCommunityWithViewer } from '../load-with-viewer.mts'
import { activateCommunityRestrictions } from './activate.mts'
import { getActiveCommunityRestrictions } from './get.mts'
import { liftCommunityRestriction } from './lift.mts'

async function fixture() {
  const user = await createTestUser()
  const community = await insertTestCommunity({ createdById: user.id })
  await insertTestCommunityMember({ communityId: community.id, userId: user.id, role: 'owner' })
  return {
    currentUser: (await getTestPrivateUserById(user.id))!,
    community,
    loaded: await loadCommunityWithViewer(community.id, user.id),
  }
}

describe('community restriction transaction atomicity', () => {
  it('rolls back activation when recordModeratorAction fails and logs once on retry', async () => {
    const { currentUser, community, loaded } = await fixture()

    const restore = rejectPostgresWriteForTest(
      '/* recordModeratorAction',
      new Error('injected activate restriction modlog failure'),
      values => values.some(value => typeof value === 'string' && value.includes(community.id)),
    )
    await expect(
      activateCommunityRestrictions(currentUser, loaded, {
        restrictionTypes: ['no_links', 'require_post_approval'],
        expiresAt: null,
        reason: 'atomic activation',
      }).finally(restore),
    ).rejects.toThrow('injected activate restriction modlog failure')

    expect(await countTestCommunityRestrictions(community.id)).toBe(0)
    expect(await getActiveCommunityRestrictions(community.id, { readOnly: false })).toEqual([])
    expect(
      await getModeratorActionRowsForTest({
        actorId: currentUser.id,
        communityId: community.id,
      }),
    ).toHaveLength(0)

    const activated = await activateCommunityRestrictions(currentUser, loaded, {
      restrictionTypes: ['no_links', 'require_post_approval'],
      expiresAt: null,
      reason: 'atomic activation',
    })
    expect(activated).toHaveLength(2)
    expect(await countTestCommunityRestrictions(community.id)).toBe(2)
    const actionsAfterRetry = await getModeratorActionRowsForTest({
      actorId: currentUser.id,
      communityId: community.id,
    })
    expect(actionsAfterRetry).toHaveLength(1)
    expect(actionsAfterRetry[0]).toMatchObject({
      action_type: 'activate_restriction',
      community_id: community.id,
    })
  })

  it('rolls back restriction lift when recordModeratorAction fails and logs once on retry', async () => {
    const { currentUser, community, loaded } = await fixture()
    const [restriction] = await activateCommunityRestrictions(currentUser, loaded, {
      restrictionTypes: ['no_links'],
      expiresAt: null,
    })

    const restore = rejectPostgresWriteForTest(
      '/* recordModeratorAction',
      new Error('injected lift restriction modlog failure'),
      values =>
        values.some(
          value =>
            typeof value === 'string' &&
            value.includes(community.id) &&
            value.includes('lift_restriction'),
        ),
    )
    await expect(
      liftCommunityRestriction(currentUser, loaded, restriction!.id).finally(restore),
    ).rejects.toThrow('injected lift restriction modlog failure')

    expect((await getTestCommunityRestriction(restriction!.id)).lifted_at).toBeNull()
    expect(await getActiveCommunityRestrictions(community.id, { readOnly: false })).toMatchObject([
      { id: restriction!.id, restriction_type: 'no_links' },
    ])
    const actionsAfterFailure = await getModeratorActionRowsForTest({
      actorId: currentUser.id,
      communityId: community.id,
    })
    expect(
      actionsAfterFailure.filter(action => action.action_type === 'lift_restriction'),
    ).toHaveLength(0)

    await liftCommunityRestriction(currentUser, loaded, restriction!.id)

    expect((await getTestCommunityRestriction(restriction!.id)).lifted_at).not.toBeNull()
    expect(await getActiveCommunityRestrictions(community.id, { readOnly: false })).toEqual([])
    const actionsAfterRetry = await getModeratorActionRowsForTest({
      actorId: currentUser.id,
      communityId: community.id,
    })
    const liftRows = actionsAfterRetry.filter(action => action.action_type === 'lift_restriction')
    expect(liftRows).toHaveLength(1)
    expect(liftRows[0]).toMatchObject({
      action_type: 'lift_restriction',
      community_id: community.id,
    })
  })
})
