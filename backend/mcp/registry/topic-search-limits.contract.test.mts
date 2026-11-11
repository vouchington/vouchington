import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  callRejectedMcpTool,
  callStructuredMcpTool,
  optionArgs,
} from '@voucha/test-helpers/mcp-tool-contract'

const topicId = '00000000-0000-7000-8000-000000000001'
const cases = [
  {
    route: '/api/v1/posts',
    field: 'topics',
    tool: 'read_posts',
    option: 'search',
    scope: 'posts:read',
  },
  {
    route: '/api/v1/rss-feeds',
    field: 'topics',
    tool: 'discover_rss_feeds',
    option: 'search',
    scope: 'rss-feeds:read',
  },
  {
    route: '/api/v1/hostnames',
    field: 'topics',
    tool: 'read_hostnames',
    option: 'search',
    scope: 'hostnames:read',
  },
  {
    route: '/api/v1/communities',
    field: 'topic',
    tool: 'discover_communities',
    option: 'search',
    scope: 'communities:read',
  },
] as const

describe('topic search input limits', () => {
  it.each(cases)(
    'enforces the same five-term limit on $route and $tool',
    async ({ route, field, tool, option, scope }) => {
      const user = await createTestUser()
      const caller = { ...user, membership_plan: null }
      const request = createRequest()
      await request.authenticateAs(user)
      const five = Array.from({ length: 5 }, () => topicId)
      const six = [...five, topicId]
      await request
        .get(route)
        .query({ [field]: five.join(',') })
        .expect(200)
      const accepted = await callStructuredMcpTool(
        caller,
        tool,
        optionArgs(option, { [field]: five }),
        [scope],
      )
      expect(accepted.success).toBe(true)
      await request
        .get(route)
        .query({ [field]: six.join(','), after: 'invalid-cursor' })
        .expect(400)
      const error = await callRejectedMcpTool(
        caller,
        tool,
        optionArgs(option, { [field]: six, after: 'invalid-cursor' }),
        [scope],
      )
      expect(error).toContain('Invalid tool arguments:')
    },
  )

  it('applies the same hashtag limit to the post feed', async () => {
    const user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user)
    const five = Array.from({ length: 5 }, () => '#missing-owned-hashtag').join(' ')
    const six = `${five} #missing-owned-hashtag`
    await request.get('/api/v1/feeds/posts/follow_users').query({ q: five }).expect(200)
    const accepted = await callStructuredMcpTool(
      { ...user, membership_plan: null },
      'read_feed',
      optionArgs('posts', { feed_type: 'follow_users', q: five }),
      ['feeds:read'],
    )
    expect(accepted.success).toBe(true)
    await request
      .get('/api/v1/feeds/posts/follow_users')
      .query({ q: six, after: 'invalid-cursor' })
      .expect(400)
    const error = await callRejectedMcpTool(
      { ...user, membership_plan: null },
      'read_feed',
      optionArgs('posts', { feed_type: 'follow_users', q: six, after: 'invalid-cursor' }),
      ['feeds:read'],
    )
    expect(error).toContain('Too many hashtag topic identifiers (max 5)')
  })

  it('counts mixed topic and hashtag terms before resolving them', async () => {
    const user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user)
    const q = '#missing #missing #missing'
    const topics = [topicId, topicId, topicId]
    await request
      .get('/api/v1/posts')
      .query({ q, topics: topics.join(',') })
      .expect(400)
    const error = await callRejectedMcpTool(
      { ...user, membership_plan: null },
      'read_posts',
      optionArgs('search', { q, topics }),
      ['posts:read'],
    )
    expect(error).toContain('Too many topic identifiers (max 5)')
  })
})
