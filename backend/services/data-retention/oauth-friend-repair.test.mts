import { describe, expect, it } from 'vitest'
import {
  connectTestOAuthAccount,
  createTestUser,
  getTestFriend,
  insertTestOAuthAccount,
} from '@voucha/test-helpers'
import { getTestFriendSyncStartTime } from '@voucha/test-helpers/entities/oauth-friend-edge-locks'
import {
  completeTestGithubFriendInvalidations,
  getTestGithubFriendRepairMarker,
  insertTestGithubRepairEdge,
  makeTestGithubRepairEdgeIds,
  repairTestGithubFriendPages,
} from '@voucha/test-helpers/oauth-friend-repair'
import { connectOAuthAccountToUser } from '../oauth-accounts/connect.mts'

describe('OAuth friend edge repair', () => {
  it('erases late stale source and target observations, resolves a fresh edge, and leaves excluded rows', async () => {
    const [source, staleSource, friend, staleFriend, outsideFriend] = await Promise.all(
      Array.from({ length: 5 }, () => createTestUser()),
    )
    const suffix = crypto.randomUUID()
    const sourceId = `repair-source-${suffix}`
    const staleSourceId = `repair-stale-source-${suffix}`
    const targetId = `repair-target-${suffix}`
    const staleTargetId = `repair-stale-target-${suffix}`
    const outsideId = `repair-outside-${suffix}`
    const sourceAccount = await insertTestOAuthAccount('github', sourceId)
    const staleSourceAccount = await insertTestOAuthAccount('github', staleSourceId)
    const targetAccount = await insertTestOAuthAccount('github', targetId)
    const staleTargetAccount = await insertTestOAuthAccount('github', staleTargetId)
    await insertTestOAuthAccount('github', outsideId)
    if (
      !sourceAccount.account_id ||
      !staleSourceAccount.account_id ||
      !targetAccount.account_id ||
      !staleTargetAccount.account_id
    )
      throw new Error('Missing account id')
    await connectTestOAuthAccount('github', source!.id, sourceId)
    await connectTestOAuthAccount('github', staleSource!.id, staleSourceId)
    await connectOAuthAccountToUser('github', friend!.id, targetId)
    expect(await getTestGithubFriendRepairMarker(targetAccount.account_id)).toBeNull()
    await connectTestOAuthAccount('github', staleFriend!.id, staleTargetId)
    await connectTestOAuthAccount('github', outsideFriend!.id, outsideId)
    const observed = await getTestFriendSyncStartTime()
    await completeTestGithubFriendInvalidations(
      [staleSourceAccount.account_id, staleTargetAccount.account_id],
      observed,
    )
    const [start, staleSourceEdge, staleTargetEdge, validEdge, outsideEdge] =
      makeTestGithubRepairEdgeIds()
    await insertTestGithubRepairEdge(
      staleSourceEdge!,
      staleSourceAccount.account_id,
      targetId,
      observed,
    )
    await insertTestGithubRepairEdge(
      staleTargetEdge!,
      sourceAccount.account_id,
      staleTargetId,
      observed,
    )
    // This edge arrives after the target's connect-time resolver has cleared its marker.
    await insertTestGithubRepairEdge(validEdge!, sourceAccount.account_id, targetId, observed)
    await insertTestGithubRepairEdge(outsideEdge!, sourceAccount.account_id, outsideId, observed)
    const pages = await repairTestGithubFriendPages(start!, validEdge!)
    expect(pages.first).toMatchObject({ scanned: 1, deleted: 1, resolved: 0 })
    expect(pages.second).toMatchObject({ scanned: 1, deleted: 1, resolved: 0 })
    expect(pages.third).toMatchObject({ scanned: 1, deleted: 0, resolved: 1 })
    expect(await getTestFriend('github', staleSourceId, targetId)).toEqual([])
    expect(await getTestFriend('github', sourceId, staleTargetId)).toEqual([])
    expect((await getTestFriend('github', sourceId, targetId))[0]).toMatchObject({
      friend_github_account_id: targetAccount.account_id,
    })
    expect((await getTestFriend('github', sourceId, outsideId))[0]).toMatchObject({
      friend_github_account_id: null,
    })
  })
})
