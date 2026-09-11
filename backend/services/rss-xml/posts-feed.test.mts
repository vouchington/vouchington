import { randomBytes } from 'node:crypto'
import { describe, expect, it, beforeAll } from 'vitest'
import { createTestUserDirect, insertTestPost } from '@voucha/test-helpers'
import { deleteTestPost } from '@voucha/test-helpers/entities/posts'
import { buildPostsRssFeed } from './posts-feed.mts'
import type { PrivateUser } from '@services/users/types'

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
  let uniqueSlugPrefix: string
  let adminUser: PrivateUser
  let adminSlugPrefix: string

  beforeAll(async () => {
    testUser = await createTestUserDirect({ username: `rsspost${randomHex()}` })
    uniqueSlugPrefix = `rss-post-test-${randomHex()}`
    adminUser = await createTestUserDirect({
      username: `rsspostadmin${randomHex()}`,
      administrator: true,
    })
    adminSlugPrefix = `rss-admin-test-${randomHex()}`
  }, 30_000)

  it('renders markdown to HTML in descriptions', async () => {
    const slug = `${uniqueSlugPrefix}-bold-${randomHex()}`
    await insertTestPost({
      title: `RSS Bold Test ${randomHex()}`,
      slug,
      createdById: testUser.id,
      markdown: 'This is **bold** and *italic* text',
    })

    const xml = await buildPostsRssFeed({ username: testUser.username })

    expect(xml).toContain('<strong>bold</strong>')
    expect(xml).toContain('<em>italic</em>')
    // Must not contain raw markdown syntax
    expect(xml).not.toContain('**bold**')
    expect(xml).not.toContain('*italic*')
  }, 30_000)

  it('renders links as HTML in descriptions', async () => {
    const slug = `${uniqueSlugPrefix}-link-${randomHex()}`
    await insertTestPost({
      title: `RSS Link Test ${randomHex()}`,
      slug,
      createdById: testUser.id,
      markdown: 'Visit [Example](https://example.com) for more',
    })

    const xml = await buildPostsRssFeed({ username: testUser.username })

    expect(xml).toContain('href="https://example.com"')
    expect(xml).toContain('Example')
    // Must not show raw markdown link syntax
    expect(xml).not.toContain('[Example](https://example.com)')
  }, 30_000)

  it('does not contain script tags in descriptions', async () => {
    const slug = `${uniqueSlugPrefix}-xss-${randomHex()}`
    await insertTestPost({
      title: `RSS XSS Test ${randomHex()}`,
      slug,
      createdById: testUser.id,
      markdown: 'Normal text\n\n```html\n<script>alert("xss")</script>\n```',
    })

    const xml = await buildPostsRssFeed({ username: testUser.username })

    // Script tags must not appear in description blocks
    const descriptions = extractDescriptions(xml)
    expect(descriptions.length).toBeGreaterThan(0)
    for (const desc of descriptions) {
      expect(desc).not.toContain('<script')
    }
  }, 30_000)

  it('escapes HTML in non-admin post markdown', async () => {
    const slug = `${uniqueSlugPrefix}-escape-${randomHex()}`
    await insertTestPost({
      title: `RSS Escape Test ${randomHex()}`,
      slug,
      createdById: testUser.id,
      markdown: '<b>raw html</b> should be escaped',
    })

    const xml = await buildPostsRssFeed({ username: testUser.username })
    const descriptions = extractDescriptions(xml)

    // Non-admin: raw HTML should be escaped, not rendered
    const matchingDesc = descriptions.find(d => d.includes('raw html'))
    expect(matchingDesc).toBeDefined()
    expect(matchingDesc).toContain('&lt;b&gt;')
  }, 30_000)

  it('handles empty markdown', async () => {
    const slug = `${uniqueSlugPrefix}-empty-${randomHex()}`
    await insertTestPost({
      title: `RSS Empty Test ${randomHex()}`,
      slug,
      createdById: testUser.id,
      markdown: '',
    })

    const xml = await buildPostsRssFeed({ username: testUser.username })

    // Should still produce valid XML
    expect(xml).toContain('<?xml')
    expect(xml).toContain('<rss')
  }, 30_000)

  it('does not proxy images (RSS readers need direct URLs)', async () => {
    const slug = `${uniqueSlugPrefix}-img-${randomHex()}`
    await insertTestPost({
      title: `RSS Img Test ${randomHex()}`,
      slug,
      createdById: testUser.id,
      markdown: '![photo](https://example.com/photo.jpg)',
    })

    const xml = await buildPostsRssFeed({ username: testUser.username })
    const descriptions = extractDescriptions(xml)
    const matchingDesc = descriptions.find(d => d.includes('photo'))
    expect(matchingDesc).toBeDefined()
    expect(matchingDesc).not.toContain('/sideload/')
    expect(matchingDesc).toContain('https://example.com/photo.jpg')
  }, 30_000)

  it('excludes deleted posts', async () => {
    const slug = `${uniqueSlugPrefix}-del-${randomHex()}`
    const deletedUser = await createTestUserDirect({
      username: `rssdel${randomHex()}`,
    })
    const postId = await insertTestPost({
      title: `RSS Deleted Post ${randomHex()}`,
      slug,
      createdById: deletedUser.id,
      markdown: 'This post is deleted',
    })

    await deleteTestPost(postId)

    const xml = await buildPostsRssFeed({ username: deletedUser.username })

    // Should not contain the deleted post content
    expect(xml).not.toContain('This post is deleted')
  }, 30_000)

  it('produces valid RSS XML structure', async () => {
    const xml = await buildPostsRssFeed({ username: testUser.username })

    expect(xml).toContain('<?xml version="1.0" encoding="utf-8"?>')
    expect(xml).toContain('<rss')
    expect(xml).toContain('<channel>')
    expect(xml).toContain('</channel>')
    expect(xml).toContain('</rss>')
  }, 30_000)

  it('returns empty feed for non-existent user', async () => {
    const xml = await buildPostsRssFeed({ username: `nonexistent${randomHex()}` })

    expect(xml).toContain('<rss')
    expect(xml).not.toContain('<item>')
  }, 30_000)

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

    const xml = await buildPostsRssFeed({ username: testUser.username })
    const descriptions = extractDescriptions(xml)
    const matchingDesc = descriptions.find(d => d.includes('example.com'))
    expect(matchingDesc).toBeDefined()
    expect(matchingDesc).toContain('nofollow')
  }, 30_000)

  it('admin posts render raw HTML (allowHtml: true path)', async () => {
    const slug = `${adminSlugPrefix}-html-${randomHex()}`
    await insertTestPost({
      title: `RSS Admin HTML Test ${randomHex()}`,
      slug,
      createdById: adminUser.id,
      markdown: '<b>admin bold</b> and *italic*',
    })

    const xml = await buildPostsRssFeed({ username: adminUser.username })
    const descriptions = extractDescriptions(xml)
    const matchingDesc = descriptions.find(d => d.includes('admin bold'))
    expect(matchingDesc).toBeDefined()
    // Admin path: raw HTML is allowed through the renderer (not escaped)
    expect(matchingDesc).toContain('<b>admin bold</b>')
    // Sanitizer still runs: no script tags
    expect(matchingDesc).not.toContain('<script')
  }, 30_000)

  it('admin post links have nofollow (sanitizer adds it after render)', async () => {
    const slug = `${adminSlugPrefix}-link-${randomHex()}`
    await insertTestPost({
      title: `RSS Admin Link Test ${randomHex()}`,
      slug,
      createdById: adminUser.id,
      markdown: '[admin link](https://example.com/admin)',
    })

    const xml = await buildPostsRssFeed({ username: adminUser.username })
    const descriptions = extractDescriptions(xml)
    const matchingDesc = descriptions.find(d => d.includes('example.com/admin'))
    expect(matchingDesc).toBeDefined()
    // sanitizeRssHtml always adds nofollow regardless of nofollowLinks render option
    expect(matchingDesc).toContain('nofollow')
  }, 30_000)
})
