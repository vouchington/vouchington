import {
  optionArgs,
  callRejectedMcpTool,
  callStructuredMcpTool,
} from '@voucha/test-helpers/mcp-tool-contract'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { encodeCursor } from '@modules/pagination'
import { beforeAll, describe, expect, it } from 'vitest'

const SCOPES = ['rss-feeds:read'] as const
const REFUSED: Array<Record<string, unknown>> = [
  { sort: 'trending', q: 'news' },
  { sort: 'trending', topic: ['example'] },
  { time_range: 'day' },
]

describe('discover_rss_feeds.search sort trending — REST and MCP parity', () => {
  let caller: Awaited<ReturnType<typeof createTestUser>> & { membership_plan: null }

  const tool = (args: Record<string, unknown>) =>
    callStructuredMcpTool(
      caller,
      'discover_rss_feeds',
      optionArgs('search', args),
      SCOPES,
    ) as Promise<{
      success: boolean
      results: unknown[]
    }>
  const query = (args: Record<string, unknown>) =>
    new URLSearchParams(
      Object.fromEntries(Object.entries(args).map(([key, value]) => [key, String(value)])),
    ).toString()
  const rest = async (args: Record<string, unknown>) => {
    const request = createRequest()
    await request.authenticateAs(caller)
    return request.get(`/api/v1/rss-feeds?${query(args)}`)
  }

  beforeAll(async () => {
    caller = { ...(await createTestUser()), membership_plan: null }
  })

  it('refuses the same combinations on REST and in the tool', async () => {
    for (const args of REFUSED) {
      expect((await rest(args)).status).toBe(400)
      const message = await callRejectedMcpTool(
        caller,
        'discover_rss_feeds',
        optionArgs('search', args),
        SCOPES,
      )
      expect(message).toBeTruthy()
    }
  })

  it('accepts every time range with the same page size as REST', async () => {
    for (const time_range of ['day', 'week', 'month']) {
      const args = { sort: 'trending', time_range, limit: 1 }
      const response = await rest(args)
      expect(response.status).toBe(200)
      expect((await tool(args)).results).toHaveLength(response.body.results.length)
    }
  })

  it('refuses a malformed cursor and a cursor of another kind', async () => {
    const bad = encodeCursor({ score: 1, id: 'not-a-uuid' })
    expect((await rest({ sort: 'trending', after: 'not-a-cursor' })).status).toBe(400)
    expect((await rest({ sort: 'trending', after: bad })).status).toBe(400)
    for (const after of ['not-a-cursor', bad]) {
      expect(await tool({ sort: 'trending', after })).toEqual({
        success: false,
        error: 'Invalid cursor',
      })
    }
  })
})
