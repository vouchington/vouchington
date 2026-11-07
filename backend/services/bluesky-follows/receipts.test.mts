import { describe, it, expect, onTestFinished } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { blueskyFollowsWorkConfig } from './work-limits.mts'
import {
  createRandomString,
  createTestUserDirect,
  deleteTestBlueskyLinkedAccount,
  insertTestBlueskyFollowReceipt,
  insertTestBlueskyLinkedAccount,
  softDeleteUser,
} from '@voucha/test-helpers'
import {
  getBlueskyFollowReceipt,
  listBlueskyFollowReceiptsForFollower,
  deleteBlueskyFollowReceiptsForFolloweeFromOtherFollowersPage,
  saveBlueskyFollowReceipt as saveScopedBlueskyFollowReceipt,
} from './receipts.mts'
import { getBlueskyLinkedAccountForUser } from '@services/bluesky-accounts'

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

describe('bluesky follow receipt ownership', () => {
  it('pages follower receipts and deletes only other followers of the target', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(blueskyFollowsWorkConfig, { backfill_batch_size: 1 }),
    )
    const follower = await createTestUserDirect()
    const target = await createTestUserDirect()
    const other = await createTestUserDirect()
    const account = await insertTestBlueskyLinkedAccount({ userId: follower.id })
    await saveBlueskyFollowReceipt(follower.id, target.id, fakeRecordUri())
    await saveBlueskyFollowReceipt(follower.id, other.id, fakeRecordUri())
    await saveBlueskyFollowReceipt(target.id, target.id, fakeRecordUri())
    await saveBlueskyFollowReceipt(other.id, target.id, fakeRecordUri())

    const first = await listBlueskyFollowReceiptsForFollower(
      follower.id,
      account.bluesky_did,
      account.link_authorization_id,
      null,
    )
    expect(first).toHaveLength(1)
    const second = await listBlueskyFollowReceiptsForFollower(
      follower.id,
      account.bluesky_did,
      account.link_authorization_id,
      first[0]!.followee_user_id,
    )
    expect(second).toHaveLength(1)
    expect([first[0]!.followee_user_id, second[0]!.followee_user_id].toSorted()).toEqual(
      [target.id, other.id].toSorted(),
    )

    const firstPage = await deleteBlueskyFollowReceiptsForFolloweeFromOtherFollowersPage(
      target.id,
      null,
    )
    expect(firstPage.hasMore).toBe(true)
    const secondPage = await deleteBlueskyFollowReceiptsForFolloweeFromOtherFollowersPage(
      target.id,
      firstPage.lastFollowerUserId,
    )
    expect(secondPage.lastFollowerUserId).not.toBe(firstPage.lastFollowerUserId)
    expect(
      await deleteBlueskyFollowReceiptsForFolloweeFromOtherFollowersPage(
        target.id,
        secondPage.lastFollowerUserId,
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
    const targetAccount = await getBlueskyLinkedAccountForUser(target.id)
    expect(
      await getBlueskyFollowReceipt(
        target.id,
        target.id,
        targetAccount!.bluesky_did,
        targetAccount!.link_authorization_id,
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

  it('binds the receipt to the exact linked-account generation', async () => {
    const follower = await createTestUserDirect()
    const followee = await createTestUserDirect()
    const account = await insertTestBlueskyLinkedAccount({ userId: follower.id })
    const uri = fakeRecordUri()

    await expect(
      saveScopedBlueskyFollowReceipt(
        follower.id,
        followee.id,
        `did:plc:${createRandomString(24)}`,
        account.link_authorization_id,
        uri,
      ),
    ).rejects.toThrow('Exact Bluesky account generation is missing')

    await saveScopedBlueskyFollowReceipt(
      follower.id,
      followee.id,
      account.bluesky_did,
      account.link_authorization_id,
      uri,
    )
    await expect(
      getBlueskyFollowReceipt(
        follower.id,
        followee.id,
        account.bluesky_did,
        account.link_authorization_id,
      ),
    ).resolves.toMatchObject({ record_uri: uri, follower_bluesky_did: account.bluesky_did })

    await deleteTestBlueskyLinkedAccount(account.bluesky_did)
    await expect(
      getBlueskyFollowReceipt(
        follower.id,
        followee.id,
        account.bluesky_did,
        account.link_authorization_id,
      ),
    ).resolves.toBeNull()
  })

  it('rejects a late receipt for a deleted follower', async () => {
    const follower = await createTestUserDirect()
    const followee = await createTestUserDirect()
    const followerAccount = await insertTestBlueskyLinkedAccount({ userId: follower.id })
    await softDeleteUser(follower.id)

    await expect(
      saveScopedBlueskyFollowReceipt(
        follower.id,
        followee.id,
        followerAccount.bluesky_did,
        followerAccount.link_authorization_id,
        fakeRecordUri(),
      ),
    ).rejects.toThrow('cannot own new data after deletion')
  })

  it('rejects a late receipt for a deleted followee', async () => {
    const follower = await createTestUserDirect()
    const followee = await createTestUserDirect()
    await insertTestBlueskyLinkedAccount({ userId: follower.id })
    await softDeleteUser(followee.id)

    await expect(
      saveBlueskyFollowReceipt(follower.id, followee.id, fakeRecordUri()),
    ).rejects.toThrow('cannot own new data after deletion')
  })

  it('rejects a late receipt from a writer that bypasses the service fence', async () => {
    const follower = await createTestUserDirect()
    const followee = await createTestUserDirect()
    await insertTestBlueskyLinkedAccount({ userId: follower.id })
    await softDeleteUser(followee.id)

    await expect(insertTestBlueskyFollowReceipt(follower.id, followee.id)).rejects.toThrow(
      'cannot own new data after deletion',
    )
  })
})
