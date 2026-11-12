import { describe, expect, it } from 'vitest'
import { encodeCursor } from '@modules/pagination'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createReferralFeedWindowFixture } from '@voucha/test-helpers/referral-feed-windows'
import { callStructuredMcpTool, optionArgs } from '@voucha/test-helpers/mcp-tool-contract'

describe('REST and MCP referral inspected-page contract', () => {
  it('continues through empty windows and exposes the same matched row and terminal state', async () => {
    const fixture = await createReferralFeedWindowFixture([
      ...Array.from({ length: 20 }, () => 'unfollowed' as const),
      'visible',
    ])
    const request = createRequest()
    await request.authenticateAs(fixture.viewer)
    const caller = { ...fixture.viewer, membership_plan: null }
    let after = fixture.after
    for (const lastIndex of [9, 19, 20]) {
      const rest = await request
        .get('/api/v1/feeds/referral_links/follow_users')
        .query({ limit: 1, after })
        .expect(200)
      const mcp = await callStructuredMcpTool(
        caller,
        'read_feed',
        optionArgs('referral_links', {
          feed_type: 'follow_users',
          limit: 1,
          after,
        }),
        ['feeds:read'],
      )
      expect(rest.body.page_info.has_next_page).toBe(true)
      expect(rest.body.page_info.end_cursor).toBe(encodeCursor({ id: fixture.ids[lastIndex]! }))
      expect(mcp.page_info).toEqual(rest.body.page_info)
      const expectedIds = lastIndex < 20 ? [] : [fixture.ids[20]]
      expect(rest.body.results.map((row: { id: string }) => row.id)).toEqual(expectedIds)
      expect(Object.keys(rest.body.users)).toEqual(lastIndex < 20 ? [] : [fixture.author.id])
      expect(mcp.results).toMatchObject(expectedIds.map(id => ({ id })))
      after = rest.body.page_info.end_cursor
    }
    let terminal = false
    let terminalCursor: unknown
    for (let pageIndex = 0; pageIndex < 256; pageIndex++) {
      const rest = await request
        .get('/api/v1/feeds/referral_links/follow_users')
        .query({ limit: 1, after })
        .expect(200)
      const mcp = await callStructuredMcpTool(
        caller,
        'read_feed',
        optionArgs('referral_links', {
          feed_type: 'follow_users',
          limit: 1,
          after,
        }),
        ['feeds:read'],
      )
      expect(rest.body.results).toEqual([])
      expect(mcp.results).toEqual([])
      expect(mcp.page_info).toEqual(rest.body.page_info)
      terminalCursor = rest.body.page_info.end_cursor
      if (!rest.body.page_info.has_next_page) {
        terminal = true
        break
      }
      expect(rest.body.page_info.end_cursor).not.toBe(after)
      after = rest.body.page_info.end_cursor
    }
    expect(terminal).toBe(true)
    expect(terminalCursor).toBeNull()
  })
})
