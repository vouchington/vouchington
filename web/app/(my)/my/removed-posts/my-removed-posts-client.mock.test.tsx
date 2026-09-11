import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { MyRemovedPostsResponse } from '@/types/my'
import { MyRemovedPostsClient } from './my-removed-posts-client'

const { mockListMyRemovedPosts } = vi.hoisted(() => ({
  mockListMyRemovedPosts: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/removed-posts'), () => ({
  listMyRemovedPosts: mockListMyRemovedPosts,
}))

vi.mock(
  import('@/components/shared/time-ago'),
  () =>
    ({
      TimeAgo: ({ date }: { date: string }) => <time data-testid='time-ago'>{date}</time>,
    }) as unknown as typeof import('@/components/shared/time-ago'),
)

const emptyData: MyRemovedPostsResponse = {
  removed_posts: [],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
}

const dataWithPost: MyRemovedPostsResponse = {
  removed_posts: [
    {
      post_id: 'post-1',
      post_title: 'My great post',
      post_declared_language: 'ar',
      post_lingua_rs_detected_language: 'en',
      community_id: 'community-1',
      community_slug: 'credit-cards',
      unpublished_at: '2026-05-31T00:00:00.000Z',
      post_removal_kind: 'community',
      __entity_type: 'removed_post',
    },
  ],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
}

describe('MyRemovedPostsClient', () => {
  it('shows empty state when there are no removed posts', () => {
    render(<MyRemovedPostsClient initialData={emptyData} />)
    expect(screen.getByText('You have no removed posts.')).toBeVisible()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('renders a list of removed posts when posts exist', () => {
    render(<MyRemovedPostsClient initialData={dataWithPost} />)
    expect(screen.getByRole('list')).toBeInTheDocument()
    expect(screen.getByText('My great post')).toBeVisible()
    expect(screen.getByText('My great post')).toHaveAttribute('lang', 'ar')
    expect(screen.getByText('My great post')).toHaveAttribute('dir', 'rtl')
  })

  it('renders the appeal dialog trigger for each removed post', () => {
    render(<MyRemovedPostsClient initialData={dataWithPost} />)
    expect(screen.getByRole('button', { name: 'File an appeal' })).toBeInTheDocument()
  })

  it('keeps platform and community removals for the same post distinct', () => {
    const communityRemoval = dataWithPost.removed_posts[0]!
    const platformRemoval: MyRemovedPostsResponse['removed_posts'][0] = {
      ...communityRemoval,
      community_id: null,
      community_slug: null,
      post_removal_kind: 'platform',
    }

    render(
      <MyRemovedPostsClient
        initialData={{
          removed_posts: [communityRemoval, platformRemoval],
          page_info: dataWithPost.page_info,
        }}
      />,
    )

    expect(screen.getAllByRole('button', { name: 'File an appeal' })).toHaveLength(2)
    expect(screen.getAllByText('My great post')).toHaveLength(2)
    expect(screen.getByText('Platform post removal')).toBeVisible()
  })

  it('shows community link when community_slug is set', () => {
    render(<MyRemovedPostsClient initialData={dataWithPost} />)
    const link = screen.getByRole('link', { name: 'credit-cards' })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/communities/credit-cards')
  })

  it('shows post title when post_title is set', () => {
    render(<MyRemovedPostsClient initialData={dataWithPost} />)
    expect(screen.getByText('My great post')).toBeVisible()
  })

  it('renders unpublished_at date for each post', () => {
    render(<MyRemovedPostsClient initialData={dataWithPost} />)
    expect(screen.getByTestId('time-ago')).toBeInTheDocument()
  })

  it('shows load-more button when has_next_page is true', () => {
    const data: MyRemovedPostsResponse = {
      removed_posts: [{ ...dataWithPost.removed_posts[0]! }],
      page_info: { has_next_page: true, end_cursor: 'cursor-abc', start_cursor: null },
    }
    render(<MyRemovedPostsClient initialData={data} />)
    expect(screen.getByRole('button', { name: 'Load more' })).toBeInTheDocument()
  })

  it('does not show load-more button when has_next_page is false', () => {
    render(<MyRemovedPostsClient initialData={dataWithPost} />)
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })

  it('loads more posts when load-more button is clicked', async () => {
    const extraPost: MyRemovedPostsResponse['removed_posts'][0] = {
      post_id: 'post-2',
      post_title: null,
      post_declared_language: null,
      post_lingua_rs_detected_language: null,
      community_id: 'community-2',
      community_slug: null,
      unpublished_at: '2026-06-01T00:00:00.000Z',
      post_removal_kind: 'community',
      __entity_type: 'removed_post',
    }
    mockListMyRemovedPosts.mockResolvedValueOnce({
      removed_posts: [
        { ...dataWithPost.removed_posts[0]!, post_title: 'Updated post title' },
        extraPost,
      ],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    })

    const data: MyRemovedPostsResponse = {
      removed_posts: [{ ...dataWithPost.removed_posts[0]! }],
      page_info: { has_next_page: true, end_cursor: 'cursor-xyz', start_cursor: null },
    }
    render(<MyRemovedPostsClient initialData={data} />)

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))

    await waitFor(() => {
      expect(mockListMyRemovedPosts).toHaveBeenCalledWith('cursor-xyz')
      expect(screen.getByText('Community post')).toBeInTheDocument()
    })
    expect(screen.getAllByRole('button', { name: 'File an appeal' })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })
})
