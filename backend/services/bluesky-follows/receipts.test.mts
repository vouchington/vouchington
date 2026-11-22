import { describe, it, expect } from 'vitest'
import {
  createRandomString,
  createTestUserDirect,
  deleteTestBlueskyLinkedAccount,
  getTestBlueskyFollowReceiptRecord,
  insertTestBlueskyLinkedAccount,
  requestTestBlueskyDisconnect,
  softDeleteUser,
} from '@voucha/test-helpers'
import {
  getBlueskyFollowReceipt,
  listBlueskyFollowReceiptsForFollower,
  deleteBlueskyFollowReceipts,
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
  it.each(['follower', 'followee'] as const)(
    'hides a receipt immediately after the %s is deleted',
    async deleted => {
      const follower = await createTestUserDirect()
      const followee = await createTestUserDirect()
      const account = await insertTestBlueskyLinkedAccount({ userId: follower.id })
      const scope = [account.bluesky_did, account.link_authorization_id] as const
      await saveScopedBlueskyFollowReceipt(follower.id, followee.id, ...scope, fakeRecordUri())
      await softDeleteUser(deleted === 'follower' ? follower.id : followee.id)
      expect(await getBlueskyFollowReceipt(follower.id, followee.id, ...scope)).toBeNull()
      expect(await listBlueskyFollowReceiptsForFollower(follower.id, ...scope, null, 1)).toEqual([])
    },
  )

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
    ).rejects.toThrow('Exact Bluesky account generation is missing or user is inactive')
  })

  it('rejects a late receipt for a deleted followee', async () => {
    const follower = await createTestUserDirect()
    const followee = await createTestUserDirect()
    await insertTestBlueskyLinkedAccount({ userId: follower.id })
    await softDeleteUser(followee.id)

    await expect(
      saveBlueskyFollowReceipt(follower.id, followee.id, fakeRecordUri()),
    ).rejects.toThrow('Exact Bluesky account generation is missing or user is inactive')
  })

  it('hides and rejects receipts while the follower account is disconnecting', async () => {
    const follower = await createTestUserDirect()
    const followee = await createTestUserDirect()
    const account = await insertTestBlueskyLinkedAccount({ userId: follower.id })
    const uri = fakeRecordUri()
    await saveScopedBlueskyFollowReceipt(
      follower.id,
      followee.id,
      account.bluesky_did,
      account.link_authorization_id,
      uri,
    )
    await requestTestBlueskyDisconnect(account.bluesky_did)

    await expect(
      getBlueskyFollowReceipt(
        follower.id,
        followee.id,
        account.bluesky_did,
        account.link_authorization_id,
      ),
    ).resolves.toBeNull()
    // Disconnect cleanup must retain access to this generation's pending receipts until revoke.
    await expect(
      listBlueskyFollowReceiptsForFollower(
        follower.id,
        account.bluesky_did,
        account.link_authorization_id,
        null,
        1,
      ),
    ).resolves.toHaveLength(1)
    await expect(
      saveScopedBlueskyFollowReceipt(
        follower.id,
        followee.id,
        account.bluesky_did,
        account.link_authorization_id,
        fakeRecordUri(),
      ),
    ).rejects.toThrow('Exact Bluesky account generation is missing')
    await expect(getTestBlueskyFollowReceiptRecord(follower.id, followee.id)).resolves.toEqual({
      record_uri: uri,
      follower_account_link_authorization_id: account.link_authorization_id,
    })
  })

  it('keeps a replacement receipt when a stale remote-delete result names the old URI', async () => {
    const follower = await createTestUserDirect()
    const followee = await createTestUserDirect()
    const account = await insertTestBlueskyLinkedAccount({ userId: follower.id })
    const oldRecordUri = fakeRecordUri()
    const replacementRecordUri = fakeRecordUri()
    await saveScopedBlueskyFollowReceipt(
      follower.id,
      followee.id,
      account.bluesky_did,
      account.link_authorization_id,
      oldRecordUri,
    )
    await saveScopedBlueskyFollowReceipt(
      follower.id,
      followee.id,
      account.bluesky_did,
      account.link_authorization_id,
      replacementRecordUri,
    )

    await deleteBlueskyFollowReceipts(
      follower.id,
      [{ followeeUserId: followee.id, recordUri: oldRecordUri }],
      account.bluesky_did,
      account.link_authorization_id,
    )

    await expect(getTestBlueskyFollowReceiptRecord(follower.id, followee.id)).resolves.toEqual({
      record_uri: replacementRecordUri,
      follower_account_link_authorization_id: account.link_authorization_id,
    })
  })
})
