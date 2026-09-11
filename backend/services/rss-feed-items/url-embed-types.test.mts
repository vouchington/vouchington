import { describe, expect, it } from 'vitest'
import { buildEmbed, type RawEmbedRow } from './url-embed-types.mts'

function rawRow(overrides: Partial<RawEmbedRow> = {}): RawEmbedRow {
  return {
    rss_feed_item_id: 'rss-item-id',
    source_url: 'https://example.com/episode',
    media_type: 'article',
    video_id: null,
    video_platform: null,
    rss_player_url: null,
    display_embed_kind: null,
    display_provider_key: null,
    display_provider_resource_id: null,
    display_player_url: null,
    display_player_width: null,
    display_player_height: null,
    display_embed_metadata_resolved: false,
    embed_metadata: null,
    meta_tags: null,
    embed_oembed_url: null,
    embed_oembed_resolved_at: null,
    enclosure_url: null,
    crawl_audio_url: null,
    crawl_source_url: null,
    enclosure_type: null,
    duration_seconds: null,
    thumbnail_urls: [],
    title: null,
    description: null,
    provider_name: null,
    markdown: null,
    show_id: null,
    show_title: null,
    show_topic_slug: null,
    show_topic_type: null,
    ...overrides,
  }
}

describe('buildEmbed', () => {
  it('constructs an authorized player from stored RSS video identity', () => {
    expect(
      buildEmbed(
        rawRow({
          media_type: 'video',
          video_id: 'rss-video',
          video_platform: 'youtube',
        }),
      ),
    ).toMatchObject({
      video_id: 'rss-video',
      video_platform: 'youtube',
      player_url: 'https://www.youtube-nocookie.com/embed/rss-video',
    })
  })

  it('keeps RSS video identity when a selected crawl player is unusable', () => {
    for (const crawl of [
      {
        display_provider_key: null,
        display_provider_resource_id: null,
        display_player_url: 'https://www.youtube-nocookie.com/embed/crawl-video',
        expectedPlayerUrl: 'https://www.youtube-nocookie.com/embed/crawl-video',
      },
      {
        display_provider_key: 'vimeo',
        display_provider_resource_id: '999999999',
        display_player_url: 'https://attacker.example/embed/999999999',
        expectedPlayerUrl: 'https://www.youtube-nocookie.com/embed/rss-video',
      },
    ]) {
      expect(
        buildEmbed(
          rawRow({
            media_type: 'video',
            video_id: 'rss-video',
            video_platform: 'youtube',
            rss_player_url: 'https://www.youtube-nocookie.com/embed/rss-video',
            display_embed_kind: 'player',
            display_provider_key: crawl.display_provider_key,
            display_provider_resource_id: crawl.display_provider_resource_id,
            display_player_url: crawl.display_player_url,
          }),
        ),
      ).toMatchObject({
        media_type: 'video',
        video_id: 'rss-video',
        video_platform: 'youtube',
        player_url: crawl.expectedPlayerUrl,
      })
    }
  })

  it('keeps stored RSS audio authoritative over a crawled player', () => {
    const embed = buildEmbed(
      rawRow({
        media_type: 'audio',
        enclosure_url: 'https://cdn.example.com/episode.mp3',
        enclosure_type: 'audio/mpeg',
        display_embed_kind: 'player',
        display_provider_key: 'youtube',
        display_provider_resource_id: 'crawl-video-id',
        display_player_url: 'https://www.youtube-nocookie.com/embed/crawl-video-id',
      }),
    )

    expect(embed).toMatchObject({
      media_type: 'audio',
      enclosure_url: 'https://cdn.example.com/episode.mp3',
      enclosure_type: 'audio/mpeg',
      video_id: null,
      video_platform: null,
      player_url: null,
      player_width: null,
      player_height: null,
    })
  })

  it('allows a crawled player to classify an article as video', () => {
    const embed = buildEmbed(
      rawRow({
        display_embed_kind: 'player',
        display_provider_key: 'youtube',
        display_provider_resource_id: 'crawl-video-id',
        display_player_url: 'https://www.youtube-nocookie.com/embed/crawl-video-id',
      }),
    )

    expect(embed).toMatchObject({
      media_type: 'video',
      video_id: 'crawl-video-id',
      video_platform: 'youtube',
      player_url: 'https://www.youtube-nocookie.com/embed/crawl-video-id',
    })
  })

  it('does not publish arbitrary oEmbed player origins', () => {
    const embed = buildEmbed(
      rawRow({
        display_embed_kind: 'player',
        display_provider_key: 'untrusted-provider',
        display_provider_resource_id: 'resource-id',
        display_player_url: 'https://embed.attacker.example/player/resource-id',
      }),
    )

    expect(embed.player_url).toBeNull()
  })

  it.each([
    'https://user@www.youtube-nocookie.com/embed/crawl-video-id',
    'https://www.youtube-nocookie.com:443/embed/crawl-video-id',
    'https://player.vimeo.com:8443/video/123456789',
  ])('does not publish player URLs with decorated authorities: %s', playerUrl => {
    const embed = buildEmbed(
      rawRow({
        display_embed_kind: 'player',
        display_provider_key: 'youtube',
        display_provider_resource_id: 'crawl-video-id',
        display_player_url: playerUrl,
      }),
    )

    expect(embed.player_url).toBeNull()
  })

  it.each([
    'https://www.youtube-nocookie.com/embed/crawl-video-id',
    'https://player.vimeo.com/video/123456789',
  ])('publishes approved normalized player URLs: %s', playerUrl => {
    const embed = buildEmbed(
      rawRow({
        display_embed_kind: 'player',
        display_provider_key: 'youtube',
        display_provider_resource_id: 'crawl-video-id',
        display_player_url: playerUrl,
      }),
    )

    expect(embed.player_url).toBe(playerUrl)
  })
})
