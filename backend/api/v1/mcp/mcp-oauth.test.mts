/**
 * OAuth bearer tests for POST /api/v1/mcp.
 *
 * Tokens come from the real authorization-code flow, so these cover the resource binding, the
 * RFC 9728 challenges, and the insufficient_scope step-up end to end.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestMembership, createTestUser, suspendTestUser } from '@voucha/test-helpers'
import { createApiKey } from '@services/api-keys'
import {
  getOAuthResourceMetadataUrl,
  type OAuthTokenResponse,
} from '@services/oauth-authorization-server'
import { issueTestOAuthTokens } from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import type { PrivateUser } from '@services/users/types'

const MCP_LIST_BODY = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }
const USER_METADATA = `resource_metadata="${getOAuthResourceMetadataUrl('user')}"`
const INVALID_TOKEN_CHALLENGE = `Bearer ${USER_METADATA}, error="invalid_token", error_description="The bearer credential is invalid or expired"`

function toolCall(name: string, id = 1, args: Record<string, unknown> = {}) {
  return { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }
}

function postMcp(token: string | null, body: unknown) {
  const request = createRequest().post('/api/v1/mcp').set('Content-Type', 'application/json')
  if (token) request.set('Authorization', `Bearer ${token}`)
  return request.send(body as object)
}

// The MCP SDK reports an McpError thrown by a tool call as a JSON-RPC InvalidRequest error.
function inBandError(message: string, id = 1) {
  return { jsonrpc: '2.0', id, error: { code: -32600, message } }
}

type JsonRpcResponse = {
  error?: unknown
  result?: { content?: Array<{ text?: string }>; isError?: boolean; tools?: unknown[] }
}

describe('POST /api/v1/mcp with OAuth access tokens', () => {
  let user: PrivateUser
  let userTokens: OAuthTokenResponse
  let topicsOnlyTokens: OAuthTokenResponse

  beforeAll(async () => {
    user = await createTestUser()
    userTokens = await issueTestOAuthTokens(user)
    topicsOnlyTokens = await issueTestOAuthTokens(user, { scope: 'topics:read' })
  })

  it('challenges a missing credential with the resource metadata and the audience scopes', async () => {
    const response = await postMcp(null, MCP_LIST_BODY).expect(401)

    expect(response.headers['www-authenticate']).toBe(
      `Bearer ${USER_METADATA}, scope="mcp.user:read mcp.user:write"`,
    )
  })

  it('rejects an unknown access token as invalid_token', async () => {
    const response = await postMcp(`voucha_access_${'0'.repeat(43)}`, MCP_LIST_BODY).expect(401)

    expect(response.headers['www-authenticate']).toBe(INVALID_TOKEN_CHALLENGE)
  })

  it('rejects a token bound to the admin resource', async () => {
    const admin = await createTestUser({ administrator: true })
    const adminTokens = await issueTestOAuthTokens(admin, {
      audience: 'admin',
      scope: 'mcp.admin:read',
    })

    const response = await postMcp(adminTokens.access_token, MCP_LIST_BODY).expect(401)

    expect(response.headers['www-authenticate']).toBe(INVALID_TOKEN_CHALLENGE)
  })

  it('rejects a token whose owner is suspended', async () => {
    const suspended = await createTestUser()
    const tokens = await issueTestOAuthTokens(suspended)
    await suspendTestUser(suspended.id)

    const response = await postMcp(tokens.access_token, MCP_LIST_BODY).expect(401)

    expect(response.headers['www-authenticate']).toBe(INVALID_TOKEN_CHALLENGE)
  })

  it('lists tools for a user-resource token', async () => {
    const response = await postMcp(userTokens.access_token, MCP_LIST_BODY).expect(200)

    const body = response.body as JsonRpcResponse
    expect(body.result?.tools?.length).toBeGreaterThan(0)
  })

  it('asks the client to step up when a single tool call lacks a scope', async () => {
    const response = await postMcp(
      topicsOnlyTokens.access_token,
      toolCall('get_my_profile'),
    ).expect(403)

    expect(response.headers['www-authenticate']).toBe(
      `Bearer ${USER_METADATA}, error="insufficient_scope", error_description="The access token lacks a scope this tool requires", scope="profile:read topics:read"`,
    )
  })

  it('returns an HTTP scope challenge for an under-scoped entity-relation tool call', async () => {
    const plusUser = await createTestUser()
    await createTestMembership({ user_id: plusUser.id, plan: 'plus' })
    const underScoped = await issueTestOAuthTokens(plusUser, { scope: 'topics:read' })
    const response = await postMcp(
      underScoped.access_token,
      toolCall('add_entity_relation', 1, { action: 'add_relation' }),
    ).expect(403)

    expect(response.headers['www-authenticate']).toBe(
      `Bearer ${USER_METADATA}, error="insufficient_scope", error_description="The access token lacks a scope this tool requires", scope="entity-relations:read entity-relations:write topics:read"`,
    )
  })

  it('runs the tool after the client re-authorizes with the step-up scopes', async () => {
    const stepped = await issueTestOAuthTokens(user, { scope: 'profile:read topics:read' })

    const response = await postMcp(stepped.access_token, toolCall('get_my_profile')).expect(200)

    const body = response.body as JsonRpcResponse
    expect(body.error).toBeUndefined()
    expect(body.result?.isError).toBeUndefined()
    expect(JSON.parse(body.result?.content?.[0]?.text ?? '{}')).toMatchObject({ success: true })
  })

  it('hides and refuses financial reads for an umbrella-only credential', async () => {
    const listing = await postMcp(userTokens.access_token, MCP_LIST_BODY).expect(200)
    const tools = (listing.body as { result: { tools: Array<{ name: string }> } }).result.tools
    expect(tools.map(tool => tool.name)).not.toContain('get_my_financial_profile')
    const denied = await postMcp(
      userTokens.access_token,
      toolCall('get_my_financial_profile'),
    ).expect(403)
    expect(denied.headers['www-authenticate']).toContain('financial-profile:read')
    const scoped = await issueTestOAuthTokens(user, { scope: 'financial-profile:read' })
    const allowed = await postMcp(scoped.access_token, toolCall('get_my_financial_profile')).expect(
      200,
    )
    expect((allowed.body as JsonRpcResponse).result?.isError).toBeUndefined()
  })

  it('keeps scope errors in-band for batches, which callMcpTool still enforces', async () => {
    const response = await postMcp(topicsOnlyTokens.access_token, [
      toolCall('get_my_profile', 1),
      toolCall('get_my_profile', 2),
    ]).expect(200)

    expect(response.headers['www-authenticate']).toBeUndefined()
    const scopeError = 'MCP error -32600: Tool requires scopes profile:read: get_my_profile'
    expect(response.body).toEqual([inBandError(scopeError, 1), inBandError(scopeError, 2)])
  })

  it('reports a plan-gated tool in-band instead of asking for more scopes', async () => {
    const readOnly = await issueTestOAuthTokens(user, {
      scope: 'financial-profile:read financial-profile:write',
    })

    const response = await postMcp(
      readOnly.access_token,
      toolCall('update_my_financial_profile'),
    ).expect(200)

    expect(response.headers['www-authenticate']).toBeUndefined()
    expect(response.body).toEqual(
      inBandError('MCP error -32600: Tool requires a higher plan: update_my_financial_profile'),
    )
  })

  it('keeps an under-scoped API key on the in-band JSON-RPC error', async () => {
    const { rawKey } = await createApiKey(user.id, 'mcp', 'Topics MCP Key', ['topics:read'])

    const response = await postMcp(rawKey, toolCall('get_my_profile')).expect(200)

    expect(response.headers['www-authenticate']).toBeUndefined()
    expect(response.body).toEqual(
      inBandError('MCP error -32600: Tool requires scopes profile:read: get_my_profile'),
    )
  })
})
