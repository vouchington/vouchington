import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RssFeedItemModal } from './rss-feed-item-modal'
import type { RssFeedItem } from '@/types/rss-feed-items'
import type { RssFeedItemResponseBody, UrlEmbed } from '@/types/api-responses'

const mockGetRssFeedItem = vi.hoisted(() =>
  vi.fn<(id: string) => Promise<RssFeedItemResponseBody | null>>(),
)
const mockGetResolvedUiLocale = vi.hoisted(() => vi.fn<() => Promise<'en'>>())
const mockRssFeedItemViewTracker = vi.hoisted(() =>
  vi.fn<(props: { itemId: string }) => null>(() => null),
)

vi.mock(import('@/lib/api/server'), () => ({
  getRssFeedItem: mockGetRssFeedItem,
}))

vi.mock(
  import('@/components/asides/rss-feed-item-hn-discussions-aside'),
  () =>
    ({
      RssFeedItemHnDiscussionsAside: () => null,
    }) as unknown as typeof import('@/components/asides/rss-feed-item-hn-discussions-aside'),
)

vi.mock(import('@/lib/i18n/get-resolved-ui-locale'), () => ({
  getResolvedUiLocale: mockGetResolvedUiLocale,
}))

vi.mock(import('./rss-feed-item-modal-shell'), () => ({
  RssFeedItemModalShell: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <section>
      <h1>{title}</h1>
      {children}
    </section>
  ),
}))

vi.mock(import('@/components/news/news-item-actions'), () => ({
  NewsItemActions: () => <div data-testid='news-item-actions' />,
}))

vi.mock(import('@/components/news/news-item-header'), () => ({
  NewsItemHeader: () => <div data-testid='news-item-header' />,
}))

vi.mock(
  import('./rss-feed-item-follow-context'),
  () =>
    ({
      default: () => null,
    }) as unknown as typeof import('./rss-feed-item-follow-context'),
)

vi.mock(import('./rss-feed-item-view-tracker'), () => ({
  RssFeedItemViewTracker: mockRssFeedItemViewTracker,
}))

vi.mock(import('@/components/feed/podcast-episode-player'), () => ({
  PodcastEpisodePlayer: ({
    episode,
  }: {
    episode: { enclosureUrl: string; title: string; coverArtUrl?: string }
  }) => (
    <div
      data-pw='podcast-episode-player'
      data-enclosure-url={episode.enclosureUrl}
      data-title={episode.title}
      data-cover-art-url={episode.coverArtUrl}
    />
  ),
}))

const ITEM_ID = '11111111-1111-4111-8111-111111111111'

const rssFeedItem: RssFeedItem = {
  __entity_type: 'rss_feed_item',
  id: ITEM_ID,
  published_at: '2026-06-20T12:00:00Z',
  lingua_rs_detected_language: null,
  data: {
    link: 'https://www.youtube.com/watch?v=abc123',
    guid: 'yt:video:abc123',
    title: 'YouTube RSS video',
    contentSnippet: '<p>&nbsp;</p>',
    'media:description': 'Description from the YouTube RSS media payload.',
    video_platform: 'youtube',
    'media:statistics': { views: 12 },
  },
  url: { id: 'url-1', url: 'https://www.youtube.com/watch?v=abc123' },
  rss_feed: {
    __entity_type: 'rss_feed',
    id: 'feed-1',
    title: 'YouTube Feed',
    is_discoverable: true,
    feed_type: 'video',
    topic: {
      id: 'topic-1',
      name: 'Videos',
      slug: 'videos',
      topic_type: 'card',
    },
  },
  rss_feed_sources: [],
  categories: [],
}

const videoEmbed: UrlEmbed = {
  rss_feed_item_id: ITEM_ID,
  source_url: rssFeedItem.url.url,
  media_type: 'video',
  video_id: 'abc123',
  video_platform: 'youtube',
  player_url: 'https://www.youtube-nocookie.com/embed/abc123',
  player_width: 640,
  player_height: 360,
  enclosure_url: null,
  enclosure_type: null,
  duration_seconds: null,
  thumbnail_url: null,
  title: 'Embedded video',
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

describe('RssFeedItemModal', () => {
  it('renders media:description and YouTube metadata from the feed item payload', async () => {
    mockGetResolvedUiLocale.mockResolvedValue('en')
    mockGetRssFeedItem.mockResolvedValue({
      rss_feed_item: rssFeedItem,
      rss_feed_item_election: null,
      content_html: null,
      bookmarks: {},
    } satisfies RssFeedItemResponseBody)

    render(
      await RssFeedItemModal({
        pathname: '/news',
        searchParams: { rss_item: ITEM_ID },
      }),
    )

    expect(screen.getByText('Description from the YouTube RSS media payload.')).toBeDefined()
    expect(screen.getByText(/12 views/)).toBeDefined()
    expect(mockRssFeedItemViewTracker).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: ITEM_ID }),
      undefined,
    )
  })

  it('marks plain-text fallback content with the detected item language', async () => {
    mockGetResolvedUiLocale.mockResolvedValue('en')
    mockGetRssFeedItem.mockResolvedValue({
      rss_feed_item: { ...rssFeedItem, lingua_rs_detected_language: 'ar' },
      rss_feed_item_election: null,
      content_html: null,
      bookmarks: {},
    } satisfies RssFeedItemResponseBody)

    render(
      await RssFeedItemModal({
        pathname: '/news',
        searchParams: { rss_item: ITEM_ID },
      }),
    )

    const fallback = screen
      .getByText('Description from the YouTube RSS media payload.')
      .closest('p')
    expect(fallback).toHaveAttribute('lang', 'ar')
    expect(fallback).toHaveAttribute('dir', 'rtl')
  })

  it('uses embed preview text when the RSS item has no title or summary', async () => {
    mockGetResolvedUiLocale.mockResolvedValue('en')
    mockGetRssFeedItem.mockResolvedValue({
      rss_feed_item: {
        ...rssFeedItem,
        data: {
          link: rssFeedItem.data.link,
          guid: rssFeedItem.data.guid,
          video_platform: 'youtube',
        },
      },
      rss_feed_item_embeds: {
        [ITEM_ID]: {
          ...videoEmbed,
          title: 'Embed-only title',
          description: 'Embed-only description',
        },
      },
      rss_feed_item_election: null,
      content_html: null,
      bookmarks: {},
    } satisfies RssFeedItemResponseBody)

    render(
      await RssFeedItemModal({
        pathname: '/news',
        searchParams: { rss_item: ITEM_ID },
      }),
    )

    expect(screen.getByRole('heading', { name: 'Embed-only title' })).toBeDefined()
    expect(screen.getByText('Embed-only description')).toBeDefined()
    expect(screen.queryByText('No article summary available.')).toBeNull()
  })

  it('renders only the authoritative video player when RSS data also has an audio enclosure', async () => {
    mockGetResolvedUiLocale.mockResolvedValue('en')
    mockGetRssFeedItem.mockResolvedValue({
      rss_feed_item: {
        ...rssFeedItem,
        data: {
          ...rssFeedItem.data,
          media_type: 'audio',
          enclosure_url: 'https://example.com/episode.mp3',
        },
      },
      rss_feed_item_embeds: {
        [ITEM_ID]: { ...videoEmbed, player_url: 'https://player.vimeo.com/video/987654321' },
      },
      rss_feed_item_election: null,
      content_html: null,
      bookmarks: {},
    } satisfies RssFeedItemResponseBody)

    const { container } = render(
      await RssFeedItemModal({
        pathname: '/news',
        searchParams: { rss_item: ITEM_ID },
      }),
    )

    expect(container.querySelector('[data-pw="video-embed-play-button"]')).not.toBeNull()
    expect(container.querySelector('[data-pw="podcast-episode-player"]')).toBeNull()
  })

  it('plays a sidecar enclosure when RSS also has an enclosure', async () => {
    mockGetResolvedUiLocale.mockResolvedValue('en')
    mockGetRssFeedItem.mockResolvedValue({
      rss_feed_item: {
        ...rssFeedItem,
        data: {
          ...rssFeedItem.data,
          media_type: 'audio',
          enclosure_url: 'https://example.com/rss-episode.mp3',
          enclosure_type: 'audio/mpeg',
          duration_seconds: 84,
        },
      },
      rss_feed_item_embeds: {
        [ITEM_ID]: {
          ...videoEmbed,
          media_type: 'audio',
          video_id: null,
          video_platform: null,
          player_url: null,
          enclosure_url: 'https://example.com/crawled-episode.mp3',
          enclosure_type: null,
          duration_seconds: null,
          thumbnail_url: '/sideload/selected-cover?w=640',
        },
      },
      rss_feed_item_election: null,
      content_html: null,
      bookmarks: {},
    } satisfies RssFeedItemResponseBody)

    const { container } = render(
      await RssFeedItemModal({
        pathname: '/news',
        searchParams: { rss_item: ITEM_ID },
      }),
    )

    expect(container.querySelector('[data-pw="podcast-episode-player"]')).toHaveAttribute(
      'data-enclosure-url',
      'https://example.com/crawled-episode.mp3',
    )
    expect(container.querySelector('[data-pw="podcast-episode-player"]')).toHaveAttribute(
      'data-title',
      'Embedded video',
    )
    expect(container.querySelector('[data-pw="podcast-episode-player"]')).toHaveAttribute(
      'data-cover-art-url',
      '/sideload/selected-cover?w=640',
    )
  })
})
