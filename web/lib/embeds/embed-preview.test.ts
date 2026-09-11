import { describe, expect, it } from 'vitest'
import { selectAuthorizedPlayerUrl, selectEmbedAudio, selectEmbedPreview } from './embed-preview'
import type { UrlEmbed } from '@/types/api-responses/posts-topics-and-feeds'

const EMBED: UrlEmbed = {
  rss_feed_item_id: 'rss-1',
  source_url: 'https://example.test/article',
  media_type: 'article',
  video_id: null,
  video_platform: null,
  player_url: null,
  player_width: null,
  player_height: null,
  enclosure_url: null,
  enclosure_type: null,
  duration_seconds: null,
  thumbnail_url: 'https://images.voucha.test/sideload/image',
  title: 'Stored title',
  description: null,
  provider_name: null,
  markdown: null,
  show_id: null,
  show_title: null,
  show_topic_slug: null,
  show_topic_type: null,
  embed_metadata: null,
  meta_tags: null,
  embed_oembed_url: null,
  embed_oembed_resolved_at: null,
}

describe('selectEmbedPreview', () => {
  it('derives the platform from an authorized player before stale video metadata', () => {
    expect(
      selectEmbedPreview({
        ...EMBED,
        video_platform: 'youtube',
        player_url: 'https://player.vimeo.com/video/123',
      }).platform,
    ).toBe('vimeo')
  })

  it('prefers backend-authorized display fields before raw administrator metadata', () => {
    const preview = selectEmbedPreview({
      ...EMBED,
      player_url: 'https://www.youtube-nocookie.com/embed/id',
      title: 'Backend title',
      description: 'Backend description',
      provider_name: 'Backend provider',
      embed_metadata: {
        kind: 'player',
        requestedUrl: EMBED.source_url!,
        resolvedUrl: EMBED.source_url!,
        title: 'Normalized title',
        description: 'Normalized description',
        author: null,
        provider: { key: 'youtube', name: 'YouTube', url: null, resourceId: 'id' },
        thumbnail: null,
        player: { url: 'https://www.youtube-nocookie.com/embed/id', width: null, height: null },
      },
      meta_tags: {
        'OG:TITLE': 'OG title',
        'twitter:title': 'Twitter title',
        'og:image': 'https://untrusted.example/image.jpg',
      },
    })

    expect(preview).toMatchObject({
      title: 'Backend title',
      description: 'Backend description',
      provider: 'Backend provider',
      thumbnailUrl: EMBED.thumbnail_url,
      playerUrl: 'https://www.youtube-nocookie.com/embed/id',
    })
  })

  it('uses case-insensitive OG and Twitter text fallbacks but never raw image or player URLs', () => {
    const preview = selectEmbedPreview({
      ...EMBED,
      title: null,
      thumbnail_url: null,
      meta_tags: {
        'Og:TiTlE': 'OG title',
        'TWITTER:DESCRIPTION': 'Twitter description',
        'og:site_name': 'Example publication',
        'og:image': 'https://untrusted.example/image.jpg',
        'og:video': 'https://untrusted.example/player',
      },
      embed_metadata: {
        kind: 'player',
        requestedUrl: EMBED.source_url!,
        resolvedUrl: EMBED.source_url!,
        title: null,
        description: null,
        author: null,
        provider: null,
        thumbnail: null,
        player: { url: 'https://attacker.example/player', width: null, height: null },
      },
    })

    expect(preview).toMatchObject({
      title: 'OG title',
      description: 'Twitter description',
      provider: 'Example publication',
      thumbnailUrl: null,
      playerUrl: null,
    })
    expect(preview.rawMetaTags?.['og:video']).toBe('https://untrusted.example/player')
  })

  it('falls back to the source hostname and existing item display fields', () => {
    expect(
      selectEmbedPreview(
        { ...EMBED, title: null, thumbnail_url: null },
        {
          title: 'RSS title',
          description: 'RSS description',
          thumbnailUrl: 'https://images.voucha.test/sideload/rss',
        },
      ),
    ).toMatchObject({
      title: 'RSS title',
      description: 'RSS description',
      provider: 'example.test',
      thumbnailUrl: 'https://images.voucha.test/sideload/rss',
    })
  })
})

describe('selectAuthorizedPlayerUrl', () => {
  it('preserves an authoritative null sidecar instead of reviving a raw RSS player', () => {
    expect(
      selectAuthorizedPlayerUrl(
        { ...EMBED, player_url: null },
        'https://www.youtube-nocookie.com/embed/wrong-resource',
      ),
    ).toBeNull()
  })

  it('uses the RSS player only when the sidecar is absent', () => {
    expect(selectAuthorizedPlayerUrl(undefined, 'https://example.com/legacy-player')).toBe(
      'https://example.com/legacy-player',
    )
  })
})

describe('selectEmbedAudio', () => {
  it('prefers sidecar enclosure fields over RSS fallback fields', () => {
    expect(
      selectEmbedAudio(
        {
          ...EMBED,
          media_type: 'audio',
          enclosure_url: 'https://cdn.example.test/crawled.mp3',
          enclosure_type: 'audio/ogg',
          duration_seconds: 42,
        },
        {
          enclosureUrl: 'https://cdn.example.test/rss.mp3',
          enclosureType: 'audio/mpeg',
          durationSeconds: 84,
        },
      ),
    ).toEqual({
      enclosureUrl: 'https://cdn.example.test/crawled.mp3',
      enclosureType: 'audio/ogg',
      durationSeconds: 42,
      mediaType: 'audio',
    })
  })

  it('uses RSS enclosure metadata when the sidecar only supplies a crawl URL', () => {
    expect(
      selectEmbedAudio(
        { ...EMBED, media_type: 'audio', enclosure_url: 'https://cdn.example.test/crawled.mp3' },
        { enclosureType: 'audio/mpeg', durationSeconds: 84, mediaType: 'article' },
      ),
    ).toEqual({
      enclosureUrl: 'https://cdn.example.test/crawled.mp3',
      enclosureType: 'audio/mpeg',
      durationSeconds: 84,
      mediaType: 'audio',
    })
  })
})
