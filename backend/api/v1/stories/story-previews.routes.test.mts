import { describe, it, expect } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  followRssFeed,
  setTestItemStoryId,
  insertTestCommunity,
  insertTestCommunityListItem,
} from '@voucha/test-helpers'
import {
  createTestStoryMembers,
  setTestStoryMemberTitle,
} from '@voucha/test-helpers/entities/story-member-pages'
import { enableQueryCapture, stopTestQueryCapture } from '@voucha/test-helpers/query-capture'

describe('bounded story routes', () => {
  it('hydrates only the selected primary and bounded related previews on RSS search', async () => {
    const fixture = await createTestStoryMembers(2000)
    const query = `large${fixture.story.id.replaceAll('-', '')}`
    await setTestStoryMemberTitle(fixture.itemIds[0]!, query)
    const response = await createRequest()
      .get('/api/v1/rss-feed-items')
      .query({ rss_feeds: fixture.feed.id, q: query, limit: '1' })
      .expect(200)
    expect(response.body.results).toHaveLength(1)
    const primary = response.body.results[0].id as string
    const peers = fixture.itemIds.filter(id => id !== primary).slice(0, 3)
    expect(response.body.story_member_pages[fixture.story.id].item_ids).toEqual(peers)
    expect(response.body.story_member_pages[fixture.story.id].page_info.has_next_page).toBe(true)
    expect(Object.keys(response.body.rss_feed_items).sort()).toEqual([primary, ...peers].sort())
    expect(Object.keys(response.body.rss_feed_item_elections).sort()).toEqual(
      [primary, ...peers].sort(),
    )
    expect(response.body.story_member_ids).toBeUndefined()
  })

  it('selects related previews outside search and follow filters on RSS feeds', async () => {
    const [fixture, user] = await Promise.all([createTestStoryMembers(4), createTestUser()])
    const peer = await createTestStoryMembers(1)
    const primary = fixture.itemIds[0]!
    const query = `primary${fixture.story.id.replaceAll('-', '')}`
    await setTestStoryMemberTitle(primary, query)
    await setTestItemStoryId(peer.itemIds[0]!, fixture.story.id)
    await followRssFeed(user, fixture.feed.id)
    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request
      .get('/api/v1/feeds/rss_feed_items/follow_rss_feeds')
      .query({ q: query, limit: '1' })
      .expect(200)
    expect(response.body.results.map((result: { entity_id: string }) => result.entity_id)).toEqual([
      primary,
    ])
    const previews = response.body.story_member_pages[fixture.story.id]
    expect(previews.item_ids).toContain(peer.itemIds[0])
    expect(previews.item_ids).not.toContain(primary)
    expect(previews.item_ids).toHaveLength(3)
    expect(Object.keys(response.body.rss_feed_items)).toHaveLength(4)
  })

  it('selects related previews outside community source membership', async () => {
    const [fixture, peers, owner] = await Promise.all([
      createTestStoryMembers(1),
      createTestStoryMembers(4),
      createTestUser(),
    ])
    for (const itemId of peers.itemIds) await setTestItemStoryId(itemId, fixture.story.id)
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityListItem({
      communityId: community.id,
      itemType: 'rss_feed',
      entityId: fixture.feed.id,
    })
    const response = await createRequest()
      .get(`/api/v1/communities/${community.id}/news`)
      .expect(200)
    expect(response.body.results.map((result: { entity_id: string }) => result.entity_id)).toEqual(
      fixture.itemIds,
    )
    expect(response.body.story_member_pages[fixture.story.id].item_ids).toEqual(
      peers.itemIds.slice(0, 3),
    )
    expect(Object.keys(response.body.rss_feed_items)).toHaveLength(4)
    expect(response.headers['cache-control']).toContain('public')
  })

  it('paginates story detail at the bounded default with page-local sidecars and no count read', async () => {
    const fixture = await createTestStoryMembers(26)
    const user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user)
    enableQueryCapture()
    let response
    try {
      response = await request.get(`/api/v1/stories/${fixture.story.id}`).expect(200)
    } finally {
      const queries = stopTestQueryCapture()
      expect(queries.some(query => query.text.includes('/* getStoryWithItemCount */'))).toBe(false)
      expect(queries.some(query => query.text.includes('/* getStoryItemIds */'))).toBe(false)
    }
    expect(response.body.item_ids).toEqual(fixture.itemIds.slice(0, 25))
    expect(response.body.story.item_count).toBeUndefined()
    expect(response.body.page_info.has_next_page).toBe(true)
    for (const field of [
      'rss_feed_items',
      'rss_feed_item_elections',
      'rss_feed_item_embeds',
      'rss_feed_item_content_html',
    ]) {
      expect(Object.keys(response.body[field]).sort()).toEqual(fixture.itemIds.slice(0, 25).sort())
    }
    for (const field of [
      'rss_feed_item_thumbnail_url',
      'bookmarks',
      'election_votes',
      'rss_feed_bookmarks',
      'related_posts_by_url_id',
      'posts',
      'posts_metrics',
      'story_post_ids',
    ]) {
      expect(response.body[field]).toEqual(expect.any(Object))
    }
    for (const field of ['bookmarks', 'election_votes']) {
      expect(
        Object.keys(response.body[field]).every(id => fixture.itemIds.slice(0, 25).includes(id)),
      ).toBe(true)
    }
    expect(Object.keys(response.body.rss_feed_bookmarks).every(id => id === fixture.feed.id)).toBe(
      true,
    )
    expect(response.headers['cache-control'] ?? '').not.toContain('public')
    const next = await request
      .get(`/api/v1/stories/${fixture.story.id}`)
      .query({ after: response.body.page_info.end_cursor })
      .expect(200)
    expect(next.body.item_ids).toEqual(fixture.itemIds.slice(25))
    expect(Object.keys(next.body.rss_feed_items)).toEqual(fixture.itemIds.slice(25))
    expect(next.body.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
  })

  it('excludes the primary before limit and rejects invalid exclusions, limits and incompatible cursors', async () => {
    const fixture = await createTestStoryMembers(4)
    const request = createRequest()
    const first = await request
      .get(`/api/v1/stories/${fixture.story.id}`)
      .query({ limit: '1', exclude_item_id: fixture.itemIds[0] })
      .expect(200)
    expect(first.body.item_ids).toEqual(fixture.itemIds.slice(1, 2))
    expect(first.body.bookmarks).toEqual({})
    expect(first.body.election_votes).toEqual({})
    expect(first.body.rss_feed_bookmarks).toEqual({})
    await request
      .get(`/api/v1/stories/${fixture.story.id}`)
      .query({ after: first.body.page_info.end_cursor, exclude_item_id: fixture.itemIds[1] })
      .expect(400)
    for (const query of [
      { exclude_item_id: 'bad' },
      { limit: '0' },
      { limit: '1.5' },
      { after: 'bad' },
    ]) {
      await request.get(`/api/v1/stories/${fixture.story.id}`).query(query).expect(400)
    }
    await request.get(`/api/v1/stories/${fixture.story.id}`).query({ limit: '26' }).expect(422)
    const final = await request
      .get(`/api/v1/stories/${fixture.story.id}`)
      .query({
        limit: '25',
        exclude_item_id: fixture.itemIds[0],
        after: first.body.page_info.end_cursor,
      })
      .expect(200)
    expect(final.body.item_ids).toEqual(fixture.itemIds.slice(2))
    expect(final.body.page_info.has_next_page).toBe(false)
  })
})
