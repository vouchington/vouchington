import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'

import {
  makePage,
  mockReceiveLoadMore,
  postListMockData,
  renderWithListStyle,
} from '@/test-helpers/components/posts/post-list.mock-support'

import { PostList } from '../post-list'
import { ListStyleProvider } from '@/lib/preferences/list-style-context'
import { getPaginatedPage } from '@/lib/api/client'
describe('PostList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('resets accumulated pages when initialData changes (filter/sort update)', async () => {
    const page1 = makePage('post-1', 'First Post', true, 'cursor1')
    const page2 = makePage('post-2', 'Second Post', false, null)
    vi.mocked(getPaginatedPage).mockResolvedValueOnce(page2)

    const { rerender } = render(
      <ListStyleProvider>
        <PostList
          data={page1}
          nextPageEndpoint='/api/v1/posts'
          nextPageParams={{ limit: 25 }}
        />
      </ListStyleProvider>,
    )

    // Load second page so we have accumulated state to discard
    const loadMore = mockReceiveLoadMore.mock.calls.at(-1)![0] as () => Promise<void>
    await act(async () => {
      await loadMore()
    })
    expect(screen.getByText('First Post')).toBeDefined()
    expect(screen.getByText('Second Post')).toBeDefined()

    // Simulate a server re-render with new initialData (e.g. sort changed)
    const newData = makePage('post-3', 'New Filter Post', false, null)
    rerender(
      <ListStyleProvider>
        <PostList
          data={newData}
          nextPageEndpoint='/api/v1/posts'
          nextPageParams={{ limit: 25 }}
        />
      </ListStyleProvider>,
    )

    // Stale accumulated pages are discarded; only the new page is visible
    expect(screen.queryByText('First Post')).toBeNull()
    expect(screen.queryByText('Second Post')).toBeNull()
    expect(screen.getByText('New Filter Post')).toBeDefined()
  })

  it('passes priority=true to first card and priority=false to subsequent cards', () => {
    renderWithListStyle(<PostList data={postListMockData} />)
    const cards = screen.getAllByTestId('post-card')
    expect(cards).toHaveLength(2)
    expect(cards[0]).toHaveAttribute('data-priority', 'true')
    expect(cards[1]).toHaveAttribute('data-priority', 'false')
  })
})
