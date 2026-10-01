import { describe, expect, it } from 'vitest'
import { ALL_TOOLS } from '@voucha/tools/registry/index'
import { listMcpToolsForUser } from './list-tools.mts'
import { resolveMcpToolCall } from './resolve-tool-call.mts'
import { ADMIN_MCP_SERVER_CONFIG, USER_MCP_SERVER_CONFIG } from './config.mts'
import { SCOPE_DEFINITIONS, type ApiScope } from '@modules/scopes'
const admin = { id: 'admin-tools-contract', roles: ['administrator'], membership_plan: null }
const allScopes = Object.keys(SCOPE_DEFINITIONS).filter(
  scope => SCOPE_DEFINITIONS[scope as ApiScope].audience === 'admin',
) as ApiScope[]

describe('admin tool authorization contract', () => {
  it('keeps every new staff tool off user MCP and denies non-administrators', () => {
    const userNames = new Set(
      listMcpToolsForUser(admin, allScopes, USER_MCP_SERVER_CONFIG).map(tool => tool.name),
    )
    const tools = ALL_TOOLS.filter(
      tool => tool.meta?.surfaces.length === 1 && tool.meta.surfaces[0] === 'admin_mcp',
    )
    for (const tool of tools) {
      expect(userNames.has(tool.schema.name)).toBe(false)
      expect(
        resolveMcpToolCall(
          tool.schema.name,
          { ...admin, roles: ['staff'] },
          allScopes,
          ADMIN_MCP_SERVER_CONFIG,
        ).status,
      ).toBe('role_denied')
      expect(tool.meta?.outputSchema).toMatchObject({ type: 'object' })
    }
  })
  it.each([
    ['approve_appeal_response', 'moderation:approve', 'moderation:write'],
    ['pause_queue', 'site-operations:queues', 'site-operations:read'],
    ['suspend_user', 'account-enforcement:suspend', 'account-enforcement:write'],
    ['get_ai_costs', 'analytics:read', 'mcp.admin:read'],
  ] as const)('hides and denies %s until its exact grant is present', (name, exact, broad) => {
    expect(resolveMcpToolCall(name, admin, [broad], ADMIN_MCP_SERVER_CONFIG).status).toBe(
      'insufficient_scope',
    )
    expect(
      listMcpToolsForUser(admin, [broad], ADMIN_MCP_SERVER_CONFIG).some(tool => tool.name === name),
    ).toBe(false)
    expect(resolveMcpToolCall(name, admin, [exact], ADMIN_MCP_SERVER_CONFIG).status).toBe('allowed')
    expect(
      listMcpToolsForUser(admin, [exact], ADMIN_MCP_SERVER_CONFIG).some(tool => tool.name === name),
    ).toBe(true)
  })
  it('advertises only the successful topic import contract', () => {
    const tool = ALL_TOOLS.find(tool => tool.schema.name === 'import_topics')!
    expect(tool.meta?.outputSchema).toMatchObject({
      type: 'object',
      required: ['valid', 'batch'],
      properties: {
        valid: { const: true },
        batch: { required: ['id', 'import_type', 'total_rows', 'created_at'] },
      },
    })
  })
})
