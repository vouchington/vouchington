import { describe, it, expect } from 'vitest'
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
