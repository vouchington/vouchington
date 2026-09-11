import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createRandomString,
  createTestUserDirect,
  getTestBlueskyLinkedAccountRow,
  insertTestBlueskyLinkedAccount,
} from '@voucha/test-helpers'
import type { NodeOAuthClient, OAuthSession } from '@modules/bluesky-oauth'

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

import { BlueskySessionStore } from '../bluesky-accounts/session-store.mts'
import { disconnectBlueskyAccountAndCleanupFollows as disconnectBlueskyAccountAndEnqueue } from './disconnect.mts'
import { getBlueskyFollowReceipt, saveBlueskyFollowReceipt } from './receipts.mts'

async function disconnectBlueskyAccountAndCleanupFollows(userId: string): Promise<void> {
  return disconnectBlueskyAccountAndEnqueue(userId, {
    enqueueDisconnectRequested: async () => {
      throw new Error('queue unavailable')
    },
    reportError: () => undefined,
  })
}

describe('Bluesky self-follow disconnect cleanup', () => {
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

  it('deletes the remote URI before removing the self-follow receipt', async () => {
    const fixture = await createSelfFollowFixture()
    let receiptObservedDuringRemoteDelete: Awaited<ReturnType<typeof getFixtureReceipt>> | undefined
    deleteFollowMock.mockImplementationOnce(async () => {
      receiptObservedDuringRemoteDelete = await getFixtureReceipt(fixture)
    })

    await disconnectBlueskyAccountAndCleanupFollows(fixture.userId)

    expect(receiptObservedDuringRemoteDelete).toMatchObject({ record_uri: fixture.recordUri })
    expect(deleteFollowMock).toHaveBeenCalledWith(fixture.recordUri)
    expect(await getFixtureReceipt(fixture)).toBeNull()
    expect(revokeBlueskySessionMock).toHaveBeenCalledOnce()
  })

  it('does not repeat a successful remote delete when only revoke must retry', async () => {
    const fixture = await createSelfFollowFixture()
    revokeBlueskySessionMock.mockRejectedValueOnce(new Error('provider revoke failed'))

    await expect(disconnectBlueskyAccountAndCleanupFollows(fixture.userId)).rejects.toThrow(
      /provider revoke failed/,
    )

    expect(deleteFollowMock).toHaveBeenCalledOnce()
    expect(await getFixtureReceipt(fixture)).toBeNull()
    expect(await getTestBlueskyLinkedAccountRow(fixture.did)).not.toBeNull()

    await disconnectBlueskyAccountAndCleanupFollows(fixture.userId)

    expect(deleteFollowMock).toHaveBeenCalledOnce()
    expect(await getTestBlueskyLinkedAccountRow(fixture.did)).toBeNull()
  })

  it('retries the same URI after remote delete and revoke both fail', async () => {
    const fixture = await createSelfFollowFixture()
    deleteFollowMock.mockRejectedValueOnce(new Error('remote delete failed'))
    revokeBlueskySessionMock.mockRejectedValueOnce(new Error('provider revoke failed'))

    await expect(disconnectBlueskyAccountAndCleanupFollows(fixture.userId)).rejects.toThrow(
      /provider revoke failed/,
    )

    expect(await getTestBlueskyLinkedAccountRow(fixture.did)).not.toBeNull()
    expect(await getFixtureReceipt(fixture)).toMatchObject({ record_uri: fixture.recordUri })

    await disconnectBlueskyAccountAndCleanupFollows(fixture.userId)

    expect(deleteFollowMock).toHaveBeenNthCalledWith(1, fixture.recordUri)
    expect(deleteFollowMock).toHaveBeenNthCalledWith(2, fixture.recordUri)
    expect(await getTestBlueskyLinkedAccountRow(fixture.did)).toBeNull()
    expect(await getFixtureReceipt(fixture)).toBeNull()
  })
})

type SelfFollowFixture = {
  authorizationId: string
  did: string
  recordUri: string
  userId: string
}

async function createSelfFollowFixture(): Promise<SelfFollowFixture> {
  const user = await createTestUserDirect()
  const linked = await insertTestBlueskyLinkedAccount({ userId: user.id })
  const recordUri = `at://${linked.bluesky_did}/app.bsky.graph.follow/${createRandomString(13)}`
  await saveBlueskyFollowReceipt(
    user.id,
    user.id,
    linked.bluesky_did,
    linked.link_authorization_id,
    recordUri,
  )
  return {
    authorizationId: linked.link_authorization_id,
    did: linked.bluesky_did,
    recordUri,
    userId: user.id,
  }
}

function getFixtureReceipt(fixture: SelfFollowFixture) {
  return getBlueskyFollowReceipt(
    fixture.userId,
    fixture.userId,
    fixture.did,
    fixture.authorizationId,
  )
}
