import crypto from 'node:crypto'
import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestPost,
  insertTestCommunity,
  insertTestRssFeedItem,
  insertTestUrlHostname,
  insertTestRssFeedDirect,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { fetchEntityContent } from './fetch-entity.mts'

describe('fetchEntityContent', () => {
  let author: PrivateUser

  beforeAll(async () => {
    author = await createTestUser()
  })

  it('returns null for a non-existent post', async () => {
    const result = await fetchEntityContent('post', crypto.randomUUID())
    expect(result).toBeNull()
  })

  it('returns text and null community rules for a standalone post', async () => {
    const title = `Agent-judgement test ${crypto.randomUUID().slice(0, 8)}`
    const markdown = 'This is test post content.'
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `agent-judgement-${crypto.randomUUID().slice(0, 8)}`,
      title,
      markdown,
    })

    const result = await fetchEntityContent('post', postId)
    expect(result).not.toBeNull()
    expect(result!.text).toContain(title)
    expect(result!.text).toContain(markdown)
    expect(result!.communityRules).toBeNull()
    expect(result!.communityId).toBeNull()
    // authorId must equal the post's createdById for OpenAI safety_identifier
    expect(result!.authorId).toBe(author.id)
  })

  it('returns communityId and communityRules for a community post', async () => {
    const community = await insertTestCommunity({
      createdById: author.id,
      name: `Fetch Entity Community ${crypto.randomUUID().slice(0, 8)}`,
      slug: `fetch-entity-comm-${crypto.randomUUID().slice(0, 8)}`,
      rules_markdown: 'Community rules text',
    })
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `fetch-entity-comm-post-${crypto.randomUUID().slice(0, 8)}`,
      title: `Community Post ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'Community post content',
      communityId: community.id,
    })

    const result = await fetchEntityContent('post', postId)
    expect(result).not.toBeNull()
    expect(result!.communityId).toBe(community.id)
    expect(result!.communityRules).toBe('Community rules text')
    expect(result!.text).toContain('Community post content')
  })

  it('returns content for a comment entity', async () => {
    const rootPostId = await insertTestPost({
      createdById: author.id,
      slug: `fetch-entity-root-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Root post',
      markdown: 'Root body',
    })
    const commentId = await insertTestPost({
      createdById: author.id,
      slug: `fetch-entity-comment-${crypto.randomUUID().slice(0, 8)}`,
      title: '',
      markdown: 'Comment text here',
      postType: 'comment',
      rootId: rootPostId,
      parentId: rootPostId,
    })

    const result = await fetchEntityContent('comment', commentId)
    expect(result).not.toBeNull()
    expect(result!.text).toContain('Comment text here')
    expect(result!.communityRules).toBeNull()
    expect(result!.communityId).toBeNull()
  })

  it('returns null for a non-existent comment', async () => {
    const result = await fetchEntityContent('comment', crypto.randomUUID())
    expect(result).toBeNull()
  })

  it('returns null for a non-existent user', async () => {
    const result = await fetchEntityContent('user', crypto.randomUUID())
    expect(result).toBeNull()
  })

  it('returns username and null community rules for a user', async () => {
    const result = await fetchEntityContent('user', author.id)
    expect(result).not.toBeNull()
    expect(result!.text).toContain(author.username)
    expect(result!.communityRules).toBeNull()
    // authorId must equal the user's own id for OpenAI safety_identifier
    expect(result!.authorId).toBe(author.id)
  })

  it('returns content for an rss_feed_item, preferring richer content fields', async () => {
    const feed = await insertTestRssFeedDirect({})
    const itemId = await insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId: feed.rss_feed_url_id,
      guid: `test-guid-${crypto.randomUUID()}`,
      itemData: { title: 'RSS Item Title', contentSnippet: 'RSS item body text content' },
      contentSha256: Buffer.alloc(32),
    })

    const result = await fetchEntityContent('rss_feed_item', itemId)
    expect(result).not.toBeNull()
    expect(result!.text).toContain('RSS Item Title')
    expect(result!.text).toContain('RSS item body text content')
    expect(result!.communityRules).toBeNull()
    expect(result!.communityId).toBeNull()
  })

  it('falls back across COALESCE content fields (description)', async () => {
    const feed = await insertTestRssFeedDirect({})
    const itemId = await insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId: feed.rss_feed_url_id,
      guid: `test-guid-coalesce-${crypto.randomUUID()}`,
      itemData: { title: 'Coalesce Title', description: 'Fallback description content' },
      contentSha256: Buffer.alloc(32),
    })

    const result = await fetchEntityContent('rss_feed_item', itemId)
    expect(result!.text).toContain('Coalesce Title')
    expect(result!.text).toContain('Fallback description content')
  })

  it('uses media:description for rss_feed_item moderation content', async () => {
    const feed = await insertTestRssFeedDirect({})
    const itemId = await insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId: feed.rss_feed_url_id,
      guid: `test-guid-media-description-${crypto.randomUUID()}`,
      itemData: {
        title: 'YouTube Report Title',
        description: '<p>&nbsp;</p>',
        'media:description': 'Problematic YouTube description text',
      },
      contentSha256: Buffer.alloc(32),
    })

    const result = await fetchEntityContent('rss_feed_item', itemId)
    expect(result!.text).toContain('YouTube Report Title')
    expect(result!.text).toContain('Problematic YouTube description text')
  })

  it('returns (no content) for an rss_feed_item with no title or content', async () => {
    const feed = await insertTestRssFeedDirect({})
    const itemId = await insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId: feed.rss_feed_url_id,
      guid: `test-guid-empty-${crypto.randomUUID()}`,
      itemData: {},
      contentSha256: Buffer.alloc(32),
    })

    const result = await fetchEntityContent('rss_feed_item', itemId)
    expect(result!.text).toBe('(no content)')
  })

  it('returns null for a non-existent rss_feed_item', async () => {
    const result = await fetchEntityContent('rss_feed_item', crypto.randomUUID())
    expect(result).toBeNull()
  })

  it('returns hostname text for an existing url_hostname', async () => {
    const hostname = `test-fetch-entity-${crypto.randomUUID().slice(0, 8)}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname })

    const result = await fetchEntityContent('url_hostname', hostnameId)
    expect(result!.text).toBe(`Hostname: ${hostname}`)
    expect(result!.communityRules).toBeNull()
    expect(result!.communityId).toBeNull()
  })

  it('returns null for a non-existent url_hostname', async () => {
    const result = await fetchEntityContent('url_hostname', crypto.randomUUID())
    expect(result).toBeNull()
  })

  it('returns null for an unrecognized entity type', async () => {
    const result = await fetchEntityContent(
      'unknown_type' as unknown as Parameters<typeof fetchEntityContent>[0],
      crypto.randomUUID(),
    )
    expect(result).toBeNull()
  })
})
