import {
  beginTransaction,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import { getCommunityMemberBatch } from './batch.mts'

describe('getCommunityMemberBatch', () => {
  it('returns the same complete membership through the default and supplied executors', async () => {
    const owner = await createTestUser()
    const member = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id, visibility: 'private' })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: member.id,
      role: 'member',
    })

    const direct = await getCommunityMemberBatch(member.id, [community.id])
    await using query = await beginTransaction()
    const transactional = await getCommunityMemberBatch(member.id, [community.id], { query })
    expect(transactional).toEqual(direct)
    expect(transactional[community.id]).toMatchObject({
      community_id: community.id,
      user_id: member.id,
      role: 'member',
    })
    await query.commit()
  })
})
