import { describe, it, expect, vi, beforeEach } from 'vitest'
import { withTestEntityListenerCompletion } from '@voucha/test-helpers/entity-listener-transition'
import { version as uuidVersion } from 'uuid'
import { createRequest } from '@voucha/test-helpers/api/server'
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
// SDK client metadata requires HTTPS and rejects localhost test origins.
// Mock only the @modules/bluesky-oauth provider boundary (see backend/AGENTS.md).
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
// The client is memoized; configure one stable fake for this file.
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

// Callback route cases live in auth-bluesky-callback.mock.test.mts.

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

// GET /api/v1/my/identity persists the link across reloads; processUserUpdated
// invalidates its cache after connect and accepted-generation disconnect.
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
    const admissionStarted = Promise.withResolvers<void>()
    const releaseAdmission = Promise.withResolvers<void>()
    const completion = withTestEntityListenerCompletion(
      'processUserUpdated',
      user.id,
      () =>
        connectBlueskyAccountToUser(user.id, did, handle, {
          linkAuthorizationId: linked.link_authorization_id,
        }),
      {
        beforeAdd: () => {
          admissionStarted.resolve()
          return releaseAdmission.promise
        },
        release: () => releaseAdmission.resolve(),
      },
    )
    try {
      expect(
        await Promise.race([
          admissionStarted.promise.then(() => true),
          completion.then(() => false),
        ]),
      ).toBe(true)
      const stillCached = await request.get('/api/v1/my/identity').expect(200)
      expect(stillCached.body.identity.bluesky_account).toBeNull()
    } finally {
      releaseAdmission.resolve()
    }
    await completion

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
    await withTestEntityListenerCompletion('processUserUpdated', user.id, () =>
      connectBlueskyAccountToUser(user.id, did, fakeHandle(), {
        linkAuthorizationId: account.link_authorization_id,
      }),
    )
    const linked = await request.get('/api/v1/my/identity').expect(200)
    expect(linked.body.identity.bluesky_account).not.toBeNull()

    await withTestEntityListenerCompletion('processUserUpdated', user.id, () =>
      request.delete('/api/v1/auth/bluesky/link').expect(204),
    )

    const after = await request.get('/api/v1/my/identity').expect(200)
    expect(after.body.identity.bluesky_account).toBeNull()
  })
})
