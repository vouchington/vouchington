import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createRandomString,
  createTestUserDirect,
  getTestBlueskyLinkedAccountRow,
  insertTestBlueskyLinkedAccount,
  insertTestLocalFollow,
  softDeleteUser,
  suspendTestUser,
  withFailingTransactionQueryOptionsForTest,
} from '@voucha/test-helpers'
import type { NodeOAuthClient, OAuthSession } from '@modules/bluesky-oauth'

// @atproto/api is the actual external boundary this test isolates — Agent.follow()/deleteFollow()
// would otherwise make real DPoP-signed XRPC calls to a Bluesky PDS. Everything else in this file
// (reconcile.mts, agent.mts, receipts.mts) runs for real against Postgres.
const followMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
const deleteFollowMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
// Agent is constructed with `new` in agent.mts, so the mock must itself be a class — vitest
// rejects mockReturnValue on a mock invoked via `new` (see vitest.dev/api/mock#class-support).
const AgentMock = vi.hoisted(() =>
  vi.fn<VitestLooseMock>().mockImplementation(
    class {
      follow = followMock
      deleteFollow = deleteFollowMock
    } as unknown as VitestLooseMock,
  ),
)
vi.mock<typeof import('@atproto/api')>(import('@atproto/api'), async importOriginal => ({
  ...(await importOriginal()),
  Agent: AgentMock as unknown as typeof import('@atproto/api').Agent,
}))

// createBlueskyOAuthClient constructs a real NodeOAuthClient requiring a real https origin (see
// bluesky-accounts' link.mock.test.mts for the same rationale) — mocked here rather than exercised
// for real. restoreBlueskySession is this test's stand-in for a rehydrated OAuth session; its own
// real implementation is exercised by @modules/bluesky-oauth's own tests.
const createBlueskyOAuthClientMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
const restoreBlueskySessionMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock<typeof import('@modules/bluesky-oauth')>(
  import('@modules/bluesky-oauth'),
  async importOriginal => ({
    ...(await importOriginal()),
    createBlueskyOAuthClient: createBlueskyOAuthClientMock,
    restoreBlueskySession: restoreBlueskySessionMock,
  }),
)
createBlueskyOAuthClientMock.mockReturnValue({} as NodeOAuthClient)

import { reconcileBlueskyFollow } from './reconcile.mts'
import {
  getBlueskyFollowReceipt as getScopedBlueskyFollowReceipt,
  saveBlueskyFollowReceipt as saveScopedBlueskyFollowReceipt,
} from './receipts.mts'
import {
  connectBlueskyAccountToUser,
  getBlueskyLinkedAccountForUser,
} from '@services/bluesky-accounts'

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
  const account = await getBlueskyLinkedAccountForUser(followerUserId)
  if (!account) throw new Error('Test follower has no Bluesky account')
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

async function linkBlueskyAccount(userId: string): Promise<string> {
  const did = fakeDid()
  await insertTestBlueskyLinkedAccount({ userId, did })
  return did
}

describe('reconcileBlueskyFollow', () => {
  beforeEach(() => {
    followMock.mockReset()
    deleteFollowMock.mockReset()
    restoreBlueskySessionMock.mockReset()
    restoreBlueskySessionMock.mockResolvedValue({} as OAuthSession)
  })

  it('no-ops when the follower has no linked Bluesky account', async () => {
    const follower = await createTestUserDirect()
    const followee = await createTestUserDirect()
    await linkBlueskyAccount(followee.id)
    await insertTestLocalFollow(follower.id, followee.id)

    await reconcileBlueskyFollow(follower.id, followee.id)

    expect(followMock).not.toHaveBeenCalled()
    expect(await getBlueskyFollowReceipt(follower.id, followee.id)).toBeNull()
  })

  it('no-ops when the followee has no linked Bluesky account', async () => {
    const follower = await createTestUserDirect()
    const followee = await createTestUserDirect()
    await linkBlueskyAccount(follower.id)
    await insertTestLocalFollow(follower.id, followee.id)

    await reconcileBlueskyFollow(follower.id, followee.id)

    expect(followMock).not.toHaveBeenCalled()
    expect(await getBlueskyFollowReceipt(follower.id, followee.id)).toBeNull()
  })

  it.each([
    ['deleted', softDeleteUser],
    ['suspended', suspendTestUser],
  ] as const)(
    'never restores a remote follow when the follower is %s',
    async (_state, deactivate) => {
      const follower = await createTestUserDirect()
      const followee = await createTestUserDirect()
      await linkBlueskyAccount(follower.id)
      await linkBlueskyAccount(followee.id)
      await insertTestLocalFollow(follower.id, followee.id)
      await deactivate(follower.id)

      await reconcileBlueskyFollow(follower.id, followee.id)

      expect(followMock).not.toHaveBeenCalled()
      expect(restoreBlueskySessionMock).not.toHaveBeenCalled()
    },
  )

  it('creates a follow record and saves the receipt when desired but no receipt exists', async () => {
    const follower = await createTestUserDirect()
    const followee = await createTestUserDirect()
    await linkBlueskyAccount(follower.id)
    const followeeDid = await linkBlueskyAccount(followee.id)
    await insertTestLocalFollow(follower.id, followee.id)
    const returnedUri = `at://did:plc:follower/app.bsky.graph.follow/${createRandomString(13)}`
    followMock.mockResolvedValueOnce({ uri: returnedUri, cid: 'bafycid' })

    await reconcileBlueskyFollow(follower.id, followee.id)

    expect(followMock).toHaveBeenCalledWith(followeeDid)
    const receipt = await getBlueskyFollowReceipt(follower.id, followee.id)
    expect(receipt?.record_uri).toBe(returnedUri)
    expect(deleteFollowMock).not.toHaveBeenCalled()
  })

  it('deletes the follow record and the receipt when not desired but a receipt exists', async () => {
    const follower = await createTestUserDirect()
    const followee = await createTestUserDirect()
    await linkBlueskyAccount(follower.id)
    await linkBlueskyAccount(followee.id)
    const existingUri = `at://did:plc:follower/app.bsky.graph.follow/${createRandomString(13)}`
    await saveBlueskyFollowReceipt(follower.id, followee.id, existingUri)

    await reconcileBlueskyFollow(follower.id, followee.id)

    expect(deleteFollowMock).toHaveBeenCalledWith(existingUri)
    expect(await getBlueskyFollowReceipt(follower.id, followee.id)).toBeNull()
    expect(followMock).not.toHaveBeenCalled()
  })

  it('no-ops when desired state and the receipt already agree', async () => {
    const follower = await createTestUserDirect()
    const followee = await createTestUserDirect()
    await linkBlueskyAccount(follower.id)
    await linkBlueskyAccount(followee.id)

    // Neither a follow relation nor a receipt exists — already in sync at "not following".
    await reconcileBlueskyFollow(follower.id, followee.id)

    expect(followMock).not.toHaveBeenCalled()
    expect(deleteFollowMock).not.toHaveBeenCalled()
  })

  it('is idempotent: calling twice while already synced only calls Bluesky once', async () => {
    const follower = await createTestUserDirect()
    const followee = await createTestUserDirect()
    await linkBlueskyAccount(follower.id)
    const followeeDid = await linkBlueskyAccount(followee.id)
    await insertTestLocalFollow(follower.id, followee.id)
    const returnedUri = `at://did:plc:follower/app.bsky.graph.follow/${createRandomString(13)}`
    followMock.mockResolvedValueOnce({ uri: returnedUri, cid: 'bafycid' })

    await reconcileBlueskyFollow(follower.id, followee.id)
    await reconcileBlueskyFollow(follower.id, followee.id)

    expect(followMock).toHaveBeenCalledTimes(1)
    expect(followMock).toHaveBeenCalledWith(followeeDid)
  })

  it('compensates by deleting the just-created follow record when saving the receipt fails', async () => {
    const follower = await createTestUserDirect()
    const followee = await createTestUserDirect()
    await linkBlueskyAccount(follower.id)
    const followeeDid = await linkBlueskyAccount(followee.id)
    await insertTestLocalFollow(follower.id, followee.id)
    const returnedUri = `at://did:plc:follower/app.bsky.graph.follow/${createRandomString(13)}`
    followMock.mockResolvedValueOnce({ uri: returnedUri, cid: 'bafycid' })
    deleteFollowMock.mockResolvedValueOnce(undefined)

    await expect(
      withFailingTransactionQueryOptionsForTest('saveBlueskyFollowReceipt', queryOptions =>
        reconcileBlueskyFollow(follower.id, followee.id, queryOptions),
      ),
    ).rejects.toThrow('Injected query failure for saveBlueskyFollowReceipt')

    expect(followMock).toHaveBeenCalledWith(followeeDid)
    expect(deleteFollowMock).toHaveBeenCalledWith(returnedUri)
    // The receipt write never landed (the transaction rolled back), so a follow-up reconcile
    // should see `desired && !receipt` again rather than a phantom receipt for a record that was
    // just undone on Bluesky.
    expect(await getBlueskyFollowReceipt(follower.id, followee.id)).toBeNull()
  })

  it('still rethrows the original save error when the compensating unfollow also fails', async () => {
    const follower = await createTestUserDirect()
    const followee = await createTestUserDirect()
    await linkBlueskyAccount(follower.id)
    await linkBlueskyAccount(followee.id)
    await insertTestLocalFollow(follower.id, followee.id)
    const returnedUri = `at://did:plc:follower/app.bsky.graph.follow/${createRandomString(13)}`
    followMock.mockResolvedValueOnce({ uri: returnedUri, cid: 'bafycid' })
    deleteFollowMock.mockRejectedValueOnce(new Error('bluesky unreachable'))

    await expect(
      withFailingTransactionQueryOptionsForTest('saveBlueskyFollowReceipt', queryOptions =>
        reconcileBlueskyFollow(follower.id, followee.id, queryOptions),
      ),
    ).rejects.toThrow('Injected query failure for saveBlueskyFollowReceipt')

    expect(deleteFollowMock).toHaveBeenCalledWith(returnedUri)
  })

  // bluesky_did is the permanent AT Protocol identifier; handle is mutable cached display data
  // (see the bluesky_linked_accounts migration). Reconciliation must keep targeting the followee
  // by DID even after their handle has gone stale relative to what's live on Bluesky.
  it('targets the followee by bluesky_did even after their linked handle has changed', async () => {
    const follower = await createTestUserDirect()
    const followee = await createTestUserDirect()
    await linkBlueskyAccount(follower.id)
    const followeeDid = await linkBlueskyAccount(followee.id)
    // Simulate the followee's Bluesky handle changing after the initial link — handle is never
    // re-fetched by the app, so a stale row looks exactly like this: same DID, new handle written
    // via the same connectBlueskyAccountToUser path a re-link would use (see connect.test.mts's
    // "is idempotent for the same user re-linking the same DID" for that same-DID-new-handle shape).
    const linked = await getTestBlueskyLinkedAccountRow(followeeDid)
    await connectBlueskyAccountToUser(
      followee.id,
      followeeDid,
      `renamed-${createRandomString(6)}.bsky.social`,
      { linkAuthorizationId: linked!.link_authorization_id },
    )
    await insertTestLocalFollow(follower.id, followee.id)
    const returnedUri = `at://did:plc:follower/app.bsky.graph.follow/${createRandomString(13)}`
    followMock.mockResolvedValueOnce({ uri: returnedUri, cid: 'bafycid' })

    await reconcileBlueskyFollow(follower.id, followee.id)

    expect(followMock).toHaveBeenCalledWith(followeeDid)
    const receipt = await getBlueskyFollowReceipt(follower.id, followee.id)
    expect(receipt?.record_uri).toBe(returnedUri)
  })
})
