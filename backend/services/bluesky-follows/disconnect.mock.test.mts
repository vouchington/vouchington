import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  countTestBlueskyFollowReceiptsForUser,
  createRandomString,
  createTestUserDirect,
  getTestBlueskyLinkedAccountRow,
  insertTestBlueskyLinkedAccount,
  softDeleteUser,
  suspendTestUser,
} from '@voucha/test-helpers'
import type { NodeOAuthClient, OAuthSession } from '@modules/bluesky-oauth'

// Isolate the real @atproto/api boundary; disconnect only needs deleteFollow.
const deleteFollowMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
const AgentMock = vi.hoisted(() =>
  vi.fn<VitestLooseMock>().mockImplementation(
    class {
      deleteFollow = deleteFollowMock
    } as unknown as VitestLooseMock,
  ),
)
vi.mock<typeof import('@atproto/api')>(import('@atproto/api'), async importOriginal => ({
  ...(await importOriginal()),
  Agent: AgentMock as unknown as typeof import('@atproto/api').Agent,
}))

const revokeBlueskySessionMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
// A real NodeOAuthClient rejects the local test origin; keep provider I/O at the SDK boundary.
const createBlueskyOAuthClientMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
const restoreBlueskySessionMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock<typeof import('@modules/bluesky-oauth')>(
  import('@modules/bluesky-oauth'),
  async importOriginal => ({
    ...(await importOriginal()),
    revokeBlueskySession: revokeBlueskySessionMock,
    createBlueskyOAuthClient: createBlueskyOAuthClientMock,
    restoreBlueskySession: restoreBlueskySessionMock,
  }),
)
createBlueskyOAuthClientMock.mockReturnValue({} as NodeOAuthClient)

import {
  disconnectAcceptedBlueskyAccountAndCleanupFollows,
  disconnectBlueskyAccountAndCleanupFollows as disconnectBlueskyAccountAndEnqueue,
} from './disconnect.mts'
import {
  getBlueskyFollowReceipt as getScopedBlueskyFollowReceipt,
  saveBlueskyFollowReceipt as saveScopedBlueskyFollowReceipt,
} from './receipts.mts'
import { getBlueskyLinkedAccountForUser } from '@services/bluesky-accounts'
import { BlueskySessionStore } from '../bluesky-accounts/session-store.mts'
import { requestBlueskyDisconnect } from './disconnect-request.mts'

async function disconnectBlueskyAccountAndCleanupFollows(userId: string): Promise<void> {
  return disconnectBlueskyAccountAndEnqueue(userId, {
    enqueueDisconnectRequested: async () => {
      throw new Error('queue unavailable')
    },
    reportError: () => undefined,
  })
}

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

function fakeDid(): string {
  return `did:plc:${createRandomString(24)}`
}

function fakeRecordUri(): string {
  return `at://did:plc:${createRandomString(24)}/app.bsky.graph.follow/${createRandomString(13)}`
}

async function seedLinkedAccount(userId: string): Promise<string> {
  const did = fakeDid()
  await insertTestBlueskyLinkedAccount({ userId, did })
  return did
}

describe('disconnectBlueskyAccountAndCleanupFollows', () => {
  beforeEach(() => {
    revokeBlueskySessionMock.mockReset()
    revokeBlueskySessionMock.mockImplementation(
      async (_client: NodeOAuthClient, did: string) => await new BlueskySessionStore().del(did),
    )
    deleteFollowMock.mockReset()
    deleteFollowMock.mockResolvedValue(undefined)
    restoreBlueskySessionMock.mockReset()
    restoreBlueskySessionMock.mockResolvedValue({} as OAuthSession)
  })

  it('clears receipts in both the follower and followee roles after disconnecting', async () => {
    const user = await createTestUserDirect()
    const otherA = await createTestUserDirect()
    const otherB = await createTestUserDirect()
    await seedLinkedAccount(user.id)
    const followerRoleUri = fakeRecordUri()
    await saveBlueskyFollowReceipt(user.id, otherA.id, followerRoleUri)
    await saveBlueskyFollowReceipt(otherB.id, user.id, fakeRecordUri())

    await disconnectBlueskyAccountAndCleanupFollows(user.id)

    // user is the follower in (user, otherA) — that record lives in user's own repo, so it must be
    // deleted on Bluesky before the local receipt is dropped. user is the followee in (otherB,
    // user) — that record lives in otherB's repo, so no remote call is made for it.
    expect(deleteFollowMock).toHaveBeenCalledTimes(1)
    expect(deleteFollowMock).toHaveBeenCalledWith(followerRoleUri)
    expect(revokeBlueskySessionMock).toHaveBeenCalledTimes(1)
    expect(await getBlueskyFollowReceipt(user.id, otherA.id)).toBeNull()
    expect(await getBlueskyFollowReceipt(otherB.id, user.id)).toBeNull()
  })

  it('drops the old generation receipt when remote cleanup fails, then relinks cleanly', async () => {
    const user = await createTestUserDirect()
    const otherA = await createTestUserDirect()
    const otherB = await createTestUserDirect()
    await seedLinkedAccount(user.id)
    const followerRoleUri = fakeRecordUri()
    await saveBlueskyFollowReceipt(user.id, otherA.id, followerRoleUri)
    await saveBlueskyFollowReceipt(otherB.id, user.id, fakeRecordUri())
    deleteFollowMock.mockRejectedValueOnce(new Error('bluesky unreachable'))

    await disconnectBlueskyAccountAndCleanupFollows(user.id)

    // Revoking the exact generation prevents a later credential from adopting the old URI.
    expect(await countTestBlueskyFollowReceiptsForUser(user.id)).toBe(0)
    // The receipt owned by another follower has no remote record this user can delete, so it is
    // cleared regardless.
    expect(await getBlueskyFollowReceipt(otherB.id, user.id)).toBeNull()
    expect(revokeBlueskySessionMock).toHaveBeenCalledTimes(1)

    const relinked = await insertTestBlueskyLinkedAccount({ userId: user.id, did: fakeDid() })
    expect(
      await getScopedBlueskyFollowReceipt(
        user.id,
        otherA.id,
        relinked.bluesky_did,
        relinked.link_authorization_id,
      ),
    ).toBeNull()
  })

  it('drops old generation receipts when the session cannot be restored', async () => {
    const user = await createTestUserDirect()
    const otherA = await createTestUserDirect()
    await seedLinkedAccount(user.id)
    const followerRoleUri = fakeRecordUri()
    await saveBlueskyFollowReceipt(user.id, otherA.id, followerRoleUri)
    restoreBlueskySessionMock.mockRejectedValueOnce(new Error('session invalid'))

    await disconnectBlueskyAccountAndCleanupFollows(user.id)

    expect(deleteFollowMock).not.toHaveBeenCalled()
    expect(await countTestBlueskyFollowReceiptsForUser(user.id)).toBe(0)
    expect(revokeBlueskySessionMock).toHaveBeenCalledTimes(1)
  })

  it('deletes followee receipts before an exact-generation revoke that fails', async () => {
    const user = await createTestUserDirect()
    const follower = await createTestUserDirect()
    const linked = await insertTestBlueskyLinkedAccount({ userId: user.id })
    await saveBlueskyFollowReceipt(follower.id, user.id, fakeRecordUri())
    revokeBlueskySessionMock.mockRejectedValueOnce(new Error('provider revoke failed'))

    const request = await requestBlueskyDisconnect(user.id)
    await expect(
      disconnectAcceptedBlueskyAccountAndCleanupFollows(user.id, request),
    ).rejects.toThrow(/provider revoke failed/)

    expect(await getBlueskyFollowReceipt(follower.id, user.id)).toBeNull()
    expect(await getTestBlueskyLinkedAccountRow(linked.bluesky_did)).not.toBeNull()
  })

  it('does not touch other users receipts', async () => {
    const user = await createTestUserDirect()
    const follower = await createTestUserDirect()
    const followee = await createTestUserDirect()
    await seedLinkedAccount(user.id)
    const recordUri = fakeRecordUri()
    await saveBlueskyFollowReceipt(follower.id, followee.id, recordUri)

    await disconnectBlueskyAccountAndCleanupFollows(user.id)

    const receipt = await getBlueskyFollowReceipt(follower.id, followee.id)
    expect(receipt?.record_uri).toBe(recordUri)
  })

  it('propagates the 404 and leaves receipts untouched when the user has no linked account', async () => {
    const user = await createTestUserDirect()

    await expect(disconnectBlueskyAccountAndCleanupFollows(user.id)).rejects.toThrow(
      /No Bluesky account linked/,
    )

    expect(revokeBlueskySessionMock).not.toHaveBeenCalled()
    expect(await countTestBlueskyFollowReceiptsForUser(user.id)).toBe(0)
  })

  it('does not let replay of an old generation unlink a newer relink', async () => {
    const user = await createTestUserDirect()
    await seedLinkedAccount(user.id)
    const linked = await getBlueskyLinkedAccountForUser(user.id)
    expect(linked).not.toBeNull()
    if (!linked) throw new Error('expected linked Bluesky account')
    const generation = {
      blueskyDid: linked.bluesky_did,
      linkAuthorizationId: linked.link_authorization_id,
    }

    const request = await requestBlueskyDisconnect(user.id)
    await disconnectAcceptedBlueskyAccountAndCleanupFollows(user.id, request)
    const relinked = await insertTestBlueskyLinkedAccount({ userId: user.id, did: fakeDid() })
    await disconnectAcceptedBlueskyAccountAndCleanupFollows(user.id, {
      ...generation,
    })

    expect(await getBlueskyLinkedAccountForUser(user.id)).toMatchObject({
      bluesky_did: relinked.bluesky_did,
      link_authorization_id: relinked.link_authorization_id,
    })
    expect(revokeBlueskySessionMock).toHaveBeenCalledOnce()
  })

  it('revokes a generation after durable disconnect intent hides it from active reads', async () => {
    const user = await createTestUserDirect()
    const linked = await insertTestBlueskyLinkedAccount({ userId: user.id })
    const request = await requestBlueskyDisconnect(user.id)

    expect(await getBlueskyLinkedAccountForUser(user.id)).toBeNull()
    await disconnectAcceptedBlueskyAccountAndCleanupFollows(user.id, request)

    expect(revokeBlueskySessionMock).toHaveBeenCalledOnce()
    expect(await getTestBlueskyLinkedAccountRow(linked.bluesky_did)).toBeNull()
  })

  it.each([
    ['suspended', suspendTestUser],
    ['deleted', softDeleteUser],
  ] as const)(
    'finishes an accepted disconnect after the user is %s',
    async (_state, mutateUser) => {
      const user = await createTestUserDirect()
      const linked = await insertTestBlueskyLinkedAccount({ userId: user.id })
      const request = await requestBlueskyDisconnect(user.id)
      await mutateUser(user.id)

      await disconnectAcceptedBlueskyAccountAndCleanupFollows(user.id, request)

      expect(revokeBlueskySessionMock).toHaveBeenCalledOnce()
      expect(await getTestBlueskyLinkedAccountRow(linked.bluesky_did)).toBeNull()
    },
  )

  it('ignores an exact-generation job without accepted disconnect intent', async () => {
    const user = await createTestUserDirect()
    const linked = await insertTestBlueskyLinkedAccount({ userId: user.id })

    await disconnectAcceptedBlueskyAccountAndCleanupFollows(user.id, {
      blueskyDid: linked.bluesky_did,
      linkAuthorizationId: linked.link_authorization_id,
    })

    expect(revokeBlueskySessionMock).not.toHaveBeenCalled()
    expect(await getTestBlueskyLinkedAccountRow(linked.bluesky_did)).not.toBeNull()
  })
})
