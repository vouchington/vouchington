import {
  optionArgs,
  callRejectedMcpTool,
  callStructuredMcpTool,
} from '@voucha/test-helpers/mcp-tool-contract'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestPost,
  createTestUser,
  followUser,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'
import { updateRssFeedById } from '@services/rss-feeds'
import {
  sharePostWithFollowers,
  processFollowerDistributionChunk,
} from '@services/follower-distributions'
import { upsertRssFeedItems } from '@services/rss-feed-items/upsert'
import { getRssFeedItemKeyByGuid } from '@voucha/test-helpers/rss-feed-item-guid-lookup'
import type { PrivateUser } from '@services/users/types'
import { beforeAll, describe, expect, it } from 'vitest'
type Caller = PrivateUser & { membership_plan: 'plus' | null }
type Page = {
  results: Array<{ id: string; markdown: string }>
  page_info: { has_next_page: boolean; end_cursor: string | null }
}
describe('MCP RSS and feed reads — real DB contracts', () => {
  const token = `rssmcp${crypto.randomUUID().replaceAll('-', '')}`
  let free: Caller
  let admin: Caller
  let feedId: string
  let itemIds: string[]
  beforeAll(async () => {
    free = { ...(await createTestUser()), membership_plan: null }
    admin = { ...(await createTestUser({ administrator: true })), membership_plan: null }
    const feed = await createTestRssFeed({ title: `${token} feed` })
    feedId = feed.id
    const guids = [1, 2, 3].map(index => `${token}-${index}`)
    await upsertRssFeedItems(
      feedId,
      guids.map((guid, index) => ({
        link: `https://example.com/${guid}`,
        guid,
        title: `${token} article ${index}`,
        description: `<script>ignored</script>Visible ${guid}`,
        pubDate: `2025-01-0${index + 1}T00:00:00Z`,
      })),
    )
    itemIds = (await Promise.all(guids.map(guid => getRssFeedItemKeyByGuid(guid)))).map(
      row => row!.id,
    )
  })
  it('returns schema-valid feed and item details with fenced external text', async () => {
    const feed = await callStructuredMcpTool(
      free,
      'read_rss_feed',
      optionArgs('details', { rss_feed_id: feedId }),
      ['rss-feeds:read'],
    )
    expect(feed).toMatchObject({ success: true, rss_feed: { id: feedId } })
    expect((feed.rss_feed as { title: string }).title).toContain('<external-content')
    const item = await callStructuredMcpTool(
      free,
      'read_rss_feed_item',
      optionArgs('details', { rss_feed_item_id: itemIds[0] }),
      ['rss-feed-items:read'],
    )
    expect(item).toMatchObject({ success: true, rss_feed_item: { id: itemIds[0] } })
    const text = (item.rss_feed_item as { markdown: string }).markdown
    expect(text).toContain('<external-content')
    expect(text).not.toContain('<script>')
  })
  it('round-trips the item cursor against signed-in and anonymous REST', async () => {
    const first = (await callStructuredMcpTool(
      free,
      'read_rss_feed_item',
      optionArgs('list', { rss_feed_id: feedId, limit: 2 }),
      ['rss-feed-items:read'],
    )) as Page
    expect(first.results).toHaveLength(2)
    expect(first.page_info.has_next_page).toBe(true)
    const second = (await callStructuredMcpTool(
      free,
      'read_rss_feed_item',
      optionArgs('list', { rss_feed_id: feedId, limit: 2, after: first.page_info.end_cursor }),
      ['rss-feed-items:read'],
    )) as Page
    expect(second.results).toHaveLength(1)
    expect(new Set([...first.results, ...second.results].map(row => row.id))).toEqual(
      new Set(itemIds),
    )
    const query = `rss_feed=${feedId}&limit=2`
    const anonymous = await createRequest().get(`/api/v1/rss-feed-items?${query}`).expect(200)
    const signedRequest = createRequest()
    await signedRequest.authenticateAs(free)
    const signed = await signedRequest.get(`/api/v1/rss-feed-items?${query}`).expect(200)
    expect(first.page_info.end_cursor).toBe(signed.body.page_info.end_cursor)
    const anonymousNext = await createRequest()
      .get(
        `/api/v1/rss-feed-items?${query}&after=${encodeURIComponent(anonymous.body.page_info.end_cursor)}`,
      )
      .expect(200)
    expect(anonymousNext.body.results).toHaveLength(1)
    expect(anonymous.body.page_info.end_cursor).not.toBe(signed.body.page_info.end_cursor)
    const signedNext = await signedRequest
      .get(
        `/api/v1/rss-feed-items?${query}&after=${encodeURIComponent(first.page_info.end_cursor!)}`,
      )
      .expect(200)
    expect(second.results.map(row => row.id)).toEqual(
      signedNext.body.results.map((row: { id: string }) => row.id),
    )
  })
  it('keeps disabled, non-discoverable feed detail readable like REST', async () => {
    const hidden = await createTestRssFeed({ title: `${token} hidden` })
    await updateRssFeedById(hidden.id, { is_enabled: false, discoverable: false })
    const detail = await callStructuredMcpTool(
      free,
      'read_rss_feed',
      optionArgs('details', { rss_feed_id: hidden.id }),
      ['rss-feeds:read'],
    )
    expect(detail).toMatchObject({
      success: true,
      rss_feed: { id: hidden.id, is_enabled: false, is_discoverable: false },
    })
    await createRequest().get(`/api/v1/rss-feeds/${hidden.id}`).expect(200)
    const search = await callStructuredMcpTool(
      free,
      'discover_rss_feeds',
      optionArgs('search', { text_search_query: `${token} hidden` }),
      ['rss-feeds:read'],
    )
    expect(search.results).toEqual([])
  })
  it('permits a suspended caller on reads when REST does', async () => {
    const user = { ...(await createTestUser()), membership_plan: null }
    await suspendTestUser(user.id)
    try {
      const mcp = await callStructuredMcpTool(
        user,
        'read_rss_feed',
        optionArgs('details', { rss_feed_id: feedId }),
        ['rss-feeds:read'],
      )
      expect(mcp).toMatchObject({ success: true, rss_feed: { id: feedId } })
      const request = createRequest()
      await request.authenticateAs(user)
      await request.get(`/api/v1/rss-feeds/${feedId}`).expect(200)
    } finally {
      await unsuspendTestUser(user.id)
    }
  })
  it('keeps regular vote reads private and lets administrators see REST-visible votes', async () => {
    const voter = await createTestUser()
    const voterRequest = createRequest()
    await voterRequest.authenticateAs(voter)
    await voterRequest
      .put(`/api/v1/rss-feed-items/${itemIds[0]}/vote`)
      .send({ choice: 'like' })
      .expect(204)
    const args = { rss_feed_item_id: itemIds[0] }
    const freeVotes = await callStructuredMcpTool(
      free,
      'read_rss_feed_item',
      optionArgs('votes', args),
      ['rss-feed-items:read'],
    )
    expect(freeVotes.results).toEqual([])
    const freeRequest = createRequest()
    await freeRequest.authenticateAs(free)
    expect(
      (await freeRequest.get(`/api/v1/rss-feed-items/${itemIds[0]}/votes`).expect(200)).body
        .results,
    ).toEqual([])
    const adminVotes = await callStructuredMcpTool(
      admin,
      'read_rss_feed_item',
      optionArgs('votes', args),
      ['rss-feed-items:read'],
    )
    expect(adminVotes.results).toEqual([expect.objectContaining({ user_id: voter.id })])
    const adminRequest = createRequest()
    await adminRequest.authenticateAs(admin)
    expect(
      (await adminRequest.get(`/api/v1/rss-feed-items/${itemIds[0]}/votes`).expect(200)).body
        .results,
    ).toEqual([expect.objectContaining({ user_id: voter.id })])
  })
  it('uses each credential owner’s own follow graph for the post feed', async () => {
    const follower = { ...(await createTestUser()), membership_plan: null }
    const author = await createTestUser()
    await followUser(follower, author)
    const post = await createTestPost({
      user: await createTestUser(),
      title: `${token} shared post`,
    })
    await processFollowerDistributionChunk(
      (await sharePostWithFollowers(author, post.id)).distribution_id,
    )
    const followerPage = await callStructuredMcpTool(
      follower,
      'read_feed',
      optionArgs('posts', { feed_type: 'follow_users' }),
      ['feeds:read'],
    )
    expect(followerPage.results).toContainEqual(
      expect.objectContaining({
        entity_id: post.id,
        delivery_type: 'share',
        shared_by_id: author.id,
      }),
    )
    const unrelatedPage = await callStructuredMcpTool(
      free,
      'read_feed',
      optionArgs('posts', { feed_type: 'follow_users' }),
      ['feeds:read'],
    )
    expect(
      (unrelatedPage.results as Array<{ entity_id: string }>).map(row => row.entity_id),
    ).not.toContain(post.id)
  })
  it('validates discovery pages against the published tool schemas', async () => {
    const search = await callStructuredMcpTool(
      free,
      'discover_rss_feeds',
      optionArgs('search', { text_search_query: token }),
      ['rss-feeds:read'],
    )
    expect(search).toMatchObject({ success: true, results: [{ id: feedId }] })
    await callStructuredMcpTool(free, 'discover_rss_feeds', optionArgs('trending', { limit: 1 }), [
      'rss-feeds:read',
    ])
    await callStructuredMcpTool(
      free,
      'discover_rss_feeds',
      optionArgs('recommended', { limit: 1 }),
      ['rss-feeds:read'],
    )
  })
  it('validates own-graph read schemas and the resource-scope gate', async () => {
    const itemArgs = { rss_feed_item_id: itemIds[0] }
    await callStructuredMcpTool(
      free,
      'read_rss_feed_item',
      optionArgs('follow_context', itemArgs),
      ['rss-feed-items:read'],
    )
    await callStructuredMcpTool(free, 'read_rss_feed_item', optionArgs('votes', itemArgs), [
      'rss-feed-items:read',
    ])
    for (const option of ['posts', 'rss_items', 'referral_links']) {
      await callStructuredMcpTool(
        free,
        'read_feed',
        optionArgs(option, { feed_type: 'follow_users' }),
        ['feeds:read'],
      )
    }
    expect(
      await callRejectedMcpTool(
        free,
        'read_rss_feed',
        optionArgs('details', { rss_feed_id: feedId }),
        [],
      ),
    ).toContain('scope')
  })
})
