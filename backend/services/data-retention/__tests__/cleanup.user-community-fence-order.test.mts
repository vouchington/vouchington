import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestUserDirect,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { getTestPurgeCommunity } from '@voucha/test-helpers/user-purge-communities'
import { getCommunityMember } from '../../communities/members/get.mts'
import { cleanupUserOwnedCommunities } from '../cleanup-user-communities.mts'

describe('community ownership cleanup page', () => {
  it('transfers each community to its own successor and archives the community without one', async () => {
    const owner = await createTestUserDirect()
    const successors = (
      await Promise.all([createTestUserDirect(), createTestUserDirect()])
    ).toSorted((left, right) => left.id.localeCompare(right.id))
    const communities = (
      await Promise.all([1, 2, 3].map(() => insertTestCommunity({ createdById: owner.id })))
    ).toSorted((left, right) => left.id.localeCompare(right.id))
    for (const community of communities) {
      await insertTestCommunityMember({
        communityId: community.id,
        userId: owner.id,
        role: 'owner',
      })
    }
    await insertTestCommunityMember({
      communityId: communities[0]!.id,
      userId: successors[1]!.id,
      role: 'moderator',
    })
    await insertTestCommunityMember({
      communityId: communities[1]!.id,
      userId: successors[0]!.id,
      role: 'moderator',
    })

    await using transaction = await beginTransaction()
    const page = await cleanupUserOwnedCommunities(transaction, owner.id, 3)
    await transaction.commit()

    expect(page.processed).toBe(3)
    await expect(getCommunityMember(communities[0]!.id, successors[1]!.id)).resolves.toMatchObject({
      role: 'owner',
    })
    await expect(getCommunityMember(communities[1]!.id, successors[0]!.id)).resolves.toMatchObject({
      role: 'owner',
    })
    await expect(getTestPurgeCommunity(communities[2]!.id)).resolves.toMatchObject({
      archived_at: expect.any(Date),
    })
  })
})
