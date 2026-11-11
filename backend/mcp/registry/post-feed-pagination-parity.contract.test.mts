import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { callStructuredMcpTool, optionArgs } from '@voucha/test-helpers/mcp-tool-contract'

describe('post feed cursor parity', () => {
  it('rejects a malformed cursor even when an unknown hashtag yields no matches', async () => {
    const user = await createTestUser()
    const q = `#unknown-feed-${randomUUID()}`
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .get('/api/v1/feeds/posts/follow_users')
      .query({ q, after: 'not-a-cursor' })
      .expect(400)
    const result = await callStructuredMcpTool(
      { ...user, membership_plan: null },
      'read_feed',
      optionArgs('posts', { feed_type: 'follow_users', q, after: 'not-a-cursor' }),
      ['feeds:read'],
    )
    expect(result).toEqual({ success: false, error: 'Invalid cursor' })
  })

  it('exhausts an unmatched feed query on REST and MCP', async () => {
    const user = await createTestUser()
    const q = `missingfeed${randomUUID().replaceAll('-', '')}`
    const request = createRequest()
    await request.authenticateAs(user)
    const first = await request
      .get('/api/v1/feeds/posts/follow_users')
      .query({ q, sort: 'new', limit: 1 })
      .expect(200)
    expect(first.body.results).toEqual([])
    expect(first.body.page_info.has_next_page).toBe(false)
    expect(first.body.page_info.end_cursor).toBeNull()
    const caller = { ...user, membership_plan: null }
    const mcp = await callStructuredMcpTool(
      caller,
      'read_feed',
      optionArgs('posts', { feed_type: 'follow_users', q, sort: 'new', limit: 1 }),
      ['feeds:read'],
    )
    expect(mcp).toMatchObject({
      success: true,
      results: [],
      page_info: { has_next_page: false, end_cursor: null },
    })
    await request
      .get('/api/v1/feeds/posts/follow_users')
      .query({ after: 'not-a-cursor' })
      .expect(400)
    const invalid = await callStructuredMcpTool(
      caller,
      'read_feed',
      optionArgs('posts', { feed_type: 'follow_users', after: 'not-a-cursor' }),
      ['feeds:read'],
    )
    expect(invalid).toEqual({ success: false, error: 'Invalid cursor' })
  })
})
