import { createHash, randomBytes } from 'node:crypto'
import { v7 as uuidv7 } from 'uuid'
import type { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import {
  beginValidatedOAuthAuthorizationRequest,
  validateOAuthAuthorizationRequest,
  createOAuthBrowserBindingHash,
  decideOAuthAuthorizationRequest,
  exchangeOAuthAuthorizationCode,
  getOAuthResourceUrl,
  registerOAuthClient,
  type OAuthResourceAudience,
} from '../../../services/oauth-authorization-server/index.mts'
import { mintNativeSessionMcpToken } from '../../../services/oauth-authorization-server/native-session-tokens.mts'
import { resolveClientIdMetadataDocument } from '../../../services/oauth-authorization-server/client-id-metadata-document.mts'

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
  return (await issueTestOAuthTokensForClient(user, options)).tokens
}

// The same flow, also returning the registered client's public client_id.
export async function issueTestOAuthTokensForClient(
  user: TestUser,
  options?: TestOAuthAuthorizationOptions,
) {
  const approved = await createTestApprovedOAuthAuthorization(user, options)
  const tokens = await exchangeOAuthAuthorizationCode({
    clientId: approved.client.client_id,
    clientSecret: approved.client.client_secret,
    code: approved.code,
    codeVerifier: approved.verifier,
    redirectUri: approved.redirectUri,
  })
  return { clientId: approved.client.client_id, tokens }
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
  const metadata = {
    client_name: `Test ${tokenEndpointAuthMethod} ${randomBytes(6).toString('hex')}`,
    redirect_uris: [redirectUri],
    scope,
    token_endpoint_auth_method: tokenEndpointAuthMethod,
  }
  const client =
    audience === 'admin' ||
    audience === 'legal' ||
    scope
      .split(' ')
      .some(value => value.startsWith('mcp.admin:') || value.startsWith('copyright-notices:'))
      ? await registerTestMetadataClient(metadata)
      : await registerOAuthClient(metadata)
  const verifier = randomBytes(32).toString('base64url')
  const deviceId = uuidv7()
  const sessionId = uuidv7()
  const parameters = {
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
  }
  const validated = await validateOAuthAuthorizationRequest(parameters)
  const request = await beginValidatedOAuthAuthorizationRequest(parameters, validated)
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

// Binds a native MCP grant to an existing native user session, as the native app does.
export async function mintTestNativeSessionMcpGrant(
  user: TestUser,
  session: { id: string; device_id: string },
) {
  return mintNativeSessionMcpToken(user.id, {
    did: session.device_id,
    sid: session.id,
    clientApp: 'ios',
    attestationStatus: 'unattested',
  })
}

export async function registerTestMetadataClient(metadata: {
  client_name: string
  redirect_uris: string[]
  scope: string
  token_endpoint_auth_method: 'none' | 'client_secret_basic'
}): Promise<Awaited<ReturnType<typeof registerOAuthClient>>> {
  const clientId = `https://client.example/${crypto.randomUUID()}/metadata.json`
  const document = {
    ...metadata,
    client_id: clientId,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  }
  const client = await resolveClientIdMetadataDocument(clientId, {
    safeFetch: async () => ({
      body: null,
      headers: new Headers({ 'content-type': 'application/json', 'cache-control': 'max-age=600' }),
      ok: true,
      status: 200,
      url: clientId,
    }),
    readResponseBodyAsBuffer: async () => Buffer.from(JSON.stringify(document)),
  })
  if (!client) throw new Error('metadata client was not created')
  return {
    ...document,
    client_id_issued_at: Math.floor(client.created_at.getTime() / 1000),
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
  }
}
