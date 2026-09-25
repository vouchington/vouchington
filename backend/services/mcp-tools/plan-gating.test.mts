import { describe, it, expect, beforeAll, vi } from 'vitest'
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js'
import { createTestUser } from '@voucha/test-helpers'
import { ALL_TOOLS } from '@voucha/tools/registry/index'
import type { Tool } from '@voucha/tools/types'
import type { ApiScope } from '@modules/scopes'
import type { PrivateUser } from '@services/users/types'
import { listMcpToolsForUser } from './list-tools.mts'
import { callMcpTool } from './call-tool.mts'
import { USER_MCP_SERVER_CONFIG } from './config.mts'

type McpUser = PrivateUser & { membership_plan: 'plus' | 'pro' | null }

// Every mutating tool currently exposed on the user mcp surface. Kept in sync with the
// `plan: 'plus'` metadata on each tool and the registry invariant in
// backend/tools/registry/registry.test.mts ('every user-mcp mutating tool declares a plus or
// pro plan').
const PLUS_GATED_WRITE_TOOL_NAMES = [
  'manage_my_cards',
  'manage_my_point_valuations',
  'manage_my_rewards_statuses',
  'manage_my_spending',
  'update_my_financial_profile',
]

// Union of every scope required by the tools above, so a listing call is never denied by the
// scope check first — this file is only exercising the plan gate.
const PLUS_GATED_WRITE_SCOPES: ApiScope[] = [
  'cards:read',
  'cards:write',
  'point-valuations:read',
  'point-valuations:write',
  'rewards-statuses:read',
  'rewards-statuses:write',
  'spending:read',
  'spending:write',
  'financial-profile:read',
  'financial-profile:write',
]

describe('user-mcp write tool plan gating', () => {
  let user: McpUser
  let plusUser: McpUser
  let proUser: McpUser

  beforeAll(async () => {
    user = { ...(await createTestUser()), membership_plan: null }
    plusUser = { ...(await createTestUser()), membership_plan: 'plus' }
    proUser = { ...(await createTestUser()), membership_plan: 'pro' }
  })

  it('hides plus-gated write tools from free users but lists them for plus and pro users', () => {
    const freeNames = listMcpToolsForUser(
      user,
      PLUS_GATED_WRITE_SCOPES,
      USER_MCP_SERVER_CONFIG,
    ).map(tool => tool.name)
    const plusNames = listMcpToolsForUser(
      plusUser,
      PLUS_GATED_WRITE_SCOPES,
      USER_MCP_SERVER_CONFIG,
    ).map(tool => tool.name)
    const proNames = listMcpToolsForUser(
      proUser,
      PLUS_GATED_WRITE_SCOPES,
      USER_MCP_SERVER_CONFIG,
    ).map(tool => tool.name)

    // Positive control: proves listMcpToolsForUser(user, ...) itself still returns tools for a
    // free user, so the `not.toContain` assertions below are the plan gate excluding the write
    // tools specifically, not the whole listing call coming back empty for an unrelated reason.
    expect(freeNames).toContain('get_my_cards')

    for (const name of PLUS_GATED_WRITE_TOOL_NAMES) {
      expect(freeNames).not.toContain(name)
      expect(plusNames).toContain(name)
      expect(proNames).toContain(name)
    }
  })

  it('throws McpError requiring a higher plan before checking scopes or invoking a plus-gated tool', async () => {
    const tool = ALL_TOOLS.find(candidate => candidate.schema.name === 'manage_my_cards')
    if (!tool) throw new Error('Expected manage_my_cards tool')
    const invoke = vi.spyOn(tool, 'function')

    try {
      // Free user, but WITH the tool's required scopes — proves the plan gate denies the call on
      // its own, before the scope check ever runs (call-tool.mts checks plan before scopes).
      await expect(
        callMcpTool(
          'manage_my_cards',
          {},
          user,
          ['cards:read', 'cards:write'],
          USER_MCP_SERVER_CONFIG,
        ),
      ).rejects.toMatchObject({
        code: ErrorCode.InvalidRequest,
        message: expect.stringContaining('requires a higher plan'),
      })
      expect(invoke).not.toHaveBeenCalled()
    } finally {
      invoke.mockRestore()
    }
  })
})

describe('pro plan gating (synthetic fixture)', () => {
  // No production tool currently requires `plan: 'pro'`. This registers a synthetic tool
  // directly into the shared ALL_TOOLS registry for the duration of one test, to prove
  // `listMcpToolsForUser`/`callMcpTool` correctly distinguish 'pro' from 'plus' rather than only
  // testing the 'free' vs 'plus' boundary that the real tools happen to exercise. The fixture is
  // pushed/spliced in place and restored in `finally` (the same pattern `mcp-tools.test.mts` uses
  // for spying on a registered tool's `function`) rather than via `vi.mock`, since backend-vitest
  // reserves module mocking for external provider boundaries, and a mock would leak into every
  // test in this file.
  const fixtureName = 'pro_only_write_fixture'
  let plusUser: McpUser
  let proUser: McpUser

  beforeAll(async () => {
    plusUser = { ...(await createTestUser()), membership_plan: 'plus' }
    proUser = { ...(await createTestUser()), membership_plan: 'pro' }
  })

  it('lists a pro-gated write tool for pro users, not plus users, and denies plus calls before invocation', async () => {
    const fixture: Tool = {
      schema: {
        name: fixtureName,
        type: 'function',
        parameters: { type: 'object', properties: {}, required: [] },
        strict: null,
      },
      // Arity 1 (currentUser) => (args) => ...: matches isToolMcpEligible's arity check, so the
      // fixture is not silently dropped as "curried" before the plan check ever runs.
      function: (_currentUser: unknown) => () => Promise.resolve({ success: true }),
      meta: {
        surfaces: ['mcp'],
        plan: 'pro',
        // Reuses a real user-audience scope so getToolRequiredScopes resolves it; both test users
        // are granted this scope below so the plan is what's under test, not the scope check.
        requiredScopes: { mcp: ['cards:read'] },
        annotations: { destructiveHint: true },
        api: null,
      },
    } as unknown as Tool
    const invoke = vi.spyOn(fixture, 'function')

    const mutableTools = ALL_TOOLS as Tool[]
    mutableTools.push(fixture)
    try {
      const plusNames = listMcpToolsForUser(plusUser, ['cards:read'], USER_MCP_SERVER_CONFIG).map(
        tool => tool.name,
      )
      const proNames = listMcpToolsForUser(proUser, ['cards:read'], USER_MCP_SERVER_CONFIG).map(
        tool => tool.name,
      )

      expect(plusNames).not.toContain(fixtureName)
      expect(proNames).toContain(fixtureName) // positive control: proves the exclusion above is
      // the plan check working, not the fixture being unreachable for every plan.

      await expect(
        callMcpTool(fixtureName, {}, plusUser, ['cards:read'], USER_MCP_SERVER_CONFIG),
      ).rejects.toMatchObject({
        code: ErrorCode.InvalidRequest,
        message: expect.stringContaining('requires a higher plan'),
      })
      expect(invoke).not.toHaveBeenCalled()

      const result = await callMcpTool(
        fixtureName,
        {},
        proUser,
        ['cards:read'],
        USER_MCP_SERVER_CONFIG,
      )
      expect(result.content).toBeDefined()
      expect(invoke).toHaveBeenCalledTimes(1)
    } finally {
      const index = mutableTools.indexOf(fixture)
      if (index !== -1) mutableTools.splice(index, 1)
      invoke.mockRestore()
    }
  })
})
