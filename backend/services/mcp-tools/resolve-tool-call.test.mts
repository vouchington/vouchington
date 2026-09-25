import { beforeAll, describe, expect, it, vi } from 'vitest'
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js'
import { createTestUser } from '@voucha/test-helpers'
import { ALL_TOOLS } from '@voucha/tools/registry/index'
import type { Tool } from '@voucha/tools/types'
import type { PrivateUser } from '@services/users/types'
import { callMcpTool } from './call-tool.mts'
import { USER_MCP_SERVER_CONFIG } from './config.mts'
import { listMcpToolsForUser } from './list-tools.mts'
import { authorizeMcpTool } from './resolve-tool-call.mts'

type McpUser = PrivateUser & { membership_plan: 'plus' | 'pro' | null }

function fixtureTool(
  name: string,
  meta: Record<string, unknown>,
  roles?: Record<string, boolean>,
): Tool {
  return {
    roles,
    schema: {
      name,
      type: 'function',
      parameters: { type: 'object', properties: {}, required: [] },
      strict: null,
    },
    // Arity 1 keeps the fixture MCP-eligible, so authorization is what's under test.
    function: (_currentUser: unknown) => () => Promise.resolve({ success: true }),
    meta: { surfaces: ['mcp'], api: null, ...meta },
  } as unknown as Tool
}

describe('authorizeMcpTool', () => {
  let user: McpUser

  beforeAll(async () => {
    user = { ...(await createTestUser()), membership_plan: null }
  })

  it('checks role, then plan, then scopes', () => {
    const staffPlusTool = fixtureTool(
      'staff_plus_fixture',
      { plan: 'plus', requiredScopes: { mcp: ['cards:write'] } },
      { administrator: true },
    )
    const plusTool = fixtureTool('plus_fixture', {
      plan: 'plus',
      requiredScopes: { mcp: ['cards:write'] },
    })
    const scopedTool = fixtureTool('scoped_fixture', { requiredScopes: { mcp: ['cards:write'] } })

    const authorize = (tool: Tool, scopes: Parameters<typeof authorizeMcpTool>[2]) =>
      authorizeMcpTool(tool, user, scopes, USER_MCP_SERVER_CONFIG)

    expect(authorize(staffPlusTool, [])).toEqual({ status: 'role_denied' })
    expect(authorize(plusTool, [])).toEqual({ status: 'plan_denied' })
    expect(authorize(scopedTool, ['cards:read'])).toEqual({
      status: 'insufficient_scope',
      requiredScopes: ['cards:write'],
    })
    expect(authorize(scopedTool, ['mcp.user:write'])).toEqual({
      status: 'allowed',
      tool: scopedTool,
    })
  })

  it('refuses a tool without declared scopes for listing and calling', async () => {
    const undeclared = fixtureTool('undeclared_scopes_fixture', {})
    const invoke = vi.spyOn(undeclared, 'function')
    const mutableTools = ALL_TOOLS as Tool[]
    mutableTools.push(undeclared)
    try {
      const names = listMcpToolsForUser(user, ['mcp.user:read'], USER_MCP_SERVER_CONFIG).map(
        tool => tool.name,
      )
      expect(names).not.toContain('undeclared_scopes_fixture')

      await expect(
        callMcpTool(
          'undeclared_scopes_fixture',
          {},
          user,
          ['mcp.user:read'],
          USER_MCP_SERVER_CONFIG,
        ),
      ).rejects.toMatchObject({
        code: ErrorCode.InvalidRequest,
        message: expect.stringContaining('Tool requires scopes unavailable'),
      })
      expect(invoke).not.toHaveBeenCalled()
    } finally {
      mutableTools.splice(mutableTools.indexOf(undeclared), 1)
      invoke.mockRestore()
    }
  })
})
