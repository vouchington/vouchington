/**
 * OAuth bearer tests for POST /api/v1/admin/mcp.
 *
 * Admin-resource tokens are only issued to administrators, and the route accepts only tokens bound
 * to the admin resource. Revoked, expired and wrong-resource tokens are rejected by the existing
 * OAuth validation before any audit row could name them.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { readTestMcpCallAuditEvents } from '@voucha/test-helpers/entities/mcp-call-audit'
import {
  revokeTestOAuthGrant,
  setTestOAuthArtifactExpiry,
} from '@voucha/test-helpers/entities/oauth-authorization-server'
import { getOAuthResourceMetadataUrl, revokeOAuthToken } from '@services/oauth-authorization-server'
import {
  issueTestOAuthTokens,
  issueTestOAuthTokensForClient,
} from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import type { PrivateUser } from '@services/users/types'

const MCP_LIST_BODY = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }
const ADMIN_METADATA = `resource_metadata="${getOAuthResourceMetadataUrl('admin')}"`
const INVALID_TOKEN_CHALLENGE = `Bearer ${ADMIN_METADATA}, error="invalid_token", error_description="The bearer credential is invalid or expired"`

function postAdminMcp(token: string | null, body: object = MCP_LIST_BODY) {
  const request = createRequest().post('/api/v1/admin/mcp').set('Content-Type', 'application/json')
  if (token) request.set('Authorization', `Bearer ${token}`)
  return request.send(body)
}

describe('POST /api/v1/admin/mcp with OAuth access tokens', () => {
  let admin: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
  })

  it('challenges a missing credential with the admin resource metadata and scopes', async () => {
    const response = await postAdminMcp(null).expect(401)

    expect(response.headers['www-authenticate']).toBe(
      `Bearer ${ADMIN_METADATA}, scope="mcp.admin:read mcp.admin:write"`,
    )
  })

  it('rejects a token bound to the user resource', async () => {
    const owner = await createTestUser({ administrator: true })
    const userTokens = await issueTestOAuthTokens(owner)

    const response = await postAdminMcp(userTokens.access_token).expect(401)

    expect(response.headers['www-authenticate']).toBe(INVALID_TOKEN_CHALLENGE)
    await expect(readTestMcpCallAuditEvents(owner.id)).resolves.toEqual([])
  })

  it('lists admin tools for an admin-resource token', async () => {
    const adminTokens = await issueTestOAuthTokens(admin, {
      audience: 'admin',
      scope: 'mcp.admin:read',
    })

    const response = await postAdminMcp(adminTokens.access_token).expect(200)

    const body = response.body as { result?: { tools?: Array<{ name?: string }> } }
    expect(body.result?.tools).toBeDefined()
    expect(body.result?.tools?.map(tool => tool.name)).not.toContain('search_support_messages')
  })

  it('hides sensitive tools and challenges an umbrella-only call, then runs with the exact grant', async () => {
    const owner = await createTestUser({ administrator: true })
    const umbrella = await issueTestOAuthTokens(owner, {
      audience: 'admin',
      scope: 'mcp.admin:read',
    })
    const listed = await postAdminMcp(umbrella.access_token).expect(200)
    expect(listed.body.result.tools.map((tool: { name: string }) => tool.name)).not.toContain(
      'list_copyright_review_queue',
    )
    const call = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'list_copyright_review_queue', arguments: { limit: 1 } },
    }
    const denied = await postAdminMcp(umbrella.access_token, call).expect(403)
    expect(denied.headers['www-authenticate']).toContain('copyright-notices:read')
    const exact = await issueTestOAuthTokens(owner, {
      audience: 'admin',
      scope: 'copyright-notices:read',
    })
    const allowed = await postAdminMcp(exact.access_token, call).expect(200)
    expect(allowed.body.result.isError).not.toBe(true)
    expect(allowed.body.result.structuredContent).toMatchObject({
      copyright_notices: expect.any(Array),
      page_info: expect.any(Object),
    })
  })

  it('returns a typed domain guard error after valid exact-scope authorization', async () => {
    const owner = await createTestUser({ administrator: true })
    const tokens = await issueTestOAuthTokens(owner, {
      audience: 'admin',
      scope: 'copyright-notices:read',
    })
    const response = await postAdminMcp(tokens.access_token, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'get_copyright_notice', arguments: { id: crypto.randomUUID() } },
    }).expect(200)
    expect(response.body.result.isError).toBe(true)
    expect(JSON.parse(response.body.result.content[0].text)).toMatchObject({
      error: { status: 404, code: 'NOT_FOUND', retryable: false },
    })
  })

  it('rejects a revoked access token and writes no row for the rejected call', async () => {
    const owner = await createTestUser({ administrator: true })
    const { clientId, tokens } = await issueTestOAuthTokensForClient(owner, {
      audience: 'admin',
      scope: 'mcp.admin:read',
    })
    await postAdminMcp(tokens.access_token).expect(200)
    await revokeOAuthToken({ clientId, token: tokens.access_token })

    const response = await postAdminMcp(tokens.access_token).expect(401)

    expect(response.headers['www-authenticate']).toBe(INVALID_TOKEN_CHALLENGE)
    await expect(readTestMcpCallAuditEvents(owner.id)).resolves.toHaveLength(1)
  })

  it('rejects an access token once its grant is revoked', async () => {
    const owner = await createTestUser({ administrator: true })
    const { clientId, tokens } = await issueTestOAuthTokensForClient(owner, {
      audience: 'admin',
      scope: 'mcp.admin:read',
    })
    await revokeTestOAuthGrant(clientId)

    await postAdminMcp(tokens.access_token).expect(401)

    await expect(readTestMcpCallAuditEvents(owner.id)).resolves.toEqual([])
  })

  it('rejects an expired access token', async () => {
    const owner = await createTestUser({ administrator: true })
    const { clientId, tokens } = await issueTestOAuthTokensForClient(owner, {
      audience: 'admin',
      scope: 'mcp.admin:read',
    })
    await setTestOAuthArtifactExpiry(clientId, new Date(Date.now() - 1000))

    await postAdminMcp(tokens.access_token).expect(401)

    await expect(readTestMcpCallAuditEvents(owner.id)).resolves.toEqual([])
  })
})
