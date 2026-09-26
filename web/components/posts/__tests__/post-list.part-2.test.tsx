import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, screen } from '@testing-library/react'

import {
  makePage,
  mockReceiveLoadMore,
  postListMockData,
  renderWithListStyle,
} from '@/test-helpers/components/posts/post-list.mock-support'

import { PostList } from '../post-list'
import { getPaginatedPage } from '@/lib/api/client'
import type { PostsResponseBody } from '@/types/api-responses'
describe('PostList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('omits posts hidden by the current viewer', () => {
    const dataWithHiddenPost: PostsResponseBody = {
      ...postListMockData,
      bookmarks: {
        'post-1': { hide: true },
      },
    }

    renderWithListStyle(<PostList data={dataWithHiddenPost} />)

    expect(screen.queryByText('First Post')).toBeNull()
    expect(screen.getByText('Second Post')).toBeDefined()
  })

  it('omits posts hidden during the current session', async () => {
    renderWithListStyle(<PostList data={postListMockData} />)

    await act(async () => {
      screen.getByRole('button', { name: 'Hide First Post' }).click()
    })

    expect(screen.queryByText('First Post')).toBeNull()
    expect(screen.getByText('Second Post')).toBeDefined()
  })

  it('accumulates posts from the next page when loadMore is triggered', async () => {
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

    expect(screen.getByText('First Post')).toBeDefined()
    expect(screen.queryByText('Second Post')).toBeNull()

    const loadMore = mockReceiveLoadMore.mock.calls.at(-1)![0] as () => Promise<void>
    await act(async () => {
      await loadMore()
    })

    expect(screen.getByText('First Post')).toBeDefined()
    expect(screen.getByText('Second Post')).toBeDefined()
  })
})
