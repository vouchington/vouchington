import { describe, it, expect, vi, beforeEach } from 'vitest'
import { onceEntityListenerCompleted } from '@workers/entity-listeners/test-support'
import { version as uuidVersion } from 'uuid'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createRandomString,
  createTestUser,
  getTestBlueskyLinkedAccountRow,
  insertTestBlueskyLinkedAccount,
} from '@voucha/test-helpers'
import type { NodeOAuthClient } from '@modules/bluesky-oauth'

const beginBlueskyAuthorizationMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
const completeBlueskyCallbackMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
const revokeBlueskySessionMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
// createBlueskyOAuthClient constructs a real @atproto/oauth-client-node NodeOAuthClient, which
// validates its client-metadata shape (client_id/redirect_uris) against the resolved site origin
// at construction time. That validation requires a real https origin (see
// backend/modules/bluesky-oauth/client-metadata.mts) — local/CI worktrees resolve to a localhost
// origin, which the SDK correctly rejects. This is the @modules/bluesky-oauth SDK boundary (see
// backend/CLAUDE.md § Provider-wide SDK boundaries), so it's mocked here rather than exercised for
// real, mirroring backend/services/bluesky-accounts/link.mock.test.mts and disconnect.mock.test.mts.
const createBlueskyOAuthClientMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock<typeof import('@modules/bluesky-oauth')>(
  import('@modules/bluesky-oauth'),
  async importOriginal => ({
    ...(await importOriginal()),
    beginBlueskyAuthorization: beginBlueskyAuthorizationMock,
    completeBlueskyCallback: completeBlueskyCallbackMock,
    revokeBlueskySession: revokeBlueskySessionMock,
    createBlueskyOAuthClient: createBlueskyOAuthClientMock,
  }),
)
// getBlueskyOAuthClient() memoizes its result for the lifetime of the module, so this mock is
// invoked at most once across the whole file — configure a stable fake up front rather than in
// each test's beforeEach.
createBlueskyOAuthClientMock.mockReturnValue({} as NodeOAuthClient)

const { BlueskySessionStore } = await import('@services/bluesky-accounts')
const { connectBlueskyAccountToUser } = await import('@services/bluesky-accounts')
const { getBlueskyLinkedAccountForUser } = await import('@services/bluesky-accounts')
const { getBlueskyLinkAuthorization } =
  await import('@services/bluesky-accounts/link-authorization')

function fakeDid(): string {
  return `did:plc:${createRandomString(24)}`
}

function fakeHandle(): string {
  return `user-${createRandomString(6)}.bsky.social`
}

describe('POST /api/v1/auth/bluesky/link', () => {
  beforeEach(() => {
    beginBlueskyAuthorizationMock.mockReset()
  })

  it('returns 401 when unauthenticated', async () => {
    const request = createRequest()
    const response = await request
      .post('/api/v1/auth/bluesky/link')
      .send({ handle: fakeHandle() })
      .expect(401)

    expect(response.body.message).toContain('Unauthorized')
  })

  it('returns 400 when handle is missing', async () => {
    const request = createRequest()
    const user = await createTestUser()
    await request.authenticateAs(user)

    await request.post('/api/v1/auth/bluesky/link').send({}).expect(400)
    expect(beginBlueskyAuthorizationMock).not.toHaveBeenCalled()
  })

  it('returns 400 when handle is blank', async () => {
    const request = createRequest()
    const user = await createTestUser()
    await request.authenticateAs(user)

    await request.post('/api/v1/auth/bluesky/link').send({ handle: '   ' }).expect(400)
    expect(beginBlueskyAuthorizationMock).not.toHaveBeenCalled()
  })

  it('returns the authorization redirect URL on success', async () => {
    const request = createRequest()
    const user = await createTestUser()
    await request.authenticateAs(user)
    const handle = fakeHandle()
    const authorizeUrl = new URL('https://bsky.social/oauth/authorize?request_uri=abc')
    beginBlueskyAuthorizationMock.mockResolvedValueOnce(authorizeUrl)

    const response = await request.post('/api/v1/auth/bluesky/link').send({ handle }).expect(200)

    expect(response.body).toEqual({ redirect_url: authorizeUrl.toString() })
    const [, calledHandle, rawState] = beginBlueskyAuthorizationMock.mock.calls[0]!
    expect(calledHandle).toBe(handle)
    const { authorizationId } = JSON.parse(rawState as string) as { authorizationId: string }
    expect(uuidVersion(authorizationId)).toBe(7)
    expect(await getBlueskyLinkAuthorization(authorizationId)).toMatchObject({
      id: authorizationId,
      user_id: user.id,
      handle,
      callback_mode: 'web',
      completion_proof_challenge: null,
      status: 'pending',
    })
  })

  it('returns a flow id for native callback mode', async () => {
    const request = createRequest()
    const user = await createTestUser()
    await request.authenticateAs(user)
    const handle = fakeHandle()
    const completionProofChallenge = 'b'.repeat(43)
    beginBlueskyAuthorizationMock.mockResolvedValueOnce(new URL('https://bsky.social/oauth'))
    const response = await request
      .post('/api/v1/auth/bluesky/link')
      .send({
        handle,
        callback_mode: 'native',
        completion_proof_challenge: completionProofChallenge,
      })
      .expect(200)
    expect(uuidVersion(response.body.flow_id)).toBe(7)
    expect(beginBlueskyAuthorizationMock).toHaveBeenCalledWith(
      expect.anything(),
      handle,
      JSON.stringify({ authorizationId: response.body.flow_id }),
    )
    expect(await getBlueskyLinkAuthorization(response.body.flow_id as string)).toMatchObject({
      id: response.body.flow_id,
      user_id: user.id,
      handle,
      callback_mode: 'native',
      completion_proof_challenge: completionProofChallenge,
      status: 'pending',
    })
  })

  it('rejects an unsupported callback mode', async () => {
    const request = createRequest()
    await request.authenticateAs(await createTestUser())
    await request
      .post('/api/v1/auth/bluesky/link')
      .send({ handle: fakeHandle(), callback_mode: 'desktop' })
      .expect(400)
    expect(beginBlueskyAuthorizationMock).not.toHaveBeenCalled()
  })

  it('returns 409 when the user already has a Bluesky account linked', async () => {
    const request = createRequest()
    const user = await createTestUser()
    await request.authenticateAs(user)
    const did = fakeDid()
    const linked = await insertTestBlueskyLinkedAccount({
      userId: null,
      did,
      linkingUserId: user.id,
    })
    await connectBlueskyAccountToUser(user.id, did, fakeHandle(), {
      linkAuthorizationId: linked.link_authorization_id,
    })

    await request.post('/api/v1/auth/bluesky/link').send({ handle: fakeHandle() }).expect(409)
    expect(beginBlueskyAuthorizationMock).not.toHaveBeenCalled()
  })
})

// GET /api/v1/auth/bluesky/callback tests live in auth-bluesky-callback.mock.test.mts — split out
// (Codex review round 2, fix #7) to stay under the 300-line file cap once the requireAuth-gating
// regression tests were added.

describe('DELETE /api/v1/auth/bluesky/link', () => {
  beforeEach(() => {
    revokeBlueskySessionMock.mockReset()
    revokeBlueskySessionMock.mockResolvedValue(undefined)
  })

  it('returns 401 when unauthenticated', async () => {
    const request = createRequest()
    const response = await request.delete('/api/v1/auth/bluesky/link').expect(401)
    expect(response.body.message).toContain('Unauthorized')
  })

  it('returns 404 when no account is linked', async () => {
    const request = createRequest()
    const user = await createTestUser()
    await request.authenticateAs(user)

    await request.delete('/api/v1/auth/bluesky/link').expect(404)
    expect(revokeBlueskySessionMock).not.toHaveBeenCalled()
  })

  it('records the unlink request without synchronous provider cleanup', async () => {
    const request = createRequest()
    const user = await createTestUser()
    await request.authenticateAs(user)
    const did = fakeDid()
    const linked = await insertTestBlueskyLinkedAccount({
      userId: null,
      did,
      linkingUserId: user.id,
    })
    await connectBlueskyAccountToUser(user.id, did, fakeHandle(), {
      linkAuthorizationId: linked.link_authorization_id,
    })

    await request.delete('/api/v1/auth/bluesky/link').expect(204)
    expect(revokeBlueskySessionMock).not.toHaveBeenCalled()
    expect(await getTestBlueskyLinkedAccountRow(did)).not.toBeNull()
    expect(await getBlueskyLinkedAccountForUser(user.id)).toBeNull()
  })
})

// Phase D3 web UI: GET /api/v1/my/identity is the only place a linked Bluesky account persists
// across a page reload (the callback's `?bluesky=linked` query param is a one-shot flash). Both
// connect and disconnect enqueue processUserUpdated to bust the cached identity read — see
// connect.mts/disconnect.mts and README.md's "Both connectBlueskyAccountToUser and
// disconnectBlueskyAccountFromUser call void enqueueOnUserUpdated" note.
describe('bluesky_account on GET /api/v1/my/identity', () => {
  beforeEach(() => {
    revokeBlueskySessionMock.mockReset()
    // Real revokeBlueskySession deletes the bluesky_linked_accounts row as a side effect (see
    // session-store.mts's BlueskySessionStore.del doc comment: "Called by client.revoke() during
    // unlink"). The mock only replaces the OAuth-server I/O (@modules/bluesky-oauth SDK
    // boundary) — it must still perform that same deletion so the identity-clears-on-disconnect
    // assertion below reflects real behavior rather than the SDK call's absence.
    revokeBlueskySessionMock.mockImplementation(async (_client: unknown, did: string) => {
      await new BlueskySessionStore().del(did)
    })
  })

  it('is null before linking, then reflects did/handle after connecting', async () => {
    const request = createRequest()
    const user = await createTestUser()
    await request.authenticateAs(user)

    const before = await request.get('/api/v1/my/identity').expect(200)
    expect(before.body.identity.bluesky_account).toBeNull()

    const did = fakeDid()
    const handle = fakeHandle()
    const linked = await insertTestBlueskyLinkedAccount({
      userId: null,
      did,
      linkingUserId: user.id,
    })
    await connectBlueskyAccountToUser(user.id, did, handle, {
      linkAuthorizationId: linked.link_authorization_id,
    })
    await onceEntityListenerCompleted('processUserUpdated', user.id)

    const after = await request.get('/api/v1/my/identity').expect(200)
    expect(after.body.identity.bluesky_account).toEqual({ did, handle })
  })

  it('clears back to null after disconnecting', async () => {
    const request = createRequest()
    const user = await createTestUser()
    await request.authenticateAs(user)
    const did = fakeDid()
    const account = await insertTestBlueskyLinkedAccount({
      userId: null,
      did,
      linkingUserId: user.id,
    })
    await connectBlueskyAccountToUser(user.id, did, fakeHandle(), {
      linkAuthorizationId: account.link_authorization_id,
    })
    await onceEntityListenerCompleted('processUserUpdated', user.id)
    const linked = await request.get('/api/v1/my/identity').expect(200)
    expect(linked.body.identity.bluesky_account).not.toBeNull()

    await request.delete('/api/v1/auth/bluesky/link').expect(204)
    await onceEntityListenerCompleted('processUserUpdated', user.id)

    const after = await request.get('/api/v1/my/identity').expect(200)
    expect(after.body.identity.bluesky_account).toBeNull()
  })
})
