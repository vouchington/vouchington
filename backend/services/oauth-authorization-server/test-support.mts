import { createHash, randomBytes } from 'node:crypto'
import { v7 as uuidv7 } from 'uuid'
import type { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import {
  beginOAuthAuthorizationRequest,
  createOAuthBrowserBindingHash,
  decideOAuthAuthorizationRequest,
  exchangeOAuthAuthorizationCode,
  getOAuthResourceUrl,
  registerOAuthClient,
  type OAuthResourceAudience,
} from './index.mts'

type TestUser = Pick<Awaited<ReturnType<typeof createTestUserDirect>>, 'id'>

type TestOAuthAuthorizationOptions = {
  audience?: OAuthResourceAudience
  scope?: string
  tokenEndpointAuthMethod?: 'none' | 'client_secret_basic'
}

export const TEST_OAUTH_RESOURCE = getOAuthResourceUrl('user')
export const TEST_OAUTH_SCOPE = 'mcp.user:read mcp.user:write'

// Runs the real authorization-code flow and returns the issued access and refresh tokens.
export async function issueTestOAuthTokens(
  user: TestUser,
  options?: TestOAuthAuthorizationOptions,
) {
  const approved = await createTestApprovedOAuthAuthorization(user, options)
  return exchangeOAuthAuthorizationCode({
    clientId: approved.client.client_id,
    clientSecret: approved.client.client_secret,
    code: approved.code,
    codeVerifier: approved.verifier,
    redirectUri: approved.redirectUri,
  })
}

export async function createTestApprovedOAuthAuthorization(
  user: TestUser,
  options?: TestOAuthAuthorizationOptions,
) {
  const pending = await createTestPendingOAuthAuthorization(user, options)
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

export async function createTestPendingOAuthAuthorization(
  user: TestUser,
  {
    audience = 'user',
    scope = TEST_OAUTH_SCOPE,
    tokenEndpointAuthMethod = 'none',
  }: TestOAuthAuthorizationOptions = {},
) {
  const redirectUri = randomTestOAuthRedirectUri()
  const client = await registerOAuthClient({
    client_name: `Test ${tokenEndpointAuthMethod} ${randomBytes(6).toString('hex')}`,
    redirect_uris: [redirectUri],
    scope,
    token_endpoint_auth_method: tokenEndpointAuthMethod,
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
    resource: getOAuthResourceUrl(audience),
    responseType: 'code',
    scope,
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
