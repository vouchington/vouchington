import { describe, expect, it } from 'vitest'
import { beginTransaction } from '@data-stores/psql'
import { ValkeyCache } from '@data-stores/valkey/cache'
import { primaryCacheValkeyClient } from '@data-stores/valkey/clients'
import { createTestUser, insertTestCommunity } from '@voucha/test-helpers'
import { insertApprovedCommunityMember } from '../insert-approved.mts'
import { getMyCommunityMemberships } from '../list-mine.mts'

// Seed an owned cache key to make the invalidation assertion deterministic: read-through fills
// are intentionally asynchronous and cannot be assumed to finish when the reader returns.
const cache = new ValkeyCache({
  prefix: 'community-memberships-by-user',
  ttlSeconds: 60,
  client: primaryCacheValkeyClient,
})

describe('membership cache transaction settlement', () => {
  it('clears the cached self list after commit and leaves it unchanged on rollback', async () => {
    const user = await createTestUser()
    const owner = await createTestUser()
    const committed = await insertTestCommunity({ createdById: owner.id })
    const rolledBack = await insertTestCommunity({ createdById: owner.id })
    await cache.set(user.id, [])
    expect((await getMyCommunityMemberships(user.id)).results).toEqual([])

    await using first = await beginTransaction()
    await insertApprovedCommunityMember(committed.id, user.id, owner.id, { query: first })
    expect(
      (await getMyCommunityMemberships(user.id, {}, { query: first })).results.map(
        row => row.community_id,
      ),
    ).toContain(committed.id)
    expect((await getMyCommunityMemberships(user.id)).results).toEqual([])
    await first.commit()
    const afterCommit = await getMyCommunityMemberships(user.id)
    expect(afterCommit.results.map(row => row.community_id)).toEqual([committed.id])
    expect(afterCommit.results[0]!.created_at).toBeInstanceOf(Date)

    await cache.set(user.id, afterCommit.results)
    await using second = await beginTransaction()
    await insertApprovedCommunityMember(rolledBack.id, user.id, owner.id, { query: second })
    expect(
      (await getMyCommunityMemberships(user.id, {}, { query: second })).results.map(
        row => row.community_id,
      ),
    ).toContain(rolledBack.id)
    await second.rollback()
    expect((await getMyCommunityMemberships(user.id)).results.map(row => row.community_id)).toEqual(
      [committed.id],
    )
    await cache.delete(user.id)
  })
})
