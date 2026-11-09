import { randomBytes } from 'node:crypto'
import { describe, expect, it, beforeAll } from 'vitest'
import {
  createTestTopic,
  createTestUserDirect,
  insertScoredPostTopicCategoryRelation,
  insertTestPost,
} from '@voucha/test-helpers'
import { deleteTestPost } from '@voucha/test-helpers/entities/posts'
import { buildPostsRssFeed } from './posts-feed.mts'
import type { PrivateUser } from '@services/users/types'
import { postsWorkConfig } from '@services/posts/work-limits'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'

const randomHex = () => randomBytes(4).toString('hex')

/** Extract all CDATA description blocks from RSS XML. */
function extractDescriptions(xml: string): string[] {
  const matches = [
    ...xml.matchAll(/<description>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]*))<\/description>/g),
  ]
  return matches.map(m => m[1] ?? m[2] ?? '')
}

describe('buildPostsRssFeed', () => {
  let testUser: PrivateUser
  let testUsername: string
  let uniqueSlugPrefix: string
  let adminUser: PrivateUser
  let adminUsername: string
  let adminSlugPrefix: string

  beforeAll(async () => {
    testUsername = `rsspost${randomHex()}`
    testUser = await createTestUserDirect({ username: testUsername })
    uniqueSlugPrefix = `rss-post-test-${randomHex()}`
    adminUsername = `rsspostadmin${randomHex()}`
    adminUser = await createTestUserDirect({
      username: adminUsername,
      administrator: true,
    })
    adminSlugPrefix = `rss-admin-test-${randomHex()}`
  })

  it('continues an empty filtered page and preserves its request filters', async () => {
    await postsWorkConfig.waitForInitialization()
    const username = `rsspage${randomHex()}`
    const user = await createTestUserDirect({ username })
    const ids: string[] = []
    const restore = overrideDynamicConfigFieldsForTest(postsWorkConfig, {
      post_search_filter_candidate_limit: 2,
    })
    try {
      for (const [index, clearanceStatus] of ['approved', 'pending', 'pending'].entries()) {
        ids.push(
          await insertTestPost({
            title: `RSS continuation ${index}`,
            slug: `rss-continuation-${index}-${randomHex()}`,
            createdById: user.id,
            markdown: 'Continuation fixture',
            clearanceStatus: clearanceStatus as 'approved' | 'pending',
            createdAt: new Date(Date.now() - (3 - index) * 60_000),
          }),
        )
      }
      const topic = await createTestTopic()
      await insertScoredPostTopicCategoryRelation(ids[0]!, topic.id, user.id)
      const first = await buildPostsRssFeed({
        username,
        postType: 'discussion',
        topicSlugs: [topic.slug],
        apiKey: 'test-key',
      })
      expect(first).not.toContain('<item>')
      const href = first.match(/<atom:link\b[^>]*\bhref="([^"]+)"/)?.[1]
      expect(href).toBeDefined()
      const next = new URL(href!.replaceAll('&amp;', '&'))
      expect(next.pathname).toBe('/rss/posts')
      expect(next.searchParams.get('user')).toBe(username)
      expect(next.searchParams.get('post_type')).toBe('discussion')
      expect(next.searchParams.get('topics')).toBe(topic.slug)
      expect(next.searchParams.get('apikey')).toBe('test-key')
      const after = next.searchParams.get('after')
      expect(after).toBeTruthy()
      const second = await buildPostsRssFeed({
        username,
        postType: 'discussion',
        topicSlugs: [topic.slug],
        after: after!,
      })
      expect(second).toContain('RSS continuation 0')
      expect(second).not.toContain('<atom:link')
    } finally {
      restore()
      await Promise.all(ids.map(id => deleteTestPost(id)))
    }
  })

  it('renders markdown to HTML in descriptions', async () => {
    const slug = `${uniqueSlugPrefix}-bold-${randomHex()}`
    await insertTestPost({
      title: `RSS Bold Test ${randomHex()}`,
      slug,
      createdById: testUser.id,
      markdown: 'This is **bold** and *italic* text',
    })

    const xml = await buildPostsRssFeed({ username: testUsername })

    expect(xml).toContain('<strong>bold</strong>')
    expect(xml).toContain('<em>italic</em>')
    // Must not contain raw markdown syntax
    expect(xml).not.toContain('**bold**')
    expect(xml).not.toContain('*italic*')
  })

  it('renders links as HTML in descriptions', async () => {
    const slug = `${uniqueSlugPrefix}-link-${randomHex()}`
    await insertTestPost({
      title: `RSS Link Test ${randomHex()}`,
      slug,
      createdById: testUser.id,
      markdown: 'Visit [Example](https://example.com) for more',
    })

    const xml = await buildPostsRssFeed({ username: testUsername })

    expect(xml).toContain('href="https://example.com"')
    expect(xml).toContain('Example')
    // Must not show raw markdown link syntax
    expect(xml).not.toContain('[Example](https://example.com)')
  })

  it('does not contain script tags in descriptions', async () => {
    const slug = `${uniqueSlugPrefix}-xss-${randomHex()}`
    await insertTestPost({
      title: `RSS XSS Test ${randomHex()}`,
      slug,
      createdById: testUser.id,
      markdown: 'Normal text\n\n```html\n<script>alert("xss")</script>\n```',
    })

    const xml = await buildPostsRssFeed({ username: testUsername })

    // Script tags must not appear in description blocks
    const descriptions = extractDescriptions(xml)
    expect(descriptions.length).toBeGreaterThan(0)
    for (const desc of descriptions) {
      expect(desc).not.toContain('<script')
    }
  })

  it('escapes HTML in non-admin post markdown', async () => {
    const slug = `${uniqueSlugPrefix}-escape-${randomHex()}`
    await insertTestPost({
      title: `RSS Escape Test ${randomHex()}`,
      slug,
      createdById: testUser.id,
      markdown: '<b>raw html</b> should be escaped',
    })

    const xml = await buildPostsRssFeed({ username: testUsername })
    const descriptions = extractDescriptions(xml)

    // Non-admin: raw HTML should be escaped, not rendered
    const matchingDesc = descriptions.find(d => d.includes('raw html'))
    expect(matchingDesc).toBeDefined()
    expect(matchingDesc).toContain('&lt;b&gt;')
  })

  it('handles empty markdown', async () => {
    const slug = `${uniqueSlugPrefix}-empty-${randomHex()}`
    await insertTestPost({
      title: `RSS Empty Test ${randomHex()}`,
      slug,
      createdById: testUser.id,
      markdown: '',
    })

    const xml = await buildPostsRssFeed({ username: testUsername })

    // Should still produce valid XML
    expect(xml).toContain('<?xml')
    expect(xml).toContain('<rss')
  })

  it('does not proxy images (RSS readers need direct URLs)', async () => {
    const slug = `${uniqueSlugPrefix}-img-${randomHex()}`
    await insertTestPost({
      title: `RSS Img Test ${randomHex()}`,
      slug,
      createdById: testUser.id,
      markdown: '![photo](https://example.com/photo.jpg)',
    })

    const xml = await buildPostsRssFeed({ username: testUsername })
    const descriptions = extractDescriptions(xml)
    const matchingDesc = descriptions.find(d => d.includes('photo'))
    expect(matchingDesc).toBeDefined()
    expect(matchingDesc).not.toContain('/sideload/')
    expect(matchingDesc).toContain('https://example.com/photo.jpg')
  })

  it('excludes deleted posts', async () => {
    const slug = `${uniqueSlugPrefix}-del-${randomHex()}`
    const deletedUsername = `rssdel${randomHex()}`
    const deletedUser = await createTestUserDirect({ username: deletedUsername })
    const postId = await insertTestPost({
      title: `RSS Deleted Post ${randomHex()}`,
      slug,
      createdById: deletedUser.id,
      markdown: 'This post is deleted',
    })

    await deleteTestPost(postId)

    const xml = await buildPostsRssFeed({ username: deletedUsername })

    // Should not contain the deleted post content
    expect(xml).not.toContain('This post is deleted')
  })

  it('produces valid RSS XML structure', async () => {
    const xml = await buildPostsRssFeed({ username: testUsername })

    expect(xml).toContain('<?xml version="1.0" encoding="utf-8"?>')
    expect(xml).toContain('<rss')
    expect(xml).toContain('<channel>')
    expect(xml).toContain('</channel>')
    expect(xml).toContain('</rss>')
  })

  it('returns empty feed for non-existent user', async () => {
    const xml = await buildPostsRssFeed({ username: `nonexistent${randomHex()}` })

    expect(xml).toContain('<rss')
    expect(xml).not.toContain('<item>')
  })

  it('rejects post types outside the RSS post catalog before querying', async () => {
    await expect(buildPostsRssFeed({ postType: 'story' })).rejects.toMatchObject({ status: 400 })
  })

  it('adds nofollow to links for non-admin posts', async () => {
    const slug = `${uniqueSlugPrefix}-nf-${randomHex()}`
    await insertTestPost({
      title: `RSS Nofollow Test ${randomHex()}`,
      slug,
      createdById: testUser.id,
      markdown: '[link](https://example.com)',
    })

    const xml = await buildPostsRssFeed({ username: testUsername })
    const descriptions = extractDescriptions(xml)
    const matchingDesc = descriptions.find(d => d.includes('example.com'))
    expect(matchingDesc).toBeDefined()
    expect(matchingDesc).toContain('nofollow')
  })

  it('admin posts render raw HTML (allowHtml: true path)', async () => {
    const slug = `${adminSlugPrefix}-html-${randomHex()}`
    await insertTestPost({
      title: `RSS Admin HTML Test ${randomHex()}`,
      slug,
      createdById: adminUser.id,
      markdown: '<b>admin bold</b> and *italic*',
    })

    const xml = await buildPostsRssFeed({ username: adminUsername })
    const descriptions = extractDescriptions(xml)
    const matchingDesc = descriptions.find(d => d.includes('admin bold'))
    expect(matchingDesc).toBeDefined()
    // Admin path: raw HTML is allowed through the renderer (not escaped)
    expect(matchingDesc).toContain('<b>admin bold</b>')
    // Sanitizer still runs: no script tags
    expect(matchingDesc).not.toContain('<script')
  })

  it('admin post links have nofollow (sanitizer adds it after render)', async () => {
    const slug = `${adminSlugPrefix}-link-${randomHex()}`
    await insertTestPost({
      title: `RSS Admin Link Test ${randomHex()}`,
      slug,
      createdById: adminUser.id,
      markdown: '[admin link](https://example.com/admin)',
    })

    const xml = await buildPostsRssFeed({ username: adminUsername })
    const descriptions = extractDescriptions(xml)
    const matchingDesc = descriptions.find(d => d.includes('example.com/admin'))
    expect(matchingDesc).toBeDefined()
    // sanitizeRssHtml always adds nofollow regardless of nofollowLinks render option
    expect(matchingDesc).toContain('nofollow')
  })
})
