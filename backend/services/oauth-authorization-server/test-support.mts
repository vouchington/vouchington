import { createHash, randomBytes } from 'node:crypto'
import { v7 as uuidv7 } from 'uuid'
import type { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import {
  beginOAuthAuthorizationRequest,
  createOAuthBrowserBindingHash,
  decideOAuthAuthorizationRequest,
  registerOAuthClient,
} from './index.mts'

type TestUser = Awaited<ReturnType<typeof createTestUserDirect>>

export const TEST_OAUTH_RESOURCE = 'http://localhost:2900/api/v1/mcp'
export const TEST_OAUTH_SCOPE = 'mcp.user:read mcp.user:write'

export async function createTestApprovedOAuthAuthorization(user: TestUser) {
  const pending = await createTestPendingOAuthAuthorization(user)
  const decision = await decideOAuthAuthorizationRequest(
    user.id,
    pending.requestId,
    'approve',
    pending.bindingHash,
  )
  const code = new URL(decision.redirect_uri).searchParams.get('code')
  if (!code) throw new Error('authorization code was not returned')
  return { ...pending, code }
}

export async function createTestPendingOAuthAuthorization(user: TestUser) {
  const redirectUri = randomTestOAuthRedirectUri()
  const client = await registerOAuthClient({
    client_name: `Test public ${randomBytes(6).toString('hex')}`,
    redirect_uris: [redirectUri],
    scope: TEST_OAUTH_SCOPE,
  })
  const verifier = randomBytes(32).toString('base64url')
  const deviceId = uuidv7()
  const sessionId = uuidv7()
  const request = await beginOAuthAuthorizationRequest({
    clientId: client.client_id,
    codeChallenge: createHash('sha256').update(verifier).digest('base64url'),
    codeChallengeMethod: 'S256',
    deviceId,
    redirectUri,
    resource: TEST_OAUTH_RESOURCE,
    responseType: 'code',
    scope: TEST_OAUTH_SCOPE,
    sessionId,
    state: randomBytes(16).toString('base64url'),
    userId: user.id,
  })
  return {
    bindingHash: createOAuthBrowserBindingHash(deviceId, sessionId),
    client,
    redirectUri,
    requestId: request.request_id,
    verifier,
  }
}

export function randomTestOAuthRedirectUri(): string {
  const port = 30_000 + (randomBytes(2).readUInt16BE(0) % 20_000)
  return `http://127.0.0.1:${port}/callback/${randomBytes(6).toString('hex')}`
}
