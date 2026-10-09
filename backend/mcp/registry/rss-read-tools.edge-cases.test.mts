import { optionArgs, callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import {
  createTestMembership,
  createTestRssFeedItemWithUrl,
  createTestRssFeedWithTiming,
  createTestTopic,
  createTestUrlWithHostname,
  createTestUser,
  followRssFeed,
  followUser,
  insertTestReferralProgram,
  insertTestUserReferralProgramLink,
} from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { describe, expect, it } from 'vitest'

describe('MCP RSS and feed edge contracts', () => {
  it('forwards REST rss_feeds and media_type array filters', async () => {
    const reader = { ...(await createTestUser()), membership_plan: null }
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    const item = await createTestRssFeedItemWithUrl(feedId)
    const matching = await callStructuredMcpTool(
      reader,
      'read_rss_feed_item',
      optionArgs('list', { rss_feeds: [feedId], media_type: ['article'] }),
      ['rss-feed-items:read'],
    )
    expect(matching.results).toContainEqual(expect.objectContaining({ id: item.id }))
    const otherTopic = await createTestTopic()
    const otherFeedId = await createTestRssFeedWithTiming(otherTopic.id)
    const excluded = await callStructuredMcpTool(
      reader,
      'read_rss_feed_item',
      optionArgs('list', { rss_feeds: [otherFeedId], media_type: ['article'] }),
      ['rss-feed-items:read'],
    )
    expect(excluded.results).toEqual([])
  })

  it('keeps followed RSS items visible with a stale community filter like REST', async () => {
    const reader = { ...(await createTestUser()), membership_plan: null }
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    const item = await createTestRssFeedItemWithUrl(feedId)
    await followRssFeed(reader, feedId)
    const community = `missing-${crypto.randomUUID()}`
    const mcp = await callStructuredMcpTool(
      reader,
      'read_feed',
      optionArgs('rss_items', { feed_type: 'follow_rss_feeds', community }),
      ['feeds:read'],
    )
    expect(mcp.results).toContainEqual(
      expect.objectContaining({ entity_id: item.id, delivery_type: 'direct', shared_by_id: null }),
    )
    const request = createRequest()
    await request.authenticateAs(reader)
    const rest = await request
      .get('/api/v1/feeds/rss_feed_items/follow_rss_feeds')
      .query({ community })
      .expect(200)
    expect(rest.body.results).toContainEqual(expect.objectContaining({ entity_id: item.id }))
  })

  it('returns followed referral links with their untrusted text fenced', async () => {
    const reader = { ...(await createTestUser()), membership_plan: null }
    const referrer = await createTestUser()
    await followUser(reader, referrer)
    const programId = await insertTestReferralProgram({ createdById: referrer.id })
    const linkId = await insertTestUserReferralProgramLink({
      userId: referrer.id,
      referralProgramId: programId,
      urlId: await createTestUrlWithHostname(),
      label: 'Useful referral',
    })
    const mcp = await callStructuredMcpTool(
      reader,
      'read_feed',
      optionArgs('referral_links', { feed_type: 'follow_users' }),
      ['feeds:read'],
    )
    expect(mcp.results).toContainEqual(
      expect.objectContaining({
        id: linkId,
        user_id: referrer.id,
        referral_program_name: expect.stringContaining('<external-content'),
        label: expect.stringContaining('Useful referral'),
      }),
    )
    const request = createRequest()
    await request.authenticateAs(reader)
    const rest = await request.get('/api/v1/feeds/referral_links/follow_users').expect(200)
    expect(rest.body.results).toContainEqual(expect.objectContaining({ id: linkId }))
  })

  it('returns only the reader’s followed voters on each side of an RSS item', async () => {
    const reader = { ...(await createTestUser()), membership_plan: null }
    const positive = await createTestUser()
    const negative = await createTestUser()
    await followUser(reader, positive)
    await followUser(reader, negative)
    const topic = await createTestTopic()
    const item = await createTestRssFeedItemWithUrl(await createTestRssFeedWithTiming(topic.id))
    for (const [voter, choice] of [
      [positive, 'like'],
      [negative, 'dislike'],
    ] as const) {
      const request = createRequest()
      await request.authenticateAs(voter)
      await request.put(`/api/v1/rss-feed-items/${item.id}/vote`).send({ choice }).expect(204)
    }
    const mcp = await callStructuredMcpTool(
      reader,
      'read_rss_feed_item',
      optionArgs('follow_context', { rss_feed_item_id: item.id }),
      ['rss-feed-items:read'],
    )
    expect(mcp).toMatchObject({
      positive_by_following: { total: 1, users: [{ id: positive.id }] },
      negative_by_following: { total: 1, users: [{ id: negative.id }] },
    })
  })

  it('reports missing crawls and items without inventing readable resources', async () => {
    const reader = await createTestUser()
    await createTestMembership({ user_id: reader.id, plan: 'plus', status: 'active' })
    const paid = { ...reader, membership_plan: 'plus' as const }
    const missingId = crypto.randomUUID()
    const crawls = await callStructuredMcpTool(
      paid,
      'read_rss_feed',
      optionArgs('crawls', { rss_feed_id: missingId }),
      ['rss-feeds:read'],
    )
    expect(crawls).toEqual({ success: false, error: 'RSS feed not found' })
    const crawl = await callStructuredMcpTool(
      paid,
      'read_rss_feed',
      optionArgs('crawl', { rss_feed_id: missingId, crawl_id: crypto.randomUUID() }),
      ['rss-feeds:read'],
    )
    expect(crawl).toEqual({ success: false, error: 'RSS feed not found' })
    for (const option of ['follow_context', 'votes'] as const) {
      const result = await callStructuredMcpTool(
        paid,
        'read_rss_feed_item',
        optionArgs(option, { rss_feed_item_id: missingId }),
        ['rss-feed-items:read'],
      )
      expect(result).toEqual({ success: false, error: 'RSS feed item not found' })
    }
    const request = createRequest()
    await request.authenticateAs(reader)
    await request.get(`/api/v1/rss-feeds/${missingId}/crawls`).expect(404)
    await request.get(`/api/v1/rss-feed-items/${missingId}/follow-context`).expect(404)
  })
})
