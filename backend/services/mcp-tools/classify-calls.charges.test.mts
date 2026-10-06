import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ALL_TOOLS } from '@voucha/tools/registry/index'
import type { Tool, ToolApiEndpoint } from '@services/openai-agents/tool-types'
import type { ApiScope } from '@modules/scopes'
import { planMcpCalls } from './classify-calls.mts'
import { ADMIN_MCP_SERVER_CONFIG } from './config.mts'

const admin = { id: 'admin-id', roles: ['administrator'], membership_plan: null } as const
const SCOPES: ApiScope[] = ['mcp.admin:read']
const REMOVE: ToolApiEndpoint = { method: 'DELETE', path: '/api/v1/things/:id' }

function fixtureTool(name: string, meta: Record<string, unknown>) {
  return {
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
    // Arity 1 keeps the fixture MCP-eligible, so the planned charge is what's under test.
    function: (_currentUser: unknown) => () => Promise.resolve({ success: true }),
    meta: {
      surfaces: ['admin_mcp'],
      requiredScopes: { admin_mcp: ['mcp.admin:read'] },
      api: null,
      ...meta,
    },
  } as unknown as Tool
}

const FIXTURES = [
  fixtureTool('charge_no_twin', {}),
  fixtureTool('charge_one_route', { api: [{ method: 'POST', path: '/api/v1/things' }] }),
  // The admin and user spellings of a path parameter name one bucket, and a repeat is charged once.
  fixtureTool('charge_each_route', {
    api: [
      { method: 'PATCH', path: '/api/v1/things/{id}' },
      { method: 'PATCH', path: '/api/v1/things/:id' },
      { method: 'GET', path: '/api/v1/other' },
    ],
  }),
  fixtureTool('charge_selected_route', {
    api: [{ method: 'POST', path: '/api/v1/things' }, REMOVE],
    selectApi: (args: Record<string, unknown>) => (args.note === 'remove' ? [REMOVE] : []),
  }),
  fixtureTool('charge_write_only', {
    requiredScopes: { admin_mcp: ['mcp.admin:write'] },
    api: [{ method: 'POST', path: '/api/v1/things' }],
  }),
]

const call = (name: unknown, args?: unknown, id: unknown = 1) => ({
  jsonrpc: '2.0',
  id,
  method: 'tools/call',
  params: { name, ...(args === undefined ? {} : { arguments: args }) },
})
const plan = (body: unknown) => planMcpCalls(body, admin, SCOPES, ADMIN_MCP_SERVER_CONFIG)

describe('planMcpCalls charges', () => {
  beforeAll(() => {
    ;(ALL_TOOLS as Tool[]).push(...FIXTURES)
  })

  afterAll(() => {
    const tools = ALL_TOOLS as Tool[]
    for (const fixture of FIXTURES) tools.splice(tools.indexOf(fixture), 1)
  })

  it('charges an allowed call to its REST route under its request id and event row', () => {
    const batch = [
      { jsonrpc: '2.0', id: 'listing', method: 'tools/list' },
      call('charge_one_route', { note: 'x' }, 'call-1'),
    ]

    expect(plan(batch).charges).toEqual([
      { eventIndex: 1, requestId: 'call-1', routeKeys: ['POST:/api/v1/things'] },
    ])
  })

  it('charges each listed route once, under one key for both parameter spellings', () => {
    expect(plan(call('charge_each_route', { note: 'x' })).charges).toEqual([
      { eventIndex: 0, requestId: 1, routeKeys: ['PATCH:/api/v1/things/:id', 'GET:/api/v1/other'] },
    ])
  })

  it('charges only the routes the arguments of a tool with a selector exercise', () => {
    expect(plan(call('charge_selected_route', { note: 'remove' })).charges).toEqual([
      { eventIndex: 0, requestId: 1, routeKeys: ['DELETE:/api/v1/things/:id'] },
    ])
    expect(plan(call('charge_selected_route', { note: 'keep' })).charges).toEqual([])
  })

  it('charges one entry per call of a batch', () => {
    const batch = [1, 2, 3].map(id => call('charge_one_route', { note: 'x' }, id))

    expect(plan(batch).charges.map(({ eventIndex, requestId }) => [eventIndex, requestId])).toEqual(
      [
        [0, 1],
        [1, 2],
        [2, 3],
      ],
    )
  })

  it.each([
    ['a tool without a REST twin', call('charge_no_twin', { note: 'x' })],
    ['invalid arguments', call('charge_one_route', { note: 7 })],
    ['a call the scopes deny', call('charge_write_only', { note: 'x' })],
    ['an unknown tool', call('not_a_tool', { note: 'x' })],
    ['a notification', { ...call('charge_one_route', { note: 'x' }), id: undefined }],
    ['a fractional request id', call('charge_one_route', { note: 'x' }, 1.5)],
    ['a null request id', call('charge_one_route', { note: 'x' }, null)],
    ['a message that is not a tool call', { jsonrpc: '2.0', id: 1, method: 'ping' }],
  ])('charges nothing for %s', (_name, body) => {
    expect(plan(body).charges).toEqual([])
  })
})
