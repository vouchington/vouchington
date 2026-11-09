/**
 * Tests for POST /api/v1/admin/mcp
 *
 * The admin MCP endpoint is OAuth-only: an admin-resource access token, an eligible staff role and
 * an admin-audience scope. API keys never authenticate here, and every call of a verified OAuth
 * principal writes an audit row.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { setTestApiKeyPermissions } from '@voucha/test-helpers/entities/api-keys'
import { readTestMcpCallAuditEvents } from '@voucha/test-helpers/entities/mcp-call-audit'
import { setTestOAuthAccessTokenScopes } from '@voucha/test-helpers/entities/oauth-access-token-scopes'
import { removeTestUserRole } from '@voucha/test-helpers/entities/user-role-removal'
import { suspendTestUser, unsuspendTestUser } from '@voucha/test-helpers/entities/users'
import { createApiKey } from '@services/api-keys'
import { SCOPE_DEFINITIONS, type ApiScope } from '@modules/scopes'
import { createVerifiedMfaTestSession } from '@voucha/test-helpers/authenticated-session'
import {
  createTestPendingOAuthAuthorization,
  issueTestOAuthTokensForClient,
} from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import {
  getOAuthResourceUrl,
  decideOAuthAuthorizationRequest,
  exchangeOAuthAuthorizationCode,
} from '@services/oauth-authorization-server'
import type { PrivateUser } from '@services/users/types'

const MCP_LIST_BODY = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }
const MCP_INITIALIZED_NOTIFICATION = {
  jsonrpc: '2.0',
  method: 'notifications/initialized',
  params: {},
}
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const allAdminScopes = (Object.keys(SCOPE_DEFINITIONS) as ApiScope[]).filter(
  scope => SCOPE_DEFINITIONS[scope].audience === 'admin',
)

function postAdminMcp(token: string | null, body: object = MCP_LIST_BODY, scheme = 'Bearer') {
  const request = createRequest().post('/api/v1/admin/mcp').set('Content-Type', 'application/json')
  if (token) request.set('Authorization', `${scheme} ${token}`)
  return request.send(body)
}

async function issueAdminToken(user: PrivateUser, scope = 'mcp.admin:read') {
  const { clientId, tokens } = await issueTestOAuthTokensForClient(user, {
    audience: 'admin',
    scope,
  })
  return { clientId, token: tokens.access_token }
}

async function issueMfaAdminToken(user: PrivateUser, scope: string) {
  const pending = await createTestPendingOAuthAuthorization(user, { audience: 'admin', scope })
  const assuredSession = await createVerifiedMfaTestSession(user.id)
  const decision = await decideOAuthAuthorizationRequest(
    user.id,
    pending.requestId,
    'approve',
    pending.bindingHash,
    assuredSession.sessionToken.payload.mfa_at,
  )
  const code = new URL(decision.redirect_uri).searchParams.get('code')
  if (!code) throw new Error('authorization code was not returned')
  const tokens = await exchangeOAuthAuthorizationCode({
    clientId: pending.client.client_id,
    clientSecret: pending.client.client_secret,
    code,
    codeVerifier: pending.verifier,
    redirectUri: pending.redirectUri,
  })
  return tokens.access_token
}

describe('POST /api/v1/admin/mcp', () => {
  let admin: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
  })

  it('returns 415 when Content-Type is not application/json', async () => {
    await createRequest()
      .post('/api/v1/admin/mcp')
      .set('Content-Type', 'text/plain')
      .set('Authorization', 'Bearer voucha_access_unused')
      .send('hello')
      .expect(415)
  })

  it('returns 401 without writing an audit row when Authorization is missing', async () => {
    const other = await createTestUser({ administrator: true })

    await postAdminMcp(null).expect(401)

    await expect(readTestMcpCallAuditEvents(other.id)).resolves.toEqual([])
  })

  describe('API keys', () => {
    it('returns 401 for a user MCP API key owned by an administrator', async () => {
      const owner = await createTestUser({ administrator: true })
      const { rawKey } = await createApiKey(owner.id, 'mcp', 'User MCP Key', ['mcp.user:read'])

      const response = await postAdminMcp(rawKey).expect(401)

      expect(response.headers['www-authenticate']).toContain('error="invalid_token"')
      await expect(readTestMcpCallAuditEvents(owner.id)).resolves.toEqual([])
    })

    it('returns 401 for a key whose stored scopes were tampered into the admin audience', async () => {
      const owner = await createTestUser({ administrator: true })
      const { apiKey, rawKey } = await createApiKey(owner.id, 'mcp', 'Tampered MCP Key', [
        'mcp.user:read',
      ])
      await setTestApiKeyPermissions(apiKey.id, ['mcp.admin:read', 'mcp.admin:write'])

      await postAdminMcp(rawKey).expect(401)

      await expect(readTestMcpCallAuditEvents(owner.id)).resolves.toEqual([])
    })

    it('cannot create an admin-scoped MCP API key at all', async () => {
      await expect(
        createApiKey(admin.id, 'mcp', 'Admin MCP Key', ['mcp.admin:read']),
      ).rejects.toThrow('scope is not supported for API keys')
    })
  })

  describe('OAuth access tokens', () => {
    it('admits moderators to report tools without exposing other admin tools', async () => {
      const moderator = await createTestUser({ extraRoles: ['moderator'] })
      const token = await issueMfaAdminToken(moderator, allAdminScopes.join(' '))

      const response = await postAdminMcp(token).expect(200)
      const tools = (response.body as { result?: { tools?: Array<{ name?: string }> } }).result
        ?.tools
      const names = tools?.map(tool => tool.name) ?? []

      expect(names).toEqual(
        expect.arrayContaining([
          'list_moderation_reports',
          'read_moderation_report',
          'resolve_moderation_report',
          'rerun_report_judgement',
        ]),
      )
      expect(names).not.toContain('read_crawler')
      expect(names).not.toContain('read_user_moderation')
      expect(names).not.toContain('set_user_suspension')
    })

    it('allows suspended moderators only the report reads admitted by REST', async () => {
      const moderator = await createTestUser({ extraRoles: ['moderator'] })
      const token = await issueMfaAdminToken(moderator, 'moderation:read')
      await suspendTestUser(moderator.id)

      try {
        const response = await postAdminMcp(token).expect(200)
        const tools = (response.body as { result?: { tools?: Array<{ name?: string }> } }).result
          ?.tools
        const names = tools?.map(tool => tool.name) ?? []

        expect(names).toEqual(
          expect.arrayContaining(['list_moderation_reports', 'read_moderation_report']),
        )
        expect(names).not.toContain('resolve_moderation_report')
        expect(names).not.toContain('rerun_report_judgement')
      } finally {
        await unsuspendTestUser(moderator.id)
      }
    })

    it('lists tools for an admin token and audits the call with a correlation id', async () => {
      const owner = await createTestUser({ administrator: true })
      const { clientId, token } = await issueAdminToken(owner)

      const response = await postAdminMcp(token).expect(200)

      const body = response.body as { result?: { tools?: Array<{ name?: string }> } }
      expect(body.result?.tools?.map(tool => tool.name)).not.toContain('search_support_messages')
      const correlationId = response.headers['x-correlation-id']
      expect(correlationId).toMatch(UUID_PATTERN)
      expect(await readTestMcpCallAuditEvents(owner.id)).toEqual([
        {
          audience: 'admin',
          correlation_id: correlationId,
          actor_user_id: owner.id,
          oauth_client_id: clientId,
          api_key_id: null,
          resource: getOAuthResourceUrl('admin'),
          jsonrpc_method: 'tools/list',
          tool_name: null,
          outcome: 'accepted',
          occurred_at: expect.any(Date),
        },
      ])
    })

    it('accepts a case-insensitive bearer authorization scheme', async () => {
      const { token } = await issueAdminToken(admin)

      await postAdminMcp(token, MCP_LIST_BODY, 'bearer').expect(200)
    })

    it('returns 202 with no response body for MCP notifications and audits them', async () => {
      const owner = await createTestUser({ administrator: true })
      const { token } = await issueAdminToken(owner)

      const response = await postAdminMcp(token, MCP_INITIALIZED_NOTIFICATION).expect(202)

      expect(response.text).toBe('')
      expect(response.headers['content-type']).toBeUndefined()
      expect(await readTestMcpCallAuditEvents(owner.id)).toEqual([
        expect.objectContaining({
          jsonrpc_method: 'notifications/initialized',
          outcome: 'accepted',
        }),
      ])
    })

    it('returns 403 and audits role_denied once the token owner loses the administrator role', async () => {
      const owner = await createTestUser({ administrator: true })
      const { clientId, token } = await issueAdminToken(owner)
      await removeTestUserRole(owner.id, 'administrator')

      const response = await postAdminMcp(token).expect(403)

      expect(await readTestMcpCallAuditEvents(owner.id)).toEqual([
        expect.objectContaining({
          correlation_id: response.headers['x-correlation-id'],
          oauth_client_id: clientId,
          jsonrpc_method: null,
          outcome: 'role_denied',
        }),
      ])
    })

    it('returns a 403 scope challenge and audits a token without admin-audience scopes', async () => {
      const owner = await createTestUser({ administrator: true })
      const { token } = await issueAdminToken(owner)
      await setTestOAuthAccessTokenScopes(token, ['topics:read'])

      const response = await postAdminMcp(token).expect(403)

      expect(response.headers['www-authenticate']).toContain('error="insufficient_scope"')
      expect(response.headers['www-authenticate']).toContain('scope="mcp.admin:read"')
      expect(await readTestMcpCallAuditEvents(owner.id)).toEqual([
        expect.objectContaining({ jsonrpc_method: null, outcome: 'insufficient_scope' }),
      ])
    })

    it('rejects a user-audience scope on an admin-resource token', async () => {
      const owner = await createTestUser({ administrator: true })
      const { token } = await issueAdminToken(owner)
      await setTestOAuthAccessTokenScopes(token, ['mcp.user:read'])

      await postAdminMcp(token).expect(403)

      expect(await readTestMcpCallAuditEvents(owner.id)).toEqual([
        expect.objectContaining({ outcome: 'insufficient_scope' }),
      ])
    })
  })

  it('returns 405 for GET /api/v1/admin/mcp', async () => {
    const response = await createRequest().get('/api/v1/admin/mcp').expect(405)
    expect(response.headers['allow']).toContain('POST')
  })

  it('returns 405 for DELETE /api/v1/admin/mcp', async () => {
    const response = await createRequest().delete('/api/v1/admin/mcp').expect(405)
    expect(response.headers['allow']).toContain('POST')
  })
})
