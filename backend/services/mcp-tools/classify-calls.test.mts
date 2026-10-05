import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ALL_TOOLS } from '@voucha/tools/registry/index'
import type { Tool } from '@services/openai-agents/tool-types'
import type { ApiScope } from '@modules/scopes'
import {
  classifyMcpCalls,
  exceedsMcpAuditBatchLimit,
  MAX_AUDITED_MCP_MESSAGES,
} from './classify-calls.mts'
import { ADMIN_MCP_SERVER_CONFIG } from './config.mts'

const admin = { id: 'admin-id', roles: ['administrator'], membership_plan: null } as const
const READ: ApiScope[] = ['mcp.admin:read']
const READ_WRITE: ApiScope[] = ['mcp.admin:read', 'mcp.admin:write']

function fixtureTool(name: string, meta: Record<string, unknown>, roles?: Record<string, boolean>) {
  return {
    roles,
    schema: {
      name,
      type: 'function',
      parameters: {
        type: 'object',
        properties: { note: { type: 'string' } },
        required: ['note'],
        additionalProperties: false,
      },
      strict: null,
    },
    // Arity 1 keeps the fixture MCP-eligible, so authorization is what's under test.
    function: (_currentUser: unknown) => () => Promise.resolve({ success: true }),
    meta: { surfaces: ['admin_mcp'], api: null, ...meta },
  } as unknown as Tool
}

const FIXTURES = [
  fixtureTool('classify_read', { requiredScopes: { admin_mcp: ['mcp.admin:read'] } }),
  fixtureTool('classify_write', { requiredScopes: { admin_mcp: ['mcp.admin:write'] } }),
  fixtureTool(
    'classify_moderator_only',
    { requiredScopes: { admin_mcp: ['mcp.admin:read'] } },
    { moderator: true },
  ),
  fixtureTool('classify_plus', { plan: 'plus', requiredScopes: { admin_mcp: ['mcp.admin:read'] } }),
  fixtureTool('classify_undeclared', {}),
]

const call = (name: unknown, args?: unknown) => ({
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: { name, ...(args === undefined ? {} : { arguments: args }) },
})
const classify = (body: unknown, scopes: ApiScope[] = READ) =>
  classifyMcpCalls(body, admin, scopes, ADMIN_MCP_SERVER_CONFIG)

describe('classifyMcpCalls', () => {
  beforeAll(() => {
    ;(ALL_TOOLS as Tool[]).push(...FIXTURES)
  })

  afterAll(() => {
    const tools = ALL_TOOLS as Tool[]
    for (const fixture of FIXTURES) tools.splice(tools.indexOf(fixture), 1)
  })

  it.each(['initialize', 'ping', 'notifications/initialized', 'notifications/cancelled'])(
    'accepts the %s method without a tool',
    method => {
      expect(classify({ jsonrpc: '2.0', id: 1, method })).toEqual([
        { jsonrpcMethod: method, toolName: null, outcome: 'accepted' },
      ])
    },
  )

  it('accepts tools/list and flags a malformed one', () => {
    expect(classify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).toEqual([
      { jsonrpcMethod: 'tools/list', toolName: null, outcome: 'accepted' },
    ])
    expect(classify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: 'bad' })).toEqual([
      { jsonrpcMethod: 'tools/list', toolName: null, outcome: 'invalid_request' },
    ])
  })

  it.each([
    ['an unknown method', { jsonrpc: '2.0', id: 1, method: 'sk_live_secret/method' }],
    ['a non-string method', { jsonrpc: '2.0', id: 1, method: 7 }],
    ['a message without a method', { jsonrpc: '2.0', id: 1 }],
    ['a string', 'tools/call'],
    ['null', null],
    ['an empty batch', []],
  ])('records %s as an invalid request with no method', (_name, body) => {
    expect(classify(body)).toEqual([
      { jsonrpcMethod: null, toolName: null, outcome: 'invalid_request' },
    ])
  })

  it('never stores the name of a tool that is not registered', () => {
    expect(classify(call('sk_live_caller_supplied'))).toEqual([
      { jsonrpcMethod: 'tools/call', toolName: null, outcome: 'not_found' },
    ])
  })

  it('omits the registered tool name and rationale while copyright decisions are off', () => {
    expect(
      classifyMcpCalls(
        call('review_copyright_form_intake', {
          id: '00000000-0000-7000-8000-000000000121',
          is_accepted: true,
          rationale: 'Sensitive staff rationale',
        }),
        admin,
        ['copyright-notices:read', 'copyright-notices:write'],
        ADMIN_MCP_SERVER_CONFIG,
        false,
      ),
    ).toEqual([{ jsonrpcMethod: 'tools/call', toolName: null, outcome: 'not_found' }])
  })

  it.each([
    { rationale: '' },
    { rationale: '   ' },
    { rationale: 7 },
    {},
    { rationale: 'Sensitive staff rationale', unknown_argument: 'Sensitive caller input' },
  ])('retains no plaintext rationale when copyright arguments are invalid: %j', fields => {
    const events = classifyMcpCalls(
      call('review_copyright_form_intake', {
        id: '00000000-0000-7000-8000-000000000121',
        is_accepted: true,
        ...fields,
      }),
      admin,
      ['copyright-notices:read', 'copyright-notices:write'],
      ADMIN_MCP_SERVER_CONFIG,
      true,
    )
    expect(events).toEqual([
      {
        jsonrpcMethod: 'tools/call',
        toolName: 'review_copyright_form_intake',
        outcome: 'invalid_arguments',
      },
    ])
  })

  it('records a tools/call without a usable name as an invalid request', () => {
    expect(classify(call(42))).toEqual([
      { jsonrpcMethod: 'tools/call', toolName: null, outcome: 'invalid_request' },
    ])
  })

  it.each([
    ['classify_moderator_only', READ, 'role_denied'],
    ['classify_plus', READ, 'plan_denied'],
    ['classify_undeclared', READ, 'scopes_undeclared'],
    ['classify_write', READ, 'insufficient_scope'],
  ])('records the registered name for %s with %j as %s', (name, scopes, outcome) => {
    expect(classify(call(name, { note: 'x' }), scopes)).toEqual([
      { jsonrpcMethod: 'tools/call', toolName: name, outcome },
    ])
  })

  it('accepts an allowed tool with valid arguments', () => {
    expect(classify(call('classify_write', { note: 'x' }), READ_WRITE)).toEqual([
      { jsonrpcMethod: 'tools/call', toolName: 'classify_write', outcome: 'accepted' },
    ])
  })

  it.each([
    ['a wrong type', { note: 7 }],
    ['a missing field', {}],
    ['an unknown field', { note: 'x', extra: 'y' }],
  ])('flags %s as invalid arguments', (_name, args) => {
    expect(classify(call('classify_read', args))).toEqual([
      { jsonrpcMethod: 'tools/call', toolName: 'classify_read', outcome: 'invalid_arguments' },
    ])
  })

  it('treats omitted arguments as an empty object', () => {
    expect(classify(call('classify_read'))[0]?.outcome).toBe('invalid_arguments')
  })

  it('classifies each message of a batch in order', () => {
    const batch = [
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      call('classify_write', { note: 'x' }),
      call('classify_read', { note: 'x' }),
      'nonsense',
    ]

    expect(classify(batch).map(event => [event.toolName, event.outcome])).toEqual([
      [null, 'accepted'],
      ['classify_write', 'insufficient_scope'],
      ['classify_read', 'accepted'],
      [null, 'invalid_request'],
    ])
  })
})

describe('exceedsMcpAuditBatchLimit', () => {
  it('allows a batch up to the limit and rejects a larger one', () => {
    expect(exceedsMcpAuditBatchLimit(new Array(MAX_AUDITED_MCP_MESSAGES).fill({}))).toBe(false)
    expect(exceedsMcpAuditBatchLimit(new Array(MAX_AUDITED_MCP_MESSAGES + 1).fill({}))).toBe(true)
  })

  it('never limits a single message', () => {
    expect(exceedsMcpAuditBatchLimit({ jsonrpc: '2.0', method: 'ping' })).toBe(false)
  })
})
