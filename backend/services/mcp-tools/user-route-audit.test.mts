/**
 * Tool calls on POST /api/v1/mcp: the audit row each call leaves, for an OAuth access token and
 * for a user API key. Fixture tools stand in for production ones so that a tool running, or not
 * running, is observable.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, suspendTestUser } from '@voucha/test-helpers'
import {
  readTestMcpCallAuditEvents,
  readTestMcpCallAuditRowText,
} from '@voucha/test-helpers/entities/mcp-call-audit'
import {
  issueTestUserMcpCredential,
  type UserMcpCredentialKind,
} from '@voucha/test-helpers/mcp-user-credentials'
import { ALL_TOOLS } from '@voucha/tools/registry/index'
import type { Tool } from '@voucha/tools/types'
import type { ApiScope } from '@modules/scopes'
import { createApiKey, revokeApiKey } from '@services/api-keys'
import { issueTestOAuthTokensForClient } from '@services/oauth-authorization-server/test-support'

const READ_TOOL = 'user_audit_fixture_read'
const PROFILE_TOOL = 'user_audit_fixture_profile'
const PLUS_TOOL = 'user_audit_fixture_plus'
const FAIL_TOOL = 'user_audit_fixture_fail'
const PRIVATE_ARGUMENT = 'private-argument-4f9c1e'
const SENSITIVE_RESULT = 'sensitive-result-7b2d80'
const invoked = vi.fn<(name: string, args: unknown) => void>()

function fixtureTool(
  name: string,
  scope: ApiScope,
  options: { plan?: 'plus'; fails?: boolean } = {},
): Tool {
  return {
    roles: { user: true },
    schema: {
      name,
      type: 'function',
      description: 'User MCP audit fixture.',
      parameters: {
        type: 'object',
        properties: { note: { type: 'string' } },
        required: ['note'],
        additionalProperties: false,
      },
      strict: null,
    },
    // Arity 1 keeps the fixture MCP-eligible, so authorization is what's under test.
    function: (_currentUser: unknown) => (args: unknown) => {
      invoked(name, args)
      if (options.fails) throw new Error(`fixture failure ${SENSITIVE_RESULT}`)
      return Promise.resolve({ ok: true, echoed: SENSITIVE_RESULT })
    },
    meta: {
      surfaces: ['mcp'],
      title: name,
      ...(options.plan ? { plan: options.plan } : {}),
      requiredScopes: { mcp: [scope] },
      annotations: { readOnlyHint: true },
      api: null,
    },
  } as unknown as Tool
}

const FIXTURES = [
  fixtureTool(READ_TOOL, 'topics:read'),
  fixtureTool(PROFILE_TOOL, 'profile:read'),
  fixtureTool(PLUS_TOOL, 'topics:read', { plan: 'plus' }),
  fixtureTool(FAIL_TOOL, 'topics:read', { fails: true }),
]

function toolCall(name: string, args: Record<string, unknown>, id = 1) {
  return { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }
}

function postUserMcp(token: string, body: object) {
  return createRequest()
    .post('/api/v1/mcp')
    .set('Content-Type', 'application/json')
    .set('Authorization', `Bearer ${token}`)
    .send(body)
}

type JsonRpcBody = { error?: { code: number; message: string } }

describe('user MCP call audit', () => {
  beforeAll(() => {
    ;(ALL_TOOLS as Tool[]).push(...FIXTURES)
  })

  beforeEach(() => {
    invoked.mockReset()
  })

  afterAll(() => {
    const tools = ALL_TOOLS as Tool[]
    for (const fixture of FIXTURES) tools.splice(tools.indexOf(fixture), 1)
  })

  describe.each<UserMcpCredentialKind>(['oauth', 'api_key'])(
    'POST /api/v1/mcp tool calls with an %s credential',
    kind => {
      it('audits an accepted call under the credential identity without arguments, results or the credential', async () => {
        const { user, token, identity } = await issueTestUserMcpCredential(kind, 'topics:read')

        const response = await postUserMcp(token, toolCall(READ_TOOL, { note: PRIVATE_ARGUMENT }))

        expect(response.status).toBe(200)
        expect(JSON.stringify(response.body)).toContain(SENSITIVE_RESULT)
        expect(invoked).toHaveBeenCalledExactlyOnceWith(READ_TOOL, { note: PRIVATE_ARGUMENT })
        expect(await readTestMcpCallAuditEvents(user.id)).toEqual([
          expect.objectContaining({
            surface: 'mcp',
            correlation_id: response.headers['x-correlation-id'],
            ...identity,
            actor_user_id: user.id,
            occurred_at: expect.any(Date),
            jsonrpc_method: 'tools/call',
            tool_name: READ_TOOL,
            outcome: 'accepted',
          }),
        ])
        for (const text of await readTestMcpCallAuditRowText(user.id)) {
          for (const secret of [PRIVATE_ARGUMENT, SENSITIVE_RESULT, token]) {
            expect(text).not.toContain(secret)
          }
        }
      })

      it('audits a scope denial and never runs the tool', async () => {
        const { user, token } = await issueTestUserMcpCredential(kind, 'topics:read')

        // An OAuth client is asked to step up over HTTP; an API key gets the in-band JSON-RPC error.
        await postUserMcp(token, toolCall(PROFILE_TOOL, { note: PRIVATE_ARGUMENT })).expect(
          kind === 'oauth' ? 403 : 200,
        )

        expect(invoked).not.toHaveBeenCalled()
        expect(await readTestMcpCallAuditEvents(user.id)).toEqual([
          expect.objectContaining({
            tool_name: PROFILE_TOOL,
            outcome: 'insufficient_scope',
          }),
        ])
        expect((await readTestMcpCallAuditRowText(user.id)).join()).not.toContain(PRIVATE_ARGUMENT)
      })

      it('audits a plan denial in-band and never runs the tool', async () => {
        const { user, token } = await issueTestUserMcpCredential(kind, 'topics:read')

        const response = await postUserMcp(token, toolCall(PLUS_TOOL, { note: 'x' })).expect(200)

        expect((response.body as JsonRpcBody).error?.code).toBe(-32600)
        expect(invoked).not.toHaveBeenCalled()
        expect(await readTestMcpCallAuditEvents(user.id)).toEqual([
          expect.objectContaining({ tool_name: PLUS_TOOL, outcome: 'plan_denied' }),
        ])
      })

      it('audits invalid arguments without running the tool or storing them', async () => {
        const { user, token } = await issueTestUserMcpCredential(kind, 'topics:read')

        const response = await postUserMcp(
          token,
          toolCall(READ_TOOL, { note: 7, extra: PRIVATE_ARGUMENT }),
        )

        expect((response.body as JsonRpcBody).error?.code).toBe(-32602)
        expect(invoked).not.toHaveBeenCalled()
        expect(await readTestMcpCallAuditEvents(user.id)).toEqual([
          expect.objectContaining({ tool_name: READ_TOOL, outcome: 'invalid_arguments' }),
        ])
        expect((await readTestMcpCallAuditRowText(user.id)).join()).not.toContain(PRIVATE_ARGUMENT)
      })

      it('follows an accepted call that then fails with a tool_error row on the same correlation id', async () => {
        const { user, token } = await issueTestUserMcpCredential(kind, 'topics:read')

        const response = await postUserMcp(token, toolCall(FAIL_TOOL, { note: 'x' }))

        expect(response.status).toBe(200)
        const events = await readTestMcpCallAuditEvents(user.id)
        expect(events.map(event => [event.tool_name, event.outcome])).toEqual([
          [FAIL_TOOL, 'accepted'],
          [FAIL_TOOL, 'tool_error'],
        ])
        expect(new Set(events.map(event => event.correlation_id))).toEqual(
          new Set([response.headers['x-correlation-id']]),
        )
        expect((await readTestMcpCallAuditRowText(user.id)).join()).not.toContain(SENSITIVE_RESULT)
      })

      it('audits each message of a batch in order under one correlation id', async () => {
        const { user, token } = await issueTestUserMcpCredential(kind, 'topics:read')

        const response = await postUserMcp(token, [
          { jsonrpc: '2.0', id: 1, method: 'tools/list' },
          toolCall(READ_TOOL, { note: 'x' }, 2),
          toolCall('not_a_registered_tool', {}, 3),
        ]).expect(200)

        expect(response.body).toHaveLength(3)
        const events = await readTestMcpCallAuditEvents(user.id)
        expect(events.map(event => [event.jsonrpc_method, event.tool_name, event.outcome])).toEqual(
          [
            ['tools/list', null, 'accepted'],
            ['tools/call', READ_TOOL, 'accepted'],
            ['tools/call', null, 'not_found'],
          ],
        )
        expect(new Set(events.map(event => event.correlation_id))).toEqual(
          new Set([response.headers['x-correlation-id']]),
        )
      })

      it('rejects an oversized batch with 413 and one audit row', async () => {
        const { user, token } = await issueTestUserMcpCredential(kind, 'topics:read')
        const batch = Array.from({ length: 26 }, (_, index) =>
          toolCall(READ_TOOL, { note: 'x' }, index),
        )

        await postUserMcp(token, batch).expect(413)

        expect(invoked).not.toHaveBeenCalled()
        expect(await readTestMcpCallAuditEvents(user.id)).toEqual([
          expect.objectContaining({ jsonrpc_method: null, outcome: 'invalid_request' }),
        ])
      })
    },
  )

  describe('POST /api/v1/mcp with a rejected credential', () => {
    it('writes no audit row for a revoked API key', async () => {
      const user = await createTestUser()
      const { apiKey, rawKey } = await createApiKey(user.id, 'mcp', 'Revoked key', ['topics:read'])
      await revokeApiKey(user.id, apiKey.id)

      await postUserMcp(rawKey, toolCall(READ_TOOL, { note: 'x' })).expect(401)

      expect(invoked).not.toHaveBeenCalled()
      await expect(readTestMcpCallAuditEvents(user.id)).resolves.toEqual([])
    })

    it('writes no audit row for an access token whose owner is suspended', async () => {
      const user = await createTestUser()
      const { tokens } = await issueTestOAuthTokensForClient(user, { scope: 'topics:read' })
      await suspendTestUser(user.id)

      await postUserMcp(tokens.access_token, toolCall(READ_TOOL, { note: 'x' })).expect(401)

      expect(invoked).not.toHaveBeenCalled()
      await expect(readTestMcpCallAuditEvents(user.id)).resolves.toEqual([])
    })
  })
})
