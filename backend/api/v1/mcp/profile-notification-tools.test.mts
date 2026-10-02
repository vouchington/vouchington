/**
 * The profile, notification and preference write tools over POST /api/v1/mcp: the scopes a
 * credential needs, the plan, the result a client receives and the audit row each call leaves.
 */
import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestMembership, createTestUser } from '@voucha/test-helpers'
import {
  readTestMcpCallAuditEvents,
  readTestMcpCallAuditRowText,
} from '@voucha/test-helpers/entities/mcp-call-audit'
import { issueTestOAuthTokensForClient } from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import { createApiKey } from '@services/api-keys'
import { getProfile } from '@services/my/profile'
import { getEmailPreferences } from '@services/users'
import type { ApiScope } from '@modules/scopes'

type Kind = 'oauth' | 'api_key'

const BIO = 'A bio only the audit must never learn: 91c4e7'

async function issueCredential(kind: Kind, scopes: readonly ApiScope[], plan: 'plus' | null) {
  const user = await createTestUser()
  if (plan) await createTestMembership({ user_id: user.id, plan })
  if (kind === 'oauth') {
    const { clientId, tokens } = await issueTestOAuthTokensForClient(user, {
      scope: scopes.join(' '),
    })
    return {
      user,
      token: tokens.access_token,
      identity: { oauth_client_id: clientId, api_key_id: null },
    }
  }
  const { apiKey, rawKey } = await createApiKey(user.id, 'mcp', 'Profile tools key', [...scopes])
  return { user, token: rawKey, identity: { oauth_client_id: null, api_key_id: apiKey.id } }
}

function callTool(token: string, name: string, args: Record<string, unknown>) {
  return createRequest()
    .post('/api/v1/mcp')
    .set('Content-Type', 'application/json')
    .set('Authorization', `Bearer ${token}`)
    .send({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })
}

type ToolCallBody = {
  result?: { isError?: boolean; structuredContent?: unknown }
  error?: { code: number; message: string }
}

describe.each<Kind>(['oauth', 'api_key'])(
  'profile and preference tools over MCP HTTP with %s',
  kind => {
    it('writes the bio under the exact grants and audits it without the argument or credential', async () => {
      const { user, token, identity } = await issueCredential(
        kind,
        ['profile:read', 'profile:write'],
        'plus',
      )

      const response = await callTool(token, 'update_my_bio', { markdown: BIO }).expect(200)

      const body = response.body as ToolCallBody
      expect(body.result?.isError).toBeUndefined()
      expect(body.result?.structuredContent).toEqual({
        success: true,
        profile: { id: user.id, markdown: BIO },
      })
      expect(await getProfile(user.id)).toEqual({ id: user.id, markdown: BIO })
      expect(await readTestMcpCallAuditEvents(user.id)).toEqual([
        expect.objectContaining({
          ...identity,
          actor_user_id: user.id,
          jsonrpc_method: 'tools/call',
          tool_name: 'update_my_bio',
          outcome: 'accepted',
        }),
      ])
      for (const text of await readTestMcpCallAuditRowText(user.id)) {
        expect(text).not.toContain(BIO)
        expect(text).not.toContain(token)
      }
    })

    it('refuses a read-only grant, leaves the bio and audits the denial', async () => {
      const { user, token } = await issueCredential(kind, ['profile:read'], 'plus')

      await callTool(token, 'update_my_bio', { markdown: BIO }).expect(kind === 'oauth' ? 403 : 200)

      expect(await getProfile(user.id)).toEqual({ id: user.id, markdown: '' })
      expect(await readTestMcpCallAuditEvents(user.id)).toEqual([
        expect.objectContaining({ tool_name: 'update_my_bio', outcome: 'insufficient_scope' }),
      ])
    })

    it('refuses a free plan in-band, leaves the bio and audits the denial', async () => {
      const { user, token } = await issueCredential(kind, ['profile:read', 'profile:write'], null)

      const response = await callTool(token, 'update_my_bio', { markdown: BIO }).expect(200)

      expect((response.body as ToolCallBody).error?.code).toBe(-32600)
      expect(await getProfile(user.id)).toEqual({ id: user.id, markdown: '' })
      expect(await readTestMcpCallAuditEvents(user.id)).toEqual([
        expect.objectContaining({ tool_name: 'update_my_bio', outcome: 'plan_denied' }),
      ])
    })

    it('changes email preferences under the preferences grants and not under the profile ones', async () => {
      const granted = await issueCredential(kind, ['preferences:read', 'preferences:write'], 'plus')
      const wrong = await issueCredential(kind, ['profile:read', 'profile:write'], 'plus')
      const before = await getEmailPreferences(wrong.user.id)

      const response = await callTool(granted.token, 'update_my_email_preferences', {
        news_digest_frequency: 'weekly',
      }).expect(200)
      await callTool(wrong.token, 'update_my_email_preferences', {
        news_digest_frequency: 'weekly',
      }).expect(kind === 'oauth' ? 403 : 200)

      expect((response.body as ToolCallBody).result?.structuredContent).toMatchObject({
        success: true,
        email_preferences: { news_digest_frequency: 'weekly' },
      })
      expect(await getEmailPreferences(wrong.user.id)).toEqual(before)
    })
  },
)
