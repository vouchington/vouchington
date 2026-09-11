import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommunityFeed } from './community-feed'
import type { CommunityPostsResponseBody } from '@/types/api-responses'

const { mockUsePaginatedList } = vi.hoisted(() => ({
  mockUsePaginatedList: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/hooks/use-paginated-list'), () => ({
  usePaginatedList: mockUsePaginatedList,
}))

vi.mock(import('@/components/shared/infinite-scroll'), () => ({
  InfiniteScroll: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock(import('@/components/shared/paginated-list-footer'), () => ({
  PaginatedListFooter: () => null,
}))

vi.mock(
  import('@/components/posts/post-card'),
  () =>
    ({
      PostCard: ({ post, community }: { post: { id: string }; community?: { slug: string } }) => (
        <article
          data-pw='post-card'
          data-community-slug={community?.slug ?? ''}
        >
          {post.id}
        </article>
      ),
    }) as unknown as typeof import('@/components/posts/post-card'),
)

describe('CommunityFeed', () => {
  const data = {
    results: [{ id: 'post-2', entity_id: 'post-2' }],
    page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    posts: {
      'post-1': { id: 'post-1', community_id: 'community-1' },
      'post-2': { id: 'post-2', community_id: 'community-1' },
    },
    posts_metrics: {},
    post_elections: {},
    markdown_to_html: {},
    communities: {
      'community-1': { id: 'community-1', name: 'Rewards', slug: 'rewards' },
    },
    pinned_post_ids: ['post-1'],
  } as unknown as CommunityPostsResponseBody

  beforeEach(() => {
    mockUsePaginatedList.mockReset()
    mockUsePaginatedList.mockReturnValue({
      pages: [data],
      hasNextPage: false,
      loadingMore: false,
      endCursor: null,
      loadMore: vi.fn<() => void>(),
      fetchError: null,
      clearError: vi.fn<() => void>(),
    })
  })

  it('renders pinned and regular posts without wrapping PostCard in another card', () => {
    render(
      <CommunityFeed
        data={data}
        communitySlug='rewards'
      />,
    )

    const pinnedWrapper = document.querySelector(
      '[data-pw="community-feed-pinned-badge"]',
    )?.parentElement
    expect(pinnedWrapper?.className).toContain('border-l-2')
    expect(pinnedWrapper?.className).not.toContain('bg-card')
    expect(pinnedWrapper?.className).not.toContain('rounded-md')

    const cards = [...document.querySelectorAll('[data-pw="post-card"]')]
    expect(cards).toHaveLength(2)
    expect(cards[0]?.getAttribute('data-community-slug')).toBe('rewards')
    expect(cards[1]?.parentElement?.className).toBe('space-y-3')
  })

  it('links active members to enabled global create flows for the community', () => {
    render(
      <CommunityFeed
        data={data}
        communitySlug='rewards'
        canCreatePost
        allowReviewPosts
        allowDataPointPosts
      />,
    )

    expect(screen.getByText('Start Discussion').closest('a')).toHaveAttribute(
      'href',
      '/discussions/create?community=rewards',
    )
    expect(screen.getByText('Write Review').closest('a')).toHaveAttribute(
      'href',
      '/reviews/create?community=rewards',
    )
    expect(screen.getByText('Share Data Point').closest('a')).toHaveAttribute(
      'href',
      '/data-points/create?community=rewards',
    )
  })

  it('omits review and data point links when the community has not enabled them', () => {
    render(
      <CommunityFeed
        data={data}
        communitySlug='rewards'
        canCreatePost
      />,
    )

    expect(screen.getByText('Start Discussion')).toBeDefined()
    expect(screen.queryByText('Write Review')).toBeNull()
    expect(screen.queryByText('Share Data Point')).toBeNull()
  })
})
