import { describe, it, expect, vi, beforeEach } from 'vitest'
import { withTestEntityListenerCompletion } from '@voucha/test-helpers/entity-listener-transition'
import { withPrivateIdentityCacheFill } from '@voucha/test-helpers/private-identity-cache'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestAccountChangeProof } from '@voucha/test-helpers/account-change'
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

function fakeDid(): string {
  return `did:plc:${createRandomString(24)}`
}

function fakeHandle(): string {
  return `user-${createRandomString(6)}.bsky.social`
}

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

    await request
      .delete('/api/v1/auth/bluesky/link')
      .send({ re_auth_token: await createTestAccountChangeProof(user.id, request) })
      .expect(404)
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
      initiatingSessionId: request.sid,
    })
    await connectBlueskyAccountToUser(user.id, did, fakeHandle(), {
      linkAuthorizationId: linked.link_authorization_id,
    })

    await request
      .delete('/api/v1/auth/bluesky/link')
      .send({ re_auth_token: await createTestAccountChangeProof(user.id, request) })
      .expect(204)
    expect(revokeBlueskySessionMock).not.toHaveBeenCalled()
    expect(await getTestBlueskyLinkedAccountRow(did)).not.toBeNull()
    expect(await getBlueskyLinkedAccountForUser(user.id)).toBeNull()
  })
})

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

    const readIdentity = () => request.get('/api/v1/my/identity').expect(200)
    const before = await withPrivateIdentityCacheFill(user.id, readIdentity)
    expect(before.body.identity.bluesky_account).toBeNull()

    const did = fakeDid()
    const handle = fakeHandle()
    const linked = await insertTestBlueskyLinkedAccount({
      userId: null,
      did,
      linkingUserId: user.id,
      initiatingSessionId: request.sid,
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
      initiatingSessionId: request.sid,
    })
    await withTestEntityListenerCompletion('processUserUpdated', user.id, () =>
      connectBlueskyAccountToUser(user.id, did, fakeHandle(), {
        linkAuthorizationId: account.link_authorization_id,
      }),
    )
    const linked = await request.get('/api/v1/my/identity').expect(200)
    expect(linked.body.identity.bluesky_account).not.toBeNull()

    await withTestEntityListenerCompletion('processUserUpdated', user.id, async () =>
      request
        .delete('/api/v1/auth/bluesky/link')
        .send({ re_auth_token: await createTestAccountChangeProof(user.id, request) })
        .expect(204),
    )

    const after = await request.get('/api/v1/my/identity').expect(200)
    expect(after.body.identity.bluesky_account).toBeNull()
  })
})
