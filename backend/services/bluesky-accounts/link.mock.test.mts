import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createRandomString,
  createTestUserDirect,
  ensureTestBlueskyLinkAuthorization,
  getTestBlueskyLinkedAccountRow,
  holdTestUserSuspensionTransaction,
  insertTestBlueskyLinkedAccount,
  observeTestBlueskyCallbackAuthorizationReadPool,
} from '@voucha/test-helpers'
import type { NodeOAuthClient, NodeSavedState, OAuthSession } from '@modules/bluesky-oauth'

const completeBlueskyCallbackMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
// createBlueskyOAuthClient constructs a real @atproto/oauth-client-node NodeOAuthClient, which
// validates its client-metadata shape (client_id/redirect_uris) against the resolved site origin
// at construction time. That validation requires a real https origin (see client-metadata.mts) —
// local/CI worktrees resolve to a localhost origin, which the SDK correctly rejects. This is the
// @modules/bluesky-oauth SDK boundary (see backend/CLAUDE.md § Provider-wide SDK boundaries), so
// it's mocked here rather than exercised for real; the OAuth I/O it would perform is separately
// mocked below via beginBlueskyAuthorization/completeBlueskyCallback.
const createBlueskyOAuthClientMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock<typeof import('@modules/bluesky-oauth')>(
  import('@modules/bluesky-oauth'),
  async importOriginal => ({
    ...(await importOriginal()),
    completeBlueskyCallback: completeBlueskyCallbackMock,
    createBlueskyOAuthClient: createBlueskyOAuthClientMock,
  }),
)
// getBlueskyOAuthClient() memoizes its result for the lifetime of the module, so this mock is
// invoked at most once across the whole file — configure a stable fake up front rather than in
// each test's beforeEach.
createBlueskyOAuthClientMock.mockReturnValue({} as NodeOAuthClient)

import { completeBlueskyAccountLink } from './link-service.mts'
import { completeWebBlueskyAccountLinkDurably } from './callback-completion.mts'
import { getBlueskyLinkedAccountForUser } from './connect.mts'
import { peekBlueskyAccountLinkAppState } from './link.mts'
import { BlueskyStateStore } from './state-store.mts'
import { v7 } from 'uuid'

function fakeDid(): string {
  return `did:plc:${createRandomString(24)}`
}

function fakeHandle(): string {
  return `user-${createRandomString(6)}.bsky.social`
}

describe('completeBlueskyAccountLink', () => {
  beforeEach(() => {
    completeBlueskyCallbackMock.mockReset()
  })

  it.each(['web', 'native'] as const)(
    'classifies %s callback app state through the primary pool',
    async callbackMode => {
      const user = await createTestUserDirect()
      const flowId = v7()
      const stateKey = v7()
      await ensureTestBlueskyLinkAuthorization({
        authorizationId: flowId,
        userId: user.id,
        callbackMode,
      })
      await new BlueskyStateStore().set(stateKey, {
        iss: 'https://bsky.social',
        authMethod: 'none',
        verifier: 'verifier',
        appState: JSON.stringify({ authorizationId: flowId }),
        dpopJwk: { kty: 'EC', crv: 'P-256', x: 'x', y: 'y', d: 'd' },
      } as unknown as NodeSavedState)
      const observed = await observeTestBlueskyCallbackAuthorizationReadPool(() =>
        peekBlueskyAccountLinkAppState(new URLSearchParams({ state: stateKey })),
      )

      expect(observed.result).toMatchObject({ flowId, userId: user.id, callbackMode })
      expect(observed.pools).toEqual(['write'])
    },
  )

  it('attaches the appState-carried user to the DID the callback resolved', async () => {
    const user = await createTestUserDirect()
    const handle = fakeHandle()
    const did = fakeDid()
    const flowId = v7()
    await insertTestBlueskyLinkedAccount({
      userId: null,
      did,
      linkingUserId: user.id,
      authorizationId: flowId,
      handle,
    })
    completeBlueskyCallbackMock.mockResolvedValueOnce({
      session: { did } as OAuthSession,
      state: JSON.stringify({ authorizationId: flowId }),
    })

    const result = await completeBlueskyAccountLink(
      new URLSearchParams({ code: 'abc' }),
      user.id,
      flowId,
    )

    expect(result).toEqual({ did, handle })
    const linked = await getBlueskyLinkedAccountForUser(user.id)
    expect(linked?.bluesky_did).toBe(did)
    expect(linked?.handle).toBe(handle)

    await expect(
      completeBlueskyAccountLink(new URLSearchParams({ code: 'abc' }), user.id, flowId),
    ).resolves.toEqual({ did, handle })
    expect(completeBlueskyCallbackMock).not.toHaveBeenCalled()
  })

  it('reconstructs callback parameters for retry recovery', async () => {
    const user = await createTestUserDirect()
    const did = fakeDid()
    const flowId = v7()
    await insertTestBlueskyLinkedAccount({
      userId: null,
      did,
      linkingUserId: user.id,
      authorizationId: flowId,
      handle: fakeHandle(),
    })
    completeBlueskyCallbackMock.mockResolvedValueOnce({
      session: { did } as OAuthSession,
      state: JSON.stringify({ authorizationId: flowId }),
    })

    await expect(
      completeWebBlueskyAccountLinkDurably({
        params: 'code=worker-code',
        flowId,
        currentUserId: user.id,
      }),
    ).resolves.toEqual({ did, handle: expect.any(String) })
  })

  it('throws 400 when the callback returns no state', async () => {
    const user = await createTestUserDirect()
    const flowId = v7()
    await ensureTestBlueskyLinkAuthorization({ authorizationId: flowId, userId: user.id })
    completeBlueskyCallbackMock.mockResolvedValueOnce({
      session: { did: fakeDid() } as OAuthSession,
      state: null,
    })

    await expect(
      completeBlueskyAccountLink(new URLSearchParams({ code: 'abc' }), user.id, flowId),
    ).rejects.toThrow(/Missing Bluesky OAuth state/)
  })

  it('throws 400 when the callback state is not valid JSON', async () => {
    const user = await createTestUserDirect()
    const flowId = v7()
    await ensureTestBlueskyLinkAuthorization({ authorizationId: flowId, userId: user.id })
    completeBlueskyCallbackMock.mockResolvedValueOnce({
      session: { did: fakeDid() } as OAuthSession,
      state: 'not-json',
    })

    await expect(
      completeBlueskyAccountLink(new URLSearchParams({ code: 'abc' }), user.id, flowId),
    ).rejects.toThrow(/Invalid Bluesky OAuth state/)
  })

  it('throws 404 when no session row was persisted for the resolved DID', async () => {
    const user = await createTestUserDirect()
    const flowId = v7()
    await ensureTestBlueskyLinkAuthorization({ authorizationId: flowId, userId: user.id })
    completeBlueskyCallbackMock.mockResolvedValueOnce({
      session: { did: fakeDid() } as OAuthSession,
      state: JSON.stringify({ authorizationId: flowId }),
    })

    await expect(
      completeBlueskyAccountLink(new URLSearchParams({ code: 'abc' }), user.id, flowId),
    ).rejects.toThrow(/complete the Bluesky sign-in step/)
  })

  // Codex review round 2, fix #7: the authorization URL from beginBlueskyAccountLink is portable —
  // an attacker can start their own flow and send the URL to a victim. If the callback trusted
  // appState.userId alone, the victim's Bluesky DID would land on the attacker's account. The
  // caller (the callback route) must pass the id of whoever is actually completing the request, and
  // this must reject when it disagrees with the appState-carried id — before ever touching
  // connectBlueskyAccountToUser.
  it("throws 403 when the completing session's user does not match the appState-carried user", async () => {
    const originator = await createTestUserDirect()
    const attacker = await createTestUserDirect()
    const did = fakeDid()
    const flowId = v7()
    await insertTestBlueskyLinkedAccount({
      userId: null,
      did,
      linkingUserId: originator.id,
      authorizationId: flowId,
    })
    completeBlueskyCallbackMock.mockResolvedValueOnce({
      session: { did } as OAuthSession,
      state: JSON.stringify({ authorizationId: flowId }),
    })

    await expect(
      completeBlueskyAccountLink(new URLSearchParams({ code: 'abc' }), attacker.id, flowId),
    ).rejects.toThrow(/different Voucha session/)

    expect(await getBlueskyLinkedAccountForUser(originator.id)).toBeNull()
    expect(await getBlueskyLinkedAccountForUser(attacker.id)).toBeNull()
  })

  it('rejects native callback state from the web completion path when state peek is unavailable', async () => {
    const user = await createTestUserDirect()
    const flowId = v7()
    await ensureTestBlueskyLinkAuthorization({
      authorizationId: flowId,
      userId: user.id,
      callbackMode: 'native',
    })
    completeBlueskyCallbackMock.mockResolvedValueOnce({
      session: { did: fakeDid() } as OAuthSession,
      state: JSON.stringify({ authorizationId: flowId }),
    })

    await expect(
      completeBlueskyAccountLink(new URLSearchParams({ code: 'abc' }), user.id, flowId),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('rejects and removes an exact pending web credential when suspension wins attachment', async () => {
    const admin = await createTestUserDirect({ administrator: true })
    const user = await createTestUserDirect()
    const did = fakeDid()
    const flowId = v7()
    await insertTestBlueskyLinkedAccount({
      userId: null,
      did,
      linkingUserId: user.id,
      authorizationId: flowId,
      handle: null,
    })
    completeBlueskyCallbackMock.mockResolvedValueOnce({
      session: { did } as OAuthSession,
      state: JSON.stringify({ authorizationId: flowId }),
    })
    const suspension = await holdTestUserSuspensionTransaction(user.id, admin.id)
    const completion = completeBlueskyAccountLink(
      new URLSearchParams({ code: 'abc' }),
      user.id,
      flowId,
    )
    const completionRejection = completion.catch((error: unknown) => error)

    suspension.release()
    await suspension.completed
    await expect(completionRejection).resolves.toMatchObject({ status: 403 })
    expect(await getTestBlueskyLinkedAccountRow(did)).toBeNull()
  })
})
