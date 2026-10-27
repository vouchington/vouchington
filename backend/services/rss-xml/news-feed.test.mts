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
  let sourceTopicSlug: string
  let topicId: string
  let feedId: string

  beforeAll(async () => {
    const user = await createTestUserDirect({ username: `rssnews${randomHex()}` })
    sourceTopicSlug = `rss-news-test-${randomHex()}`
    topicId = await insertTestTopic({
      name: `RSS News Test ${randomHex()}`,
      slug: sourceTopicSlug,
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

  it('creates items with sanitized descriptions in feed XML', async () => {
    await createItemWithContent('<p>Clean news content</p><script>alert("owned-script")</script>')

    const xml = await buildNewsFeed({ sourceTopicSlugs: [sourceTopicSlug] })

    expect(xml).toContain('Clean news content')
    expect([...xml.matchAll(/<item>/g)]).toHaveLength(1)

    // Should contain at least one description block
    const descriptions = extractDescriptions(xml)
    expect(descriptions.length).toBeGreaterThan(0)

    // No description should contain script tags
    for (const desc of descriptions) {
      expect(desc).not.toContain('<script')
    }
  })

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

    const xml = await buildNewsFeed({ sourceTopicSlugs: [sourceTopicSlug], limit: 10 })

    expect(xml).toContain('YouTube XML description')
  })

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

    const titleA = `Batched Source Item A ${randomHex()}`
    const titleB = `Batched Source Item B ${randomHex()}`
    await createFeedItem(feedA, titleA)
    await createFeedItem(feedB, titleB)

    const xml = await buildNewsFeed({ sourceTopicSlugs: [sourceSlugA, sourceSlugB], limit: 10 })

    expect(xml).toContain('Batched Source Item A')
    expect(xml).toContain('Batched Source Item B')
    expect(xml).toContain(titleA)
    expect(xml).toContain(titleB)
    expect([...xml.matchAll(/<item>/g)]).toHaveLength(2)
  })
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
