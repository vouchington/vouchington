import { describe, it, expect, onTestFinished } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  createRandomString,
  createTestUserDirect,
  deleteTestBlueskyLinkedAccount,
  insertTestBlueskyLinkedAccount,
} from '@voucha/test-helpers'
import { getBlueskyLinkedAccountForUser } from '@services/bluesky-accounts'
import { deleteBlueskyFollowReceiptsForFolloweeFromOtherFollowersPage } from './followee-receipt-cleanup.mts'
import {
  getBlueskyFollowReceipt,
  listBlueskyFollowReceiptsForFollower,
  saveBlueskyFollowReceipt as saveScopedBlueskyFollowReceipt,
  START_OF_IDS,
} from './receipts.mts'
import { blueskyFollowsWorkConfig, getBlueskyFollowsWorkLimit } from './work-limits.mts'

async function saveBlueskyFollowReceipt(
  followerUserId: string,
  followeeUserId: string,
  recordUri: string,
) {
  const existingAccount = await getBlueskyLinkedAccountForUser(followerUserId)
  const account =
    existingAccount ?? (await insertTestBlueskyLinkedAccount({ userId: followerUserId }))
  return saveScopedBlueskyFollowReceipt(
    followerUserId,
    followeeUserId,
    account.bluesky_did,
    account.link_authorization_id,
    recordUri,
  )
}

function fakeRecordUri(): string {
  return `at://did:plc:${createRandomString(24)}/app.bsky.graph.follow/${createRandomString(13)}`
}

describe('bluesky followee receipt cleanup', () => {
  it('pages follower receipts and deletes only other followers of the target', async () => {
    const restoreInitialConfig = overrideDynamicConfigFieldsForTest(blueskyFollowsWorkConfig, {
      backfill_batch_size: 1,
      disconnect_batch_size: 1,
    })
    const batchSize = getBlueskyFollowsWorkLimit('disconnect_batch_size')
    const restoreChangedConfig = overrideDynamicConfigFieldsForTest(blueskyFollowsWorkConfig, {
      disconnect_batch_size: 2,
    })
    onTestFinished(() => {
      restoreChangedConfig()
      restoreInitialConfig()
    })
    const follower = await createTestUserDirect()
    const target = await createTestUserDirect()
    const other = await createTestUserDirect()
    const account = await insertTestBlueskyLinkedAccount({ userId: follower.id })
    await saveBlueskyFollowReceipt(follower.id, target.id, fakeRecordUri())
    await saveBlueskyFollowReceipt(follower.id, other.id, fakeRecordUri())
    await saveBlueskyFollowReceipt(target.id, target.id, fakeRecordUri())
    await saveBlueskyFollowReceipt(other.id, target.id, fakeRecordUri())

    const readPage = (cursor: string | null) =>
      listBlueskyFollowReceiptsForFollower(
        follower.id,
        account.bluesky_did,
        account.link_authorization_id,
        cursor,
        batchSize,
      )
    const first = await readPage(null)
    expect(first).toHaveLength(1)
    const second = await readPage(first[0]!.followee_user_id)
    expect(second).toHaveLength(1)
    expect([first[0]!.followee_user_id, second[0]!.followee_user_id].toSorted()).toEqual(
      [target.id, other.id].toSorted(),
    )

    const targetAccount = (await getBlueskyLinkedAccountForUser(target.id))!
    const targetGeneration = {
      blueskyDid: targetAccount.bluesky_did,
      linkAuthorizationId: targetAccount.link_authorization_id,
    }
    const firstPage = await deleteBlueskyFollowReceiptsForFolloweeFromOtherFollowersPage(
      target.id,
      targetGeneration,
      START_OF_IDS,
    )
    expect(firstPage.hasMore).toBe(true)
    const secondPage = await deleteBlueskyFollowReceiptsForFolloweeFromOtherFollowersPage(
      target.id,
      targetGeneration,
      firstPage.lastFollowerUserId!,
    )
    expect(secondPage.lastFollowerUserId).not.toBe(firstPage.lastFollowerUserId)
    expect(
      await deleteBlueskyFollowReceiptsForFolloweeFromOtherFollowersPage(
        target.id,
        targetGeneration,
        secondPage.lastFollowerUserId!,
      ),
    ).toEqual({ lastFollowerUserId: null, hasMore: false })
    expect(
      await getBlueskyFollowReceipt(
        follower.id,
        target.id,
        account.bluesky_did,
        account.link_authorization_id,
      ),
    ).toBeNull()
    expect(
      await getBlueskyFollowReceipt(
        follower.id,
        other.id,
        account.bluesky_did,
        account.link_authorization_id,
      ),
    ).not.toBeNull()
    expect(
      await getBlueskyFollowReceipt(
        target.id,
        target.id,
        targetAccount.bluesky_did,
        targetAccount.link_authorization_id,
      ),
    ).not.toBeNull()
    const otherAccount = await getBlueskyLinkedAccountForUser(other.id)
    expect(
      await getBlueskyFollowReceipt(
        other.id,
        target.id,
        otherAccount!.bluesky_did,
        otherAccount!.link_authorization_id,
      ),
    ).toBeNull()
  })

  it('keeps receipts saved for a relinked generation when a paused run resumes after revoke', async () => {
    const target = await createTestUserDirect()
    const follower = await createTestUserDirect()
    const stale = await insertTestBlueskyLinkedAccount({ userId: target.id })
    const staleGeneration = {
      blueskyDid: stale.bluesky_did,
      linkAuthorizationId: stale.link_authorization_id,
    }
    // The paused run already read the pending generation; another run then revokes it and the
    // user relinks before the pause ends.
    await deleteTestBlueskyLinkedAccount(stale.bluesky_did)
    const relinked = await insertTestBlueskyLinkedAccount({ userId: target.id })
    const saved = await insertTestBlueskyLinkedAccount({ userId: follower.id })
    await saveScopedBlueskyFollowReceipt(
      follower.id,
      target.id,
      saved.bluesky_did,
      saved.link_authorization_id,
      fakeRecordUri(),
    )

    expect(
      await deleteBlueskyFollowReceiptsForFolloweeFromOtherFollowersPage(
        target.id,
        staleGeneration,
        START_OF_IDS,
      ),
    ).toEqual({ lastFollowerUserId: null, hasMore: false })
    expect(
      await getBlueskyFollowReceipt(
        follower.id,
        target.id,
        saved.bluesky_did,
        saved.link_authorization_id,
      ),
    ).not.toBeNull()

    const current = await deleteBlueskyFollowReceiptsForFolloweeFromOtherFollowersPage(
      target.id,
      { blueskyDid: relinked.bluesky_did, linkAuthorizationId: relinked.link_authorization_id },
      START_OF_IDS,
    )
    expect(current.lastFollowerUserId).toBe(follower.id)
  })
})
