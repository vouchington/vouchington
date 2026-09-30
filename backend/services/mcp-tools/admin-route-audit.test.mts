/**
 * Tool calls on POST /api/v1/admin/mcp: which admin tokens may invoke which tools, and the audit
 * row each call leaves. No production tool is on the admin_mcp surface yet, so fixtures stand in.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import {
  readTestMcpCallAuditEvents,
  readTestMcpCallAuditRowText,
} from '@voucha/test-helpers/entities/mcp-call-audit'
import { ALL_TOOLS } from '@voucha/tools/registry/index'
import type { Tool } from '@voucha/tools/types'
import { issueTestOAuthTokensForClient } from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import type { PrivateUser } from '@services/users/types'

const READ_TOOL = 'admin_audit_fixture_read'
const WRITE_TOOL = 'admin_audit_fixture_write'
const FAIL_TOOL = 'admin_audit_fixture_fail'
const PRIVATE_ARGUMENT = 'private-argument-4f9c1e'
const SENSITIVE_RESULT = 'sensitive-result-7b2d80'
const invoked = vi.fn<(name: string, args: unknown) => void>()

function fixtureTool(name: string, scope: string, readOnly: boolean, fails = false): Tool {
  return {
    roles: { administrator: true },
    schema: {
      name,
      type: 'function',
      description: 'Admin MCP audit fixture.',
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
      if (fails) throw new Error(`fixture failure ${SENSITIVE_RESULT}`)
      return Promise.resolve({ ok: true, echoed: SENSITIVE_RESULT })
    },
    meta: {
      surfaces: ['admin_mcp'],
      title: name,
      requiredScopes: { admin_mcp: [scope] },
      annotations: readOnly
        ? { readOnlyHint: true }
        : { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      api: null,
    },
  } as unknown as Tool
}

const FIXTURES = [
  fixtureTool(READ_TOOL, 'mcp.admin:read', true),
  fixtureTool(WRITE_TOOL, 'mcp.admin:write', false),
  fixtureTool(FAIL_TOOL, 'mcp.admin:read', true, true),
]

function toolCall(name: string, args: Record<string, unknown>, id = 1) {
  return { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }
}

function postAdminMcp(token: string, body: object) {
  return createRequest()
    .post('/api/v1/admin/mcp')
    .set('Content-Type', 'application/json')
    .set('Authorization', `Bearer ${token}`)
    .send(body)
}

async function issueAdmin(scope: string) {
  const user: PrivateUser = await createTestUser({ administrator: true })
  const { clientId, tokens } = await issueTestOAuthTokensForClient(user, {
    audience: 'admin',
    scope,
  })
  return { user, clientId, token: tokens.access_token }
}

type JsonRpcBody = { error?: { code: number; message: string }; result?: { tools?: unknown[] } }

describe('POST /api/v1/admin/mcp tool calls', () => {
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

  it('lists only the fixture tools the token scopes allow', async () => {
    const readOnly = await issueAdmin('mcp.admin:read')
    const readWrite = await issueAdmin('mcp.admin:read mcp.admin:write')
    const names = async (token: string) => {
      const response = await postAdminMcp(token, { jsonrpc: '2.0', id: 1, method: 'tools/list' })
      const tools = (response.body as { result: { tools: Array<{ name: string }> } }).result.tools
      return tools.map(tool => tool.name).sort()
    }

    expect(await names(readOnly.token)).toEqual([FAIL_TOOL, READ_TOOL])
    expect(await names(readWrite.token)).toEqual([FAIL_TOOL, READ_TOOL, WRITE_TOOL])
  })

  it('invokes an allowed tool and audits the registered tool name without arguments or results', async () => {
    const { user, clientId, token } = await issueAdmin('mcp.admin:read')

    const response = await postAdminMcp(token, toolCall(READ_TOOL, { note: PRIVATE_ARGUMENT }))

    expect(response.status).toBe(200)
    expect(JSON.stringify(response.body)).toContain(SENSITIVE_RESULT)
    expect(invoked).toHaveBeenCalledExactlyOnceWith(READ_TOOL, { note: PRIVATE_ARGUMENT })
    expect(await readTestMcpCallAuditEvents(user.id)).toEqual([
      expect.objectContaining({
        correlation_id: response.headers['x-correlation-id'],
        oauth_client_id: clientId,
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

  it('answers a read-only token calling a write tool with a scope challenge and never runs it', async () => {
    const { user, token } = await issueAdmin('mcp.admin:read')

    const response = await postAdminMcp(token, toolCall(WRITE_TOOL, { note: PRIVATE_ARGUMENT }))

    expect(response.status).toBe(403)
    expect(response.headers['www-authenticate']).toContain('error="insufficient_scope"')
    expect(response.headers['www-authenticate']).toContain('scope="mcp.admin:read mcp.admin:write"')
    expect(invoked).not.toHaveBeenCalled()
    expect(await readTestMcpCallAuditEvents(user.id)).toEqual([
      expect.objectContaining({
        jsonrpc_method: 'tools/call',
        tool_name: WRITE_TOOL,
        outcome: 'insufficient_scope',
      }),
    ])
  })

  it('lets a read-write token call the write tool', async () => {
    const { user, token } = await issueAdmin('mcp.admin:read mcp.admin:write')

    await postAdminMcp(token, toolCall(WRITE_TOOL, { note: 'ok' })).expect(200)

    expect(invoked).toHaveBeenCalledExactlyOnceWith(WRITE_TOOL, { note: 'ok' })
    expect(await readTestMcpCallAuditEvents(user.id)).toEqual([
      expect.objectContaining({ tool_name: WRITE_TOOL, outcome: 'accepted' }),
    ])
  })

  it('audits an unknown tool without storing the caller-supplied name', async () => {
    const { user, token } = await issueAdmin('mcp.admin:read')
    const suppliedName = 'sk_live_caller_supplied_name'

    const response = await postAdminMcp(token, toolCall(suppliedName, {}))

    expect((response.body as JsonRpcBody).error?.code).toBe(-32601)
    expect(await readTestMcpCallAuditEvents(user.id)).toEqual([
      expect.objectContaining({
        jsonrpc_method: 'tools/call',
        tool_name: null,
        outcome: 'not_found',
      }),
    ])
    expect((await readTestMcpCallAuditRowText(user.id)).join()).not.toContain(suppliedName)
  })

  it('audits invalid arguments without running the tool or storing them', async () => {
    const { user, token } = await issueAdmin('mcp.admin:read')

    const response = await postAdminMcp(
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
    const { user, token } = await issueAdmin('mcp.admin:read')

    const response = await postAdminMcp(token, toolCall(FAIL_TOOL, { note: 'x' }))

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

  it('gives concurrent calls their own correlation ids and rows', async () => {
    const { user, token } = await issueAdmin('mcp.admin:read')

    const responses = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        postAdminMcp(token, toolCall(READ_TOOL, { note: `n${index}` }, index + 1)),
      ),
    )

    const headerIds = responses.map(response => response.headers['x-correlation-id'] as string)
    expect(new Set(headerIds).size).toBe(8)
    const events = await readTestMcpCallAuditEvents(user.id)
    expect(events.map(event => event.correlation_id).sort()).toEqual([...headerIds].sort())
    expect(events.every(event => event.outcome === 'accepted')).toBe(true)
  })

  it('audits a malformed body as invalid_request', async () => {
    const { user, token } = await issueAdmin('mcp.admin:read')

    await createRequest()
      .post('/api/v1/admin/mcp')
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${token}`)
      .send('{"jsonrpc":')
      .expect(400)

    expect(await readTestMcpCallAuditEvents(user.id)).toEqual([
      expect.objectContaining({
        jsonrpc_method: null,
        tool_name: null,
        outcome: 'invalid_request',
      }),
    ])
  })

  it('audits each message of a batch in order under one correlation id', async () => {
    const { user, token } = await issueAdmin('mcp.admin:read')

    const response = await postAdminMcp(token, [
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      toolCall(READ_TOOL, { note: 'x' }, 2),
      toolCall('not_a_registered_tool', {}, 3),
    ]).expect(200)

    expect(response.body).toHaveLength(3)
    const events = await readTestMcpCallAuditEvents(user.id)
    expect(events.map(event => [event.jsonrpc_method, event.tool_name, event.outcome])).toEqual([
      ['tools/list', null, 'accepted'],
      ['tools/call', READ_TOOL, 'accepted'],
      ['tools/call', null, 'not_found'],
    ])
    expect(new Set(events.map(event => event.correlation_id))).toEqual(
      new Set([response.headers['x-correlation-id']]),
    )
  })

  it('rejects an oversized batch with 413 and one audit row', async () => {
    const { user, token } = await issueAdmin('mcp.admin:read')
    const batch = Array.from({ length: 26 }, (_, index) =>
      toolCall(READ_TOOL, { note: 'x' }, index),
    )

    await postAdminMcp(token, batch).expect(413)

    expect(invoked).not.toHaveBeenCalled()
    expect(await readTestMcpCallAuditEvents(user.id)).toEqual([
      expect.objectContaining({ jsonrpc_method: null, outcome: 'invalid_request' }),
    ])
  })
})
