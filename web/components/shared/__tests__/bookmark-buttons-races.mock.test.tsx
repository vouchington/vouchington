import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockLucideReact } from '@/test-helpers/lucide-icons'

vi.mock(import('@/lib/api/client/bookmarks'), () => ({
  bookmarkEntity: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
  unbookmarkEntity: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
}))
vi.mock(
  import('sonner'),
  () => ({ toast: { error: vi.fn<VitestLooseMock>() } }) as unknown as typeof import('sonner'),
)
vi.mock(
  import('@/lib/api/rate-limit-error'),
  () =>
    ({
      isRateLimitError: () => false,
      getRateLimitMessage: () => '',
    }) as unknown as typeof import('@/lib/api/rate-limit-error'),
)
vi.mock(import('lucide-react'), () =>
  mockLucideReact({ Bookmark: () => null, BookmarkCheck: () => null, EyeOff: () => null }),
)

import { bookmarkEntity } from '@/lib/api/client/bookmarks'
import { RSS_ITEM_HIDDEN_EVENT } from '@/lib/rss-item-modal'
import { toast } from 'sonner'
import { HideButton } from '../hide-button'
import { SaveButton } from '../save-button'

describe('bookmark button request races', () => {
  beforeEach(() => vi.clearAllMocks())

  for (const testCase of [
    { Component: SaveButton, inactive: 'Save', active: 'Saved' },
    { Component: HideButton, inactive: 'Hide', active: 'Unhide' },
  ]) {
    it(`does not let an old ${testCase.inactive} request update a new A view`, async () => {
      let reject!: (error: Error) => void
      vi.mocked(bookmarkEntity).mockReturnValueOnce(
        new Promise((_, rejectPromise) => (reject = rejectPromise)),
      )
      const { Component } = testCase
      const { rerender } = render(
        <Component
          entityType='rss_feed_item'
          entityId='item-a'
          initialActive={false}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: testCase.inactive }))
      rerender(
        <Component
          entityType='rss_feed_item'
          entityId='item-b'
          initialActive={false}
        />,
      )
      rerender(
        <Component
          entityType='rss_feed_item'
          entityId='item-a'
          initialActive
        />,
      )
      reject(new Error('network'))

      await waitFor(() =>
        expect(screen.getByRole('button', { name: testCase.active })).not.toBeDisabled(),
      )
    })

    it(`resets ${testCase.inactive} state when its initial flag changes`, () => {
      const { Component } = testCase
      const { rerender } = render(
        <Component
          entityType='rss_feed_item'
          entityId='item-1'
          initialActive={false}
        />,
      )

      rerender(
        <Component
          entityType='rss_feed_item'
          entityId='item-1'
          initialActive
        />,
      )

      expect(screen.getByRole('button', { name: testCase.active })).toBeVisible()
    })
  }

  it('does not report a deferred Save failure after an immediate entity rerender', async () => {
    let reject!: (error: Error) => void
    vi.mocked(bookmarkEntity).mockReturnValueOnce(
      new Promise((_, rejectPromise) => (reject = rejectPromise)),
    )
    const onActiveChange = vi.fn<(active: boolean) => void>()
    const { rerender } = render(
      <SaveButton
        entityType='rss_feed_item'
        entityId='item-a'
        onActiveChange={onActiveChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    rerender(
      <SaveButton
        entityType='rss_feed_item'
        entityId='item-b'
        onActiveChange={onActiveChange}
      />,
    )
    await act(async () => reject(new Error('network')))

    expect(onActiveChange).toHaveBeenCalledTimes(1)
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('does not emit deferred Hide success callbacks after an immediate entity rerender', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof bookmarkEntity>>) => void
    vi.mocked(bookmarkEntity).mockReturnValueOnce(new Promise(done => (resolve = done)))
    const onHide = vi.fn<(entityId: string) => void>()
    const onActiveChange = vi.fn<(active: boolean) => void>()
    const hiddenEvent = vi.fn<() => void>()
    window.addEventListener(RSS_ITEM_HIDDEN_EVENT, hiddenEvent)
    const { rerender } = render(
      <HideButton
        entityType='rss_feed_item'
        entityId='item-a'
        onActiveChange={onActiveChange}
        onHide={onHide}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
    rerender(
      <HideButton
        entityType='rss_feed_item'
        entityId='item-b'
        onActiveChange={onActiveChange}
        onHide={onHide}
      />,
    )
    await act(async () => resolve({} as Awaited<ReturnType<typeof bookmarkEntity>>))

    expect(onActiveChange).toHaveBeenCalledTimes(1)
    expect(onHide).not.toHaveBeenCalled()
    expect(hiddenEvent).not.toHaveBeenCalled()
    window.removeEventListener(RSS_ITEM_HIDDEN_EVENT, hiddenEvent)
  })
})
