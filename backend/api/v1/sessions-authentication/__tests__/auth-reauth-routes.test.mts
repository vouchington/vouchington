import { afterAll, describe, expect, it, vi } from 'vitest'
import { v7 } from 'uuid'

vi.stubEnv('GITHUB_CLIENT_ID', 'synthetic-reauth-github-client')
vi.stubEnv('GITHUB_CLIENT_SECRET', 'synthetic-reauth-github-secret')
vi.stubEnv('GOOGLE_CLIENT_ID', 'synthetic-reauth-google-client')
vi.stubEnv('APPLE_CLIENT_ID', '')
vi.resetModules()
const { createRequest } = await import('@voucha/test-helpers/api/server')
const { connectTestOAuthAccount, createTestUser, insertTestOAuthAccount, insertTestPasskey } =
  await import('@voucha/test-helpers')
const { expireTestOAuthAuthorization, insertTestOAuthAuthorization } =
  await import('@voucha/test-helpers/entities/oauth-authorizations')
const { createProviderReAuthChallenge } = await import('@services/oauth/provider-reauth-challenge')
const { createTestAccountChangeProof } = await import('@voucha/test-helpers/account-change')
const { disconnectOAuthAccount } = await import('@services/my/oauth-account')

describe('fresh provider and passkey proof routes', () => {
  afterAll(() => vi.unstubAllEnvs())

  it('starts a broker confirmation for the acting session and rejects an incomplete proof', async () => {
    const user = await createTestUser()
    const providerUserId = `reauth-${v7()}`
    await insertTestOAuthAccount('github', providerUserId)
    await connectTestOAuthAccount('github', user.id, providerUserId)
    const request = createRequest()
    await request.authenticateAs(user)

    const started = await request
      .post('/api/v1/auth/re-auth/providers/github/authorizations')
      .send({ callback_mode: 'web' })
      .expect(200)
    expect(started.body).toMatchObject({
      flow_id: expect.any(String),
      redirect_url: expect.any(String),
    })

    const premature = await request
      .post('/api/v1/auth/re-auth/providers/github/proofs')
      .send({ flow_id: started.body.flow_id })
      .expect(409)
    expect(premature.body.message).toBe('Provider reauthentication is not complete')

    const anotherSession = createRequest()
    await anotherSession.authenticateAs(user)
    await anotherSession
      .post('/api/v1/auth/re-auth/providers/github/proofs')
      .send({ flow_id: started.body.flow_id })
      .expect(403)

    await expireTestOAuthAuthorization(started.body.flow_id)
    await request
      .post('/api/v1/auth/re-auth/providers/github/proofs')
      .send({ flow_id: started.body.flow_id })
      .expect(410)
  })

  it('retrieves one proof only after the linked-provider callback completed for this session', async () => {
    const user = await createTestUser()
    const providerUserId = `reauth-${v7()}`
    await insertTestOAuthAccount('github', providerUserId)
    await connectTestOAuthAccount('github', user.id, providerUserId)
    const request = createRequest()
    await request.authenticateAs(user)
    const flowId = v7()
    await createProviderReAuthChallenge({
      userId: user.id,
      deviceId: request.did,
      sessionId: request.sid,
      provider: 'github',
      flowId,
    })
    const now = new Date()
    await insertTestOAuthAuthorization({
      id: flowId,
      provider: 'github',
      purpose: 're_auth',
      status: 'completed',
      initiatingUserId: user.id,
      deviceId: request.did,
      sessionId: request.sid,
      providerUserId,
      resultKind: 'connected',
      resultUserId: user.id,
      callbackReceivedAt: now,
      completionReadyAt: now,
      completedAt: now,
    })

    const proof = await request
      .post('/api/v1/auth/re-auth/providers/github/proofs')
      .send({ flow_id: flowId })
      .expect(200)
    expect(proof.body.re_auth_token).toEqual(expect.any(String))
    await request
      .post('/api/v1/auth/re-auth/providers/github/proofs')
      .send({ flow_id: flowId })
      .expect(401)
  })

  it("rejects a completed callback that carries another account's provider identity", async () => {
    const actor = await createTestUser()
    const actorSubject = `actor-${v7()}`
    await insertTestOAuthAccount('github', actorSubject)
    await connectTestOAuthAccount('github', actor.id, actorSubject)
    const other = await createTestUser()
    const otherSubject = `other-${v7()}`
    await insertTestOAuthAccount('github', otherSubject)
    await connectTestOAuthAccount('github', other.id, otherSubject)
    const request = createRequest()
    await request.authenticateAs(actor)
    const flowId = v7()
    await createProviderReAuthChallenge({
      userId: actor.id,
      deviceId: request.did,
      sessionId: request.sid,
      provider: 'github',
      flowId,
    })
    const now = new Date()
    await insertTestOAuthAuthorization({
      id: flowId,
      provider: 'github',
      purpose: 're_auth',
      status: 'completed',
      initiatingUserId: actor.id,
      deviceId: request.did,
      sessionId: request.sid,
      providerUserId: otherSubject,
      resultKind: 'connected',
      resultUserId: actor.id,
      callbackReceivedAt: now,
      completionReadyAt: now,
      completedAt: now,
    })

    await request
      .post('/api/v1/auth/re-auth/providers/github/proofs')
      .send({ flow_id: flowId })
      .expect(403)
  })

  it('rejects proof when the linked provider subject changes after challenge creation', async () => {
    const user = await createTestUser()
    const originalSubject = `original-${v7()}`
    await insertTestOAuthAccount('github', originalSubject)
    await connectTestOAuthAccount('github', user.id, originalSubject)
    const request = createRequest()
    await request.authenticateAs(user)
    const flowId = v7()
    await createProviderReAuthChallenge({
      userId: user.id,
      deviceId: request.did,
      sessionId: request.sid,
      provider: 'github',
      flowId,
    })
    await disconnectOAuthAccount(user.id, 'github')
    const replacementSubject = `replacement-${v7()}`
    await insertTestOAuthAccount('github', replacementSubject)
    await connectTestOAuthAccount('github', user.id, replacementSubject)
    const now = new Date()
    await insertTestOAuthAuthorization({
      id: flowId,
      provider: 'github',
      purpose: 're_auth',
      status: 'completed',
      initiatingUserId: user.id,
      deviceId: request.did,
      sessionId: request.sid,
      providerUserId: replacementSubject,
      resultKind: 'connected',
      resultUserId: user.id,
      callbackReceivedAt: now,
      completionReadyAt: now,
      completedAt: now,
    })

    await request
      .post('/api/v1/auth/re-auth/providers/github/proofs')
      .send({ flow_id: flowId })
      .expect(403)
  })

  it('issues a challenge only for a linked SDK provider and rejects an invalid signed assertion', async () => {
    const user = await createTestUser()
    const providerUserId = `reauth-${v7()}`
    await insertTestOAuthAccount('google', providerUserId)
    await connectTestOAuthAccount('google', user.id, providerUserId)
    const request = createRequest()
    await request.authenticateAs(user)

    await request.post('/api/v1/auth/re-auth/providers/facebook/challenges').send({}).expect(404)
    await request.post('/api/v1/auth/re-auth/providers/apple/challenges').send({}).expect(404)

    const started = await request
      .post('/api/v1/auth/re-auth/providers/google/challenges')
      .send({})
      .expect(200)
    expect(started.body).toMatchObject({
      flow_id: expect.any(String),
      nonce: expect.any(String),
      expires_at: expect.any(String),
    })

    await request
      .post('/api/v1/auth/re-auth/providers/google/verification')
      .send({ flow_id: started.body.flow_id, credential: 'not-a-signed-assertion' })
      .expect(401)
  })

  it('binds a passkey challenge to the selected owned credential and rejects an invalid assertion', async () => {
    const user = await createTestUser()
    const passkey = await insertTestPasskey(user.id, `reauth-${v7()}`)
    const request = createRequest()
    await request.authenticateAs(user)

    const started = await request
      .post('/api/v1/auth/re-auth/passkeys/options')
      .send({ passkey_id: passkey.id })
      .expect(200)
    expect(started.body).toMatchObject({ flow_id: expect.any(String), options: expect.any(Object) })

    await request
      .post('/api/v1/auth/re-auth/passkeys/verification')
      .send({ passkey_id: passkey.id, flow_id: started.body.flow_id, response: { id: 'wrong' } })
      .expect(401)
  })

  it('disconnects an owned provider only after one fresh account-change proof', async () => {
    const user = await createTestUser()
    const providerUserId = `reauth-${v7()}`
    await insertTestOAuthAccount('github', providerUserId)
    await connectTestOAuthAccount('github', user.id, providerUserId)
    const request = createRequest()
    await request.authenticateAs(user)
    const proof = await createTestAccountChangeProof(user.id, request)

    await request
      .delete('/api/v1/auth/oauth/github/connect')
      .send({ re_auth_token: proof })
      .expect(204)
    await request
      .delete('/api/v1/auth/oauth/github/connect')
      .send({ re_auth_token: proof })
      .expect(403)
  })
})
