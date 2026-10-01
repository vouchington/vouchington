import { ErrorCode } from '@modelcontextprotocol/sdk/types.js'
import type { ApiScope } from '@modules/scopes'
import type { PrivateUser } from '@services/users/types'
import { createTestUser } from '@voucha/test-helpers'
import { beforeAll, describe, expect, it } from 'vitest'
import { callMcpTool } from './call-tool.mts'
import { USER_MCP_SERVER_CONFIG } from './config.mts'
import { listMcpToolsForUser } from './list-tools.mts'

type McpUser = PrivateUser & { membership_plan: 'plus' | 'pro' | null }

const READ_TOOLS = [
  ['get_post', { post_id: 'some-post' }],
  ['get_post_ancestors', { post_id: 'some-post' }],
  ['get_post_descendants', { post_id: 'some-post' }],
  ['get_story', { story_id: crypto.randomUUID() }],
] as const

describe('post and story read tool gating', () => {
  let users: Record<string, McpUser>

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
    'lists the read tools with their schemas for a %s user holding posts:read',
    label => {
      const listed = listMcpToolsForUser(users[label]!, ['posts:read'], USER_MCP_SERVER_CONFIG)

      for (const [name] of READ_TOOLS) {
        const tool = listed.find(candidate => candidate.name === name)
        expect(tool?.annotations).toMatchObject({ readOnlyHint: true })
        expect(tool?.outputSchema).toMatchObject({ type: 'object' })
      }
    },
  )

  it('hides the read tools from a credential without posts:read', () => {
    const listed = listMcpToolsForUser(
      users['free']!,
      ['profile:read', 'cards:read'] as ApiScope[],
      USER_MCP_SERVER_CONFIG,
    )

    for (const [name] of READ_TOOLS) {
      expect(listed.map(tool => tool.name)).not.toContain(name)
    }
  })

  it.each(READ_TOOLS)('refuses %s without the posts:read scope', async (name, args) => {
    await expect(
      callMcpTool(name, args, users['free']!, ['profile:read'], USER_MCP_SERVER_CONFIG),
    ).rejects.toMatchObject({
      code: ErrorCode.InvalidRequest,
      message: expect.stringContaining('posts:read'),
    })
  })

  it.each(READ_TOOLS)('rejects %s arguments that miss the required id', async name => {
    await expect(
      callMcpTool(name, {}, users['free']!, ['posts:read'], USER_MCP_SERVER_CONFIG),
    ).rejects.toMatchObject({ code: ErrorCode.InvalidParams })
  })
})
