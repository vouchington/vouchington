import { describe, it, expect, beforeAll } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { listMcpToolsForUser } from './list-tools.mts'
import {
  callMcpTool,
  MAX_MCP_TOOL_RESULT_BYTES,
  MAX_MCP_TOOL_RESULT_VISITS,
  serializeMcpToolResult,
} from './call-tool.mts'
import { handleMcpHttpRequest } from './handle-request.mts'
import { ADMIN_MCP_SERVER_CONFIG, USER_MCP_SERVER_CONFIG } from './config.mts'

type McpUser = PrivateUser & { membership_plan: 'plus' | 'pro' | null }

describe('listMcpToolsForUser', () => {
  let user: McpUser

  beforeAll(async () => {
    user = { ...(await createTestUser()), membership_plan: null }
  })

  it('returns only read-only tools when permissions has no write', () => {
    const tools = listMcpToolsForUser(user, ['mcp-tools:read'], USER_MCP_SERVER_CONFIG)
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint).toBe(true)
    }
    expect(tools.length).toBeGreaterThan(0)
  })

  it('includes write tools when permissions includes mcp-tools:write', () => {
    const readOnly = listMcpToolsForUser(user, ['mcp-tools:read'], USER_MCP_SERVER_CONFIG)
    const withWrite = listMcpToolsForUser(
      user,
      ['mcp-tools:read', 'mcp-tools:write'],
      USER_MCP_SERVER_CONFIG,
    )
    expect(withWrite.length).toBeGreaterThanOrEqual(readOnly.length)
  })

  it('returns array of McpToolShape with name and inputSchema', () => {
    const tools = listMcpToolsForUser(user, ['mcp-tools:read'], USER_MCP_SERVER_CONFIG)
    for (const tool of tools) {
      expect(typeof tool.name).toBe('string')
      expect(typeof tool.inputSchema).toBe('object')
    }
  })

  it('excludes staff-only tools for regular users', () => {
    const tools = listMcpToolsForUser(
      user,
      ['mcp-tools:read', 'mcp-tools:write'],
      USER_MCP_SERVER_CONFIG,
    )
    const names = tools.map(t => t.name)
    // Staff-restricted tools like search_support_messages should not appear
    expect(names).not.toContain('search_support_messages')
  })

  it('lists admin MCP tools for administrators on the admin surface', async () => {
    const admin = { ...(await createTestUser({ administrator: true })), membership_plan: null }
    const tools = listMcpToolsForUser(admin, ['mcp-admin-tools:read'], ADMIN_MCP_SERVER_CONFIG)
    expect(tools.map(t => t.name)).toContain('search_support_messages')
  })

  it('does not list admin MCP tools for regular users on the admin surface', () => {
    const tools = listMcpToolsForUser(user, ['mcp-admin-tools:read'], ADMIN_MCP_SERVER_CONFIG)
    expect(tools.map(t => t.name)).not.toContain('search_support_messages')
  })
})

describe('callMcpTool', () => {
  let user: McpUser

  beforeAll(async () => {
    user = { ...(await createTestUser()), membership_plan: null }
  })

  it('rejects serialized tool results over the MCP response limit', () => {
    expect(() =>
      serializeMcpToolResult({ value: 'x'.repeat(MAX_MCP_TOOL_RESULT_BYTES + 1) }),
    ).toThrow('MCP response limit')
  })

  it('bounds traversal when object properties serialize to no output', () => {
    const value = Object.fromEntries(
      Array.from({ length: MAX_MCP_TOOL_RESULT_VISITS }, (_, index) => [index, undefined]),
    )

    expect(() => serializeMcpToolResult(value)).toThrow('MCP response traversal limit')
  })

  it('counts inherited enumerable properties against the traversal budget', () => {
    const prototype = Object.fromEntries(
      Array.from({ length: MAX_MCP_TOOL_RESULT_VISITS }, (_, index) => [index, undefined]),
    )

    expect(() => serializeMcpToolResult(Object.create(prototype))).toThrow(
      'MCP response traversal limit',
    )
  })

  it('preserves JSON serialization for bounded tool results', () => {
    expect(serializeMcpToolResult({ value: ['test', null, true] })).toBe(
      JSON.stringify({ value: ['test', null, true] }),
    )
  })

  it('matches JSON.stringify semantics for supported edge cases', () => {
    const inherited = Object.assign(Object.create({ ignored: true }), { own: 'value' })
    const value = {
      array: [undefined, () => undefined, Symbol('ignored'), Number.POSITIVE_INFINITY],
      inherited,
      omitted: undefined,
      text: '😊',
      nested: {
        toJSON(key: string) {
          return { key, value: true }
        },
      },
    }

    expect(serializeMcpToolResult(value)).toBe(JSON.stringify(value))
  })

  it('rejects unsupported top-level and recursive values', () => {
    expect(() => serializeMcpToolResult(undefined)).toThrow('not JSON serializable')
    expect(() => serializeMcpToolResult(1n)).toThrow('BigInt')

    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(() => serializeMcpToolResult(circular)).toThrow('circular structure')
  })

  it('throws McpError when tool is not found', async () => {
    await expect(
      callMcpTool('nonexistent_tool', {}, user, ['mcp-tools:read'], USER_MCP_SERVER_CONFIG),
    ).rejects.toMatchObject({
      message: expect.stringContaining('Tool not found'),
    })
  })

  it('throws McpError when user does not have the required role for the tool', async () => {
    // search_support_messages is admin-MCP eligible but restricted to administrator/customer_support
    await expect(
      callMcpTool(
        'search_support_messages',
        {},
        user,
        ['mcp-admin-tools:read'],
        ADMIN_MCP_SERVER_CONFIG,
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining('Tool not allowed for your role'),
    })
  })

  it('throws McpError when tool requires write permission but only read is granted', async () => {
    // find a write-only tool (readOnlyHint !== true)
    const { listToolsForSurface, isToolMcpEligible } = await import('@voucha/tools/registry/select')
    const { ALL_TOOLS } = await import('@voucha/tools/registry/index')
    const writeTool = listToolsForSurface('mcp', ALL_TOOLS).find(
      t => isToolMcpEligible(t) && t.meta?.annotations?.readOnlyHint !== true,
    )

    if (!writeTool) return // skip if no write tools exist

    await expect(
      callMcpTool(writeTool.schema.name, {}, user, ['mcp-tools:read'], USER_MCP_SERVER_CONFIG),
    ).rejects.toMatchObject({
      message: expect.stringContaining('mcp-tools:write'),
    })
  })

  it('throws McpError when tool is not MCP-eligible (curried)', async () => {
    // Curried tools are not exposed via MCP surface so they won't appear in mcp list
    // If we call with a non-existent name we get MethodNotFound
    await expect(
      callMcpTool('__bad_tool__', {}, user, ['mcp-tools:read'], USER_MCP_SERVER_CONFIG),
    ).rejects.toMatchObject({
      message: expect.stringContaining('Tool not found'),
    })
  })

  it('returns CallToolResult on successful tool call', async () => {
    // search_topics_text is a read-only MCP tool
    const result = await callMcpTool(
      'search_topics_text',
      { query: 'test' },
      user,
      ['mcp-tools:read'],
      USER_MCP_SERVER_CONFIG,
    )
    expect(result.content).toBeDefined()
    expect(Array.isArray(result.content)).toBe(true)
  }, 15_000)
})

describe('handleMcpHttpRequest', () => {
  let user: McpUser

  beforeAll(async () => {
    user = { ...(await createTestUser()), membership_plan: null }
  })

  it('returns a Response for tools/list request', async () => {
    const body = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }
    const request = new Request('http://localhost/api/v1/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify(body),
    })

    const response = await handleMcpHttpRequest({
      user,
      permissions: ['mcp-tools:read'],
      request,
      parsedBody: body,
      config: USER_MCP_SERVER_CONFIG,
    })

    expect(response.status).toBe(200)
    const json = (await response.json()) as { result?: { tools?: unknown[] } }
    expect(Array.isArray(json.result?.tools)).toBe(true)
  })

  it('returns a Response for tools/call request', async () => {
    const body = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'search_topics_text', arguments: { query: 'hello' } },
    }
    const request = new Request('http://localhost/api/v1/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify(body),
    })

    const response = await handleMcpHttpRequest({
      user,
      permissions: ['mcp-tools:read'],
      request,
      parsedBody: body,
      config: USER_MCP_SERVER_CONFIG,
    })

    expect(response.status).toBe(200)
  }, 15_000)
})
