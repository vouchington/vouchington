import { randomUUID } from 'node:crypto'
import type { ResolvedEmbed } from '@vouchington/embeds'
import { it, expect, describe } from 'vitest'
import { createTestUrlWithHostname } from '@voucha/test-helpers/entities/urls'
import { insertTestCrawl } from '@voucha/test-helpers/entities/crawls'
import {
  insertTestRssFeedItem,
  setRssFeedItemVideoMetadata,
} from '@voucha/test-helpers/entities/rss-feed-items'
import { insertTestRssFeedDirect } from '@voucha/test-helpers/entities/rss-feeds'
import { updateUrl } from '@services/urls/update'
import { addUrl } from '@services/urls/upsert'
import { getUrlEmbedByUrlId, getUrlEmbedsByUrlIds } from './get-url-embed.mts'

const YOUTUBE_EMBED: ResolvedEmbed = {
  kind: 'player',
  requestedUrl: 'https://www.youtube.com/watch?v=shared-video',
  resolvedUrl: 'https://www.youtube.com/watch?v=shared-video',
  title: 'Shared video title',
  description: 'Shared video description',
  author: { name: 'Shared author', url: null },
  provider: { key: 'youtube', name: 'YouTube', url: null, resourceId: 'shared-video' },
  thumbnail: {
    url: 'https://i.ytimg.com/vi/shared-video/hqdefault.jpg',
    width: 480,
    height: 360,
  },
  player: {
    url: 'https://www.youtube-nocookie.com/embed/shared-video',
    width: 640,
    height: 360,
  },
}

const VIMEO_EMBED: ResolvedEmbed = {
  ...YOUTUBE_EMBED,
  requestedUrl: 'https://vimeo.com/987654321',
  resolvedUrl: 'https://vimeo.com/987654321',
  provider: { key: 'vimeo', name: 'Vimeo', url: null, resourceId: '987654321' },
  player: { url: 'https://player.vimeo.com/video/987654321', width: 640, height: 360 },
}

describe('getUrlEmbedByUrlId', () => {
  it('returns null for a non-existent URL id', async () => {
    const result = await getUrlEmbedByUrlId(randomUUID())
    expect(result).toBeNull()
  })

  it('returns a bare embed with source_url for a URL with no feed item and no crawl', async () => {
    const urlId = await createTestUrlWithHostname()
    const result = await getUrlEmbedByUrlId(urlId)
    expect(result).not.toBeNull()
    expect(result!.source_url).toMatch(/^https:\/\/test-/)
    expect(result!.rss_feed_item_id).toBeNull()
    expect(result!.media_type).toBe('article')
    expect(result!.title).toBeNull()
    expect(result!.markdown).toBeNull()
    expect(result!.thumbnail_url).toBeNull()
    expect(result!.player_url).toBeNull()
    expect(result!.player_width).toBeNull()
    expect(result!.player_height).toBeNull()
  })

  it('projects normalized crawl player metadata into the legacy URL embed contract', async () => {
    const urlId = await createTestUrlWithHostname()
    await insertTestCrawl({
      urlId,
      statusCode: 200,
      markdown: 'Crawled markdown',
      embedMetadata: YOUTUBE_EMBED,
    })

    const result = await getUrlEmbedByUrlId(urlId)
    expect(result).toMatchObject({
      media_type: 'video',
      video_platform: 'youtube',
      video_id: 'shared-video',
      player_url: 'https://www.youtube-nocookie.com/embed/shared-video',
      player_width: 640,
      player_height: 360,
      title: 'Shared video title',
    })
    expect(result!.thumbnail_url).toMatch(/^https?:\/\/[^/]+\/sideload\//)
    expect(result).toMatchObject({
      embed_metadata: null,
      meta_tags: null,
      embed_oembed_url: null,
      embed_oembed_resolved_at: null,
    })
  })

  it('returns thumbnail_url proxied through /sideload/ when crawl has og:image', async () => {
    const urlId = await createTestUrlWithHostname()
    await insertTestCrawl({
      urlId,
      statusCode: 200,
      markdown: '',
      metaTags: { 'og:image': 'https://example.com/hero.jpg' },
    })

    const result = await getUrlEmbedByUrlId(urlId)
    expect(result).not.toBeNull()
    expect(result!.thumbnail_url).toMatch(/^https?:\/\/[^/]+\/sideload\//)
    expect(result!.thumbnail_url).toContain('w=640')
  })

  it('returns crawl data from the canonical URL when the original URL is a redirect', async () => {
    const originalUrlId = await createTestUrlWithHostname()
    const canonicalUrlId = await createTestUrlWithHostname()
    await updateUrl(originalUrlId, { canonical_url_id: canonicalUrlId })
    await insertTestCrawl({
      urlId: canonicalUrlId,
      statusCode: 200,
      markdown: 'Canonical article content.',
      title: 'Canonical Article Title',
      embedMetadata: null,
    })

    const result = await getUrlEmbedByUrlId(originalUrlId, {}, 'administrator')
    expect(result).not.toBeNull()
    expect(result!.title).toBe('Canonical Article Title')
    expect(result!.markdown).toBe('Canonical article content.')
  })

  it('detects video media_type and platform for a YouTube source URL', async () => {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 8)
    const url = await addUrl(null, `https://www.youtube.com/watch?v=${suffix}`, {
      content_type: 'text/html',
      skipCreatedEvents: true,
    })
    const urlId = url!.id
    const result = await getUrlEmbedByUrlId(urlId)
    expect(result).not.toBeNull()
    expect(result!.media_type).toBe('video')
    expect(result!.video_platform).toBe('youtube')
    expect(result!.video_id).toBe(suffix)
  })

  it('detects audio media_type from og:audio crawl when no rss_feed_item exists', async () => {
    const urlId = await createTestUrlWithHostname()
    await insertTestCrawl({
      urlId,
      statusCode: 200,
      markdown: '',
      metaTags: { 'og:audio': 'https://example.com/episode.mp3' },
    })
    const result = await getUrlEmbedByUrlId(urlId)
    expect(result).not.toBeNull()
    expect(result!.media_type).toBe('audio')
    expect(result!.enclosure_url).toBe('https://example.com/episode.mp3')
  })

  it('detects video media_type and platform for a Vimeo source URL', async () => {
    const vimeoId = '123456789'
    const url = await addUrl(null, `https://vimeo.com/${vimeoId}`, {
      content_type: 'text/html',
      skipCreatedEvents: true,
    })
    const result = await getUrlEmbedByUrlId(url!.id)
    expect(result).not.toBeNull()
    expect(result!.media_type).toBe('video')
    expect(result!.video_platform).toBe('vimeo')
    expect(result!.video_id).toBe(vimeoId)
  })

  it('uses only validated RSS player URLs for non-provider item links', async () => {
    const urlId = await createTestUrlWithHostname()
    const feed = await insertTestRssFeedDirect({})
    const playerUrl = 'https://www.youtube-nocookie.com/embed/rss-video'
    const itemId = await insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId,
      guid: randomUUID(),
      itemData: { player_url: playerUrl },
      contentSha256: Buffer.alloc(32, 1),
    })
    await setRssFeedItemVideoMetadata(itemId, {
      videoId: 'rss-video',
      videoPlatform: 'youtube',
    })
    const invalidUrlId = await createTestUrlWithHostname()
    const invalidItemId = await insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId: invalidUrlId,
      guid: randomUUID(),
      itemData: { player_url: 'https://attacker.example/embed/rss-video' },
      contentSha256: Buffer.alloc(32, 2),
    })
    await setRssFeedItemVideoMetadata(invalidItemId, {
      videoId: 'rss-video',
      videoPlatform: 'youtube',
    })

    expect((await getUrlEmbedByUrlId(urlId))?.player_url).toBe(playerUrl)
    const batch = await getUrlEmbedsByUrlIds([urlId, invalidUrlId])
    expect(batch[urlId].player_url).toBe(playerUrl)
    expect(batch[invalidUrlId].player_url).toBeNull()
  })

  it('keeps authoritative crawl player and provider metadata together', async () => {
    const urlId = await createTestUrlWithHostname()
    const feed = await insertTestRssFeedDirect({})
    const itemId = await insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId,
      guid: randomUUID(),
      itemData: { player_url: 'https://www.youtube-nocookie.com/embed/rss-video' },
      contentSha256: Buffer.alloc(32, 3),
    })
    await setRssFeedItemVideoMetadata(itemId, {
      videoId: 'rss-video',
      videoPlatform: 'youtube',
    })
    await insertTestCrawl({ urlId, statusCode: 200, markdown: '', embedMetadata: VIMEO_EMBED })

    const expected = {
      video_platform: 'vimeo',
      video_id: '987654321',
      player_url: 'https://player.vimeo.com/video/987654321',
    }
    expect(await getUrlEmbedByUrlId(urlId)).toMatchObject(expected)
    expect((await getUrlEmbedsByUrlIds([urlId]))[urlId]).toMatchObject(expected)
  })
})

describe('getUrlEmbedsByUrlIds', () => {
  it('returns empty object for empty input', async () => {
    const result = await getUrlEmbedsByUrlIds([])
    expect(result).toEqual({})
  })

  it('returns a record keyed by url_id for multiple URLs', async () => {
    const urlId1 = await createTestUrlWithHostname()
    const urlId2 = await createTestUrlWithHostname()
    const result = await getUrlEmbedsByUrlIds([urlId1, urlId2])
    expect(result).toHaveProperty(urlId1)
    expect(result).toHaveProperty(urlId2)
  })

  it('returns embed keyed by url_id for a URL with no feed item or crawl', async () => {
    const urlId = await createTestUrlWithHostname()
    const result = await getUrlEmbedsByUrlIds([urlId])
    expect(result[urlId]).toBeDefined()
    expect(result[urlId].media_type).toBe('article')
  })

  it('uses metadata from the selected crawl without copying from another crawl', async () => {
    const urlId = await createTestUrlWithHostname()
    await insertTestCrawl({
      urlId,
      statusCode: 200,
      markdown: 'Resolved crawl',
      embedMetadata: YOUTUBE_EMBED,
    })
    await insertTestCrawl({
      urlId,
      statusCode: 200,
      markdown: 'Skipped crawl',
      embedMetadata: { ...YOUTUBE_EMBED, title: 'Stale title' },
    })

    expect((await getUrlEmbedByUrlId(urlId))?.title).toBe('Stale title')
    expect((await getUrlEmbedsByUrlIds([urlId]))[urlId].title).toBe('Stale title')
  })

  it('treats a resolved null result as an authoritative metadata clear', async () => {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 8)
    const url = await addUrl(null, `https://www.youtube.com/watch?v=${suffix}`, {
      content_type: 'text/html',
      skipCreatedEvents: true,
    })
    const urlId = url!.id
    await insertTestCrawl({
      urlId,
      statusCode: 200,
      markdown: 'Video crawl',
      embedMetadata: YOUTUBE_EMBED,
    })
    await insertTestCrawl({
      urlId,
      statusCode: 200,
      markdown: 'Article crawl',
      title: 'Plain article',
      embedMetadata: null,
    })

    const result = await getUrlEmbedByUrlId(urlId)
    expect(result?.title).toBe('Plain article')
    expect(result?.media_type).toBe('article')
    expect(result?.video_platform).toBeNull()
    expect(result?.video_id).toBeNull()
    expect(result?.player_url).toBeNull()
    expect((await getUrlEmbedsByUrlIds([urlId]))[urlId].player_url).toBeNull()
  })
})
