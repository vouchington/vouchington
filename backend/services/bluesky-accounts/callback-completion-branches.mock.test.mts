import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createRandomString,
  createTestUserDirect,
  ensureTestBlueskyLinkAuthorization,
  getTestBlueskyLinkAuthorizationRow,
  getTestBlueskyLinkedAccountRow,
  insertTestBlueskyLinkedAccount,
} from '@voucha/test-helpers'
import type { NodeOAuthClient, NodeSavedState, OAuthSession } from '@modules/bluesky-oauth'
import { v7 } from 'uuid'
import { BlueskyStateStore } from './state-store.mts'

const completeBlueskyCallbackMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
const createBlueskyOAuthClientMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock<typeof import('@modules/bluesky-oauth')>(
  import('@modules/bluesky-oauth'),
  async importOriginal => ({
    ...(await importOriginal()),
    completeBlueskyCallback: completeBlueskyCallbackMock,
    createBlueskyOAuthClient: createBlueskyOAuthClientMock,
  }),
)
createBlueskyOAuthClientMock.mockReturnValue({} as NodeOAuthClient)

import {
  completeNativeBlueskyAccountLinkDurably,
  completeWebBlueskyAccountLinkDurably,
} from './callback-completion.mts'

describe('durable Bluesky callback rejection branches', () => {
  beforeEach(() => completeBlueskyCallbackMock.mockReset())

  it('checks a different state authorization before invoking the provider', async () => {
    const user = await createTestUserDirect()
    const requestedFlowId = v7()
    const nativeFlowId = v7()
    const stateKey = v7()
    await ensureTestBlueskyLinkAuthorization({
      authorizationId: requestedFlowId,
      userId: user.id,
    })
    await ensureTestBlueskyLinkAuthorization({
      authorizationId: nativeFlowId,
      userId: user.id,
      callbackMode: 'native',
    })
    await new BlueskyStateStore().set(stateKey, {
      iss: 'https://bsky.social',
      authMethod: 'none',
      verifier: 'verifier',
      appState: JSON.stringify({ authorizationId: nativeFlowId }),
      dpopJwk: { kty: 'EC', crv: 'P-256', x: 'x', y: 'y', d: 'd' },
    } as unknown as NodeSavedState)

    await expect(
      completeWebBlueskyAccountLinkDurably({
        params: new URLSearchParams({ code: 'abc', state: stateKey }).toString(),
        flowId: requestedFlowId,
        currentUserId: user.id,
      }),
    ).rejects.toMatchObject({ status: 400, message: 'Invalid Bluesky OAuth state' })
    expect(completeBlueskyCallbackMock).not.toHaveBeenCalled()
    expect(await getTestBlueskyLinkAuthorizationRow(nativeFlowId)).toMatchObject({
      status: 'pending',
    })
  })

  it('deletes a returned web generation when it differs from the requested flow', async () => {
    const user = await createTestUserDirect()
    const requestedFlowId = v7()
    const returnedFlowId = v7()
    const returned = await insertTestBlueskyLinkedAccount({
      userId: null,
      linkingUserId: user.id,
      authorizationId: returnedFlowId,
    })
    await ensureTestBlueskyLinkAuthorization({
      authorizationId: requestedFlowId,
      userId: user.id,
    })
    mockCallbackResult(returned.bluesky_did, returnedFlowId)

    await expect(
      completeWebBlueskyAccountLinkDurably({
        params: 'code=abc',
        flowId: requestedFlowId,
        currentUserId: user.id,
      }),
    ).rejects.toMatchObject({ status: 400 })

    expect(await getTestBlueskyLinkedAccountRow(returned.bluesky_did)).toBeNull()
  })

  it('rejects a web authorization passed to native completion', async () => {
    const user = await createTestUserDirect()
    const flowId = v7()
    await ensureTestBlueskyLinkAuthorization({ authorizationId: flowId, userId: user.id })

    await expect(
      completeNativeBlueskyAccountLinkDurably({
        params: 'code=abc',
        flowId,
        completionTokenHash: 'token-hash',
      }),
    ).rejects.toMatchObject({ status: 400 })
    expect(await getTestBlueskyLinkAuthorizationRow(flowId)).toMatchObject({ status: 'rejected' })
  })

  it('deletes a returned native generation when it differs from the requested flow', async () => {
    const user = await createTestUserDirect()
    const requestedFlowId = v7()
    const returnedFlowId = v7()
    const returned = await insertTestBlueskyLinkedAccount({
      userId: null,
      linkingUserId: user.id,
      authorizationId: returnedFlowId,
      nativeFlowId: returnedFlowId,
    })
    await ensureTestBlueskyLinkAuthorization({
      authorizationId: requestedFlowId,
      userId: user.id,
      callbackMode: 'native',
    })
    mockCallbackResult(returned.bluesky_did, returnedFlowId)

    await expect(
      completeNativeBlueskyAccountLinkDurably({
        params: 'code=abc',
        flowId: requestedFlowId,
        completionTokenHash: 'token-hash',
      }),
    ).rejects.toMatchObject({ status: 400 })

    expect(await getTestBlueskyLinkedAccountRow(returned.bluesky_did)).toBeNull()
  })

  it('rejects native completion when the callback did not persist a provider session', async () => {
    const user = await createTestUserDirect()
    const flowId = v7()
    await ensureTestBlueskyLinkAuthorization({
      authorizationId: flowId,
      userId: user.id,
      callbackMode: 'native',
    })
    mockCallbackResult(fakeDid(), flowId)

    await expect(
      completeNativeBlueskyAccountLinkDurably({
        params: 'code=abc',
        flowId,
        completionTokenHash: 'token-hash',
      }),
    ).rejects.toMatchObject({ status: 404 })
    expect(await getTestBlueskyLinkAuthorizationRow(flowId)).toMatchObject({ status: 'rejected' })
  })
})

function mockCallbackResult(did: string, flowId: string): void {
  completeBlueskyCallbackMock.mockResolvedValueOnce({
    session: { did } as OAuthSession,
    state: JSON.stringify({ authorizationId: flowId }),
  })
}

function fakeDid(): string {
  return `did:plc:${createRandomString(24)}`
}
