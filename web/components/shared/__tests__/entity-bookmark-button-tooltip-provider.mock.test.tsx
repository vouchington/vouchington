import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EntityBookmarkButton } from '../entity-bookmark-button'

vi.mock(import('@/lib/api/client/bookmarks'), () => ({
  bookmarkEntity: vi.fn<VitestLooseMock>(),
  unbookmarkEntity: vi.fn<VitestLooseMock>(),
  getEntityBookmarks: vi.fn<VitestLooseMock>().mockResolvedValue({ bookmarks: {} }),
}))

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: {
        error: vi.fn<VitestLooseMock>(),
        success: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('sonner'),
)

describe('EntityBookmarkButton — no external TooltipProvider', () => {
  const errors: ErrorEvent[] = []

  const handleError = (event: ErrorEvent): void => {
    errors.push(event)
  }

  beforeEach(() => {
    errors.length = 0
    window.addEventListener('error', handleError)
  })

  afterEach(() => {
    window.removeEventListener('error', handleError)
  })

  it('renders without throwing when there is no external TooltipProvider', async () => {
    render(
      <EntityBookmarkButton
        entityType='post'
        entityId='post-1'
        preset='subscribe'
        initialActive={false}
      />,
    )

    await act(async () => {})

    expect(errors).toHaveLength(0)
  })
})
