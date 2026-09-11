import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createRandomString,
  createTestUser,
  ensureTestBlueskyLinkAuthorization,
  getTestBlueskyCompletionProofVerifier,
  getTestBlueskyLinkAuthorizationRow,
} from '@voucha/test-helpers'
import type {
  NodeOAuthClient,
  NodeSavedSession,
  NodeSavedState,
  OAuthSession,
} from '@modules/bluesky-oauth'
import { v7 } from 'uuid'

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
const { BlueskySessionStore, BlueskyStateStore, getBlueskyLinkedAccountForUser } =
  await import('@services/bluesky-accounts')

describe('native Bluesky callback', () => {
  beforeEach(() => completeBlueskyCallbackMock.mockReset())

  it('issues a completion token that only the authenticated flow owner can consume', async () => {
    const user = await createTestUser()
    const flowId = v7()
    const stateKey = v7()
    const did = `did:plc:${createRandomString(24)}`
    await ensureTestBlueskyLinkAuthorization({
      authorizationId: flowId,
      userId: user.id,
      callbackMode: 'native',
    })
    const appState = JSON.stringify({ authorizationId: flowId })
    await new BlueskyStateStore().set(stateKey, fakeState(appState))
    completeBlueskyCallbackMock.mockImplementationOnce(async () => {
      await new BlueskySessionStore().set(did, fakeSession(did))
      return { session: { did } as OAuthSession, state: appState }
    })
    const request = createRequest()
    const callback = await request
      .get(`/api/v1/auth/bluesky/callback?code=abc&state=${stateKey}`)
      .expect(302)
    const location = new URL(callback.headers.location)
    const token = location.searchParams.get('completion_token')
    expect(location.protocol).toBe('voucha:')
    expect(token).toBeTruthy()
    await request.authenticateAs(user)
    await request
      .post('/api/v1/auth/bluesky/link-completions')
      .send({
        flow_id: flowId,
        completion_token: token,
        completion_proof_verifier: getTestBlueskyCompletionProofVerifier(flowId),
      })
      .expect(204)
    expect(await getBlueskyLinkedAccountForUser(user.id)).toMatchObject({ bluesky_did: did })
  })

  it('fences the native flow after provider completion fails', async () => {
    const user = await createTestUser()
    const flowId = v7()
    const stateKey = v7()
    await ensureTestBlueskyLinkAuthorization({
      authorizationId: flowId,
      userId: user.id,
      callbackMode: 'native',
    })
    await new BlueskyStateStore().set(
      stateKey,
      fakeState(JSON.stringify({ authorizationId: flowId })),
    )
    completeBlueskyCallbackMock.mockRejectedValueOnce(new Error('provider failed'))
    await createRequest()
      .get(`/api/v1/auth/bluesky/callback?code=abc&state=${stateKey}`)
      .expect(302)
    expect(await getTestBlueskyLinkAuthorizationRow(flowId)).toMatchObject({ status: 'rejected' })
  })
})

function fakeSession(did: string): NodeSavedSession {
  return {
    dpopKey: { kty: 'EC', crv: 'P-256', x: 'x', y: 'y', d: 'd' },
    authMethod: 'none',
    tokenSet: {
      iss: 'https://bsky.social',
      sub: did,
      aud: 'https://example.voucha.ai/client-metadata.json',
      access_token: createRandomString(24),
      token_type: 'DPoP',
      scope: 'atproto',
    },
  } as unknown as NodeSavedSession
}
function fakeState(appState: string): NodeSavedState {
  return {
    iss: 'https://bsky.social',
    authMethod: 'none',
    verifier: 'verifier',
    appState,
    dpopJwk: { kty: 'EC', crv: 'P-256', x: 'x', y: 'y', d: 'd' },
  } as unknown as NodeSavedState
}
