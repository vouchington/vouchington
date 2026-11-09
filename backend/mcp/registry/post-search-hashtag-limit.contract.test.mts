import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  callRejectedMcpTool,
  callStructuredMcpTool,
  optionArgs,
} from '@voucha/test-helpers/mcp-tool-contract'

describe('post search hashtag limit', () => {
  it('accepts five raw mentions and rejects six on REST and MCP', async () => {
    const user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user)
    const caller = { ...user, membership_plan: null }
    const five = Array.from({ length: 5 }, () => '#missing-owned-hashtag').join(' ')
    const six = `${five} #missing-owned-hashtag`
    await request.get('/api/v1/posts').query({ q: five }).expect(200)
    const accepted = await callStructuredMcpTool(
      caller,
      'read_posts',
      optionArgs('search', { q: five }),
      ['posts:read'],
    )
    expect(accepted.success).toBe(true)
    await request.get('/api/v1/posts').query({ q: six }).expect(400)
    const rejected = await callRejectedMcpTool(
      caller,
      'read_posts',
      optionArgs('search', { q: six }),
      ['posts:read'],
    )
    expect(rejected).toContain('Too many hashtag topic identifiers (max 5)')

    for (const extra of [
      { topic: 'missing-topic-for-hashtag-guard' },
      { after: 'invalid-cursor' },
    ]) {
      await request
        .get('/api/v1/posts')
        .query({ q: six, ...extra })
        .expect(400)
      const error = await callRejectedMcpTool(
        caller,
        'read_posts',
        optionArgs('search', { q: six, ...extra }),
        ['posts:read'],
      )
      expect(error).toContain('Too many hashtag topic identifiers (max 5)')
    }
    const unknown = await callStructuredMcpTool(
      caller,
      'read_posts',
      optionArgs('search', {
        q: five.split(' ').slice(0, 4).join(' '),
        topic: 'missing-topic-for-hashtag-guard',
      }),
      ['posts:read'],
    )
    expect(unknown).toMatchObject({ success: true, results: [] })
  })
})
