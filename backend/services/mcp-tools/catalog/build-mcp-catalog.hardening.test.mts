import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { SCOPE_DEFINITIONS, type ApiScope } from '@modules/scopes'
import { ALL_TOOLS } from '@voucha/mcp/registry/index'
import { USER_MCP_SERVER_CONFIG, ADMIN_MCP_SERVER_CONFIG } from '../config.mts'
import { listMcpToolsForUser } from '../list-tools.mts'

const moderationScopes: ApiScope[] = ['community-moderation:read', 'community-moderation:write']
const allScopes = Object.keys(SCOPE_DEFINITIONS) as ApiScope[]
const nonModerationScopes = allScopes.filter(
  scope => SCOPE_DEFINITIONS[scope].audience === 'user' && !moderationScopes.includes(scope),
)
const plus = { id: 'moderation-grant-budget', roles: [], membership_plan: 'plus' as const }
const names = [
  'read_community_moderation',
  'add_community_moderation',
  'update_community_moderation',
  'remove_community_moderation',
]
// Pin listings with the approved community participation options.
const PLUS_WITHOUT_MODERATION_DIGEST =
  '3ff4ea5e81c320df4c7f875a951fca59d81a4a4c57de7d44dbd802d7a0bd2379'
const UMBRELLA_ONLY_DIGEST = '2992ea8823835c07779f639996cfc5af83b108c28ce7ee9f0ce1f1160f97806b'
const digest = (tools: unknown) => createHash('sha256').update(JSON.stringify(tools)).digest('hex')

describe('community moderation exact-grant catalog boundaries', () => {
  it('pins the community participation Plus listing without moderation grants', () => {
    const tools = listMcpToolsForUser(plus, nonModerationScopes, USER_MCP_SERVER_CONFIG)
    expect(tools).toHaveLength(74)
    expect(digest(tools)).toBe(PLUS_WITHOUT_MODERATION_DIGEST)
    expect(tools.some(tool => names.includes(tool.name))).toBe(false)
  })

  it('preserves the umbrella-only listing without granting financial or moderation scopes', () => {
    const tools = listMcpToolsForUser(
      plus,
      ['mcp.user:read', 'mcp.user:write'],
      USER_MCP_SERVER_CONFIG,
    )
    expect(tools).toHaveLength(70)
    expect(digest(tools)).toBe(UMBRELLA_ONLY_DIGEST)
    expect(tools.some(tool => names.includes(tool.name))).toBe(false)
  })

  it('has exactly 78 tools when every user tool is authorized', () => {
    const caller = {
      ...plus,
      membership_plan: 'pro' as const,
      roles: [...new Set(ALL_TOOLS.flatMap(tool => Object.keys(tool.roles ?? {})))],
    }
    expect(listMcpToolsForUser(caller, allScopes, USER_MCP_SERVER_CONFIG, true)).toHaveLength(78)
  })

  it('adds only the free moderation reader to the unchanged Reader grant', () => {
    const scopes: ApiScope[] = [
      'topics:read',
      'posts:read',
      'rss-feeds:read',
      'rss-feed-items:read',
      'feeds:read',
      'reference-data:read',
    ]
    const caller = { ...plus, membership_plan: null }
    const before = listMcpToolsForUser(caller, scopes, USER_MCP_SERVER_CONFIG)
    const after = listMcpToolsForUser(
      caller,
      [...scopes, 'community-moderation:read'],
      USER_MCP_SERVER_CONFIG,
    )
    expect(before).toHaveLength(9)
    expect(after).toHaveLength(10)
    expect(after.filter(tool => tool.name !== names[0])).toEqual(before)
    expect(after.filter(tool => names.includes(tool.name)).map(tool => tool.name)).toEqual([
      names[0],
    ])
  })

  it('keeps moderator tools off the admin server', () => {
    const caller = { ...plus, roles: ['administrator'], membership_plan: 'pro' as const }
    const tools = listMcpToolsForUser(caller, allScopes, ADMIN_MCP_SERVER_CONFIG, true)
    expect(tools.some(tool => names.includes(tool.name))).toBe(false)
  })
})
