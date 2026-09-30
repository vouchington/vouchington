import { createHash, randomUUID } from 'node:crypto'
import type { ResolvedEmbed } from '@vouchington/embeds'
import { describe, expect, it } from 'vitest'
import { createTestUrlWithHostname, insertTestUrlDirect } from '@voucha/test-helpers/entities/urls'
import { insertTestCrawl } from '@voucha/test-helpers/entities/crawls'
import { insertTestRssFeedDirect } from '@voucha/test-helpers/entities/rss-feeds'
import { insertTestRssFeedItem } from '@voucha/test-helpers/entities/rss-feed-items'
import { setRssFeedItemMediaDetails } from '@voucha/test-helpers/entities/rss-feed-items-media'
import { updateUrl } from '@services/urls/update'
import { enableQueryCapture, stopTestQueryCapture } from '../../test-helpers/query-capture.mts'
import { getRssFeedItemEmbedsByItems } from './get-rss-feed-item-embeds.mts'
import { getUrlEmbedByUrlId, getUrlEmbedsByUrlIds } from './get-url-embed.mts'

const EMBED: ResolvedEmbed = {
  kind: 'player',
  requestedUrl: 'https://www.youtube.com/watch?v=shared-video',
  resolvedUrl: 'https://www.youtube.com/watch?v=shared-video',
  title: 'Shared video title',
  description: null,
  author: null,
  provider: { key: 'youtube', name: 'YouTube', url: null, resourceId: 'shared-video' },
  thumbnail: null,
  player: { url: 'https://www.youtube-nocookie.com/embed/shared-video', width: 640, height: 360 },
}

describe('URL embed response contract', () => {
  it('retains selected preview crawl og:audio when the newest raw crawl has no audio', async () => {
    const urlId = await createTestUrlWithHostname()
    await insertTestCrawl({
      urlId,
      statusCode: 200,
      markdown: '',
      metaTags: { 'og:audio': 'https://example.com/preview-audio.mp3' },
    })
    await insertTestCrawl({
      urlId,
      statusCode: 200,
      markdown: 'Newer raw snapshot without preview metadata',
      metaTags: { robots: 'index,follow' },
    })

    const expected = {
      media_type: 'audio',
      enclosure_url: 'https://example.com/preview-audio.mp3',
    }
    expect(await getUrlEmbedByUrlId(urlId)).toMatchObject(expected)
    expect((await getUrlEmbedsByUrlIds([urlId]))[urlId]).toMatchObject(expected)
  })

  it('falls through invalid thumbnail candidates in every embed query', async () => {
    const urlId = await createTestUrlWithHostname()
    const feed = await insertTestRssFeedDirect({})
    const itemId = await insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId,
      guid: randomUUID(),
      itemData: { title: 'Thumbnail fallback item' },
      contentSha256: createHash('sha256').update(randomUUID()).digest(),
    })
    const thumbnailUrl = `https://images.example.com/${randomUUID()}.jpg`
    await setRssFeedItemMediaDetails(itemId, {
      mediaType: 'article',
      enclosureUrl: null,
      enclosureType: null,
      durationSeconds: null,
      thumbnailUrl,
    })
    await insertTestCrawl({
      urlId,
      statusCode: 200,
      markdown: '',
      metaTags: {
        'og:image': 'javascript:alert(1)',
        'twitter:image': 'data:image/png;base64,invalid',
      },
      embedMetadata: {
        ...EMBED,
        thumbnail: { url: 'ftp://images.example.com/invalid.jpg', width: null, height: null },
      },
    })

    const expectedThumbnailSource = Buffer.from(thumbnailUrl).toString('base64url')
    const single = await getUrlEmbedByUrlId(urlId)
    const batch = await getUrlEmbedsByUrlIds([urlId])
    const rssItems = await getRssFeedItemEmbedsByItems([{ id: itemId, url: { id: urlId } }])
    expect(single!.thumbnail_url).toContain(expectedThumbnailSource)
    expect(batch[urlId].thumbnail_url).toContain(expectedThumbnailSource)
    expect(rssItems[itemId].thumbnail_url).toContain(expectedThumbnailSource)
  })

  it.each([
    ['resolves relative', '/media/episode.mp3', true],
    ['rejects non-HTTP', 'javascript:alert(1)', false],
  ])('normalizes crawl og:audio before publishing: %s', async (_name, audio, isAudio) => {
    const originalUrl = await insertTestUrlDirect(
      null,
      `https://origin-${randomUUID()}.example.com/outbound`,
    )
    const crawledSourceUrl = `https://audio-${randomUUID()}.example.com/articles/current`
    const crawledUrl = await insertTestUrlDirect(null, crawledSourceUrl)
    await updateUrl(originalUrl!.id, { canonical_url_id: crawledUrl!.id })
    const feed = await insertTestRssFeedDirect({})
    const itemId = await insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId: originalUrl!.id,
      guid: randomUUID(),
      itemData: { title: 'Crawl audio item' },
      contentSha256: createHash('sha256').update(randomUUID()).digest(),
    })
    await setRssFeedItemMediaDetails(itemId, {
      mediaType: 'article',
      enclosureUrl: null,
      enclosureType: null,
      durationSeconds: null,
      thumbnailUrl: null,
    })
    await insertTestCrawl({
      urlId: crawledUrl!.id,
      statusCode: 200,
      markdown: '',
      metaTags: { 'Og:AuDiO': audio },
    })

    const expected = {
      media_type: isAudio ? 'audio' : 'article',
      enclosure_url: isAudio ? new URL(audio, crawledSourceUrl).toString() : null,
    }
    expect(await getUrlEmbedByUrlId(originalUrl!.id)).toMatchObject(expected)
    expect((await getUrlEmbedsByUrlIds([originalUrl!.id]))[originalUrl!.id]).toMatchObject(expected)
    expect(
      (await getRssFeedItemEmbedsByItems([{ id: itemId, url: { id: originalUrl!.id } }]))[itemId],
    ).toMatchObject(expected)
  })

  it('classifies crawl og:audio as the effective audio enclosure for article RSS items', async () => {
    const urlId = await createTestUrlWithHostname()
    const feed = await insertTestRssFeedDirect({})
    const itemId = await insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId,
      guid: randomUUID(),
      itemData: { title: 'Crawl audio item' },
      contentSha256: createHash('sha256').update(randomUUID()).digest(),
    })
    await setRssFeedItemMediaDetails(itemId, {
      mediaType: 'article',
      enclosureUrl: null,
      enclosureType: null,
      durationSeconds: null,
      thumbnailUrl: null,
    })
    await insertTestCrawl({
      urlId,
      statusCode: 200,
      markdown: '',
      metaTags: { 'Og:AuDiO': 'https://example.com/crawl-audio.mp3' },
    })

    const expected = {
      media_type: 'audio',
      enclosure_url: 'https://example.com/crawl-audio.mp3',
    }
    expect(await getUrlEmbedByUrlId(urlId)).toMatchObject(expected)
    expect((await getUrlEmbedsByUrlIds([urlId]))[urlId]).toMatchObject(expected)
    expect(
      (await getRssFeedItemEmbedsByItems([{ id: itemId, url: { id: urlId } }]))[itemId],
    ).toMatchObject(expected)
  })

  it('uses narrow safe display projections in all public embed query rows', async () => {
    const urlId = await createTestUrlWithHostname()
    await expectNarrowPublicEmbedQuery('getUrlEmbedByUrlId', () => getUrlEmbedByUrlId(urlId))
    await expectNarrowPublicEmbedQuery('getUrlEmbedsByUrlIds', () => getUrlEmbedsByUrlIds([urlId]))
    await expectNarrowPublicEmbedQuery('getRssFeedItemEmbedsByItems', () =>
      getRssFeedItemEmbedsByItems([{ id: urlId, url: { id: urlId } }]),
    )
  })

  it('hides crawl-derived fields by default while retaining safe display projections', async () => {
    const urlId = await createTestUrlWithHostname()
    const resolvedAt = new Date('2026-09-01T00:00:00.000Z')
    const embedMetadata = { ...EMBED, kind: 'article' as const, player: null, thumbnail: null }
    const metaTags = {
      'og:title': 'Open Graph title',
      'Og:DeScRiPtIoN': 'Open Graph description',
      'Og:SiTe_NaMe': 'Open Graph publication',
      'twitter:image': 'https://example.com/twitter-image.jpg',
      nested: { locale: ['en_US', { primary: true }] },
      player: 'https://attacker.example/embed/not-authorized',
    }
    await insertTestCrawl({
      urlId,
      statusCode: 200,
      markdown: '',
      metaTags,
      embedMetadata,
      embedOEmbedUrl: 'https://www.youtube.com/oembed?url=shared-video',
      embedOEmbedResolvedAt: resolvedAt,
    })

    const result = await getUrlEmbedByUrlId(urlId)
    expect(result).toMatchObject({
      markdown: null,
      embed_metadata: null,
      meta_tags: null,
      embed_oembed_url: null,
      embed_oembed_resolved_at: null,
      player_url: 'https://www.youtube-nocookie.com/embed/shared-video',
      title: 'Shared video title',
      description: 'Open Graph description',
      provider_name: 'YouTube',
    })
    expect(result!.thumbnail_url).toMatch(/^https?:\/\/[^/]+\/sideload\//)
  })

  it('returns complete crawl-scoped metadata and oEmbed provenance for administrators', async () => {
    const urlId = await createTestUrlWithHostname()
    const resolvedAt = new Date('2026-09-01T00:00:00.000Z')
    const metaTags = {
      'oG:DeScRiPtIoN': 'Open Graph description',
      'Og:SiTe_NaMe': 'Open Graph publication',
      nested: { locale: ['en_US'] },
    }
    await insertTestCrawl({
      urlId,
      statusCode: 200,
      markdown: 'Administrator-only extracted content',
      metaTags,
      embedMetadata: EMBED,
      embedOEmbedUrl: 'https://www.youtube.com/oembed?url=shared-video',
      embedOEmbedResolvedAt: resolvedAt,
    })

    expect(await getUrlEmbedByUrlId(urlId, {}, 'administrator')).toMatchObject({
      markdown: 'Administrator-only extracted content',
      embed_metadata: EMBED,
      meta_tags: metaTags,
      embed_oembed_url: 'https://www.youtube.com/oembed?url=shared-video',
      embed_oembed_resolved_at: resolvedAt.toISOString(),
      title: 'Shared video title',
      description: 'Open Graph description',
      provider_name: 'YouTube',
    })
  })

  it('uses case-insensitive OG and Twitter text through safe public projections', async () => {
    const urlId = await createTestUrlWithHostname()
    const metaTags = {
      'Og:TiTlE': 'Open Graph title',
      'TWITTER:TITLE': 'Twitter title',
      'twitter:description': 'Twitter description',
      'OG:SITE_NAME': 'Example publication',
      'twitter:image': 'https://example.com/twitter-hero.jpg',
    }
    await insertTestCrawl({
      urlId,
      statusCode: 200,
      markdown: '',
      metaTags,
    })

    const result = await getUrlEmbedByUrlId(urlId)
    expect(result!.meta_tags).toBeNull()
    expect(result!.embed_metadata).toBeNull()
    expect(result).toMatchObject({
      title: 'Open Graph title',
      description: 'Twitter description',
      provider_name: 'Example publication',
    })
    expect(result!.thumbnail_url).toMatch(/^https?:\/\/[^/]+\/sideload\//)
  })
})

async function expectNarrowPublicEmbedQuery(
  annotation: string,
  runQuery: () => Promise<unknown>,
): Promise<void> {
  enableQueryCapture()
  try {
    await runQuery()
    const [query] = stopTestQueryCapture().filter(captured =>
      captured.text.includes(`/* ${annotation} */`),
    )

    expect(query).toBeDefined()
    const queryText = query!.text
    expect(queryText).toContain('AS display_embed_kind')
    expect(queryText).toContain('AS display_provider_key')
    expect(queryText).toContain('AS display_player_url')
    expect(queryText).not.toMatch(/\bAS display_embed_metadata\b/)
    expect(queryText).not.toContain('AS display_meta_tags')
    expect(queryText).toContain('THEN c.embed_metadata ELSE NULL END AS embed_metadata')
    expect(query!.values).toContain(false)
  } catch (error) {
    stopTestQueryCapture()
    throw error
  }
}
