import { describe, expect, it } from 'vitest'
import { createTestPost, createTestUser, followRssFeed } from '@voucha/test-helpers'
import { createTestStoryMembers } from '@voucha/test-helpers/entities/story-member-pages'
import {
  insertHackerNewsReferencesForTest,
  setHackerNewsReferenceFlagsForTest,
} from '@voucha/test-helpers/hacker-news-references'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { hackerNewsVisibilityConfig } from '@services/urls/hacker-news-visibility-config'
import { callStructuredMcpTool, optionArgs } from '@voucha/test-helpers/mcp-tool-contract'

const counts = { story_count: 2, comment_count: 3 }
const stories = [
  { hacker_news_item_id: 1, points: 4, reply_count: 2, posted_at: '2026-01-01T00:00:00.000Z' },
]
const comments = [
  { hacker_news_item_id: 2, parent_story_item_id: 3, posted_at: '2026-01-02T00:00:00.000Z' },
]

describe('MCP neutral Hacker News facts', () => {
  it('shares post search counts and capped detail facts, omitting both while hidden', async () => {
    const caller = { ...(await createTestUser()), membership_plan: null }
    const fixture = await createTestStoryMembers(1)
    const post = await createTestPost({ user: caller, url_id: fixture.urlId, post_type: 'link' })
    await insertHackerNewsReferencesForTest({ url_id: fixture.urlId, ...counts, stories, comments })
    for (const visible of [true, false]) {
      const restore = overrideDynamicConfigFieldsForTest(hackerNewsVisibilityConfig, {
        references_visible: visible,
      })
      try {
        const search = await callStructuredMcpTool(
          caller,
          'read_posts',
          optionArgs('search', { creator: caller.id }),
          ['posts:read'],
        )
        const row = (search.results as Array<Record<string, unknown>>).find(
          row => row.id === post.id,
        )
        expect(row).toBeDefined()
        expect(row!.hacker_news_references).toEqual(visible ? counts : undefined)
        const detail = await callStructuredMcpTool(
          caller,
          'read_posts',
          optionArgs('details', { post_id: post.id }),
          ['posts:read'],
        )
        expect((detail.post as Record<string, unknown>).hacker_news_references).toEqual(
          visible ? { ...counts, stories, comments } : undefined,
        )
      } finally {
        restore()
      }
    }
  })

  it('shares batch RSS and story-member counts, capped RSS detail and feed filters while hiding all facts when disabled', async () => {
    const caller = { ...(await createTestUser()), membership_plan: null }
    const fixture = await createTestStoryMembers(2)
    await insertHackerNewsReferencesForTest({ url_id: fixture.urlId, ...counts, stories, comments })
    await setHackerNewsReferenceFlagsForTest([], fixture.itemIds)
    await followRssFeed(caller, fixture.feed.id)
    for (const visible of [true, false]) {
      const restore = overrideDynamicConfigFieldsForTest(hackerNewsVisibilityConfig, {
        references_visible: visible,
      })
      try {
        const list = await callStructuredMcpTool(
          caller,
          'read_rss_feed_item',
          optionArgs('list', { rss_feeds: [fixture.feed.id] }),
          ['rss-feed-items:read'],
        )
        // The list collapses the two same-URL members to one article; story pages retain both.
        expect(list.results).toHaveLength(1)
        expect(fixture.itemIds).toContain((list.results as Array<Record<string, unknown>>)[0]!.id)
        for (const row of list.results as Array<Record<string, unknown>>)
          expect(row.hacker_news_references).toEqual(visible ? counts : undefined)
        const detail = await callStructuredMcpTool(
          caller,
          'read_rss_feed_item',
          optionArgs('details', { rss_feed_item_id: fixture.itemIds[0] }),
          ['rss-feed-items:read'],
        )
        expect((detail.rss_feed_item as Record<string, unknown>).hacker_news_references).toEqual(
          visible ? { ...counts, stories, comments } : undefined,
        )
        const story = await callStructuredMcpTool(
          caller,
          'get_story',
          { story_id: fixture.story.id },
          ['posts:read'],
        )
        expect(
          (story.items as Array<Record<string, unknown>>)
            .map(row => row.id)
            .toSorted((a, b) => String(a).localeCompare(String(b))),
        ).toEqual(fixture.itemIds.toSorted((a, b) => a.localeCompare(b)))
        for (const row of story.items as Array<Record<string, unknown>>)
          expect(row.hacker_news_references).toEqual(visible ? counts : undefined)
        const feed = await callStructuredMcpTool(
          caller,
          'read_feed',
          optionArgs('rss_items', {
            feed_type: 'follow_rss_feeds',
            has_hacker_news_references: visible,
          }),
          ['feeds:read'],
        )
        const rows = (feed.results as Array<Record<string, unknown>>).filter(row =>
          fixture.itemIds.includes(String(row.entity_id)),
        )
        expect(rows).toHaveLength(1)
        for (const row of rows)
          expect(row.hacker_news_references).toEqual(visible ? counts : undefined)
      } finally {
        restore()
      }
    }
  })
})
