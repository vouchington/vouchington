import { describe, expect, it, vi } from 'vitest'
import {
  beginTransaction,
  createTestUserDirect,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { invalidate } from '@services/entity-cache/invalidate'
import { cleanupUserOwnedCommunities } from '../cleanup-user-communities.mts'

describe('community purge cache invalidation', () => {
  it('invalidates archived and transferred communities together only after commit', async () => {
    const owner = await createTestUserDirect()
    const successor = await createTestUserDirect()
    const [archived, transferred] = await Promise.all([
      insertTestCommunity({ createdById: owner.id }),
      insertTestCommunity({ createdById: owner.id }),
    ])
    for (const community of [archived, transferred]) {
      await insertTestCommunityMember({
        communityId: community.id,
        userId: owner.id,
        role: 'owner',
      })
    }
    await insertTestCommunityMember({
      communityId: transferred.id,
      userId: successor.id,
      role: 'moderator',
    })
    const communities = vi.spyOn(invalidate, 'communities').mockResolvedValue()
    const userMetrics = vi.spyOn(invalidate, 'user_metrics').mockResolvedValue()
    try {
      await using query = await beginTransaction()
      const page = await cleanupUserOwnedCommunities(query, owner.id, 2)
      expect(communities).not.toHaveBeenCalled()
      await query.commit()
      expect(communities).not.toHaveBeenCalled()

      await Promise.all(page.afterCommit.map(effect => effect()))

      expect(communities).toHaveBeenCalledTimes(1)
      expect([...communities.mock.calls[0]!].toSorted()).toEqual(
        [archived.id, transferred.id].toSorted(),
      )
      expect(userMetrics).toHaveBeenCalledExactlyOnceWith(successor.id)
    } finally {
      communities.mockRestore()
      userMetrics.mockRestore()
    }
  })
})
