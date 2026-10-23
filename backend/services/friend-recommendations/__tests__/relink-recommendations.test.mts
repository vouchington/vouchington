import { describe, expect, it } from 'vitest'
import {
  connectTestOAuthAccount,
  createTestUser,
  getTestFriend,
  getTestOAuthAccountFriendsSyncedAt,
  insertTestFriend,
  insertTestGithubFriend,
  insertTestOAuthAccount,
  testGithubFriendExists,
} from '@voucha/test-helpers'
import {
  getTestFriendSyncStartTime,
  holdTestOAuthAccountRow,
} from '@voucha/test-helpers/entities/oauth-friend-edge-locks'
import { connectOAuthAccountToUser } from '../../oauth-accounts/connect.mts'
import { resolveFriendReferencePage } from '../../oauth-accounts/resolve-friend-reference-page.mts'
import { disconnectOAuthAccount } from '../../my/oauth-account.mts'
import {
  finalizeGithubFriendSync,
  persistGithubFriendPage,
} from '../../oauth-github/friends-persistence.mts'
import { getFriendRecommendations } from '../get-recommendations.mts'

describe('friend recommendation relink boundary', () => {
  it('rejects a source sync fetched before unlink even after relinking the same user', async () => {
    const viewer = await createTestUser()
    const friend = await createTestUser()
    const viewerProviderId = `github-stale-source-${viewer.id}`
    const friendProviderId = `github-stale-source-friend-${friend.id}`
    const viewerAccount = await insertTestOAuthAccount('github', viewerProviderId)
    if (!viewerAccount.account_id) throw new Error('GitHub account id missing')
    await connectTestOAuthAccount('github', viewer.id, viewerProviderId)
    await insertTestOAuthAccount('github', friendProviderId)
    await connectTestOAuthAccount('github', friend.id, friendProviderId)

    const staleSyncStart = await getTestFriendSyncStartTime()
    await disconnectOAuthAccount(viewer.id, 'github')
    await connectOAuthAccountToUser('github', viewer.id, viewerProviderId)
    expect(
      await persistGithubFriendPage(
        viewerAccount.account_id,
        viewer.id,
        [friendProviderId],
        staleSyncStart,
      ),
    ).toBe(false)
    await finalizeGithubFriendSync(viewerAccount.account_id, viewer.id, staleSyncStart)
    expect(await getTestFriend('github', viewerProviderId, friendProviderId)).toEqual([])
    expect(await getTestOAuthAccountFriendsSyncedAt('github', viewerProviderId)).toBeNull()

    expect(
      await persistGithubFriendPage(
        viewerAccount.account_id,
        viewer.id,
        [friendProviderId],
        await getTestFriendSyncStartTime(),
      ),
    ).toBe(true)
    expect((await getFriendRecommendations(viewer)).results.map(row => row.id)).toContain(friend.id)
  })

  it('keeps a pre-unlink target observation unresolved after relink', async () => {
    const viewer = await createTestUser()
    const friend = await createTestUser()
    const viewerProviderId = `github-stale-target-${viewer.id}`
    const friendProviderId = `github-stale-target-friend-${friend.id}`
    const viewerAccount = await insertTestOAuthAccount('github', viewerProviderId)
    if (!viewerAccount.account_id) throw new Error('GitHub account id missing')
    await connectTestOAuthAccount('github', viewer.id, viewerProviderId)
    await insertTestOAuthAccount('github', friendProviderId)
    await connectTestOAuthAccount('github', friend.id, friendProviderId)

    const staleSyncStart = await getTestFriendSyncStartTime()
    await disconnectOAuthAccount(friend.id, 'github')
    expect(
      await persistGithubFriendPage(
        viewerAccount.account_id,
        viewer.id,
        [friendProviderId],
        staleSyncStart,
      ),
    ).toBe(true)
    expect((await getFriendRecommendations(viewer)).results.map(row => row.id)).not.toContain(
      friend.id,
    )

    const edge = (await getTestFriend('github', viewerProviderId, friendProviderId))[0] as {
      friend_github_account_id: string | null
    }
    expect(edge.friend_github_account_id).toBeNull()

    await connectOAuthAccountToUser('github', friend.id, friendProviderId)
    const stillHidden = (await getTestFriend('github', viewerProviderId, friendProviderId))[0] as {
      friend_github_account_id: string | null
    }
    expect(stillHidden.friend_github_account_id).toBeNull()
    expect((await getFriendRecommendations(viewer)).results.map(row => row.id)).not.toContain(
      friend.id,
    )

    await persistGithubFriendPage(
      viewerAccount.account_id,
      viewer.id,
      [friendProviderId],
      staleSyncStart,
    )
    const lateResolved = (await getTestFriend('github', viewerProviderId, friendProviderId))[0] as {
      friend_github_account_id: string | null
    }
    expect(lateResolved.friend_github_account_id).toBeTruthy()
    expect((await getFriendRecommendations(viewer)).results.map(row => row.id)).not.toContain(
      friend.id,
    )

    await persistGithubFriendPage(
      viewerAccount.account_id,
      viewer.id,
      [friendProviderId],
      await getTestFriendSyncStartTime(),
    )
    expect((await getFriendRecommendations(viewer)).results.map(row => row.id)).toContain(friend.id)
  })

  it('keeps old edges hidden until a fresh friend import', async () => {
    const viewer = await createTestUser()
    const friend = await createTestUser()
    const viewerProviderId = `github-relink-viewer-${viewer.id}`
    const friendProviderId = `github-relink-friend-${friend.id}`
    const viewerAccount = await insertTestOAuthAccount('github', viewerProviderId)
    if (!viewerAccount.account_id) throw new Error('GitHub account id missing')
    await connectTestOAuthAccount('github', viewer.id, viewerProviderId)
    const friendAccount = await insertTestOAuthAccount('github', friendProviderId)
    if (!friendAccount.account_id) throw new Error('Friend GitHub account id missing')
    await connectTestOAuthAccount('github', friend.id, friendProviderId)
    await insertTestFriend('github', viewerProviderId, friendProviderId)
    expect((await getFriendRecommendations(viewer)).results.map(row => row.id)).toContain(friend.id)

    await disconnectOAuthAccount(viewer.id, 'github')
    expect((await getFriendRecommendations(viewer)).results.map(row => row.id)).not.toContain(
      friend.id,
    )
    await persistGithubFriendPage(
      friendAccount.account_id,
      friend.id,
      [viewerProviderId],
      await getTestFriendSyncStartTime(),
    )
    expect((await getTestFriend('github', friendProviderId, viewerProviderId))[0]).toMatchObject({
      friend_github_account_id: null,
    })
    await connectOAuthAccountToUser('github', viewer.id, viewerProviderId)
    expect((await getFriendRecommendations(viewer)).results.map(row => row.id)).not.toContain(
      friend.id,
    )
    expect((await getTestFriend('github', friendProviderId, viewerProviderId))[0]).toMatchObject({
      friend_github_account_id: viewerAccount.account_id,
    })
    await persistGithubFriendPage(
      viewerAccount.account_id,
      viewer.id,
      [friendProviderId],
      await getTestFriendSyncStartTime(),
    )
    expect((await getFriendRecommendations(viewer)).results.map(row => row.id)).toContain(friend.id)
  })

  it('hides a reference resolved just before its target unlinks', async () => {
    const viewer = await createTestUser()
    const friend = await createTestUser()
    const viewerProviderId = `github-overlap-viewer-${viewer.id}`
    const friendProviderId = `github-overlap-friend-${friend.id}`
    const viewerAccount = await insertTestOAuthAccount('github', viewerProviderId)
    const friendAccount = await insertTestOAuthAccount('github', friendProviderId)
    if (!viewerAccount.account_id || !friendAccount.account_id) {
      throw new Error('GitHub account ids missing')
    }
    await connectTestOAuthAccount('github', viewer.id, viewerProviderId)
    await connectTestOAuthAccount('github', friend.id, friendProviderId)
    const edgeId = await insertTestGithubFriend(
      viewerAccount.account_id,
      friendProviderId,
      new Date(),
    )
    const holder = await holdTestOAuthAccountRow('github', friendAccount.account_id, 'UPDATE')
    let released = false
    try {
      const page = await resolveFriendReferencePage(
        holder.query,
        'github',
        friendAccount.account_id,
        friendProviderId,
        1,
        null,
      )
      expect(page).toEqual({ resolved: 1, hasMore: false })
      const pendingUnlink = disconnectOAuthAccount(friend.id, 'github')
      await holder.release()
      released = true
      await pendingUnlink
    } finally {
      if (!released) await holder.release()
    }
    expect((await getFriendRecommendations(viewer)).results.map(row => row.id)).not.toContain(
      friend.id,
    )
    expect(await testGithubFriendExists(edgeId)).toBe(true)
  })
})
