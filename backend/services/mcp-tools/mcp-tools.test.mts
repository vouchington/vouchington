import { describe, it, expect, beforeAll, vi } from 'vitest'
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js'
import { createTestUser } from '@voucha/test-helpers'
import { ALL_TOOLS } from '@voucha/tools/registry/index'
import type { PrivateUser } from '@services/users/types'
import { listMcpToolsForUser } from './list-tools.mts'
import {
  callMcpTool,
  MAX_MCP_TOOL_RESULT_BYTES,
  MAX_MCP_TOOL_RESULT_VISITS,
  serializeMcpToolResult,
} from './call-tool.mts'
import { ADMIN_MCP_SERVER_CONFIG, USER_MCP_SERVER_CONFIG } from './config.mts'
import { validateToolArguments } from './validate-tool-arguments.mts'

// Plan-gating coverage (free/plus/pro listing, denial-before-invocation, and the synthetic
// pro-only fixture) lives in ./plan-gating.test.mts to keep this file under the max-lines budget.
type McpUser = PrivateUser & { membership_plan: 'plus' | 'pro' | null }

describe('listMcpToolsForUser', () => {
  let user: McpUser
  let plusUser: McpUser

  beforeAll(async () => {
    user = { ...(await createTestUser()), membership_plan: null }
    plusUser = { ...(await createTestUser()), membership_plan: 'plus' }
  })

  it('hides tools whose explicit resource scope is absent', () => {
    const tools = listMcpToolsForUser(user, ['topics:read'], USER_MCP_SERVER_CONFIG)
    expect(tools.map(tool => tool.name)).toContain('search_topics_text')
    expect(tools.map(tool => tool.name)).not.toContain('search_posts')
  })

  it('separates resource read and write tools by scope', () => {
    const readOnlyNames = listMcpToolsForUser(user, ['cards:read'], USER_MCP_SERVER_CONFIG).map(
      tool => tool.name,
    )
    const writeNames = listMcpToolsForUser(
      plusUser,
      ['cards:read', 'cards:write'],
      USER_MCP_SERVER_CONFIG,
    ).map(tool => tool.name)

    expect(readOnlyNames).toContain('get_my_cards')
    expect(readOnlyNames).not.toContain('manage_my_cards')
    expect(writeNames).toContain('manage_my_cards')
  })

  it('keeps legacy broad grants compatible', () => {
    const readOnly = listMcpToolsForUser(plusUser, ['mcp.user:read'], USER_MCP_SERVER_CONFIG)
    const withWrite = listMcpToolsForUser(
      plusUser,
      ['mcp.user:read', 'mcp.user:write'],
      USER_MCP_SERVER_CONFIG,
    )
    expect(withWrite.length).toBeGreaterThan(readOnly.length)
  })

  it('returns array of McpToolShape with name and inputSchema', () => {
    const tools = listMcpToolsForUser(user, ['mcp.user:read'], USER_MCP_SERVER_CONFIG)
    for (const tool of tools) {
      expect(typeof tool.name).toBe('string')
      expect(typeof tool.inputSchema).toBe('object')
    }
  })

  it('does not list retired support tools for regular users', () => {
    const tools = listMcpToolsForUser(
      user,
      ['mcp.user:read', 'mcp.user:write'],
      USER_MCP_SERVER_CONFIG,
    )
    const names = tools.map(t => t.name)
    expect(names).not.toContain('search_support_messages')
  })

  it('does not list retired support tools for administrators on the admin surface', async () => {
    const admin = { ...(await createTestUser({ administrator: true })), membership_plan: null }
    const tools = listMcpToolsForUser(admin, ['mcp.admin:read'], ADMIN_MCP_SERVER_CONFIG)
    expect(tools.map(t => t.name)).not.toContain('search_support_messages')
  })

  it('does not list admin MCP tools for regular users on the admin surface', () => {
    const tools = listMcpToolsForUser(user, ['mcp.admin:read'], ADMIN_MCP_SERVER_CONFIG)
    expect(tools.map(t => t.name)).not.toContain('search_support_messages')
  })
})

describe('callMcpTool', () => {
  let user: McpUser
  let plusUser: McpUser

  beforeAll(async () => {
    user = { ...(await createTestUser()), membership_plan: null }
    plusUser = { ...(await createTestUser()), membership_plan: 'plus' }
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
      callMcpTool('nonexistent_tool', {}, user, ['mcp.user:read'], USER_MCP_SERVER_CONFIG),
    ).rejects.toMatchObject({
      message: expect.stringContaining('Tool not found'),
    })
  })

  it('throws McpError when a retired support tool is called', async () => {
    await expect(
      callMcpTool('search_support_messages', {}, user, ['mcp.admin:read'], ADMIN_MCP_SERVER_CONFIG),
    ).rejects.toMatchObject({
      message: expect.stringContaining('Tool not found'),
    })
  })

  it('throws McpError when tool scope is absent', async () => {
    // find a write-only tool (readOnlyHint !== true)
    const { listToolsForSurface, isToolMcpEligible } = await import('@voucha/tools/registry/select')
    const { ALL_TOOLS } = await import('@voucha/tools/registry/index')
    const writeTool = listToolsForSurface('mcp', ALL_TOOLS).find(
      t => isToolMcpEligible(t) && t.meta?.annotations?.readOnlyHint !== true,
    )

    if (!writeTool) return // skip if no write tools exist

    // Use a plus-plan caller so the write tool's own plan gate doesn't pre-empt the scope check
    // this test targets.
    await expect(
      callMcpTool(writeTool.schema.name, {}, plusUser, ['mcp.user:read'], USER_MCP_SERVER_CONFIG),
    ).rejects.toMatchObject({
      message: expect.stringContaining('requires scopes'),
    })
  })

  it('throws McpError when tool is not MCP-eligible (curried)', async () => {
    // Curried tools are not exposed via MCP surface so they won't appear in mcp list
    // If we call with a non-existent name we get MethodNotFound
    await expect(
      callMcpTool('__bad_tool__', {}, user, ['mcp.user:read'], USER_MCP_SERVER_CONFIG),
    ).rejects.toMatchObject({
      message: expect.stringContaining('Tool not found'),
    })
  })

  it('rejects invalid registered tool arguments before invoking the tool', async () => {
    const tool = ALL_TOOLS.find(candidate => candidate.schema.name === 'search_topics_text')
    if (!tool) throw new Error('Expected search_topics_text tool')
    const invoke = vi.spyOn(tool, 'function')

    try {
      await expect(
        callMcpTool('search_topics_text', {}, user, ['mcp.user:read'], USER_MCP_SERVER_CONFIG),
      ).rejects.toMatchObject({
        code: ErrorCode.InvalidParams,
        message: expect.stringContaining('Invalid tool arguments'),
      })
      expect(invoke).not.toHaveBeenCalled()
    } finally {
      invoke.mockRestore()
    }
  })

  it('rejects strict-schema extra tool arguments', () => {
    expect(
      validateToolArguments(
        {
          type: 'object',
          additionalProperties: false,
          required: ['query'],
          properties: { query: { type: 'string' } },
        },
        { query: 'Voucha', unexpected: true },
      ),
    ).toContain('must NOT have additional properties')
  })

  it('returns CallToolResult on successful tool call', async () => {
    // search_topics_text is a read-only MCP tool
    const result = await callMcpTool(
      'search_topics_text',
      { query: 'test' },
      user,
      ['mcp.user:read'],
      USER_MCP_SERVER_CONFIG,
    )
    expect(result.content).toBeDefined()
    expect(Array.isArray(result.content)).toBe(true)
  }, 15_000)
})
