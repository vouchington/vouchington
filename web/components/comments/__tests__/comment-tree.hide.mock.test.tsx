import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  makeComment,
  makeData,
  renderWithAuth,
} from '@/test-helpers/components/comment-tree-fixtures'
import { CommentTree } from '../comment-tree'
import { bookmarkEntity, unbookmarkEntity } from '@/lib/api/client/bookmarks'
import { fetchPostDescendants } from '@/lib/api/client/posts'
import { setPreference } from '@/lib/preferences/storage'
import type { PostsResponseBody } from '@/types/api-responses'
import type { User } from '@/types/user'

vi.mock(import('@/lib/api/client/bookmarks'), () => ({
  bookmarkEntity: vi.fn<VitestLooseMock>().mockResolvedValue({}),
  unbookmarkEntity: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
}))

vi.mock(import('@/lib/api/client/posts'), async importOriginal => ({
  ...(await importOriginal()),
  fetchPostDescendants: vi.fn<VitestLooseMock>(),
}))

const viewer = { id: 'viewer-1' } as User

function renderTree(data: PostsResponseBody, user: User | null = viewer) {
  return renderWithAuth(
    <CommentTree
      data={data}
      rootPostId='root-1'
      rootPostType='discussion'
      rootLockedAt={null}
      isAdmin={false}
      hideDownCount={false}
    />,
    user,
  )
}

describe('comment collapse for a signed-in viewer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('collapses through the hide bookmark and never writes localStorage', async () => {
    renderTree(makeData([makeComment('1', 'root-1', 'alice')]))

    fireEvent.click(screen.getByRole('button', { name: 'Collapse comment thread' }))

    expect(bookmarkEntity).toHaveBeenCalledWith('post', '1', 'hide')
    expect(setPreference).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Expand comment thread' })).toBeTruthy()
  })

  it('starts collapsed from the server hide bookmark and expands with an unbookmark', async () => {
    const data = {
      ...makeData([makeComment('1', 'root-1', 'alice')]),
      bookmarks: { '1': { hide: true } },
    }
    renderTree(data)

    fireEvent.click(screen.getByRole('button', { name: 'Expand comment thread' }))

    expect(unbookmarkEntity).toHaveBeenCalledWith('post', '1', 'hide')
  })

  it('loads the replies of a hidden comment when it opens', async () => {
    const parent = makeComment('1', 'root-1', 'alice')
    const child = makeComment('2', '1', 'bob')
    const data = {
      ...makeData([parent]),
      bookmarks: { '1': { hide: true } },
      posts_metrics: { '1': { id: '1', count: { children: 1 } } },
    } as unknown as PostsResponseBody
    vi.mocked(fetchPostDescendants).mockResolvedValueOnce({
      ...makeData([child]),
      page_info: { has_next_page: true, end_cursor: 'next', start_cursor: null },
    })
    renderTree(data)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Expand comment thread' }))
    })

    expect(fetchPostDescendants).toHaveBeenCalledWith('1', undefined)
    await waitFor(() =>
      expect(
        screen.getAllByTestId('markdown').some(el => el.textContent === '<p>Comment 2</p>'),
      ).toBe(true),
    )
    expect(screen.getByRole('button', { name: 'Load more' })).toBeTruthy()
  })

  it('shows a comment awaiting moderation without its author', () => {
    const pending = {
      ...makeComment('1', 'root-1'),
      markdown: '',
      placeholder_state: 'unmoderated' as const,
    }
    renderTree(makeData([pending]), null)

    expect(screen.getAllByText('Pending review').length).toBeGreaterThan(0)
    expect(screen.queryByText('alice')).toBeNull()
  })
})
