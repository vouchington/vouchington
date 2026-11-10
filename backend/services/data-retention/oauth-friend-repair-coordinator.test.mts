import { describe, expect, it } from 'vitest'
import {
  connectTestOAuthAccount,
  createTestUser,
  getTestFriend,
  insertTestOAuthAccount,
} from '@voucha/test-helpers'
import { getTestFriendSyncStartTime } from '@voucha/test-helpers/entities/oauth-friend-edge-locks'
import {
  insertTestGithubRepairEdge,
  makeTestGithubRepairEdgeIds,
  observeTestGithubFriendRepairCoordinator,
} from '@voucha/test-helpers/oauth-friend-repair'
import { beginTransaction } from '@data-stores/psql'
import {
  repairOAuthFriendEdges,
  repairOAuthFriendEdgesInTransaction,
} from './cleanup-oauth-friend-repair.mts'
import { requestOAuthFriendRepairSweep } from '../oauth-accounts/request-friend-repair-sweep.mts'

describe('OAuth friend repair coordinator', () => {
  it('advances owned pages and clears the finished cursor without touching an excluded edge', async () => {
    const [source, target, outside] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])
    const suffix = crypto.randomUUID()
    const sourceId = `repair-coordinator-source-${suffix}`
    const missingId = `repair-coordinator-missing-${suffix}`
    const targetId = `repair-coordinator-target-${suffix}`
    const outsideId = `repair-coordinator-outside-${suffix}`
    const sourceAccount = await insertTestOAuthAccount('github', sourceId)
    const targetAccount = await insertTestOAuthAccount('github', targetId)
    await insertTestOAuthAccount('github', outsideId)
    if (!sourceAccount.account_id || !targetAccount.account_id)
      throw new Error('Missing account id')
    await connectTestOAuthAccount('github', source.id, sourceId)
    await connectTestOAuthAccount('github', target.id, targetId)
    await connectTestOAuthAccount('github', outside.id, outsideId)
    const observed = await getTestFriendSyncStartTime()
    const [start, missing, resolvable, excluded] = makeTestGithubRepairEdgeIds()
    await insertTestGithubRepairEdge(missing!, sourceAccount.account_id, missingId, observed)
    await insertTestGithubRepairEdge(resolvable!, sourceAccount.account_id, targetId, observed)
    await insertTestGithubRepairEdge(excluded!, sourceAccount.account_id, outsideId, observed)

    const result = await observeTestGithubFriendRepairCoordinator(start!, resolvable!, [
      missing!,
      resolvable!,
      excluded!,
    ])
    expect(result.first).toEqual({ worked: true, deleted: 0, resolved: 0, hasMore: true })
    expect(result.firstCursor).toEqual({
      cursor_edge_id: missing,
      cursor_upper_edge_id: resolvable,
    })
    expect(result.second).toEqual({ worked: true, deleted: 0, resolved: 1, hasMore: true })
    expect(result.secondCursor).toEqual({
      cursor_edge_id: resolvable,
      cursor_upper_edge_id: resolvable,
    })
    expect(result.completed).toEqual({ worked: false, deleted: 0, resolved: 0, hasMore: false })
    expect(result.completedCursor).toBeNull()
    expect(result.edges).toEqual([
      { id: missing, friend_github_account_id: null },
      { id: resolvable, friend_github_account_id: targetAccount.account_id },
      { id: excluded, friend_github_account_id: null },
    ])
    expect((await getTestFriend('github', sourceId, targetId))[0]).toMatchObject({
      friend_github_account_id: null,
    })
  })

  it('rejects a non-positive page size', async () => {
    await expect(repairOAuthFriendEdges('github', 0)).rejects.toThrow(RangeError)
  })

  it('starts no sweep until one is requested and ends it when the sweep completes', async () => {
    await using query = await beginTransaction()
    const countCursors = async () =>
      (
        await query<{ count: number }>(
          `/* countTestRepairCursors */ SELECT count(*)::int AS count
           FROM oauth_friend_reference_repair_cursors WHERE provider = 'github'`,
        )
      ).rows[0]!.count
    await query(
      `/* clearTestRepairCursor */ DELETE FROM oauth_friend_reference_repair_cursors WHERE provider = 'github'`,
    )
    expect(await repairOAuthFriendEdgesInTransaction(query, 'github', 1)).toMatchObject({
      worked: false,
      hasMore: false,
    })
    expect(await countCursors()).toBe(0)
    await requestOAuthFriendRepairSweep(query, 'github')
    expect(await countCursors()).toBe(1)
    await query.rollback()
  })
})
