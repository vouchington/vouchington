import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser, softDeleteUser, suspendTestUser } from '@voucha/test-helpers'
import {
  getTestBlueskyLinkedAccountRow,
  getTestBlueskyCompletionProofVerifier,
  getTestBlueskyLinkCompletionTokenHash,
  insertTestBlueskyLinkedAccount,
  setTestBlueskyLinkCompletionExpiresAt,
  testBlueskyLinkCompletionExists,
} from '@voucha/test-helpers/entities/bluesky-linked-accounts'
import {
  createNativeBlueskyLinkCompletion,
  finalizeNativeBlueskyAccountLink,
} from '@services/bluesky-accounts'
import { onceEntityListenerCompleted } from '@workers/entity-listeners/test-support'
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
    const { flowId, token, did, verifier } = await createCompletion(user.id)
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post('/api/v1/auth/bluesky/link-completions')
      .send({ flow_id: flowId, completion_token: token, completion_proof_verifier: verifier })
      .expect(204)
    expect(await getTestBlueskyLinkedAccountRow(did)).toMatchObject({
      user_id: user.id,
      link_authorization_id: flowId,
    })
    expect(await testBlueskyLinkCompletionExists(flowId)).toBe(false)
    await request
      .post('/api/v1/auth/bluesky/link-completions')
      .send({ flow_id: flowId, completion_token: token, completion_proof_verifier: verifier })
      .expect(404)
  })

  it('allows only one concurrent consumer to attach and consume a completion', async () => {
    const user = await createTestUser()
    const { flowId, token, did, verifier } = await createCompletion(user.id)
    const request = createRequest()
    await request.authenticateAs(user)

    const responses = await Promise.all(
      [0, 1].map(() =>
        request
          .post('/api/v1/auth/bluesky/link-completions')
          .send({ flow_id: flowId, completion_token: token, completion_proof_verifier: verifier }),
      ),
    )

    expect(responses.map(response => response.status).sort()).toEqual([204, 404])
    expect((await getTestBlueskyLinkedAccountRow(did))?.user_id).toBe(user.id)
    expect(await testBlueskyLinkCompletionExists(flowId)).toBe(false)
  })

  it('rechecks deletion on the writer before consuming a completion', async () => {
    const user = await createTestUser()
    const completion = await createCompletion(user.id)
    await softDeleteUser(user.id)

    await expect(
      finalizeNativeBlueskyAccountLink(
        user.id,
        completion.flowId,
        completion.token,
        completion.verifier,
      ),
    ).rejects.toMatchObject({ status: 404 })
    expect(await testBlueskyLinkCompletionExists(completion.flowId)).toBe(true)
  })

  it('rechecks suspension on the writer before consuming a completion', async () => {
    const user = await createTestUser()
    const completion = await createCompletion(user.id)
    await suspendTestUser(user.id)

    await expect(
      finalizeNativeBlueskyAccountLink(
        user.id,
        completion.flowId,
        completion.token,
        completion.verifier,
      ),
    ).rejects.toMatchObject({ status: 403, code: 'ACCOUNT_SUSPENDED' })
    expect(await testBlueskyLinkCompletionExists(completion.flowId)).toBe(true)
  })

  it('enqueues the user update only after the completion transaction commits', async () => {
    const user = await createTestUser()
    const completion = await createCompletion(user.id)
    const listenerCompleted = onceEntityListenerCompleted('processUserUpdated', user.id)

    await finalizeNativeBlueskyAccountLink(
      user.id,
      completion.flowId,
      completion.token,
      completion.verifier,
    )
    await listenerCompleted

    expect(await testBlueskyLinkCompletionExists(completion.flowId)).toBe(false)
  })

  it('rejects a completion owned by another user', async () => {
    const owner = await createTestUser()
    const other = await createTestUser()
    const { flowId, token, verifier } = await createCompletion(owner.id)
    const request = createRequest()
    await request.authenticateAs(other)
    await request
      .post('/api/v1/auth/bluesky/link-completions')
      .send({ flow_id: flowId, completion_token: token, completion_proof_verifier: verifier })
      .expect(403)
    expect(await testBlueskyLinkCompletionExists(flowId)).toBe(true)
  })

  it('rejects expired and mismatched completion tokens', async () => {
    const user = await createTestUser()
    const expired = await createCompletion(user.id)
    await setTestBlueskyLinkCompletionExpiresAt(expired.flowId, new Date(Date.now() - 1_000))
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post('/api/v1/auth/bluesky/link-completions')
      .send({
        flow_id: expired.flowId,
        completion_token: expired.token,
        completion_proof_verifier: expired.verifier,
      })
      .expect(404)
    const mismatch = await createCompletion(user.id)
    await request
      .post('/api/v1/auth/bluesky/link-completions')
      .send({
        flow_id: mismatch.flowId,
        completion_token: 'wrong-token',
        completion_proof_verifier: mismatch.verifier,
      })
      .expect(404)
  })

  it('retains the completion when account attachment rolls back', async () => {
    const user = await createTestUser()
    await insertTestBlueskyLinkedAccount({ userId: user.id })
    const completion = await createCompletion(user.id)
    const request = createRequest()
    await request.authenticateAs(user)
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
        completion.flowId,
        completion.token,
        getTestBlueskyCompletionProofVerifier(uuidv7()),
      ),
    ).rejects.toMatchObject({ status: 404 })

    expect(await getTestBlueskyLinkedAccountRow(completion.did)).toMatchObject({
      user_id: null,
      link_authorization_id: completion.flowId,
    })
    expect(await testBlueskyLinkCompletionExists(completion.flowId)).toBe(true)
  })
})

async function createCompletion(userId: string): Promise<{
  flowId: string
  token: string
  did: string
  verifier: string
}> {
  const flowId = uuidv7()
  const account = await insertTestBlueskyLinkedAccount({
    userId: null,
    linkingUserId: userId,
    authorizationId: flowId,
    nativeFlowId: flowId,
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
    verifier: getTestBlueskyCompletionProofVerifier(flowId),
  }
}
