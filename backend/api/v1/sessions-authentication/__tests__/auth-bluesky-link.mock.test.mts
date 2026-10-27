import { describe, it, expect, vi, beforeEach } from 'vitest'
import { version as uuidVersion } from 'uuid'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestAccountChangeProof } from '@voucha/test-helpers/account-change'
import {
  createRandomString,
  createTestUser,
  getTestBlueskyLinkAuthorizationRow,
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

const { connectBlueskyAccountToUser } = await import('@services/bluesky-accounts')

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

    const response = await request
      .post('/api/v1/auth/bluesky/link')
      .send({ handle, re_auth_token: await createTestAccountChangeProof(user.id, request) })
      .expect(200)

    expect(response.body).toEqual({ redirect_url: authorizeUrl.toString() })
    const [, calledHandle, rawState] = beginBlueskyAuthorizationMock.mock.calls[0]!
    expect(calledHandle).toBe(handle)
    const { authorizationId } = JSON.parse(rawState as string) as { authorizationId: string }
    expect(uuidVersion(authorizationId)).toBe(7)
    expect(await getTestBlueskyLinkAuthorizationRow(authorizationId)).toMatchObject({
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
        re_auth_token: await createTestAccountChangeProof(user.id, request),
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
    expect(await getTestBlueskyLinkAuthorizationRow(response.body.flow_id as string)).toMatchObject(
      {
        id: response.body.flow_id,
        user_id: user.id,
        handle,
        callback_mode: 'native',
        completion_proof_challenge: completionProofChallenge,
        status: 'pending',
      },
    )
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
      initiatingSessionId: request.sid,
    })
    await connectBlueskyAccountToUser(user.id, did, fakeHandle(), {
      linkAuthorizationId: linked.link_authorization_id,
    })
    await request
      .post('/api/v1/auth/bluesky/link')
      .send({
        handle: fakeHandle(),
        re_auth_token: await createTestAccountChangeProof(user.id, request),
      })
      .expect(409)
    expect(beginBlueskyAuthorizationMock).not.toHaveBeenCalled()
  })
})
