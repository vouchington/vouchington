import { mockLucideReact } from '@/test-helpers/lucide-icons'
import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createTranslator } from '@ts-shared/ui-messages'
import { enMessages } from '@ts-shared/ui-messages/locale-catalogs'
import { PodcastShowMetadataAside } from '../podcast-show-metadata-aside'
import type { ViewRssFeed } from '@/types/rss-feeds'

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

vi.mock(import('@/components/asides/aside-accordion'), () => ({
  AsideAccordion: ({
    title,
    children,
  }: {
    title: string
    children: React.ReactNode
    'data-pw'?: string
  }) => (
    <div data-testid='aside-accordion'>
      <h3>{title}</h3>
      {children}
    </div>
  ),
}))

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

describe('PodcastShowMetadataAside', () => {
  let t: ReturnType<typeof createTranslator>

  beforeAll(() => {
    t = createTranslator('en', enMessages)
  })

  it('returns null when no podcast_show and no categories', () => {
    const { container } = render(
      <PodcastShowMetadataAside
        t={t}
        feed={makeFeed()}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders the accordion when podcast_show is present', async () => {
    const feed = makeFeed({
      podcast_show: {
        itunes_author: 'NPR',
        itunes_owner_name: null,
        cover_art_url: null,
        is_explicit: false,
        itunes_type: null,
      },
    })
    render(
      <PodcastShowMetadataAside
        t={t}
        feed={feed}
      />,
    )
    expect(screen.getByTestId('aside-accordion')).toBeDefined()
    expect(screen.getByText('About this podcast')).toBeDefined()
  })

  it('renders cover art when cover_art_url is set', async () => {
    const feed = makeFeed({
      podcast_show: {
        itunes_author: null,
        itunes_owner_name: null,
        cover_art_url: '/sideload/test-cover.jpg',
        is_explicit: false,
        itunes_type: null,
      },
    })
    render(
      <PodcastShowMetadataAside
        t={t}
        feed={feed}
      />,
    )
    const img = screen.getByAltText('Test Podcast cover art')
    expect(img.getAttribute('src')).toBe('/sideload/test-cover.jpg')
  })

  it('renders a mic placeholder when no cover art is available', async () => {
    const feed = makeFeed({
      podcast_show: {
        itunes_author: null,
        itunes_owner_name: null,
        cover_art_url: null,
        is_explicit: false,
        itunes_type: null,
      },
    })
    render(
      <PodcastShowMetadataAside
        t={t}
        feed={feed}
      />,
    )
    expect(screen.getByTestId('mic-icon')).toBeDefined()
  })

  it('renders author name', async () => {
    const feed = makeFeed({
      podcast_show: {
        itunes_author: 'NPR',
        itunes_owner_name: null,
        cover_art_url: null,
        is_explicit: false,
        itunes_type: null,
      },
    })
    render(
      <PodcastShowMetadataAside
        t={t}
        feed={feed}
      />,
    )
    expect(screen.getByText('By NPR')).toBeDefined()
  })

  it('renders explicit badge when is_explicit is true', async () => {
    const feed = makeFeed({
      podcast_show: {
        itunes_author: null,
        itunes_owner_name: null,
        cover_art_url: null,
        is_explicit: true,
        itunes_type: null,
      },
    })
    render(
      <PodcastShowMetadataAside
        t={t}
        feed={feed}
      />,
    )
    expect(screen.getByText('Explicit')).toBeDefined()
  })

  it('renders linked category chips when topic_slug is set', async () => {
    const feed = makeFeed({
      categories: [{ category_text: 'technology', topic_id: 'topic-2', topic_slug: 'technology' }],
    })
    render(
      <PodcastShowMetadataAside
        t={t}
        feed={feed}
      />,
    )
    const chip = screen.getByText('technology')
    const link = chip.closest('a')
    expect(link?.getAttribute('href')).toBe('/podcasts/technology')
  })

  it('renders unlinked category chips when topic_slug is null', async () => {
    const feed = makeFeed({
      categories: [{ category_text: 'news', topic_id: null, topic_slug: null }],
    })
    render(
      <PodcastShowMetadataAside
        t={t}
        feed={feed}
      />,
    )
    expect(screen.getByText('news')).toBeDefined()
    expect(screen.queryByRole('link', { name: 'news' })).toBeNull()
  })

  it('renders when only categories are present (no podcast_show)', async () => {
    const feed = makeFeed({
      categories: [{ category_text: 'business', topic_id: null, topic_slug: null }],
    })
    render(
      <PodcastShowMetadataAside
        t={t}
        feed={feed}
      />,
    )
    expect(screen.getByTestId('aside-accordion')).toBeDefined()
  })
})
