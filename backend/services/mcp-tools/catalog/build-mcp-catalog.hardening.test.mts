import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { SCOPE_DEFINITIONS, type ApiScope } from '@modules/scopes'
import { ALL_TOOLS } from '@voucha/mcp/registry/index'
import {
  ADMIN_MCP_SERVER_CONFIG,
  COMMUNITY_MODERATION_MCP_SERVER_CONFIG,
  USER_MCP_SERVER_CONFIG,
} from '../config.mts'
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
// Pin the exact-grant listing including explicit message and household grants.
const PLUS_WITHOUT_MODERATION_DIGEST =
  '98b103553cccc3bb6f9174fe2f8b9326c0403e4c111cdf6f4351b7bcda2d1089'
const PRE_MESSAGE_DIGEST = 'f80ab568017862c7904a39cb104ab6ec727ca408a59a11dc9b57ea3911484658'
const UMBRELLA_ONLY_DIGEST = 'ef40b11207c24c8545fbd6cd1831a862e5ec9063771c55ebc86ff54a5ba08fe3'
// Released native MCP bridges (.NET MemberMcpInputSchema, Swift NativeChatMCPInputSchema) reject
// the whole catalog when an array has `uniqueItems: true` and `maxItems` above this bound.
const NATIVE_UNIQUE_ITEMS_MAX_ITEMS = 256
const findOversizedUniqueArrays = (node: unknown, path: string): string[] => {
  if (Array.isArray(node))
    return node.flatMap((child, i) => findOversizedUniqueArrays(child, `${path}[${i}]`))
  if (typeof node !== 'object' || node === null) return []
  const record = node as Record<string, unknown>
  const own =
    record.uniqueItems === true &&
    typeof record.maxItems === 'number' &&
    record.maxItems > NATIVE_UNIQUE_ITEMS_MAX_ITEMS
      ? [`${path} maxItems=${record.maxItems}`]
      : []
  return [
    ...own,
    ...Object.entries(record).flatMap(([key, child]) =>
      findOversizedUniqueArrays(child, `${path}.${key}`),
    ),
  ]
}
const digest = (tools: unknown) => createHash('sha256').update(JSON.stringify(tools)).digest('hex')

describe('community moderation exact-grant catalog boundaries', () => {
  it('adds exact-grant tools to the existing Plus listing without moderation grants', () => {
    const tools = listMcpToolsForUser(plus, nonModerationScopes, USER_MCP_SERVER_CONFIG)
    expect(tools).toHaveLength(71)
    expect(digest(tools)).toBe(PLUS_WITHOUT_MODERATION_DIGEST)
    expect(
      digest(
        tools.filter(
          tool =>
            ![
              'read_my_messages',
              'manage_my_messages',
              'read_my_households',
              'manage_my_households',
            ].includes(tool.name),
        ),
      ),
    ).toBe(PRE_MESSAGE_DIGEST)
    expect(tools.some(tool => names.includes(tool.name))).toBe(false)
  })

  it('preserves the umbrella-only listing without granting financial or moderation scopes', () => {
    const tools = listMcpToolsForUser(
      plus,
      ['mcp.user:read', 'mcp.user:write'],
      USER_MCP_SERVER_CONFIG,
    )
    expect(tools).toHaveLength(63)
    expect(digest(tools)).toBe(UMBRELLA_ONLY_DIGEST)
    expect(tools.some(tool => names.includes(tool.name))).toBe(false)
  })

  it('has exactly 71 tools when every user tool is authorized', () => {
    const caller = {
      ...plus,
      membership_plan: 'pro' as const,
      roles: [...new Set(ALL_TOOLS.flatMap(tool => Object.keys(tool.roles ?? {})))],
    }
    expect(listMcpToolsForUser(caller, allScopes, USER_MCP_SERVER_CONFIG, true)).toHaveLength(71)
  })

  it('keeps moderation scopes off the user listing and serves the free reader on its audience', () => {
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
    const userAfter = listMcpToolsForUser(
      caller,
      [...scopes, 'community-moderation:read'],
      USER_MCP_SERVER_CONFIG,
    )
    const community = listMcpToolsForUser(
      caller,
      ['community-moderation:read'],
      COMMUNITY_MODERATION_MCP_SERVER_CONFIG,
    )
    expect(before).toHaveLength(9)
    expect(userAfter).toEqual(before)
    expect(community.map(tool => tool.name)).toEqual([names[0]])
  })

  it('keeps moderator tools off the admin server', () => {
    const caller = { ...plus, roles: ['administrator'], membership_plan: 'pro' as const }
    const tools = listMcpToolsForUser(caller, allScopes, ADMIN_MCP_SERVER_CONFIG, true)
    expect(tools.some(tool => names.includes(tool.name))).toBe(false)
  })

  it('keeps uniqueItems arrays within the bound released native clients accept', () => {
    const caller = {
      ...plus,
      membership_plan: 'pro' as const,
      roles: [...new Set(ALL_TOOLS.flatMap(tool => Object.keys(tool.roles ?? {})))],
    }
    const offenders = [USER_MCP_SERVER_CONFIG, ADMIN_MCP_SERVER_CONFIG].flatMap(config =>
      listMcpToolsForUser(caller, allScopes, config, true).flatMap(tool =>
        findOversizedUniqueArrays(tool.inputSchema, tool.name),
      ),
    )
    expect(offenders).toEqual([])
  })
})
