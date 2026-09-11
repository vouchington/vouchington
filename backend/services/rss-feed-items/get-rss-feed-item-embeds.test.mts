import { createHash, randomUUID } from 'node:crypto'
import type { ResolvedEmbed } from '@vouchington/embeds'
import { describe, expect, it } from 'vitest'
import { insertTestCrawl } from '@voucha/test-helpers/entities/crawls'
import { createTestTopic } from '@voucha/test-helpers/entities/create-test-entities'
import { insertTestRssFeedDirect } from '@voucha/test-helpers/entities/rss-feeds'
import { insertTestRssFeedItem } from '@voucha/test-helpers/entities/rss-feed-items'
import { setRssFeedItemMediaDetails } from '@voucha/test-helpers/entities/rss-feed-items-media'
import { createTestUrlWithHostname } from '@voucha/test-helpers/entities/urls'
import { getRssFeedItemEmbedsByItems } from './get-rss-feed-item-embeds.mts'

function sideloadSource(url: string): string {
  const encoded = new URL(url).pathname.split('/sideload/')[1]!
  return Buffer.from(encoded, 'base64url').toString('utf8')
}

describe('getRssFeedItemEmbedsByItems', () => {
  it('projects crawl-derived fields only for administrator access', async () => {
    const urlId = await createTestUrlWithHostname()
    const feed = await insertTestRssFeedDirect({})
    const itemId = await insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId,
      guid: randomUUID(),
      itemData: { title: 'Access-projected item' },
      contentSha256: createHash('sha256').update(randomUUID()).digest(),
    })
    const embedMetadata: ResolvedEmbed = {
      kind: 'article',
      requestedUrl: 'https://example.com/article',
      resolvedUrl: 'https://example.com/article',
      title: 'Raw normalized title',
      description: 'Raw normalized description',
      author: null,
      provider: { key: 'example', name: 'Raw normalized publisher', url: null, resourceId: null },
      thumbnail: null,
      player: null,
    }
    const metaTags = {
      'og:title': 'Raw Open Graph title',
      'og:description': 'Raw Open Graph description',
      'og:site_name': 'Raw Open Graph publisher',
      nested: { sensitive: true },
    }
    await insertTestCrawl({
      urlId,
      statusCode: 200,
      markdown: 'Raw extracted markdown',
      metaTags,
      embedMetadata,
      embedOEmbedUrl: 'https://example.com/oembed',
      embedOEmbedResolvedAt: new Date('2026-09-01T00:00:00.000Z'),
    })
    const input = [{ id: itemId, url: { id: urlId } }]
    expect((await getRssFeedItemEmbedsByItems(input))[itemId]).toMatchObject({
      title: 'Raw normalized title',
      description: 'Raw normalized description',
      provider_name: 'Raw normalized publisher',
      markdown: null,
      embed_metadata: null,
      meta_tags: null,
      embed_oembed_url: null,
      embed_oembed_resolved_at: null,
    })
    expect((await getRssFeedItemEmbedsByItems(input, {}, 'administrator'))[itemId]).toMatchObject({
      markdown: 'Raw extracted markdown',
      embed_metadata: embedMetadata,
      meta_tags: metaTags,
      embed_oembed_url: 'https://example.com/oembed',
      embed_oembed_resolved_at: '2026-09-01T00:00:00.000Z',
    })
  })

  it('keeps item-specific fields isolated when RSS items share a source URL', async () => {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
    const sharedUrlId = await createTestUrlWithHostname()
    const firstTopic = await createTestTopic({
      name: `First show ${suffix}`,
      slug: `first-show-${suffix}`,
    })
    const secondTopic = await createTestTopic({
      name: `Second show ${suffix}`,
      slug: `second-show-${suffix}`,
    })
    const firstFeed = await insertTestRssFeedDirect({
      topicId: firstTopic.id,
      title: `First feed ${suffix}`,
    })
    const secondFeed = await insertTestRssFeedDirect({
      topicId: secondTopic.id,
      title: `Second feed ${suffix}`,
    })
    const firstItemId = await insertTestRssFeedItem({
      rssFeedId: firstFeed.id,
      urlId: sharedUrlId,
      guid: `first-${suffix}`,
      itemData: { title: `First item ${suffix}` },
      contentSha256: createHash('sha256').update(`first-${suffix}`).digest(),
    })
    const secondItemId = await insertTestRssFeedItem({
      rssFeedId: secondFeed.id,
      urlId: sharedUrlId,
      guid: `second-${suffix}`,
      itemData: { title: `Second item ${suffix}` },
      contentSha256: createHash('sha256').update(`second-${suffix}`).digest(),
    })
    await Promise.all([
      setRssFeedItemMediaDetails(firstItemId, {
        mediaType: 'audio',
        enclosureUrl: `https://example.com/${suffix}/first.mp3`,
        enclosureType: 'audio/mpeg',
        durationSeconds: 61,
        thumbnailUrl: null,
      }),
      setRssFeedItemMediaDetails(secondItemId, {
        mediaType: 'video',
        enclosureUrl: `https://example.com/${suffix}/second.mp4`,
        enclosureType: 'video/mp4',
        durationSeconds: 122,
        thumbnailUrl: null,
      }),
    ])

    const embeds = await getRssFeedItemEmbedsByItems([
      { id: firstItemId, url: { id: sharedUrlId } },
      { id: secondItemId, url: { id: sharedUrlId } },
    ])

    expect(embeds[firstItemId]).toMatchObject({
      rss_feed_item_id: firstItemId,
      title: `First item ${suffix}`,
      media_type: 'audio',
      enclosure_url: `https://example.com/${suffix}/first.mp3`,
      enclosure_type: 'audio/mpeg',
      duration_seconds: 61,
      show_id: firstFeed.id,
      show_title: `First feed ${suffix}`,
      show_topic_slug: firstTopic.slug,
    })
    expect(embeds[secondItemId]).toMatchObject({
      rss_feed_item_id: secondItemId,
      title: `Second item ${suffix}`,
      media_type: 'video',
      enclosure_url: `https://example.com/${suffix}/second.mp4`,
      enclosure_type: 'video/mp4',
      duration_seconds: 122,
      show_id: secondFeed.id,
      show_title: `Second feed ${suffix}`,
      show_topic_slug: secondTopic.slug,
    })
  })

  it('uses normalized, OG, then Twitter thumbnails through the sideload projection', async () => {
    const urlId = await createTestUrlWithHostname()
    const feed = await insertTestRssFeedDirect({})
    const itemId = await insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId,
      guid: randomUUID(),
      itemData: { title: 'Thumbnail precedence' },
      contentSha256: createHash('sha256').update(randomUUID()).digest(),
    })
    await setRssFeedItemMediaDetails(itemId, {
      mediaType: 'article',
      enclosureUrl: null,
      enclosureType: null,
      durationSeconds: null,
      thumbnailUrl: 'https://example.com/rss-thumbnail.jpg',
    })
    const embedMetadata: ResolvedEmbed = {
      kind: 'article',
      requestedUrl: 'https://example.com/article',
      resolvedUrl: 'https://example.com/article',
      title: null,
      description: null,
      author: null,
      provider: null,
      thumbnail: { url: 'https://example.com/normalized-thumbnail.jpg', width: null, height: null },
      player: null,
    }
    await insertTestCrawl({
      urlId,
      statusCode: 200,
      markdown: '',
      embedMetadata,
      metaTags: {
        'og:image': 'https://example.com/og-thumbnail.jpg',
        'twitter:image': 'https://example.com/twitter-thumbnail.jpg',
      },
    })

    const embed = (await getRssFeedItemEmbedsByItems([{ id: itemId, url: { id: urlId } }]))[itemId]
    expect(embed.thumbnail_url).toMatch(/^https?:\/\/[^/]+\/sideload\//)
    expect(sideloadSource(embed.thumbnail_url!)).toContain('normalized-thumbnail.jpg')

    const ogUrlId = await createTestUrlWithHostname()
    const ogItemId = await insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId: ogUrlId,
      guid: randomUUID(),
      itemData: { title: 'OG thumbnail precedence' },
      contentSha256: createHash('sha256').update(randomUUID()).digest(),
    })
    await setRssFeedItemMediaDetails(ogItemId, {
      mediaType: 'article',
      enclosureUrl: null,
      enclosureType: null,
      durationSeconds: null,
      thumbnailUrl: 'https://example.com/rss-thumbnail-og.jpg',
    })
    await insertTestCrawl({
      urlId: ogUrlId,
      statusCode: 200,
      markdown: '',
      metaTags: {
        'og:image': 'https://example.com/og-thumbnail.jpg',
        'twitter:image': 'https://example.com/twitter-thumbnail.jpg',
      },
    })
    const ogEmbed = (await getRssFeedItemEmbedsByItems([{ id: ogItemId, url: { id: ogUrlId } }]))[
      ogItemId
    ]
    expect(ogEmbed.thumbnail_url).toMatch(/^https?:\/\/[^/]+\/sideload\//)
    expect(sideloadSource(ogEmbed.thumbnail_url!)).toContain('og-thumbnail.jpg')

    const twitterUrlId = await createTestUrlWithHostname()
    const twitterItemId = await insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId: twitterUrlId,
      guid: randomUUID(),
      itemData: { title: 'Twitter thumbnail precedence' },
      contentSha256: createHash('sha256').update(randomUUID()).digest(),
    })
    await setRssFeedItemMediaDetails(twitterItemId, {
      mediaType: 'article',
      enclosureUrl: null,
      enclosureType: null,
      durationSeconds: null,
      thumbnailUrl: 'https://example.com/rss-thumbnail-twitter.jpg',
    })
    await insertTestCrawl({
      urlId: twitterUrlId,
      statusCode: 200,
      markdown: '',
      metaTags: { 'twitter:image': 'https://example.com/twitter-thumbnail.jpg' },
    })
    const twitterEmbed = (
      await getRssFeedItemEmbedsByItems([{ id: twitterItemId, url: { id: twitterUrlId } }])
    )[twitterItemId]
    expect(twitterEmbed.thumbnail_url).toMatch(/^https?:\/\/[^/]+\/sideload\//)
    expect(sideloadSource(twitterEmbed.thumbnail_url!)).toContain('twitter-thumbnail.jpg')
  })
})
