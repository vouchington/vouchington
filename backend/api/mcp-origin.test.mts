/**
 * Request-origin tests for both MCP routes: tool handlers run in the MCP origin of the bearer
 * credential, so the content they write records `mcp` and, for OAuth, the issuing client.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { ALL_TOOLS } from '@voucha/tools/registry/index'
import type { Tool } from '@voucha/tools/types'
import { getOptionalRequestOrigin } from '@modules/request-client-info'
import { getRequestContentProvenance } from '@modules/request-client-info/content-provenance'
import { createApiKey } from '@services/api-keys'
import {
  exchangeOAuthAuthorizationCode,
  getOAuthClient,
} from '@services/oauth-authorization-server'
import { createTestApprovedOAuthAuthorization } from '@services/oauth-authorization-server/test-support'
import type { PrivateUser } from '@services/users/types'

const FIXTURE_NAME = 'request_origin_fixture'
// Arity 1 (currentUser) keeps the fixture MCP-eligible. It reports what a writer would see.
const fixture = {
  schema: {
    name: FIXTURE_NAME,
    type: 'function',
    parameters: { type: 'object', properties: {}, required: [] },
    strict: null,
  },
  function: (_currentUser: unknown) => () =>
    Promise.resolve({
      origin: getOptionalRequestOrigin(),
      provenance: getRequestContentProvenance(),
    }),
  meta: {
    surfaces: ['mcp', 'admin_mcp'],
    requiredScopes: { mcp: ['topics:read'], admin_mcp: ['mcp.admin:read'] },
    api: null,
  },
} as unknown as Tool

const ROUTES = [
  { path: '/api/v1/mcp', audience: 'user', scope: 'topics:read' },
  { path: '/api/v1/admin/mcp', audience: 'admin', scope: 'mcp.admin:read' },
] as const

async function callFixture(path: string, token: string) {
  const response = await createRequest()
    .post(path)
    .set('Content-Type', 'application/json')
    .set('Authorization', `Bearer ${token}`)
    .send({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: FIXTURE_NAME, arguments: {} },
    })
    .expect(200)
  const body = response.body as { result?: { content?: Array<{ text?: string }> } }
  return JSON.parse(body.result?.content?.[0]?.text ?? '{}') as Record<string, unknown>
}

describe.each(ROUTES)('POST $path request origin', ({ path, audience, scope }) => {
  let admin: PrivateUser
  const mutableTools = ALL_TOOLS as Tool[]

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
  })

  beforeEach(() => {
    mutableTools.push(fixture)
  })

  afterEach(() => {
    mutableTools.splice(mutableTools.indexOf(fixture), 1)
  })

  it('records the OAuth client that the access token was issued to', async () => {
    const approved = await createTestApprovedOAuthAuthorization(admin, { audience, scope })
    const tokens = await exchangeOAuthAuthorizationCode({
      clientId: approved.client.client_id,
      code: approved.code,
      codeVerifier: approved.verifier,
      redirectUri: approved.redirectUri,
    })
    const client = await getOAuthClient(approved.client.client_id)

    await expect(callFixture(path, tokens.access_token)).resolves.toEqual({
      origin: { interface: 'mcp', credential: 'oauth', client: null, oauthClientId: client!.id },
      provenance: { createdVia: 'mcp', oauthClientId: client!.id },
    })
  })

  it('records an MCP API key without an OAuth client', async () => {
    const { rawKey } = await createApiKey(admin.id, 'mcp', 'Origin MCP Key', [scope])

    await expect(callFixture(path, rawKey)).resolves.toEqual({
      origin: { interface: 'mcp', credential: 'api_key', client: null, oauthClientId: null },
      provenance: { createdVia: 'mcp', oauthClientId: null },
    })
  })
})
