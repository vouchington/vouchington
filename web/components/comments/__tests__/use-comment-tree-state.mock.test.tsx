import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeComment, makeData } from '@/test-helpers/components/comment-tree-fixtures'
import { fetchPostDescendants } from '@/lib/api/client/posts'
import type { CommentNodeData } from '../comment-tree-utils'
import { useCommentTreeState } from '../use-comment-tree-state'
import type { PostsResponseBody } from '@/types/api-responses'

vi.mock(import('@/lib/api/client/bookmarks'), () => ({
  bookmarkEntity: vi.fn<VitestLooseMock>().mockResolvedValue({}),
  unbookmarkEntity: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
}))

const parent = makeComment('1', 'root-1', 'alice')
const child = makeComment('2', '1', 'bob')
const election = { id: 'e-2', votes_count_up: 3, votes_count_down: 1 }

function hiddenParentData(extra: Partial<PostsResponseBody> = {}) {
  return {
    ...makeData([parent]),
    bookmarks: { '1': { hide: true } },
    ...extra,
  } as PostsResponseBody
}

function countNodes(nodes: CommentNodeData[]): number {
  return nodes.reduce((total, node) => total + 1 + countNodes(node.children), 0)
}

function renderState(data: PostsResponseBody, isAdmin = false) {
  return renderHook(
    ({ data: current }) =>
      useCommentTreeState({
        currentUserId: 'viewer-1',
        data: current,
        isAdmin,
        rootPostId: 'root-1',
      }),
    { initialProps: { data } },
  )
}

describe('useCommentTreeState replies of a hidden comment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('fetches unloaded replies even when the public reply count is zero', async () => {
    vi.mocked(fetchPostDescendants).mockResolvedValueOnce(makeData([child]))
    const { result } = renderState(hiddenParentData())

    await act(async () => {
      result.current.handleToggleCollapse('1')
    })

    expect(fetchPostDescendants).toHaveBeenCalledWith('1', undefined)
    await waitFor(() => expect(countNodes(result.current.commentNodes)).toBe(2))
  })

  it('keeps the vote controls of fetched replies', async () => {
    vi.mocked(fetchPostDescendants).mockResolvedValueOnce({
      ...makeData([child]),
      post_elections: { '2': election },
    } as unknown as PostsResponseBody)
    const { result } = renderState(hiddenParentData())

    await act(async () => {
      result.current.handleToggleCollapse('1')
    })

    await waitFor(() =>
      expect(result.current.commentNodes[0]?.children[0]?.election).toEqual(election),
    )
  })

  it('keeps the moderation records of fetched replies for an admin', async () => {
    const moderation = { id: 'm-2', post_id: '2' }
    const moderationElection = { id: 'me-2', votes_count_up: 1, votes_count_down: 0 }
    vi.mocked(fetchPostDescendants).mockResolvedValueOnce({
      ...makeData([child]),
      post_moderations: { '2': [moderation] },
      agent_moderation_elections: { 'm-2': moderationElection },
    } as unknown as PostsResponseBody)
    const { result } = renderState(hiddenParentData(), true)

    await act(async () => {
      result.current.handleToggleCollapse('1')
    })

    await waitFor(() => {
      const node = result.current.commentNodes[0]?.children[0]
      expect(node?.moderations).toEqual([moderation])
      expect(node?.moderationElections).toEqual({ 'm-2': moderationElection })
    })
  })

  it('renders a reply once when a later page of the thread returns it too', async () => {
    vi.mocked(fetchPostDescendants).mockResolvedValueOnce(makeData([child]))
    const { result, rerender } = renderState(hiddenParentData())

    await act(async () => {
      result.current.handleToggleCollapse('1')
    })
    await waitFor(() => expect(countNodes(result.current.commentNodes)).toBe(2))

    const later = makeData([parent, child])
    rerender({ data: { ...later, bookmarks: { '1': { hide: true } } } as PostsResponseBody })

    expect(countNodes(result.current.commentNodes)).toBe(2)
  })
})
