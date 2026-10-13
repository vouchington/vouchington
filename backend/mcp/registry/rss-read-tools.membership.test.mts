import {
  optionArgs,
  callRejectedMcpTool,
  callStructuredMcpTool,
} from '@voucha/test-helpers/mcp-tool-contract'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestMembership, createTestUser } from '@voucha/test-helpers'
import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'
import { insertRssFeedCrawl } from '@services/rss-feeds/crawls'
import { describe, expect, it } from 'vitest'

describe('read_rss_feed crawl membership — real DB', () => {
  it('preserves free denial, paid summary and administrator detail beside REST', async () => {
    const free = { ...(await createTestUser()), membership_plan: null }
    const paidUser = await createTestUser()
    await createTestMembership({ user_id: paidUser.id, plan: 'plus', status: 'active' })
    const paid = { ...paidUser, membership_plan: 'plus' as const }
    const admin = { ...(await createTestUser({ administrator: true })), membership_plan: null }
    const feed = await createTestRssFeed({ title: `crawl-${crypto.randomUUID()}` })
    const crawlId = await insertRssFeedCrawl({
      rss_feed_id: feed.id,
      response_code: 200,
      feed_data: { title: 'external crawl' },
    })
    const args = { rss_feed_id: feed.id, crawl_id: crawlId }

    expect(
      await callRejectedMcpTool(free, 'read_rss_feed', optionArgs('crawl', args), [
        'rss-feeds:read',
      ]),
    ).toContain('Premium membership required')
    expect(
      await callRejectedMcpTool(
        free,
        'read_rss_feed',
        optionArgs('crawls', { rss_feed_id: feed.id }),
        ['rss-feeds:read'],
      ),
    ).toContain('Premium membership required')

    const paidResult = await callStructuredMcpTool(
      paid,
      'read_rss_feed',
      optionArgs('crawl', args),
      ['rss-feeds:read'],
    )
    expect(paidResult).toMatchObject({ success: true, crawl: { id: crawlId, response_code: 200 } })
    expect(paidResult.crawl).not.toHaveProperty('feed_data')
    const paidRequest = createRequest()
    await paidRequest.authenticateAs(paid)
    const paidRest = await paidRequest
      .get(`/api/v1/rss-feeds/${feed.id}/crawls/${crawlId}`)
      .expect(200)
    expect(paidRest.body.crawl).not.toHaveProperty('feed_data')

    const privileged = await callStructuredMcpTool(
      admin,
      'read_rss_feed',
      optionArgs('crawl', args),
      ['rss-feeds:read'],
    )
    expect((privileged.crawl as { feed_data: string }).feed_data).toContain('<external-content')
    const adminRequest = createRequest()
    await adminRequest.authenticateAs(admin)
    const adminRest = await adminRequest
      .get(`/api/v1/rss-feeds/${feed.id}/crawls/${crawlId}`)
      .expect(200)
    expect(adminRest.body.crawl).toHaveProperty('feed_data')

    const page = await callStructuredMcpTool(
      paid,
      'read_rss_feed',
      optionArgs('crawls', { rss_feed_id: feed.id }),
      ['rss-feeds:read'],
    )
    expect(page).toMatchObject({ success: true, results: [{ id: crawlId }] })
  })
})
