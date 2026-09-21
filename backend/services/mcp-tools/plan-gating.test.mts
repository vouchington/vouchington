import { beforeAll, describe, expect, it, vi } from 'vitest'
import { ALL_TOOLS } from '@voucha/tools/registry/index'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { callMcpTool } from './call-tool.mts'
import { USER_MCP_SERVER_CONFIG } from './config.mts'
import { listMcpToolsForUser } from './list-tools.mts'

type McpUser = PrivateUser & { membership_plan: 'plus' | 'pro' | null }

const USER_MCP_MUTATION_NAMES = [
  'manage_my_cards',
  'manage_my_point_valuations',
  'manage_my_rewards_statuses',
  'manage_my_spending',
  'update_my_financial_profile',
]

const USER_MCP_WRITE_SCOPES = ['mcp.user:read', 'mcp.user:write'] as const

describe('user MCP plan gating', () => {
  let user: McpUser

  beforeAll(async () => {
    user = { ...(await createTestUser()), membership_plan: null }
  })

  it('hides every mutation from free callers while retaining authorized reads', () => {
    const names = listMcpToolsForUser(user, USER_MCP_WRITE_SCOPES, USER_MCP_SERVER_CONFIG).map(
      tool => tool.name,
    )

    expect(names).toContain('get_my_cards')
    expect(names.filter(name => USER_MCP_MUTATION_NAMES.includes(name))).toEqual([])
  })

  it.each(['plus', 'pro'] as const)('lists every mutation for %s callers', plan => {
    const names = listMcpToolsForUser(
      { ...user, membership_plan: plan },
      USER_MCP_WRITE_SCOPES,
      USER_MCP_SERVER_CONFIG,
    ).map(tool => tool.name)

    expect(names).toEqual(expect.arrayContaining(USER_MCP_MUTATION_NAMES))
  })

  it('denies a direct free mutation call before the function executes', async () => {
    const tool = ALL_TOOLS.find(tool => tool.schema.name === 'manage_my_cards')
    if (tool == null) throw new Error('manage_my_cards must be registered')
    const functionSpy = vi.spyOn(tool, 'function')

    try {
      await expect(
        callMcpTool(
          tool.schema.name,
          { action: 'add', card_id: 'not-used-when-denied' },
          user,
          USER_MCP_WRITE_SCOPES,
          USER_MCP_SERVER_CONFIG,
        ),
      ).rejects.toMatchObject({ message: expect.stringContaining('requires a higher plan') })
      expect(functionSpy).not.toHaveBeenCalled()
    } finally {
      functionSpy.mockRestore()
    }
  })
})
