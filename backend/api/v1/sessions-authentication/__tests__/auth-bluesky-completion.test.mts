import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, softDeleteUser, suspendTestUser } from '@voucha/test-helpers'
import {
  getTestBlueskyLinkedAccountRow,
  getTestBlueskyCompletionProofVerifier,
  getTestBlueskyLinkCompletionTokenHash,
  insertTestBlueskyLinkedAccount,
  setTestBlueskyLinkCompletionExpiresAt,
  testBlueskyLinkCompletionExists,
} from '@voucha/test-helpers/entities/bluesky-linked-accounts'
import { createNativeBlueskyLinkCompletion } from '@voucha/test-helpers/bluesky-native-completion-fixtures'
import { finalizeNativeBlueskyAccountLink } from '@services/bluesky-accounts'
import { createTestAccountChangeActor } from '@voucha/test-helpers/account-change'
import { withEntityListenerCompletion } from '@voucha/test-helpers/entity-listener-completion'
import { isSessionRevoked } from '@services/jwt-session'
import { v7 as uuidv7 } from 'uuid'

describe('POST /api/v1/auth/bluesky/link-completions', () => {
  it('requires authentication', async () => {
    await createRequest()
      .post('/api/v1/auth/bluesky/link-completions')
      .send({ flow_id: uuidv7(), completion_token: 'token' })
      .expect(401)
  })

  it('persists only a purpose-bound token hash', async () => {
    const user = await createTestUser()
    const { flowId, token } = await createCompletion(user.id)
    const storedHash = await getTestBlueskyLinkCompletionTokenHash(flowId)
    expect(storedHash).toMatch(/^[A-F0-9]{64}$/)
    expect(storedHash).not.toContain(token)
  })

  it('rejects a malformed flow id before querying PostgreSQL', async () => {
    const request = createRequest()
    await request.authenticateAs(await createTestUser())
    await request
      .post('/api/v1/auth/bluesky/link-completions')
      .send({ flow_id: 'not-a-uuid', completion_token: 'token' })
      .expect(400)
  })

  it('atomically attaches the DID, consumes the completion, and rejects replay', async () => {
    const user = await createTestUser()
    const request = await createAuthenticatedRequest(user)
    const { flowId, token, did, verifier, session } = await createCompletion(user.id, request)
    await request
      .post('/api/v1/auth/bluesky/link-completions')
      .send({ flow_id: flowId, completion_token: token, completion_proof_verifier: verifier })
      .expect(204)
    expect(await getTestBlueskyLinkedAccountRow(did)).toMatchObject({
      user_id: user.id,
      link_authorization_id: flowId,
    })
    expect(await testBlueskyLinkCompletionExists(flowId)).toBe(false)
    await expect(isSessionRevoked(session.sid, { userId: user.id })).resolves.toBe(false)
    await request
      .post('/api/v1/auth/bluesky/link-completions')
      .send({ flow_id: flowId, completion_token: token, completion_proof_verifier: verifier })
      .expect(404)
  })

  it('allows only one concurrent consumer to attach and consume a completion', async () => {
    const user = await createTestUser()
    const request = await createAuthenticatedRequest(user)
    const { flowId, token, did, verifier } = await createCompletion(user.id, request)

    const responses = await Promise.all(
      [0, 1].map(() =>
        request
          .post('/api/v1/auth/bluesky/link-completions')
          .send({ flow_id: flowId, completion_token: token, completion_proof_verifier: verifier }),
      ),
    )

    expect(responses.map(response => response.status).toSorted()).toEqual([204, 404])
    expect((await getTestBlueskyLinkedAccountRow(did))?.user_id).toBe(user.id)
    expect(await testBlueskyLinkCompletionExists(flowId)).toBe(false)
  })

  it('rejects a same-user session that did not initiate the completion', async () => {
    const user = await createTestUser()
    const initiatingRequest = await createAuthenticatedRequest(user)
    const completion = await createCompletion(user.id, initiatingRequest)
    const other = await createAuthenticatedRequest(user)

    await other
      .post('/api/v1/auth/bluesky/link-completions')
      .send({
        flow_id: completion.flowId,
        completion_token: completion.token,
        completion_proof_verifier: completion.verifier,
      })
      .expect(401)

    expect(await getTestBlueskyLinkedAccountRow(completion.did)).toMatchObject({ user_id: null })
    expect(await testBlueskyLinkCompletionExists(completion.flowId)).toBe(true)
    await expect(isSessionRevoked(completion.session.sid, { userId: user.id })).resolves.toBe(false)
    await expect(isSessionRevoked(other.sid, { userId: user.id })).resolves.toBe(false)
  })

  it('rejects a different device for the initiating session without consuming the completion', async () => {
    const user = await createTestUser()
    const completion = await createCompletion(user.id)

    await expect(
      finalizeCompletion(user.id, completion, {
        sid: completion.session.sid,
        did: uuidv7(),
      }),
    ).rejects.toMatchObject({ status: 401 })

    expect(await getTestBlueskyLinkedAccountRow(completion.did)).toMatchObject({ user_id: null })
    expect(await testBlueskyLinkCompletionExists(completion.flowId)).toBe(true)
    await expect(isSessionRevoked(completion.session.sid, { userId: user.id })).resolves.toBe(false)
  })

  it('rechecks deletion on the writer before consuming a completion', async () => {
    const user = await createTestUser()
    const completion = await createCompletion(user.id)
    await softDeleteUser(user.id)

    await expect(finalizeCompletion(user.id, completion)).rejects.toMatchObject({ status: 404 })
    expect(await testBlueskyLinkCompletionExists(completion.flowId)).toBe(true)
  })

  it('rechecks suspension on the writer before consuming a completion', async () => {
    const user = await createTestUser()
    const completion = await createCompletion(user.id)
    await suspendTestUser(user.id)

    await expect(finalizeCompletion(user.id, completion)).rejects.toMatchObject({
      status: 403,
      code: 'ACCOUNT_SUSPENDED',
    })
    expect(await testBlueskyLinkCompletionExists(completion.flowId)).toBe(true)
  })

  it('enqueues the user update only after the completion transaction commits', async () => {
    const user = await createTestUser()
    const completion = await createCompletion(user.id)
    await withEntityListenerCompletion([{ jobName: 'processUserUpdated', entityId: user.id }], () =>
      finalizeCompletion(user.id, completion),
    )

    expect(await testBlueskyLinkCompletionExists(completion.flowId)).toBe(false)
  })

  it('rejects a completion from a different authenticated user session', async () => {
    const owner = await createTestUser()
    const other = await createTestUser()
    const ownerRequest = await createAuthenticatedRequest(owner)
    const { flowId, token, verifier } = await createCompletion(owner.id, ownerRequest)
    const request = createRequest()
    await request.authenticateAs(other)
    await request
      .post('/api/v1/auth/bluesky/link-completions')
      .send({ flow_id: flowId, completion_token: token, completion_proof_verifier: verifier })
      .expect(401)
    expect(await testBlueskyLinkCompletionExists(flowId)).toBe(true)
  })

  it('rejects expired and mismatched completion tokens', async () => {
    const user = await createTestUser()
    const expiredRequest = await createAuthenticatedRequest(user)
    const expired = await createCompletion(user.id, expiredRequest)
    await setTestBlueskyLinkCompletionExpiresAt(expired.flowId, new Date(Date.now() - 1_000))
    await expiredRequest
      .post('/api/v1/auth/bluesky/link-completions')
      .send({
        flow_id: expired.flowId,
        completion_token: expired.token,
        completion_proof_verifier: expired.verifier,
      })
      .expect(404)
    const mismatchRequest = await createAuthenticatedRequest(user)
    const mismatch = await createCompletion(user.id, mismatchRequest)
    await mismatchRequest
      .post('/api/v1/auth/bluesky/link-completions')
      .send({
        flow_id: mismatch.flowId,
        completion_token: 'wrong-token',
        completion_proof_verifier: mismatch.verifier,
      })
      .expect(404)
  })

  it('enforces the exact completion-expiry boundary', async () => {
    const user = await createTestUser()
    const instant = new Date()

    for (const offsetMs of [-1, 0]) {
      const completion = await createCompletion(user.id)
      await setTestBlueskyLinkCompletionExpiresAt(
        completion.flowId,
        new Date(instant.getTime() + offsetMs),
      )

      await expect(
        finalizeCompletion(user.id, completion, completion.session, () => instant),
      ).rejects.toMatchObject({ status: 404 })
      expect(await getTestBlueskyLinkedAccountRow(completion.did)).toMatchObject({ user_id: null })
      expect(await testBlueskyLinkCompletionExists(completion.flowId)).toBe(true)
    }

    const valid = await createCompletion(user.id)
    await setTestBlueskyLinkCompletionExpiresAt(valid.flowId, new Date(instant.getTime() + 1))

    await expect(
      finalizeCompletion(user.id, valid, valid.session, () => instant),
    ).resolves.toBeUndefined()
    expect(await getTestBlueskyLinkedAccountRow(valid.did)).toMatchObject({ user_id: user.id })
    expect(await testBlueskyLinkCompletionExists(valid.flowId)).toBe(false)
  })

  it('retains the completion when account attachment rolls back', async () => {
    const user = await createTestUser()
    await insertTestBlueskyLinkedAccount({ userId: user.id })
    const request = await createAuthenticatedRequest(user)
    const completion = await createCompletion(user.id, request)
    await request
      .post('/api/v1/auth/bluesky/link-completions')
      .send({
        flow_id: completion.flowId,
        completion_token: completion.token,
        completion_proof_verifier: completion.verifier,
      })
      .expect(409)
    expect(await testBlueskyLinkCompletionExists(completion.flowId)).toBe(true)
  })

  it('rejects finalization without the app-held proof even when the bearer token is valid', async () => {
    const user = await createTestUser()
    const completion = await createCompletion(user.id)
    await expect(
      finalizeNativeBlueskyAccountLink(
        user.id,
        completion.session,
        completion.flowId,
        completion.token,
        getTestBlueskyCompletionProofVerifier(uuidv7()),
        () => new Date(),
      ),
    ).rejects.toMatchObject({ status: 404 })

    expect(await getTestBlueskyLinkedAccountRow(completion.did)).toMatchObject({
      user_id: null,
      link_authorization_id: completion.flowId,
    })
    expect(await testBlueskyLinkCompletionExists(completion.flowId)).toBe(true)
  })
})

async function createCompletion(userId: string, session?: { sid: string; did: string }) {
  const flowId = uuidv7()
  const initiatingSession = session ?? (await createTestAccountChangeActor(userId)).session
  const account = await insertTestBlueskyLinkedAccount({
    userId: null,
    linkingUserId: userId,
    authorizationId: flowId,
    nativeFlowId: flowId,
    initiatingSessionId: initiatingSession.sid,
  })
  const token = await createNativeBlueskyLinkCompletion({
    flowId,
    userId,
    did: account.bluesky_did,
    handle: `${uuidv7()}.bsky.social`,
  })
  return {
    flowId,
    token,
    did: account.bluesky_did,
    session: initiatingSession,
    verifier: getTestBlueskyCompletionProofVerifier(flowId),
  }
}

function finalizeCompletion(
  userId: string,
  completion: Awaited<ReturnType<typeof createCompletion>>,
  session = completion.session,
  now = () => new Date(),
) {
  return finalizeNativeBlueskyAccountLink(
    userId,
    session,
    completion.flowId,
    completion.token,
    completion.verifier,
    now,
  )
}

async function createAuthenticatedRequest(user: Awaited<ReturnType<typeof createTestUser>>) {
  const request = createRequest()
  await request.authenticateAs(user)
  return request
}
