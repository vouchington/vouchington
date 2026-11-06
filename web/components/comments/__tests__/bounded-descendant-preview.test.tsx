import { act, renderHook, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  makeComment,
  makeData,
  renderWithAuth,
} from '@/test-helpers/components/comment-tree-fixtures'
import { fetchPostDescendants } from '@/lib/api/client/posts'
import { CommentTree } from '../comment-tree'
import { useCommentTreeState } from '../use-comment-tree-state'

describe('bounded descendant previews', () => {
  beforeEach(() => vi.clearAllMocks())

  it('continues an empty expansion page using its inspected-head cursor', async () => {
    const parent = makeComment('1', 'root-1')
    const child = makeComment('2', parent.id)
    const empty = makeData([])
    empty.page_info = {
      has_next_page: true,
      start_cursor: 'first-inspected-head',
      end_cursor: 'last-inspected-head',
    }
    vi.mocked(fetchPostDescendants)
      .mockResolvedValueOnce(empty)
      .mockResolvedValueOnce(makeData([child]))
    const data = makeData([parent])
    const { result } = renderHook(() =>
      useCommentTreeState({ currentUserId: null, data, isAdmin: false, rootPostId: 'root-1' }),
    )

    await act(async () => {
      await result.current.handleLoadMoreReplies(parent.id)
    })
    expect(result.current.moreRepliesIds.has(parent.id)).toBe(true)
    expect(result.current.commentNodes[0]?.children).toHaveLength(0)

    await act(async () => {
      await result.current.handleLoadMoreReplies(parent.id)
    })
    expect(fetchPostDescendants).toHaveBeenLastCalledWith(parent.id, {
      after: 'last-inspected-head',
    })
    expect(result.current.commentNodes[0]?.children[0]?.post.id).toBe(child.id)
    expect(result.current.moreRepliesIds.has(parent.id)).toBe(false)
  })

  it('keeps a placeholder permalink available without loaded preview children', () => {
    const placeholder = {
      ...makeComment('1', 'root-1'),
      placeholder_state: 'deleted' as const,
      created_by_id: null,
      markdown: '',
    }
    renderWithAuth(
      <CommentTree
        data={makeData([placeholder])}
        rootPostId='root-1'
        rootPostType='discussion'
        rootLockedAt={null}
        isAdmin={false}
        hideDownCount={false}
      />,
    )
    expect(screen.getByRole('link', { name: placeholder.created_at })).toHaveAttribute(
      'href',
      `/discussion/root-1/comment/${placeholder.id}`,
    )
  })
})
