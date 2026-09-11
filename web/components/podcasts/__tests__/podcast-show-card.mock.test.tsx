import { mockLucideReact } from '@/test-helpers/lucide-icons'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PodcastShowCard } from '../podcast-show-card'
import type { ViewRssFeed } from '@/types/rss-feeds'

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ refresh: () => undefined }),
      usePathname: () => '/',
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('next/dynamic'), () => ({
  default: () => () => null,
}))

vi.mock(import('@/components/shared/follow-button'), () => ({
  FollowButton: () => null,
}))

vi.mock(import('next/image'), () => {
  const Img = 'img' as const

  return {
    default: ({
      src,
      alt,
      ...props
    }: {
      src: string
      alt: string
      width: number
      height: number
      className?: string
      'data-pw'?: string
    }) => (
      <Img
        src={src}
        alt={alt}
        {...props}
      />
    ),
  } as unknown as typeof import('next/image')
})

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        href,
        children,
        ...props
      }: {
        href: string
        children: React.ReactNode
        prefetch?: boolean
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

vi.mock(import('lucide-react'), () =>
  mockLucideReact({
    Mic: () => <svg data-testid='mic-icon' />,
    Lock: () => <svg data-testid='lock-icon' />,
  }),
)

// SourceListItemMeta calls useAuth() which requires AuthProvider; mock the whole component
// since this test file focuses on PodcastListItem's own rendering.
vi.mock(
  import('@/components/sources/source-list-item-meta'),
  () =>
    ({
      SourceListItemMeta: () => null,
    }) as unknown as typeof import('@/components/sources/source-list-item-meta'),
)

function makeFeed(overrides: Partial<ViewRssFeed> = {}): ViewRssFeed {
  return {
    __entity_type: 'rss_feed',
    id: 'feed-1',
    title: 'Test Podcast',
    is_enabled: true,
    is_discoverable: true,
    etag: null,
    last_modified_at: null,
    last_fetched_at: null,
    feed_type: 'podcast',
    rss_feed_url: { id: 'url-1', url: 'https://example.com/podcast.xml' },
    home_page_url: null,
    topic: { id: 'topic-1', name: 'Test Podcast', slug: 'test-podcast', topic_type: 'rss_feed' },
    ...overrides,
  }
}

describe('PodcastShowCard', () => {
  it('renders the podcast title as a link', () => {
    render(<PodcastShowCard feed={makeFeed()} />)
    expect(screen.getByText('Test Podcast (Podcast)')).toBeDefined()
  })

  it('renders cover art when podcast_show provides a cover_art_url', () => {
    const feed = makeFeed({
      podcast_show: {
        itunes_author: 'NPR',
        itunes_owner_name: null,
        cover_art_url: '/sideload/test-cover.jpg',
        is_explicit: false,
        itunes_type: null,
      },
    })
    render(<PodcastShowCard feed={feed} />)
    const img = screen.getByAltText('Test Podcast (Podcast) cover art')
    expect(img.getAttribute('src')).toBe('/sideload/test-cover.jpg')
  })

  it('renders a mic placeholder when no cover art is available', () => {
    render(<PodcastShowCard feed={makeFeed()} />)
    expect(screen.getByTestId('mic-icon')).toBeDefined()
  })

  it('renders the author name', () => {
    const feed = makeFeed({
      podcast_show: {
        itunes_author: 'NPR',
        itunes_owner_name: null,
        cover_art_url: null,
        is_explicit: false,
        itunes_type: null,
      },
    })
    render(<PodcastShowCard feed={feed} />)
    expect(screen.getByText('NPR')).toBeDefined()
  })

  it('renders the explicit badge when is_explicit is true', () => {
    const feed = makeFeed({
      podcast_show: {
        itunes_author: null,
        itunes_owner_name: null,
        cover_art_url: null,
        is_explicit: true,
        itunes_type: null,
      },
    })
    render(<PodcastShowCard feed={feed} />)
    expect(screen.getByText('Explicit')).toBeDefined()
  })

  it('renders linked category chips when topic_slug is set', () => {
    const feed = makeFeed({
      categories: [{ category_text: 'technology', topic_id: 'topic-2', topic_slug: 'technology' }],
    })
    render(<PodcastShowCard feed={feed} />)
    const chip = screen.getByText('technology')
    expect(chip).toBeDefined()
    const link = chip.closest('a')
    expect(link?.getAttribute('href')).toBe('/podcasts/technology')
  })

  it('renders unlinked category chips when topic_slug is null', () => {
    const feed = makeFeed({
      categories: [{ category_text: 'business', topic_id: null, topic_slug: null }],
    })
    render(<PodcastShowCard feed={feed} />)
    expect(screen.getByText('business')).toBeDefined()
    expect(screen.queryByRole('link', { name: 'business' })).toBeNull()
  })
})
