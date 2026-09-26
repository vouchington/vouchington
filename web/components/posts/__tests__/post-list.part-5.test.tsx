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

  it('accumulates posts across three pages', async () => {
    const page1 = makePage('post-1', 'First Post', true, 'cursor1')
    const page2 = makePage('post-2', 'Second Post', true, 'cursor2')
    const page3 = makePage('post-3', 'Third Post', false, null)
    vi.mocked(getPaginatedPage).mockResolvedValueOnce(page2).mockResolvedValueOnce(page3)

    renderWithListStyle(
      <PostList
        data={page1}
        nextPageEndpoint='/api/v1/posts'
        nextPageParams={{ limit: 25 }}
      />,
    )

    // Load page 2; component re-renders with new cursor, exposing a new loadMore
    let loadMore = mockReceiveLoadMore.mock.calls.at(-1)![0] as () => Promise<void>
    await act(async () => {
      await loadMore()
    })

    // Load page 3 using the updated loadMore from the re-render
    loadMore = mockReceiveLoadMore.mock.calls.at(-1)![0] as () => Promise<void>
    await act(async () => {
      await loadMore()
    })

    expect(screen.getByText('First Post')).toBeDefined()
    expect(screen.getByText('Second Post')).toBeDefined()
    expect(screen.getByText('Third Post')).toBeDefined()
  })
})
