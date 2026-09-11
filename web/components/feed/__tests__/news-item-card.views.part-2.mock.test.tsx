import { describe, it, expect, vi } from 'vitest'
import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'
import { makeRssFeedItem, makeRssFeedItemTopic } from '@/test-helpers/api-responses'
import { render, screen } from '@testing-library/react'
import { NewsItemCard } from '../news-item-card'
import type { RssFeedItem } from '@/types/rss-feed-items'
import type { UrlEmbed } from '@/types/api-responses'

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

const mockNav = createNavMock()
mockNav.setPathname('/news')
mockNav.setSearchParams('topics=travel')

const nextDynamicMock = vi.hoisted(() => {
  const React = require('react')
  return {
    default: (loader: () => Promise<unknown>) =>
      function MockDynamic(props: Record<string, unknown>) {
        const [dynamicComponent, setDynamicComponent] = React.useState(null)
        React.useEffect(() => {
          let active = true
          void loader().then((mod: unknown) => {
            if (active)
              setDynamicComponent(() =>
                typeof mod === 'function' ? mod : (mod as Record<string, unknown>).default,
              )
          })
          return () => {
            active = false
          }
        }, [])
        return dynamicComponent ? React.createElement(dynamicComponent, props) : null
      },
  }
})
vi.mock(import('next/dynamic'), () => nextDynamicMock as unknown as typeof import('next/dynamic'))

vi.mock(
  import('@/lib/auth/context'),
  () =>
    ({
      useAuth: () => ({ isAuthenticated: true }),
      useOptionalAuth: () => null,
    }) as unknown as typeof import('@/lib/auth/context'),
)

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        ...props
      }: {
        children: React.ReactNode
        href: string
        [k: string]: unknown
      }) => (
        <a
          href={href}
          {...props}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

vi.mock(import('next/image'), () => {
  const Img = 'img' as const

  return {
    default: ({
      src,
      alt,
      width,
      height,
      className,
    }: {
      src: string
      alt: string
      width: number
      height: number
      className?: string
    }) => (
      <Img
        src={src}
        alt={alt}
        width={width}
        height={height}
        className={className}
      />
    ),
  } as unknown as typeof import('next/image')
})

vi.mock(import('@/components/shared/follower-share-actions'), () => ({
  FollowerShareActions: ({ className }: { className?: string }) => (
    <div
      data-testid='follower-share-actions'
      className={className}
    />
  ),
}))

vi.mock(import('@/components/shared/shared-byline'), () => ({
  SharedByline: ({ sharedByUser }: { sharedByUser?: { username?: string } }) =>
    sharedByUser?.username ? (
      <div>
        <span>Shared by</span>{' '}
        <a href={`/user/${sharedByUser.username}`}>@{sharedByUser.username}</a>
      </div>
    ) : null,
}))

vi.mock(import('../podcast-episode-player'), () => ({
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

const mockItem: RssFeedItem = makeRssFeedItem({
  id: 'item-1',
  published_at: '2025-01-15T10:00:00Z',
  data: {
    link: 'https://example.com/article1',
    guid: 'test-guid-1',
    title: 'Test Article Title',
    contentSnippet: 'This is a test article excerpt.',
  },
  url: { id: 'url-1', url: 'https://example.com/article1' },
  rss_feed: {
    id: 'rss-feed-1',
    title: 'Tech Weekly',
    topic: makeRssFeedItemTopic({
      id: 'topic-1',
      name: 'Technology',
      slug: 'technology',
      topic_type: 'card',
    }),
  },
})

const videoEmbed: UrlEmbed = {
  rss_feed_item_id: 'item-1',
  source_url: 'https://example.com/article1',
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

describe('NewsItemCard content language', () => {
  it('marks the original excerpt with the detected language', () => {
    const item: RssFeedItem = {
      ...mockItem,
      lingua_rs_detected_language: 'ar',
    }
    render(<NewsItemCard item={item} />)

    const excerpt = screen.getByText('This is a test article excerpt.')
    expect(excerpt).toHaveAttribute('lang', 'ar')
    expect(excerpt).toHaveAttribute('dir', 'rtl')
  })
})

describe('NewsItemCard compact view', () => {
  it('renders title and source but not excerpt', () => {
    render(
      <NewsItemCard
        item={mockItem}
        view='compact'
      />,
    )
    expect(screen.getByText('Test Article Title')).toBeDefined()
    expect(screen.getByText('Tech Weekly')).toBeDefined()
    expect(screen.queryByText('This is a test article excerpt.')).toBeNull()
  })

  it('does not render "Show more" link', () => {
    const item: RssFeedItem = {
      ...mockItem,
      data: {
        ...mockItem.data,
        contentSnippet: 'Short excerpt.',
        'content:encodedSnippet': 'Full long content here.',
      },
    }
    render(
      <NewsItemCard
        item={item}
        view='compact'
      />,
    )
    expect(screen.queryByText('Show more')).toBeNull()
  })
})

describe('NewsItemCard media precedence', () => {
  it('renders only the authoritative video player when RSS data also has an audio enclosure', () => {
    const mixedItem: RssFeedItem = {
      ...mockItem,
      data: {
        ...mockItem.data,
        media_type: 'audio',
        enclosure_url: 'https://example.com/episode.mp3',
      },
    }
    const { container } = render(
      <NewsItemCard
        item={mixedItem}
        embed={{ ...videoEmbed, player_url: 'https://player.vimeo.com/video/987654321' }}
      />,
    )

    expect(container.querySelector('[data-pw="video-embed-play-button"]')).not.toBeNull()
    expect(container.querySelector('[data-pw="podcast-episode-player"]')).toBeNull()
  })

  it('plays a sidecar enclosure when RSS also has an enclosure', () => {
    const itemWithRssEnclosure: RssFeedItem = {
      ...mockItem,
      data: {
        ...mockItem.data,
        media_type: 'audio',
        enclosure_url: 'https://example.com/rss-episode.mp3',
        enclosure_type: 'audio/mpeg',
        duration_seconds: 84,
      },
    }
    const audioEmbed: UrlEmbed = {
      ...videoEmbed,
      media_type: 'audio',
      video_id: null,
      video_platform: null,
      player_url: null,
      enclosure_url: 'https://example.com/crawled-episode.mp3',
      enclosure_type: null,
      duration_seconds: null,
      thumbnail_url: '/sideload/selected-cover?w=640',
    }

    const { container } = render(
      <NewsItemCard
        item={itemWithRssEnclosure}
        embed={audioEmbed}
      />,
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
