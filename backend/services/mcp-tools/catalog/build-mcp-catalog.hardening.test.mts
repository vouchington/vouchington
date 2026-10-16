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
// Pin both pre-moderation listings from #2545's generated catalog.
const PLUS_WITHOUT_MODERATION_DIGEST =
  'c1e606309d25e03e81674d6ab9daa7bfe53b05fd0d231f76b9616ed8267df09e'
const UMBRELLA_ONLY_DIGEST = '842513bcbf6e80432c57b7e6ccd6f9d3b63f054b613624ec6c8515f88947af91'
const digest = (tools: unknown) => createHash('sha256').update(JSON.stringify(tools)).digest('hex')

describe('community moderation exact-grant catalog boundaries', () => {
  it('keeps the existing Plus listing byte-identical without moderation grants', () => {
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
