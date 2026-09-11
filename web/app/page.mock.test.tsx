import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import Home from './page'

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: vi.fn<VitestLooseMock>().mockResolvedValue(null),
}))

vi.mock(import('@/lib/api/server/rss-feeds'), () => ({
  getTrendingRssFeeds: vi.fn<VitestLooseMock>().mockResolvedValue({
    results: [],
    page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    rss_feeds: {},
  }),
}))

vi.mock(import('@/lib/api/server/platform-stats'), () => ({
  getPlatformStats: vi.fn<VitestLooseMock>().mockResolvedValue({
    topic_count: 467,
    rss_feed_count: 102,
    post_count: 50,
    review_count: 20,
    data_point_count: 15,
    hostname_count: 30,
  }),
}))

vi.mock(import('@/lib/api/server/trending-topics'), () => ({
  getTrendingTopics: vi.fn<VitestLooseMock>().mockResolvedValue({
    results: [],
    page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    topics: {},
    topics_metrics: {},
  }),
}))

vi.mock(import('@/lib/api/server/trending-communities'), () => ({
  getTrendingCommunities: vi.fn<VitestLooseMock>().mockResolvedValue(null),
}))

vi.mock(import('@/lib/api/server/trending-referral-programs'), () => ({
  getTrendingReferralPrograms: vi.fn<VitestLooseMock>().mockResolvedValue(null),
}))

vi.mock(import('@/components/home/social-mechanics'), () => ({
  SocialMechanics: () => <div data-testid='social-mechanics' />,
}))

vi.mock(import('@/components/home/top-communities'), () => ({
  TopCommunities: () => <div data-testid='top-communities' />,
}))

vi.mock(import('@/components/home/top-referral-programs'), () => ({
  TopReferralPrograms: () => <div data-testid='top-referral-programs' />,
}))

vi.mock(import('@/components/home/top-communities-streaming'), () => ({
  TopCommunitiesStreaming: () => <div data-testid='top-communities-streaming' />,
}))

vi.mock(import('@/components/home/top-referral-programs-streaming'), () => ({
  TopReferralProgramsStreaming: () => <div data-testid='top-referral-programs-streaming' />,
}))

vi.mock(
  import('@/components/seo/anonymous-structured-data-script'),
  () =>
    ({
      AnonymousStructuredDataScript: () => <script type='application/ld+json' />,
    }) as unknown as typeof import('@/components/seo/anonymous-structured-data-script'),
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

// Helper to render async Server Components in tests
async function renderHome() {
  const jsx = await Home()
  return render(jsx)
}

describe('Home', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders a primary heading', async () => {
    await renderHome()
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /the social trust network/i,
      }),
    ).toBeInTheDocument()
  })

  it('renders subheading with trust network description', async () => {
    await renderHome()
    expect(
      screen.getByText(
        /News, podcasts, videos, reviews, and referral links from people and sources you trust/i,
      ),
    ).toBeInTheDocument()
  })

  it('renders Trending Sources section heading', async () => {
    await renderHome()
    expect(screen.getByRole('heading', { level: 2, name: /trending sources/i })).toBeInTheDocument()
  })

  it('renders Trending Topics section heading', async () => {
    await renderHome()
    expect(screen.getByRole('heading', { level: 2, name: /trending topics/i })).toBeInTheDocument()
  })

  it('renders pillars section', async () => {
    await renderHome()
    expect(screen.getByRole('heading', { level: 2, name: /the platform/i })).toBeInTheDocument()
  })

  it('renders platform stats bar with mocked data', async () => {
    await renderHome()
    expect(screen.getByText('467')).toBeInTheDocument()
    expect(screen.getByText('Topics')).toBeInTheDocument()
  })

  it('renders CTA for logged-out users', async () => {
    await renderHome()
    expect(screen.getByText('Start your circle of trust.')).toBeInTheDocument()
    expect(screen.getByText('Get started for free')).toBeInTheDocument()
  })
})
