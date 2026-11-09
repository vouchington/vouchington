import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { profileCountConfig } from '@services/users/profile-count-cap'
import { updateUserFields } from '@services/users/update-fields'
import { countUserMemberCommunities } from '../member-communities.mts'

describe('countUserMemberCommunities cap', () => {
  it('reports the cap and a capped flag when memberships exceed the cap', async () => {
    await profileCountConfig.waitForInitialization()
    onTestFinished(overrideDynamicConfigFieldsForTest(profileCountConfig, { count_cap: 1 }))
    const user = await createTestUser()
    await updateUserFields(user.id, { community_memberships_visibility: 'everyone' })
    const communities = await Promise.all([
      insertTestCommunity({ createdById: user.id, visibility: 'public' }),
      insertTestCommunity({ createdById: user.id, visibility: 'public' }),
    ])
    await Promise.all(
      communities.map(community =>
        insertTestCommunityMember({ communityId: community.id, userId: user.id, role: 'member' }),
      ),
    )

    expect(await countUserMemberCommunities(user.id, null)).toEqual({ count: 1, capped: true })
  })
})
