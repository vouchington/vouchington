import { beforeAll, describe, expect, it } from 'vitest'
import type { ApiScope } from '../modules/scopes/index.mts'
import { callMcpTool } from '../services/mcp-tools/call-tool.mts'
import { USER_MCP_SERVER_CONFIG } from '../services/mcp-tools/config.mts'
import { listMcpToolsForUser } from '../services/mcp-tools/list-tools.mts'
import type { PrivateUser } from '../services/users/types.mts'
import { createTestUser } from './entities/users.mts'

// JSON-RPC 2.0 error codes, as the MCP SDK names them `InvalidRequest` and `InvalidParams`.
const INVALID_REQUEST = -32600
const INVALID_PARAMS = -32602

type McpUser = PrivateUser & { membership_plan: 'plus' | 'pro' | null }

type McpReadToolGatingSuite = {
  /** Every scope that unlocks a tool of the family. */
  scopes: readonly ApiScope[]
  /** Each tool, the one scope it needs and a valid call. */
  tools: readonly (readonly [name: string, scope: ApiScope, args: object])[]
  /** Names of the tools that take `limit`, which accepts 1 through 25. */
  pagedTools: readonly string[]
  /** A tool and arguments that omit one it requires. */
  requiredArguments: readonly (readonly [name: string, args: object])[]
}

/**
 * Registers the gating checks every user-surface MCP read tool family shares: listing by scope or
 * by the `mcp.user:read` umbrella, refusal without the scope or with only a sibling scope, the same
 * result for every plan, required arguments and the page size bounds. Call it inside the family's
 * own `describe`, which supplies the family's title.
 */
export function registerMcpReadToolGatingTests(suite: McpReadToolGatingSuite): void {
  const { scopes: familyScopes, tools, pagedTools, requiredArguments } = suite
  const paged = tools.filter(([name]) => pagedTools.includes(name))

  describe('gating', () => {
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
        for (const held of [[...familyScopes], ['mcp.user:read']] as ApiScope[][]) {
          const listed = listMcpToolsForUser(users[label]!, held, USER_MCP_SERVER_CONFIG)

          for (const [name] of tools) {
            const tool = listed.find(candidate => candidate.name === name)
            expect(tool?.annotations).toMatchObject({ readOnlyHint: true })
            expect(tool?.outputSchema).toMatchObject({ type: 'object' })
            expect(tool?.title).toEqual(expect.any(String))
          }
        }
      },
    )

    it.each(tools)('lists %s only for a credential holding %s', (name, scope) => {
      const withScope = listMcpToolsForUser(users['free']!, [scope], USER_MCP_SERVER_CONFIG)
      const withoutScope = listMcpToolsForUser(
        users['free']!,
        ['profile:read', 'cards:read'] as ApiScope[],
        USER_MCP_SERVER_CONFIG,
      )

      expect(withScope.map(tool => tool.name)).toContain(name)
      expect(withoutScope.map(tool => tool.name)).not.toContain(name)
    })

    it.each(tools)('refuses %s without the %s scope', async (name, scope, args) => {
      await expect(call(name, args, ['profile:read'])).rejects.toMatchObject({
        code: INVALID_REQUEST,
        message: expect.stringContaining(scope),
      })
    })

    it.each(tools)(
      'refuses %s to a credential holding only a sibling read scope',
      async (name, scope, args) => {
        const sibling = familyScopes.filter(held => held !== scope)

        await expect(call(name, args, [...sibling])).rejects.toMatchObject({
          code: INVALID_REQUEST,
        })
      },
    )

    it.each(tools)('runs %s for a free, plus and pro user alike', async (name, scope, args) => {
      for (const who of Object.values(users)) {
        await expect(call(name, args, [scope], who)).resolves.toMatchObject({
          structuredContent: { success: expect.any(Boolean) },
        })
      }
    })

    it.each(requiredArguments)(
      'rejects %s arguments that miss the required one',
      async (name, args) => {
        const scope = tools.find(([candidate]) => candidate === name)![1]

        await expect(call(name, args, [scope])).rejects.toMatchObject({ code: INVALID_PARAMS })
      },
    )

    it.each(paged)('bounds the page size of %s to 1 through 25', async (name, scope, args) => {
      for (const limit of [1, 25]) {
        await expect(call(name, { ...args, limit }, [scope])).resolves.toMatchObject({
          structuredContent: { success: expect.any(Boolean) },
        })
      }
      for (const limit of [0, 26, 100, 1.5, -1]) {
        await expect(call(name, { ...args, limit }, [scope])).rejects.toMatchObject({
          code: INVALID_PARAMS,
        })
      }
    })
  })
}
