import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/error'
import CommunityNewsAllPage from './page'
import CommunityNewsSourcesPage from './sources/page'
import CommunityNewsTopicsPage from './topics/page'

const { mockGetCommunity, mockGetCommunityNews, mockGetCurrentUser, mockHeaders } = vi.hoisted(
  () => ({
    mockGetCommunity: vi.fn<VitestLooseMock>(),
    mockGetCommunityNews: vi.fn<VitestLooseMock>(),
    mockGetCurrentUser: vi.fn<VitestLooseMock>(),
    mockHeaders: vi.fn<VitestLooseMock>().mockResolvedValue({ get: () => null }),
  }),
)

vi.mock(
  import('next/navigation'),
  () =>
    ({
      notFound: vi.fn<VitestLooseMock>(() => {
        throw new Error('notFound')
      }),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/lib/api/server'), () => ({
  getCommunity: mockGetCommunity,
  getCommunityNews: mockGetCommunityNews,
}))

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: mockGetCurrentUser,
}))

vi.mock(import('next/headers'), () => ({
  headers: mockHeaders,
}))

interface CommunityDiscussionTargetMock {
  slug: string
}

vi.mock(import('@/components/news/news-item-cluster-list'), () => ({
  NewsItemClusterList: ({
    children,
    communityDiscussionTarget,
  }: {
    children?: ReactNode
    communityDiscussionTarget?: CommunityDiscussionTargetMock
  }) => (
    <div
      data-testid='news-list'
      data-community-target={communityDiscussionTarget?.slug ?? ''}
    >
      news list
      {children}
    </div>
  ),
}))

vi.mock(
  import('@/components/news/news-filters'),
  () =>
    ({
      NewsFilters: () => null,
    }) as unknown as typeof import('@/components/news/news-filters'),
)

vi.mock(
  import('@/components/shared/link-select-dropdown'),
  () =>
    ({
      LinkSelectDropdown: ({
        items,
      }: {
        items: Array<{ label: string; href: string; active: boolean }>
      }) => (
        <nav>
          {items.map(item => (
            <a
              key={item.label}
              href={item.href}
              aria-current={item.active ? 'page' : undefined}
            >
              {item.label}
            </a>
          ))}
        </nav>
      ),
    }) as unknown as typeof import('@/components/shared/link-select-dropdown'),
)

vi.mock(
  import('@/components/rss-feed-items/rss-feed-item-modal'),
  () =>
    ({
      RssFeedItemModal: ({
        communityDiscussionTarget,
      }: {
        communityDiscussionTarget?: CommunityDiscussionTargetMock
      }) => (
        <div
          data-testid='rss-modal'
          data-community-target={communityDiscussionTarget?.slug ?? ''}
        />
      ),
    }) as unknown as typeof import('@/components/rss-feed-items/rss-feed-item-modal'),
)

const communityData = {
  community: {
    id: 'community-1',
    name: 'Rewards',
    slug: 'rewards',
    visibility: 'public',
    post_approval_required_at: null,
  },
  membership: null,
}
const newsData = { results: [], page_info: { has_next_page: false }, clusters: {} }

describe('CommunityNewsPage', () => {
  beforeEach(() => {
    mockGetCommunity.mockReset()
    mockGetCommunityNews.mockReset()
    mockGetCurrentUser.mockReset()
    mockGetCommunity.mockResolvedValue(communityData)
    mockGetCommunityNews.mockResolvedValue(newsData)
    mockGetCurrentUser.mockResolvedValue(null)
  })

  it('renders the news page', async () => {
    const result = await CommunityNewsAllPage({
      params: Promise.resolve({ slug: 'rewards' }),
      searchParams: Promise.resolve({}),
    })
    expect(result).toBeTruthy()
    expect(mockGetCommunityNews).toHaveBeenCalledWith('rewards', {
      searchParams: { limit: 25, feed_type: 'any' },
    })
  })

  it('requests source-scoped community news on the sources route', async () => {
    const result = await CommunityNewsSourcesPage({
      params: Promise.resolve({ slug: 'rewards' }),
      searchParams: Promise.resolve({ q: 'travel' }),
    })
    render(result)

    expect(mockGetCommunityNews).toHaveBeenCalledWith('rewards', {
      searchParams: { limit: 25, feed_type: 'follow_rss_feeds', q: 'travel' },
    })
    expect(screen.getByRole('link', { name: 'All' }).getAttribute('href')).toBe(
      '/communities/rewards/news?q=travel',
    )
    expect(screen.getByRole('link', { name: 'Sources' }).getAttribute('href')).toBe(
      '/communities/rewards/news/sources?q=travel',
    )
    expect(screen.getByRole('link', { name: 'Topics' }).getAttribute('href')).toBe(
      '/communities/rewards/news/topics?q=travel',
    )
  })

  it('requests topic-scoped community news on the topics route', async () => {
    await CommunityNewsTopicsPage({
      params: Promise.resolve({ slug: 'rewards' }),
      searchParams: Promise.resolve({}),
    })
    expect(mockGetCommunityNews).toHaveBeenCalledWith('rewards', {
      searchParams: { limit: 25, feed_type: 'follow_topics' },
    })
  })

  it('renders list search errors returned by community news search', async () => {
    mockGetCommunityNews.mockRejectedValue(
      new ApiError('Invalid search syntax', 422, { message: 'Invalid search syntax' }),
    )

    const result = await CommunityNewsAllPage({
      params: Promise.resolve({ slug: 'rewards' }),
      searchParams: Promise.resolve({ q: 'bad syntax' }),
    })
    render(result)

    expect(screen.getByText('Invalid search syntax')).toBeDefined()
    expect(screen.queryByTestId('news-list')).toBeNull()
  })

  it('does not pass a community discussion target to signed-in non-members', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1', roles: [] })
    const result = await CommunityNewsAllPage({
      params: Promise.resolve({ slug: 'rewards' }),
      searchParams: Promise.resolve({}),
    })
    render(result)

    expect(screen.getByTestId('news-list').getAttribute('data-community-target')).toBe('')
    expect(screen.getByTestId('rss-modal').getAttribute('data-community-target')).toBe('')
  })

  it('passes a community discussion target to members', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1', roles: [] })
    mockGetCommunity.mockResolvedValue({
      ...communityData,
      membership: { user_id: 'user-1', removed_at: null },
    })
    const result = await CommunityNewsAllPage({
      params: Promise.resolve({ slug: 'rewards' }),
      searchParams: Promise.resolve({}),
    })
    render(result)

    expect(screen.getByTestId('news-list').getAttribute('data-community-target')).toBe('rewards')
    expect(screen.getByTestId('rss-modal').getAttribute('data-community-target')).toBe('rewards')
  })

  it('calls notFound when has_pending_application is true', async () => {
    mockGetCommunity.mockResolvedValue({ ...communityData, has_pending_application: true })
    await expect(
      CommunityNewsAllPage({
        params: Promise.resolve({ slug: 'rewards' }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow('notFound')
    expect(mockGetCommunityNews).not.toHaveBeenCalled()
  })
})
