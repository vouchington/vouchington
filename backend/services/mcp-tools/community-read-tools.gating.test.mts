import { ErrorCode } from '@modelcontextprotocol/sdk/types.js'
import type { ApiScope } from '@modules/scopes'
import type { PrivateUser } from '@services/users/types'
import { createTestUser } from '@voucha/test-helpers'
import { beforeAll, describe, expect, it } from 'vitest'
import { callMcpTool } from './call-tool.mts'
import { USER_MCP_SERVER_CONFIG } from './config.mts'
import { listMcpToolsForUser } from './list-tools.mts'

type McpUser = PrivateUser & { membership_plan: 'plus' | 'pro' | null }

const NO_SUCH_COMMUNITY = `no-such-community-${crypto.randomUUID().slice(0, 8)}`
const READ_TOOLS = [
  ['search_communities', {}],
  ['get_community', { community_id: NO_SUCH_COMMUNITY }],
  ['get_community_posts', { community_id: NO_SUCH_COMMUNITY }],
  ['get_community_pinned_posts', { community_id: NO_SUCH_COMMUNITY }],
  ['get_community_members', { community_id: NO_SUCH_COMMUNITY }],
] as const
const ID_TOOLS = READ_TOOLS.filter(([name]) => name !== 'search_communities')
const PAGED_TOOLS = [
  ['search_communities', {}],
  ['get_community_posts', { community_id: NO_SUCH_COMMUNITY }],
  ['get_community_members', { community_id: NO_SUCH_COMMUNITY }],
] as const

describe('community read tool gating', () => {
  let user: McpUser

  beforeAll(async () => {
    user = { ...(await createTestUser()), membership_plan: null }
  })

  const call = (name: string, args: Record<string, unknown>, scopes: ApiScope[]) =>
    callMcpTool(name, args, user, scopes, USER_MCP_SERVER_CONFIG)

  it.each([['communities:read'], ['mcp.user:read']] as const)(
    'lists the read tools with their schemas for a credential holding %s',
    scope => {
      const listed = listMcpToolsForUser(user, [scope], USER_MCP_SERVER_CONFIG)

      for (const [name] of READ_TOOLS) {
        const tool = listed.find(candidate => candidate.name === name)
        expect(tool?.annotations).toMatchObject({ readOnlyHint: true })
        expect(tool?.outputSchema).toMatchObject({ type: 'object' })
      }
    },
  )

  it('hides the read tools from a credential without communities:read', () => {
    const listed = listMcpToolsForUser(
      user,
      ['profile:read', 'posts:read'] as ApiScope[],
      USER_MCP_SERVER_CONFIG,
    )

    for (const [name] of READ_TOOLS) {
      expect(listed.map(tool => tool.name)).not.toContain(name)
    }
  })

  it.each(READ_TOOLS)('refuses %s without the communities:read scope', async (name, args) => {
    await expect(call(name, args, ['posts:read', 'profile:read'])).rejects.toMatchObject({
      code: ErrorCode.InvalidRequest,
      message: expect.stringContaining('communities:read'),
    })
  })

  it.each(READ_TOOLS)('allows %s with communities:read', async (name, args) => {
    const result = await call(name, args, ['communities:read'])

    expect(result.isError).toBeUndefined()
  })

  it.each(READ_TOOLS)('allows %s with the mcp.user:read umbrella', async (name, args) => {
    const result = await call(name, args, ['mcp.user:read'])

    expect(result.isError).toBeUndefined()
  })

  it.each(ID_TOOLS)('rejects %s arguments that miss the community id', async name => {
    await expect(call(name, {}, ['communities:read'])).rejects.toMatchObject({
      code: ErrorCode.InvalidParams,
    })
  })

  it.each(PAGED_TOOLS)('rejects %s limits outside 1 to 25', async (name, args) => {
    for (const limit of [0, 26, 100, 1.5, -1]) {
      await expect(call(name, { ...args, limit }, ['communities:read'])).rejects.toMatchObject({
        code: ErrorCode.InvalidParams,
      })
    }
  })

  it.each(PAGED_TOOLS)('accepts the %s limit bounds 1 and 25', async (name, args) => {
    for (const limit of [1, 25]) {
      const result = await call(name, { ...args, limit }, ['communities:read'])
      expect(result.isError).toBeUndefined()
    }
  })

  it.each([
    ['search_communities', { sort: 'newest' }],
    ['get_community_posts', { community_id: NO_SUCH_COMMUNITY, sort: 'top' }],
    ['get_community_members', { community_id: NO_SUCH_COMMUNITY, role: 'admin' }],
  ] as const)('rejects %s arguments outside the documented enums', async (name, args) => {
    await expect(call(name, args, ['communities:read'])).rejects.toMatchObject({
      code: ErrorCode.InvalidParams,
    })
  })
})
