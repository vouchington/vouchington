import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import CommunityPage from './page'
import { ApiError } from '@/lib/api/error'

const { mockGetCommunity, mockGetCommunityPosts, mockCommunityFeed } = vi.hoisted(() => ({
  mockGetCommunity: vi.fn<VitestLooseMock>(),
  mockGetCommunityPosts: vi.fn<VitestLooseMock>(),
  mockCommunityFeed: vi.fn<VitestLooseMock>(
    ({ nextPageParams }: { nextPageParams: Record<string, string | number> }) => (
      <div>{JSON.stringify(nextPageParams)}</div>
    ),
  ),
}))

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
  getCommunityPosts: mockGetCommunityPosts,
}))

vi.mock(import('@/components/communities/community-feed'), () => ({
  CommunityFeed: mockCommunityFeed,
}))

vi.mock(import('@/components/posts/post-filters'), () => ({
  PostFilters: () => <div>post filters</div>,
}))

vi.mock(
  import('@/components/seo/anonymous-structured-data-script'),
  () =>
    ({
      AnonymousStructuredDataScript: () => null,
    }) as unknown as typeof import('@/components/seo/anonymous-structured-data-script'),
)

const communityData = {
  community: {
    id: 'community-1',
    name: 'Rewards',
    slug: 'rewards',
    markdown: null,
    archived_at: null,
    allow_review_posts: true,
    allow_data_point_posts: false,
  },
  membership: { removed_at: null },
}
const postsData = { results: [], page_info: { has_next_page: false }, posts: {}, posts_metrics: {} }

describe('CommunityPage', () => {
  beforeEach(() => {
    mockGetCommunity.mockReset()
    mockGetCommunityPosts.mockReset()
    mockGetCommunity.mockResolvedValue(communityData)
    mockGetCommunityPosts.mockResolvedValue(postsData)
  })

  it('renders the community posts feed by default', async () => {
    const result = await CommunityPage({ params: Promise.resolve({ slug: 'rewards' }) })
    render(result)
    expect(mockGetCommunity).toHaveBeenCalledWith('rewards')
    expect(mockGetCommunityPosts).toHaveBeenCalled()
  })

  it('forwards URL query and sort params to community posts', async () => {
    const result = await CommunityPage({
      params: Promise.resolve({ slug: 'Rewards' }),
      searchParams: Promise.resolve({ q: 'cashback #cards', sort: 'hot' }),
    })
    render(result)

    expect(mockGetCommunityPosts).toHaveBeenCalledWith('Rewards', {
      searchParams: { limit: 25, sort: 'hot', q: 'cashback #cards' },
    })
    expect(mockCommunityFeed).toHaveBeenCalledWith(
      expect.objectContaining({
        communitySlug: 'rewards',
        canCreatePost: true,
        allowReviewPosts: true,
        allowDataPointPosts: false,
      }),
      undefined,
    )
  })

  it('defaults unsupported sorts to new', async () => {
    await CommunityPage({
      params: Promise.resolve({ slug: 'Rewards' }),
      searchParams: Promise.resolve({ sort: 'unsupported' }),
    })

    expect(mockGetCommunityPosts).toHaveBeenCalledWith('Rewards', {
      searchParams: { limit: 25, sort: 'new' },
    })
  })

  it('shows pending message and skips posts fetch when application is pending', async () => {
    mockGetCommunity.mockResolvedValue({ ...communityData, has_pending_application: true })

    const result = await CommunityPage({ params: Promise.resolve({ slug: 'Rewards' }) })

    expect(result).toBeTruthy()
    expect(mockGetCommunityPosts).not.toHaveBeenCalled()
  })

  it('calls notFound when the community is missing', async () => {
    mockGetCommunity.mockResolvedValue(null)

    await expect(CommunityPage({ params: Promise.resolve({ slug: 'Rewards' }) })).rejects.toThrow(
      'notFound',
    )
  })

  it('renders recoverable hashtag search errors inline', async () => {
    mockGetCommunityPosts.mockRejectedValue(
      new ApiError('Bad Request', 400, { error: 'Topic #missing was not found' }),
    )

    const result = await CommunityPage({
      params: Promise.resolve({ slug: 'Rewards' }),
      searchParams: Promise.resolve({ q: '#missing' }),
    })

    render(result)
    expect(screen.getByText('Topic #missing was not found')).toBeDefined()
  })
})
