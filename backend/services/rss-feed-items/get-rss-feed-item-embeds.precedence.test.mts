import { createHash, randomUUID } from 'node:crypto'
import type { ResolvedEmbed } from '@vouchington/embeds'
import { describe, expect, it } from 'vitest'
import { insertTestCrawl } from '@voucha/test-helpers/entities/crawls'
import { insertTestRssFeedDirect } from '@voucha/test-helpers/entities/rss-feeds'
import { insertTestRssFeedItem } from '@voucha/test-helpers/entities/rss-feed-items'
import { createTestUrlWithHostname } from '@voucha/test-helpers/entities/urls'
import { getRssFeedItemEmbedsByItems } from './get-rss-feed-item-embeds.mts'

describe('getRssFeedItemEmbedsByItems safe text', () => {
  it('retains selected preview crawl og:audio for single and batch RSS item queries', async () => {
    const feed = await insertTestRssFeedDirect({})
    const firstUrlId = await createTestUrlWithHostname()
    const secondUrlId = await createTestUrlWithHostname()
    const suffix = randomUUID()
    const firstItemId = await insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId: firstUrlId,
      guid: `first-${suffix}`,
      itemData: { title: 'First preview audio item' },
      contentSha256: createHash('sha256').update(`first-${suffix}`).digest(),
    })
    const secondItemId = await insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId: secondUrlId,
      guid: `second-${suffix}`,
      itemData: { title: 'Second preview audio item' },
      contentSha256: createHash('sha256').update(`second-${suffix}`).digest(),
    })
    for (const [urlId, audioName] of [
      [firstUrlId, 'first'],
      [secondUrlId, 'second'],
    ] as const) {
      await insertTestCrawl({
        urlId,
        statusCode: 200,
        markdown: '',
        metaTags: { 'Og:AuDiO': `https://example.com/${audioName}.mp3` },
      })
      await insertTestCrawl({
        urlId,
        statusCode: 200,
        markdown: 'Latest raw snapshot',
        metaTags: { robots: 'index,follow' },
      })
    }

    expect(
      (await getRssFeedItemEmbedsByItems([{ id: firstItemId, url: { id: firstUrlId } }]))[
        firstItemId
      ],
    ).toMatchObject({
      media_type: 'audio',
      enclosure_url: 'https://example.com/first.mp3',
    })
    expect(
      await getRssFeedItemEmbedsByItems([
        { id: firstItemId, url: { id: firstUrlId } },
        { id: secondItemId, url: { id: secondUrlId } },
      ]),
    ).toMatchObject({
      [firstItemId]: {
        media_type: 'audio',
        enclosure_url: 'https://example.com/first.mp3',
      },
      [secondItemId]: {
        media_type: 'audio',
        enclosure_url: 'https://example.com/second.mp3',
      },
    })
  })

  it('keeps the preview crawl independent from the latest successful administrator raw snapshot', async () => {
    const feed = await insertTestRssFeedDirect({})
    const urlId = await createTestUrlWithHostname()
    const itemId = await insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId,
      guid: randomUUID(),
      itemData: { title: 'RSS title' },
      contentSha256: createHash('sha256').update(randomUUID()).digest(),
    })
    const historicalEmbed = makeEmbed(0, {
      title: 'Historical normalized title',
      description: 'Historical normalized description',
      provider: 'Historical publisher',
    })
    await insertTestCrawl({
      urlId,
      statusCode: 200,
      markdown: 'Historical markdown',
      metaTags: { 'og:title': 'Historical Open Graph title' },
      embedMetadata: historicalEmbed,
      embedOEmbedUrl: 'https://example.com/oembed',
      embedOEmbedResolvedAt: new Date('2026-09-01T00:00:00.000Z'),
    })
    await insertTestCrawl({
      urlId,
      statusCode: 200,
      markdown: 'Latest markdown',
      title: 'Latest crawl title',
      metaTags: { robots: 'index,follow', viewport: 'width=device-width' },
    })

    const input = [{ id: itemId, url: { id: urlId } }]
    expect((await getRssFeedItemEmbedsByItems(input))[itemId]).toMatchObject({
      title: 'Historical normalized title',
      description: 'Historical normalized description',
      provider_name: 'Historical publisher',
      markdown: null,
      embed_metadata: null,
      meta_tags: null,
      embed_oembed_url: null,
      embed_oembed_resolved_at: null,
    })
    expect((await getRssFeedItemEmbedsByItems(input, {}, 'administrator'))[itemId]).toMatchObject({
      title: 'Historical normalized title',
      description: 'Historical normalized description',
      provider_name: 'Historical publisher',
      markdown: 'Latest markdown',
      embed_metadata: null,
      meta_tags: { robots: 'index,follow', viewport: 'width=device-width' },
      embed_oembed_url: null,
      embed_oembed_resolved_at: null,
    })
  })

  it('selects normalized, case-insensitive social, RSS, and crawl values in precedence order', async () => {
    const feed = await insertTestRssFeedDirect({})
    const socialMetaTags = {
      'OG:TITLE': 'Open Graph title',
      'OG:DESCRIPTION': 'Open Graph description',
      'OG:SITE_NAME': 'Open Graph publisher',
      'TWITTER:TITLE': 'Twitter title',
      'TWITTER:DESCRIPTION': 'Twitter description',
    }
    const cases = [
      [
        {
          title: 'Normalized title',
          description: 'Normalized description',
          provider: 'Normalized publisher',
        },
        socialMetaTags,
        'RSS title',
        {
          title: 'Normalized title',
          description: 'Normalized description',
          provider_name: 'Normalized publisher',
        },
      ],
      [
        null,
        socialMetaTags,
        'RSS title',
        {
          title: 'Open Graph title',
          description: 'Open Graph description',
          provider_name: 'Open Graph publisher',
        },
      ],
      [
        null,
        { 'TWITTER:TITLE': 'Twitter title', 'TWITTER:DESCRIPTION': 'Twitter description' },
        'RSS title',
        { title: 'Twitter title', description: 'Twitter description', provider_name: null },
      ],
      [null, {}, 'RSS title', { title: 'RSS title', description: null, provider_name: null }],
      [null, {}, null, { title: 'Crawl title', description: null, provider_name: null }],
    ] as const

    for (const [index, [normalized, metaTags, itemTitle, expected]] of cases.entries()) {
      const urlId = await createTestUrlWithHostname()
      const itemId = await insertTestRssFeedItem({
        rssFeedId: feed.id,
        urlId,
        guid: randomUUID(),
        itemData: itemTitle ? { title: itemTitle } : {},
        contentSha256: createHash('sha256').update(randomUUID()).digest(),
      })
      await insertTestCrawl({
        urlId,
        statusCode: 200,
        markdown: '',
        title: 'Crawl title',
        metaTags,
        embedMetadata: makeEmbed(index, normalized),
      })

      expect(
        (await getRssFeedItemEmbedsByItems([{ id: itemId, url: { id: urlId } }]))[itemId],
      ).toMatchObject(expected)
    }
  })
})

function makeEmbed(
  index: number,
  normalized: { title: string; description: string; provider: string } | null,
): ResolvedEmbed {
  return {
    kind: 'article',
    requestedUrl: `https://example.com/${index}`,
    resolvedUrl: `https://example.com/${index}`,
    title: normalized?.title ?? null,
    description: normalized?.description ?? null,
    provider: normalized
      ? { key: 'example', name: normalized.provider, url: null, resourceId: null }
      : null,
    author: null,
    thumbnail: null,
    player: null,
  }
}
