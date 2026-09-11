import type { ResolvedEmbed } from '@vouchington/embeds'
import { describe, expect, it } from 'vitest'
import { createTestUrlWithHostname } from '@voucha/test-helpers/entities/urls'
import { insertTestCrawl } from '@voucha/test-helpers/entities/crawls'
import { getUrlEmbedByUrlId, getUrlEmbedsByUrlIds } from './get-url-embed.mts'

const RESOLVED_EMBED: ResolvedEmbed = {
  kind: 'player',
  requestedUrl: 'https://www.youtube.com/watch?v=shared-video',
  resolvedUrl: 'https://www.youtube.com/watch?v=shared-video',
  title: 'Shared video title',
  description: null,
  author: null,
  provider: { key: 'youtube', name: 'YouTube', url: null, resourceId: 'shared-video' },
  thumbnail: null,
  player: {
    url: 'https://www.youtube-nocookie.com/embed/shared-video',
    width: 640,
    height: 360,
  },
}

describe('URL embed crawl history', () => {
  it('keeps the preview crawl independent from the latest successful administrator raw snapshot', async () => {
    const urlId = await createTestUrlWithHostname()
    const resolvedAt = new Date('2026-09-01T00:00:00.000Z')
    await insertTestCrawl({
      urlId,
      statusCode: 200,
      markdown: 'Historical crawl markdown',
      embedMetadata: RESOLVED_EMBED,
      metaTags: { 'og:title': 'Historical Open Graph title' },
      embedOEmbedUrl: 'https://www.youtube.com/oembed?url=shared-video',
      embedOEmbedResolvedAt: resolvedAt,
    })
    await insertTestCrawl({
      urlId,
      statusCode: 200,
      markdown: 'Latest crawl markdown',
      title: 'Latest crawl title',
      metaTags: { robots: 'index,follow', viewport: 'width=device-width' },
    })

    const expectedRawSnapshot = {
      markdown: 'Latest crawl markdown',
      embed_metadata: null,
      meta_tags: { robots: 'index,follow', viewport: 'width=device-width' },
      embed_oembed_url: null,
      embed_oembed_resolved_at: null,
    }
    const expectedSafeDisplay = {
      title: 'Shared video title',
      player_url: 'https://www.youtube-nocookie.com/embed/shared-video',
    }

    expect(await getUrlEmbedByUrlId(urlId, {}, 'administrator')).toMatchObject({
      ...expectedRawSnapshot,
      ...expectedSafeDisplay,
    })
    expect((await getUrlEmbedsByUrlIds([urlId], {}, 'administrator'))[urlId]).toMatchObject({
      ...expectedRawSnapshot,
      ...expectedSafeDisplay,
    })
  })

  it('keeps the preview crawl across a content-only raw snapshot', async () => {
    const urlId = await createTestUrlWithHostname()
    await insertTestCrawl({
      urlId,
      statusCode: 200,
      markdown: 'Resolved crawl',
      embedMetadata: RESOLVED_EMBED,
    })
    await insertTestCrawl({
      urlId,
      statusCode: 200,
      markdown: 'Latest crawl content',
      title: 'Latest page title',
    })

    const expected = {
      markdown: 'Latest crawl content',
      embed_metadata: null,
      title: 'Shared video title',
      player_url: 'https://www.youtube-nocookie.com/embed/shared-video',
    }
    expect(await getUrlEmbedByUrlId(urlId, {}, 'administrator')).toMatchObject(expected)
    expect((await getUrlEmbedsByUrlIds([urlId], {}, 'administrator'))[urlId]).toMatchObject(
      expected,
    )
  })

  it('classifies normalized article metadata with a provider resource as video', async () => {
    const urlId = await createTestUrlWithHostname()
    await insertTestCrawl({
      urlId,
      statusCode: 200,
      markdown: '',
      embedMetadata: {
        ...RESOLVED_EMBED,
        kind: 'article',
        provider: { ...RESOLVED_EMBED.provider!, resourceId: 'article-video' },
        player: null,
      },
    })

    expect(await getUrlEmbedByUrlId(urlId)).toMatchObject({
      media_type: 'video',
      video_platform: 'youtube',
      video_id: 'article-video',
      player_url: 'https://www.youtube-nocookie.com/embed/article-video',
    })
  })
})
