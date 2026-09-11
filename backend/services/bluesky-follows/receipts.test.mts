import { describe, it, expect } from 'vitest'
import {
  createRandomString,
  createTestUserDirect,
  insertTestBlueskyFollowReceipt,
  insertTestBlueskyLinkedAccount,
  softDeleteUser,
} from '@voucha/test-helpers'
import {
  deleteBlueskyFollowReceiptsForUser,
  getBlueskyFollowReceipt as getScopedBlueskyFollowReceipt,
  saveBlueskyFollowReceipt as saveScopedBlueskyFollowReceipt,
} from './receipts.mts'
import { getBlueskyLinkedAccountForUser } from '@services/bluesky-accounts'

async function getBlueskyFollowReceipt(followerUserId: string, followeeUserId: string) {
  const account = await getBlueskyLinkedAccountForUser(followerUserId)
  if (!account) return null
  return getScopedBlueskyFollowReceipt(
    followerUserId,
    followeeUserId,
    account.bluesky_did,
    account.link_authorization_id,
  )
}

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

describe('deleteBlueskyFollowReceiptsForUser', () => {
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

  it('deletes a receipt in which the user is the follower', async () => {
    const follower = await createTestUserDirect()
    const followee = await createTestUserDirect()
    await saveBlueskyFollowReceipt(follower.id, followee.id, fakeRecordUri())

    await deleteBlueskyFollowReceiptsForUser(follower.id)

    expect(await getBlueskyFollowReceipt(follower.id, followee.id)).toBeNull()
  })

  it('deletes a receipt in which the user is the followee', async () => {
    const follower = await createTestUserDirect()
    const followee = await createTestUserDirect()
    await saveBlueskyFollowReceipt(follower.id, followee.id, fakeRecordUri())

    await deleteBlueskyFollowReceiptsForUser(followee.id)

    expect(await getBlueskyFollowReceipt(follower.id, followee.id)).toBeNull()
  })

  it('does not touch receipts for other users', async () => {
    const follower = await createTestUserDirect()
    const followee = await createTestUserDirect()
    const bystander = await createTestUserDirect()
    const recordUri = fakeRecordUri()
    await saveBlueskyFollowReceipt(follower.id, followee.id, recordUri)

    await deleteBlueskyFollowReceiptsForUser(bystander.id)

    const receipt = await getBlueskyFollowReceipt(follower.id, followee.id)
    expect(receipt?.record_uri).toBe(recordUri)
  })

  it('is a no-op when the user has no receipts', async () => {
    const user = await createTestUserDirect()

    await expect(deleteBlueskyFollowReceiptsForUser(user.id)).resolves.toBeUndefined()
  })
})
