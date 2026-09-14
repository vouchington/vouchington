import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createRandomString,
  createTestUser,
  ensureTestBlueskyLinkAuthorization,
  suspendTestUser,
  unsuspendTestUser,
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

describe('GET /api/v1/auth/bluesky/callback', () => {
  beforeEach(() => completeBlueskyCallbackMock.mockReset())

  it('links the authenticated user after a successful callback', async () => {
    const request = createRequest()
    const user = await createTestUser()
    const did = fakeDid()
    const flowId = v7()
    const stateKey = v7()
    await ensureTestBlueskyLinkAuthorization({ authorizationId: flowId, userId: user.id })
    const appState = JSON.stringify({ authorizationId: flowId })
    await new BlueskyStateStore().set(stateKey, fakeState(appState))
    await request.authenticateAs(user)
    completeBlueskyCallbackMock.mockImplementationOnce(async () => {
      await new BlueskySessionStore().set(did, fakeSession(did))
      return { session: { did } as OAuthSession, state: appState }
    })

    const response = await request
      .get(`/api/v1/auth/bluesky/callback?code=abc&state=${stateKey}`)
      .expect(302)

    expect(new URL(response.headers.location).searchParams.get('bluesky')).toBe('linked')
    expect(await getBlueskyLinkedAccountForUser(user.id)).toMatchObject({ bluesky_did: did })
  })

  it('rejects a suspended user before provider completion', async () => {
    const request = createRequest()
    const user = await createTestUser()
    await request.authenticateAs(user)
    await suspendTestUser(user.id)
    try {
      const response = await request
        .get('/api/v1/auth/bluesky/callback?code=abc&state=missing')
        .expect(302)
      expect(new URL(response.headers.location).searchParams.get('bluesky_error')).toBe(
        'account_suspended',
      )
      expect(completeBlueskyCallbackMock).not.toHaveBeenCalled()
    } finally {
      await unsuspendTestUser(user.id)
    }
  })
})

function fakeDid(): string {
  return `did:plc:${createRandomString(24)}`
}

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
