import { randomBytes, createHash } from 'node:crypto'
import { describe, expect, it, beforeAll } from 'vitest'
import {
  createTestUserDirect,
  insertTestTopic,
  insertTestRssFeed,
  insertTestRssFeedItem,
} from '@voucha/test-helpers'
import { addUrl } from '@services/urls'
import { updateRssFeedTiming } from '@voucha/test-helpers/entities/rss-feeds'
import { sanitizeRssHtml } from '@jongleberry/vurst-html'
import { buildNewsFeed } from './news-feed.mts'

const randomHex = () => randomBytes(4).toString('hex')

/** Extract all CDATA description blocks from RSS XML. */
function extractDescriptions(xml: string): string[] {
  const matches = [
    ...xml.matchAll(/<description>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]*))<\/description>/g),
  ]
  return matches.map(m => m[1] ?? m[2] ?? '')
}

describe('news feed sanitization', () => {
  const scriptScheme = `java${'script'}:`
  let topicId: string
  let feedId: string

  beforeAll(async () => {
    const user = await createTestUserDirect({ username: `rssnews${randomHex()}` })
    topicId = await insertTestTopic({
      name: `RSS News Test ${randomHex()}`,
      slug: `rss-news-test-${randomHex()}`,
      createdById: user.id,
    })
    feedId = await insertTestRssFeed({ topicId, title: `Test News Feed ${randomHex()}` })
    await updateRssFeedTiming(feedId, new Date())
  })

  async function createItemWithContent(content: string): Promise<string> {
    const random = randomHex()
    const guid = `guid-${random}`
    const urlObj = await addUrl(null, `https://example.com/news-${random}`, {
      content_type: 'text/html',
    })
    const contentSha256 = createHash('sha256').update(random).digest()
    return insertTestRssFeedItem({
      rssFeedId: feedId,
      urlId: urlObj!.id,
      guid,
      itemData: {
        title: `Test News Item ${random}`,
        link: `https://example.com/news-${random}`,
        'content:encodedSnippet': content,
      },
      contentSha256,
    })
  }

  it('sanitizes script tags from descriptions', async () => {
    const html = '<p>Safe content</p><script>alert("xss")</script>'
    const sanitized = await sanitizeRssHtml(Buffer.from(html, 'utf-8'))
    const result = sanitized.html.toString('utf-8')

    expect(result).toContain('Safe content')
    expect(result).not.toContain('<script')
    expect(result).not.toContain('alert')
  }, 30_000)

  it('strips event handlers from descriptions', async () => {
    const html = '<img src="x" onerror="alert(1)"><p>Normal text</p>'
    const sanitized = await sanitizeRssHtml(Buffer.from(html, 'utf-8'))
    const result = sanitized.html.toString('utf-8')

    expect(result).toContain('Normal text')
    expect(result).not.toContain('onerror')
    expect(result).not.toContain('alert')
  }, 30_000)

  it('removes javascript: URLs from descriptions', async () => {
    const html = `<a href="${scriptScheme}alert(1)">click me</a><p>Safe</p>`
    const sanitized = await sanitizeRssHtml(Buffer.from(html, 'utf-8'))
    const result = sanitized.html.toString('utf-8')

    expect(result).toContain('Safe')
    expect(result).not.toContain(scriptScheme)
  }, 30_000)

  it('preserves safe HTML in descriptions', async () => {
    const html = '<p>Normal <strong>bold</strong> and <em>italic</em> text</p>'
    const sanitized = await sanitizeRssHtml(Buffer.from(html, 'utf-8'))
    const result = sanitized.html.toString('utf-8')

    expect(result).toContain('<p>')
    expect(result).toContain('<strong>bold</strong>')
    expect(result).toContain('<em>italic</em>')
  }, 30_000)

  it('returns empty string for empty content', async () => {
    const sanitized = await sanitizeRssHtml(Buffer.from('', 'utf-8'))
    const result = sanitized.html.toString('utf-8')
    expect(result).toBe('')
  }, 30_000)

  it('strips style attributes', async () => {
    const html = '<p style="color:red">Styled text</p>'
    const sanitized = await sanitizeRssHtml(Buffer.from(html, 'utf-8'))
    const result = sanitized.html.toString('utf-8')

    expect(result).toContain('Styled text')
    expect(result).not.toContain('style=')
  }, 30_000)

  it('removes iframe elements', async () => {
    const html = '<iframe src="https://evil.com"></iframe><p>After iframe</p>'
    const sanitized = await sanitizeRssHtml(Buffer.from(html, 'utf-8'))
    const result = sanitized.html.toString('utf-8')

    expect(result).toContain('After iframe')
    expect(result).not.toContain('<iframe')
    expect(result).not.toContain('evil.com')
  }, 30_000)

  it('adds nofollow to links', async () => {
    const html = '<a href="https://example.com">link</a>'
    const sanitized = await sanitizeRssHtml(Buffer.from(html, 'utf-8'))
    const result = sanitized.html.toString('utf-8')

    expect(result).toContain('rel="nofollow noopener"')
  }, 30_000)

  it('creates items with sanitized descriptions in feed XML', async () => {
    await createItemWithContent('<p>Clean news content</p>')

    const xml = await buildNewsFeed({})

    // Should contain at least one description block
    const descriptions = extractDescriptions(xml)
    expect(descriptions.length).toBeGreaterThan(0)

    // No description should contain script tags
    for (const desc of descriptions) {
      expect(desc).not.toContain('<script')
    }
  }, 60_000)

  it('uses media:description for news feed XML descriptions', async () => {
    const random = randomHex()
    const urlObj = await addUrl(null, `https://example.com/news-${random}`, {
      content_type: 'text/html',
    })
    await insertTestRssFeedItem({
      rssFeedId: feedId,
      urlId: urlObj!.id,
      guid: `guid-${random}`,
      itemData: {
        title: `Test News Item ${random}`,
        link: `https://example.com/news-${random}`,
        'content:encodedSnippet': '<p>&nbsp;</p>',
        'media:description': '<p>YouTube XML description</p>',
      },
      contentSha256: createHash('sha256').update(random).digest(),
    })

    const xml = await buildNewsFeed({ limit: 10 })

    expect(xml).toContain('YouTube XML description')
  }, 60_000)

  it('filters by multiple source topic slugs with one source feed lookup', async () => {
    const user = await createTestUserDirect({ username: `rsssourcemulti${randomHex()}` })
    const sourceSlugA = `rss-source-a-${randomHex()}`
    const sourceSlugB = `rss-source-b-${randomHex()}`
    const sourceTopicA = await insertTestTopic({
      name: `RSS Source A ${randomHex()}`,
      slug: sourceSlugA,
      createdById: user.id,
      topicType: 'rss_feed',
    })
    const sourceTopicB = await insertTestTopic({
      name: `RSS Source B ${randomHex()}`,
      slug: sourceSlugB,
      createdById: user.id,
      topicType: 'rss_feed',
    })
    const feedA = await insertTestRssFeed({
      topicId: sourceTopicA,
      title: `Source Feed A ${randomHex()}`,
    })
    const feedB = await insertTestRssFeed({
      topicId: sourceTopicB,
      title: `Source Feed B ${randomHex()}`,
    })
    await updateRssFeedTiming(feedA, new Date())
    await updateRssFeedTiming(feedB, new Date())

    await createFeedItem(feedA, `Batched Source Item A ${randomHex()}`)
    await createFeedItem(feedB, `Batched Source Item B ${randomHex()}`)

    const xml = await buildNewsFeed({ sourceTopicSlugs: [sourceSlugA, sourceSlugB], limit: 10 })

    expect(xml).toContain('Batched Source Item A')
    expect(xml).toContain('Batched Source Item B')
  }, 60_000)
})

async function createFeedItem(rssFeedId: string, title: string): Promise<string> {
  const random = randomHex()
  const urlObj = await addUrl(null, `https://example.com/news-source-${random}`, {
    content_type: 'text/html',
  })
  return insertTestRssFeedItem({
    rssFeedId,
    urlId: urlObj!.id,
    guid: `source-guid-${random}`,
    itemData: {
      title,
      link: `https://example.com/news-source-${random}`,
      'content:encodedSnippet': '<p>Source content</p>',
    },
    contentSha256: createHash('sha256').update(random).digest(),
  })
}
