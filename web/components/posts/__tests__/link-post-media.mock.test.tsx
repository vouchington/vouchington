import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LinkPostMedia } from '../link-post-media'
import { VideoEmbed } from '@/components/feed/video-embed'
import type { UrlEmbed } from '@/types/api-responses'

vi.mock(import('next/image'), () => {
  const Img = 'img' as const
  return { default: Img } as unknown as typeof import('next/image')
})

vi.mock(import('@/components/feed/video-embed'), () => ({
  VideoEmbed: vi.fn<VitestLooseMock>(() => null),
}))

vi.mock(import('@/components/feed/podcast-episode-player'), () => ({
  PodcastEpisodePlayer: vi.fn<VitestLooseMock>(() => null),
}))

function makeEmbed(overrides: Partial<UrlEmbed> = {}): UrlEmbed {
  return {
    rss_feed_item_id: null,
    source_url: null,
    media_type: 'article',
    video_id: null,
    video_platform: null,
    player_url: null,
    player_width: null,
    player_height: null,
    enclosure_url: null,
    enclosure_type: null,
    duration_seconds: null,
    thumbnail_url: null,
    title: null,
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
    ...overrides,
  }
}

describe('LinkPostMedia', () => {
  it('renders video embed when media_type is video with a platform', () => {
    const { container } = render(
      <LinkPostMedia
        embed={makeEmbed({
          media_type: 'video',
          video_platform: 'youtube',
          video_id: 'abc123',
          player_url: 'https://player.vimeo.com/video/987654321',
        })}
        view='detail'
      />,
    )
    expect(container.querySelector('[data-pw="link-post-video-embed"]')).not.toBeNull()
    expect(vi.mocked(VideoEmbed)).toHaveBeenLastCalledWith(
      expect.objectContaining({ platform: 'vimeo' }),
      undefined,
    )
  })

  it('preserves an authoritative null player URL for the video embed', () => {
    vi.mocked(VideoEmbed).mockClear()
    render(
      <LinkPostMedia
        embed={makeEmbed({
          media_type: 'video',
          video_platform: 'youtube',
          video_id: 'abc123',
          player_url: null,
        })}
        view='detail'
      />,
    )

    expect(vi.mocked(VideoEmbed)).toHaveBeenCalledWith(
      expect.objectContaining({ playerUrl: null, videoId: 'abc123' }),
      undefined,
    )
  })

  it('renders bare audio embed when media_type is audio with an enclosure_url but no show_id', () => {
    const { container } = render(
      <LinkPostMedia
        embed={makeEmbed({
          media_type: 'audio',
          enclosure_url: 'https://example.com/audio.mp3',
          title: 'Episode 1',
        })}
        view='detail'
      />,
    )
    expect(container.querySelector('[data-pw="link-post-audio-embed"]')).not.toBeNull()
    expect(container.querySelector('audio')).not.toBeNull()
  })

  it('renders podcast player when audio embed has full show context', () => {
    const { container } = render(
      <LinkPostMedia
        embed={makeEmbed({
          media_type: 'audio',
          enclosure_url: 'https://example.com/audio.mp3',
          rss_feed_item_id: 'feed-item-uuid',
          show_id: 'show-uuid',
          show_title: 'My Podcast',
          show_topic_slug: 'my-podcast',
          show_topic_type: 'rss_feed',
          title: 'Episode 1',
        })}
        view='detail'
      />,
    )
    expect(container.querySelector('[data-pw="link-post-podcast-embed"]')).not.toBeNull()
  })

  it('returns null when embed has no thumbnail, title, or source_url', () => {
    const { container } = render(
      <LinkPostMedia
        embed={makeEmbed()}
        view='detail'
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders a source-only preview when no title or thumbnail is present', () => {
    const { container } = render(
      <LinkPostMedia
        embed={makeEmbed({ source_url: 'https://example.com/uncrawled' })}
        view='card'
      />,
    )
    const link = container.querySelector('a')
    expect(link).not.toBeNull()
    expect(link?.getAttribute('href')).toBe('https://example.com/uncrawled')
    expect(link?.getAttribute('target')).toBe('_blank')
    expect(link?.getAttribute('rel')).toContain('nofollow')
    expect(link?.getAttribute('rel')).toContain('ugc')
    expect(container.textContent).toContain('example.com')
    expect(container.querySelector('[data-pw="link-post-article-embed-card"]')).toBeNull()
  })

  it('returns null when source_url has a non-https scheme and no title or thumbnail', () => {
    const { container } = render(
      <LinkPostMedia
        embed={makeEmbed({ source_url: 'javascript:alert(1)' })}
        view='detail'
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders article embed in detail view when thumbnail or title is present', () => {
    const { container } = render(
      <LinkPostMedia
        embed={makeEmbed({ thumbnail_url: '/sideload/test-img.jpg', title: 'Article Title' })}
        view='detail'
      />,
    )
    expect(container.querySelector('[data-pw="link-post-article-embed-detail"]')).not.toBeNull()
  })

  it('renders detail article thumbnails as a full-width 640 by 360 hero', () => {
    const { container } = render(
      <LinkPostMedia
        embed={makeEmbed({ thumbnail_url: '/sideload/test-img.jpg', title: 'Article Title' })}
        view='detail'
      />,
    )

    const image = container.querySelector('[data-pw="link-post-article-embed-detail"] img')
    expect(image).not.toBeNull()
    expect(image?.getAttribute('width')).toBe('640')
    expect(image?.getAttribute('height')).toBe('360')
    expect(image?.className).toContain('aspect-video')
    expect(image?.className).toContain('w-full')
  })

  it('renders a rich article embed in card view', () => {
    const { container } = render(
      <LinkPostMedia
        embed={makeEmbed({ thumbnail_url: '/sideload/test-img.jpg', title: 'Article Title' })}
        view='card'
      />,
    )
    expect(container.querySelector('[data-pw="link-post-article-embed-card"]')).not.toBeNull()
    expect(container.textContent).toContain('Article Title')
    const image = container.querySelector('[data-pw="link-post-article-embed-card"] img')
    expect(image?.getAttribute('width')).toBe('128')
    expect(image?.getAttribute('height')).toBe('80')
  })

  it('renders normalized metadata in card view without a thumbnail', () => {
    const { container } = render(
      <LinkPostMedia
        embed={makeEmbed({
          source_url: 'https://example.com/article',
          embed_metadata: {
            kind: 'article',
            requestedUrl: 'https://example.com/article',
            resolvedUrl: 'https://example.com/article',
            title: 'Normalized title',
            description: 'Normalized description',
            author: null,
            provider: { key: 'example', name: 'Example', url: null, resourceId: null },
            thumbnail: null,
            player: null,
          },
        })}
        view='card'
      />,
    )

    expect(container.textContent).toContain('Normalized title')
    expect(container.textContent).toContain('Normalized description')
    expect(container.textContent).toContain('Example')
  })

  it('renders provider and description metadata in card view without a title or thumbnail', () => {
    const { container } = render(
      <LinkPostMedia
        embed={makeEmbed({
          source_url: 'https://example.com/article',
          meta_tags: {
            'og:description': 'OG-only description',
            'og:site_name': 'OG provider',
          },
        })}
        view='card'
      />,
    )

    expect(container.textContent).toContain('OG-only description')
    expect(container.textContent).toContain('OG provider')
  })

  it('wraps article detail embed in an outbound link when source_url is set', () => {
    const { container } = render(
      <LinkPostMedia
        embed={makeEmbed({ title: 'Article Title', source_url: 'https://example.com/article' })}
        view='detail'
      />,
    )
    const link = container.querySelector('a')
    expect(link).not.toBeNull()
    expect(link?.getAttribute('href')).toBe('https://example.com/article')
    expect(link?.getAttribute('target')).toBe('_blank')
    expect(link?.getAttribute('rel')).toContain('nofollow')
    expect(link?.getAttribute('rel')).toContain('ugc')
  })

  it('renders article embed without a link when source_url is null', () => {
    const { container } = render(
      <LinkPostMedia
        embed={makeEmbed({ title: 'Article Title', source_url: null })}
        view='detail'
      />,
    )
    expect(container.querySelector('a')).toBeNull()
    expect(container.querySelector('[data-pw="link-post-article-embed-detail"]')).not.toBeNull()
  })

  it('does not wrap in a link when source_url has a non-http scheme', () => {
    const { container } = render(
      <LinkPostMedia
        embed={makeEmbed({ title: 'Article Title', source_url: 'javascript:alert(1)' })}
        view='detail'
      />,
    )
    expect(container.querySelector('a')).toBeNull()
    expect(container.querySelector('[data-pw="link-post-article-embed-detail"]')).not.toBeNull()
  })

  it('wraps card article embed in an outbound link when source_url is set', () => {
    const { container } = render(
      <LinkPostMedia
        embed={makeEmbed({
          thumbnail_url: '/sideload/test.jpg',
          title: 'T',
          source_url: 'https://example.com/a',
        })}
        view='card'
      />,
    )
    expect(container.querySelector('[data-pw="link-post-article-embed-card"]')).not.toBeNull()
    const link = container.querySelector('a')
    expect(link).not.toBeNull()
    expect(link?.getAttribute('href')).toBe('https://example.com/a')
    expect(link?.getAttribute('target')).toBe('_blank')
    expect(link?.getAttribute('rel')).toContain('nofollow')
  })
})
