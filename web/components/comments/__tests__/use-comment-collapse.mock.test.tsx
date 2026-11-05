import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bookmarkEntity, unbookmarkEntity } from '@/lib/api/client/bookmarks'
import { makeComment } from '@/test-helpers/components/comment-tree-fixtures'
import type { BookmarkResponseBody } from '@/types/api-responses'
import { useCommentCollapse } from '../use-comment-collapse'

vi.mock(import('@/lib/api/client/bookmarks'), () => ({
  bookmarkEntity: vi.fn<VitestLooseMock>().mockResolvedValue({}),
  unbookmarkEntity: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
}))

const comment = makeComment('1', 'root-1', 'alice')

function renderCollapse(viewer = 'viewer-1') {
  return renderHook(
    ({ currentViewer }: { currentViewer: string }) =>
      useCommentCollapse({
        currentUserId: currentViewer,
        rootPostId: 'root-1',
        mergedPostsMap: { '1': comment },
        postIdsKey: '1',
        serverHidden: () => currentViewer === 'viewer-2',
        onExpand: () => undefined,
      }),
    { initialProps: { currentViewer: viewer } },
  )
}

describe('signed-in comment collapse persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends reopen after hide settles and leaves the server open', async () => {
    let finishHide!: (response: BookmarkResponseBody) => void
    const hidePending = new Promise<BookmarkResponseBody>(resolve => {
      finishHide = resolve
    })
    let persistedHidden = false
    vi.mocked(bookmarkEntity).mockImplementationOnce(() =>
      hidePending.then(response => {
        persistedHidden = true
        return response
      }),
    )
    vi.mocked(unbookmarkEntity).mockImplementationOnce(async () => {
      persistedHidden = false
    })
    const { result } = renderCollapse()

    act(() => {
      result.current.toggle('1')
    })
    expect(result.current.collapsedIds.has('1')).toBe(true)

    act(() => {
      result.current.toggle('1')
    })
    expect(result.current.collapsedIds.has('1')).toBe(false)
    expect(unbookmarkEntity).not.toHaveBeenCalled()
    expect(persistedHidden).toBe(false)

    await act(async () => {
      finishHide({} as BookmarkResponseBody)
      await hidePending
    })
    expect(unbookmarkEntity).toHaveBeenCalledWith('post', '1', 'hide')
    expect(persistedHidden).toBe(false)
  })

  it('keeps a newer reopen when the pending hide fails', async () => {
    let failHide!: (error: Error) => void
    const hidePending = new Promise<BookmarkResponseBody>((_resolve, reject) => {
      failHide = reject
    })
    vi.mocked(bookmarkEntity).mockReturnValueOnce(hidePending)
    const { result } = renderCollapse()

    act(() => {
      result.current.toggle('1')
      result.current.toggle('1')
    })

    await act(async () => {
      failHide(new Error('offline'))
      await hidePending.catch(() => undefined)
    })

    expect(result.current.collapsedIds.has('1')).toBe(false)
    expect(unbookmarkEntity).not.toHaveBeenCalled()
  })

  it('retries a newer collapse intent after an older hide fails', async () => {
    let failFirstHide!: (error: Error) => void
    const firstHide = new Promise<BookmarkResponseBody>((_resolve, reject) => {
      failFirstHide = reject
    })
    vi.mocked(bookmarkEntity).mockReturnValueOnce(firstHide)
    const { result } = renderCollapse()

    act(() => {
      result.current.toggle('1')
      result.current.toggle('1')
      result.current.toggle('1')
    })

    await act(async () => {
      failFirstHide(new Error('offline'))
      await firstHide.catch(() => undefined)
    })

    expect(result.current.collapsedIds.has('1')).toBe(true)
    expect(bookmarkEntity).toHaveBeenCalledTimes(2)
    expect(unbookmarkEntity).not.toHaveBeenCalled()
  })

  it.each([{ viewers: ['viewer-2'] }, { viewers: ['viewer-2', 'viewer-1'] }])(
    'drops a queued reopen across viewer switches $viewers',
    async ({ viewers }) => {
      let finishHide!: (response: BookmarkResponseBody) => void
      const hidePending = new Promise<BookmarkResponseBody>(resolve => {
        finishHide = resolve
      })
      vi.mocked(bookmarkEntity).mockReturnValueOnce(hidePending)
      const { result, rerender } = renderCollapse()

      act(() => {
        result.current.toggle('1')
        result.current.toggle('1')
      })
      for (const currentViewer of viewers) rerender({ currentViewer })
      expect(result.current.collapsedIds.has('1')).toBe(viewers.at(-1) === 'viewer-2')

      await act(async () => {
        finishHide({} as BookmarkResponseBody)
        await hidePending
      })

      expect(unbookmarkEntity).not.toHaveBeenCalled()
    },
  )
})
