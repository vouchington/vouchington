import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { readTestMcpCallAuditOptions } from '@voucha/test-helpers/entities/mcp-call-audit'
import { issueTestUserMcpCredential } from '@voucha/test-helpers/mcp-user-credentials'
import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'
import { insertRssFeedCrawl } from '../rss-feeds/crawls.mts'

type McpResponse = {
  result?: { isError?: boolean; structuredContent?: Record<string, unknown>; content?: unknown[] }
}

describe('merged RSS feed HTTP audit', () => {
  it('records details success and free crawl denials with the selected option on both rows', async () => {
    const { user, token } = await issueTestUserMcpCredential('api_key', 'rss-feeds:read')
    const feed = await createTestRssFeed({})
    const crawlId = await insertRssFeedCrawl({
      rss_feed_id: feed.id,
      response_code: 200,
      feed_data: { title: `Audit feed ${crypto.randomUUID()}` },
    })
    const invoke = (option: string, args: Record<string, unknown>) =>
      createRequest()
        .post('/api/v1/mcp')
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${token}`)
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'read_rss_feed', arguments: { option, arguments: args } },
        })

    const details = await invoke('details', { rss_feed_id: feed.id }).expect(200)
    expect((details.body as McpResponse).result?.structuredContent).toMatchObject({
      success: true,
      rss_feed: { id: feed.id },
    })

    const crawls = await invoke('crawls', { rss_feed_id: feed.id }).expect(200)
    const crawl = await invoke('crawl', { rss_feed_id: feed.id, crawl_id: crawlId }).expect(200)
    for (const response of [crawls, crawl]) {
      expect((response.body as McpResponse).result?.isError).toBe(true)
      expect(JSON.stringify(response.body)).toContain('Premium membership required')
    }

    const invalidId = await invoke('crawl', {
      rss_feed_id: feed.id,
      crawl_id: 'invalid_uuid',
    }).expect(200)
    expect(invalidId.body).toMatchObject({ error: { code: -32602 } })
    const unknown = await invoke('not_an_option', {}).expect(200)
    expect(unknown.body).toMatchObject({ error: { code: -32602 } })

    const events = await readTestMcpCallAuditOptions(user.id)
    expect(
      events.map(({ tool_name, tool_option, outcome }) => [tool_name, tool_option, outcome]),
    ).toEqual([
      ['read_rss_feed', 'details', 'accepted'],
      ['read_rss_feed', 'crawls', 'accepted'],
      ['read_rss_feed', 'crawls', 'tool_error'],
      ['read_rss_feed', 'crawl', 'accepted'],
      ['read_rss_feed', 'crawl', 'tool_error'],
      ['read_rss_feed', 'crawl', 'invalid_arguments'],
      ['read_rss_feed', null, 'invalid_arguments'],
    ])
    expect(events.map(event => event.correlation_id)).toEqual([
      details.headers['x-correlation-id'],
      crawls.headers['x-correlation-id'],
      crawls.headers['x-correlation-id'],
      crawl.headers['x-correlation-id'],
      crawl.headers['x-correlation-id'],
      invalidId.headers['x-correlation-id'],
      unknown.headers['x-correlation-id'],
    ])
  })
})
