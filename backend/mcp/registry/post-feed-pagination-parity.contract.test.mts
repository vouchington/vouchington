import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestPost } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { callStructuredMcpTool, optionArgs } from '@voucha/test-helpers/mcp-tool-contract'
import { postsWorkConfig } from '@services/posts/work-limits'

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

  it('continues an empty inspected page across REST and MCP and rejects malformed cursors', async () => {
    await postsWorkConfig.waitForInitialization()
    const user = await createTestUser()
    for (let index = 0; index < 5; index++) {
      await insertTestPost({
        createdById: user.id,
        title: `Feed cursor ${randomUUID()}`,
        slug: `feed-cursor-${randomUUID()}`,
        markdown: 'Feed cursor fixture',
      })
    }
    const restore = overrideDynamicConfigFieldsForTest(postsWorkConfig, {
      post_feed_candidate_limit: 2,
    })
    try {
      const q = `missingfeed${randomUUID().replaceAll('-', '')}`
      const request = createRequest()
      await request.authenticateAs(user)
      const first = await request
        .get('/api/v1/feeds/posts/follow_users')
        .query({ q, sort: 'new', limit: 1 })
        .expect(200)
      expect(first.body.results).toEqual([])
      expect(first.body.page_info.has_next_page).toBe(true)
      expect(first.body.page_info.end_cursor).toEqual(expect.any(String))
      const caller = { ...user, membership_plan: null }
      const mcp = await callStructuredMcpTool(
        caller,
        'read_feed',
        optionArgs('posts', {
          feed_type: 'follow_users',
          q,
          sort: 'new',
          limit: 1,
          after: first.body.page_info.end_cursor,
        }),
        ['feeds:read'],
      )
      expect(mcp).toMatchObject({ success: true, results: [] })
      const nextPage = mcp.page_info as { has_next_page: boolean; end_cursor: string | null }
      expect(nextPage.has_next_page).toBe(true)
      expect(nextPage.end_cursor).toEqual(expect.any(String))
      await request
        .get('/api/v1/feeds/posts/follow_users')
        .query({ q, sort: 'new', limit: 1, after: nextPage.end_cursor })
        .expect(200)
      await request
        .get('/api/v1/feeds/posts/follow_users')
        .query({ after: 'not-a-cursor' })
        .expect(400)
      const invalid = await callStructuredMcpTool(
        caller,
        'read_feed',
        optionArgs('posts', {
          feed_type: 'follow_users',
          after: 'not-a-cursor',
        }),
        ['feeds:read'],
      )
      expect(invalid).toEqual({ success: false, error: 'Invalid cursor' })
    } finally {
      restore()
    }
  })
})
