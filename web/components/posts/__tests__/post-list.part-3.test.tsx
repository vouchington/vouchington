import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, screen } from '@testing-library/react'

import {
  makePage,
  mockReceiveLoadMore,
  renderWithListStyle,
} from '@/test-helpers/components/posts/post-list.mock-support'

import { PostList } from '../post-list'
import { getPaginatedPage } from '@/lib/api/client'
describe('PostList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('continues an empty page when a cursor points to more posts', async () => {
    const initial = { ...makePage('unused', 'Unused', true, 'cursor1'), results: [], posts: {} }
    const next = makePage('post-2', 'Later Post', false, null)
    vi.mocked(getPaginatedPage).mockResolvedValueOnce(next)
    renderWithListStyle(
      <PostList
        data={initial}
        nextPageEndpoint='/api/v1/posts'
      />,
    )

    const loadMore = mockReceiveLoadMore.mock.calls.at(-1)![0] as () => Promise<void>
    await act(async () => {
      await loadMore()
    })
    expect(getPaginatedPage).toHaveBeenCalledWith('/api/v1/posts', { after: 'cursor1' })
    expect(screen.getByText('Later Post')).toBeDefined()
  })

  it('shows the empty state when a next page has no usable cursor', () => {
    const initial = { ...makePage('unused', 'Unused', true, null), results: [], posts: {} }
    renderWithListStyle(
      <PostList
        data={initial}
        nextPageEndpoint='/api/v1/posts'
      />,
    )
    expect(screen.getByText('No posts found')).toBeDefined()
    expect(mockReceiveLoadMore).not.toHaveBeenCalled()
  })

  it('fetches the next page with the correct cursor and params', async () => {
    const page1 = makePage('post-1', 'First Post', true, 'cursor1')
    const page2 = makePage('post-2', 'Second Post', false, null)
    vi.mocked(getPaginatedPage).mockResolvedValueOnce(page2)

    renderWithListStyle(
      <PostList
        data={page1}
        nextPageEndpoint='/api/v1/posts'
        nextPageParams={{ post_types: 'review', sort: 'new', limit: 25 }}
      />,
    )

    const loadMore = mockReceiveLoadMore.mock.calls.at(-1)![0] as () => Promise<void>
    await act(async () => {
      await loadMore()
    })

    expect(getPaginatedPage).toHaveBeenCalledWith('/api/v1/posts', {
      post_types: 'review',
      sort: 'new',
      limit: 25,
      after: 'cursor1',
    })
  })
})
