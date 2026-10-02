import { ErrorCode } from '@modelcontextprotocol/sdk/types.js'
import type { ApiScope } from '@modules/scopes'
import type { PrivateUser } from '@services/users/types'
import { createTestUser } from '@voucha/test-helpers'
import { beforeAll, describe, expect, it } from 'vitest'
import { callMcpTool } from './call-tool.mts'
import { USER_MCP_SERVER_CONFIG } from './config.mts'
import { listMcpToolsForUser } from './list-tools.mts'

type McpUser = PrivateUser & { membership_plan: 'plus' | 'pro' | null }

const LIST_ID = crypto.randomUUID()
// Every tool of the hostname, list and user read families, the scope it needs and a valid call.
const READ_TOOLS = [
  ['search_hostnames', 'hostnames:read', {}],
  ['get_top_hostnames', 'hostnames:read', {}],
  ['get_user', 'users:read', { user_id: 'some-user' }],
  ['search_users', 'users:read', { q: 'some' }],
  ['get_my_lists', 'lists:read', {}],
  ['get_list', 'lists:read', { list_id: LIST_ID }],
  ['get_list_items', 'lists:read', { list_id: LIST_ID }],
] as const
const PAGED_TOOLS = READ_TOOLS.filter(([name]) => !['get_user', 'get_list'].includes(name))
const REQUIRED_ARGUMENTS = [
  ['get_user', { q: 'some' }],
  ['search_users', {}],
  ['get_list', {}],
  ['get_list_items', {}],
] as const

describe('hostname, list and user read tool gating', () => {
  let users: Record<string, McpUser>

  const call = (name: string, args: object, scopes: ApiScope[], who = users['free']!) =>
    callMcpTool(name, args, who, scopes, USER_MCP_SERVER_CONFIG)

  beforeAll(async () => {
    const plans = { free: null, plus: 'plus', pro: 'pro' } as const
    users = Object.fromEntries(
      await Promise.all(
        Object.entries(plans).map(async ([label, plan]) => [
          label,
          { ...(await createTestUser()), membership_plan: plan },
        ]),
      ),
    )
  })

  it.each(['free', 'plus', 'pro'])(
    'lists every read tool with its schemas for a %s user, by scope or by the umbrella',
    label => {
      const scopes = [
        ['hostnames:read', 'users:read', 'lists:read'],
        ['mcp.user:read'],
      ] as ApiScope[][]

      for (const held of scopes) {
        const listed = listMcpToolsForUser(users[label]!, held, USER_MCP_SERVER_CONFIG)

        for (const [name] of READ_TOOLS) {
          const tool = listed.find(candidate => candidate.name === name)
          expect(tool?.annotations).toMatchObject({ readOnlyHint: true })
          expect(tool?.outputSchema).toMatchObject({ type: 'object' })
          expect(tool?.title).toEqual(expect.any(String))
        }
      }
    },
  )

  it.each(READ_TOOLS)('lists %s only for a credential holding %s', (name, scope) => {
    const withScope = listMcpToolsForUser(users['free']!, [scope], USER_MCP_SERVER_CONFIG)
    const withoutScope = listMcpToolsForUser(
      users['free']!,
      ['profile:read', 'cards:read'] as ApiScope[],
      USER_MCP_SERVER_CONFIG,
    )

    expect(withScope.map(tool => tool.name)).toContain(name)
    expect(withoutScope.map(tool => tool.name)).not.toContain(name)
  })

  it.each(READ_TOOLS)('refuses %s without the %s scope', async (name, scope, args) => {
    await expect(call(name, args, ['profile:read'])).rejects.toMatchObject({
      code: ErrorCode.InvalidRequest,
      message: expect.stringContaining(scope),
    })
  })

  it.each(READ_TOOLS)(
    'refuses %s to a credential holding only a sibling read scope',
    async (name, scope, args) => {
      const sibling = (['hostnames:read', 'users:read', 'lists:read'] as ApiScope[]).filter(
        held => held !== scope,
      )

      await expect(call(name, args, sibling)).rejects.toMatchObject({
        code: ErrorCode.InvalidRequest,
      })
    },
  )

  it.each(READ_TOOLS)('runs %s for a free, plus and pro user alike', async (name, scope, args) => {
    for (const who of Object.values(users)) {
      await expect(call(name, args, [scope], who)).resolves.toMatchObject({
        structuredContent: { success: expect.any(Boolean) },
      })
    }
  })

  it.each(REQUIRED_ARGUMENTS)(
    'rejects %s arguments that miss the required one',
    async (name, args) => {
      const scope = READ_TOOLS.find(([candidate]) => candidate === name)![1]

      await expect(call(name, args, [scope])).rejects.toMatchObject({
        code: ErrorCode.InvalidParams,
      })
    },
  )

  it.each(PAGED_TOOLS)(
    'bounds the page size of %s to 1 through its maximum',
    async (name, scope, args) => {
      const accepted = [1, 25]
      const rejected = [0, 26, 100, 1.5, -1]

      for (const limit of accepted) {
        await expect(call(name, { ...args, limit }, [scope])).resolves.toMatchObject({
          structuredContent: { success: expect.any(Boolean) },
        })
      }
      for (const limit of rejected) {
        await expect(call(name, { ...args, limit }, [scope])).rejects.toMatchObject({
          code: ErrorCode.InvalidParams,
        })
      }
    },
  )
})
