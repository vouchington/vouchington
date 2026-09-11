import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EntityBookmarkButton } from '../entity-bookmark-button'

vi.mock(
  import('@/components/ui/tooltip'),
  () =>
    ({
      Tooltip: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      TooltipContent: ({ children }: { children: ReactNode }) => (
        <span role='tooltip'>{children}</span>
      ),
      TooltipProvider: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      TooltipTrigger: ({ children }: { children: ReactNode; asChild?: boolean }) => (
        <div>{children}</div>
      ),
    }) as unknown as typeof import('@/components/ui/tooltip'),
)

const { mockBookmarkEntity, mockUnbookmarkEntity, mockGetEntityBookmarks } = vi.hoisted(() => ({
  mockBookmarkEntity: vi.fn<VitestLooseMock>(),
  mockUnbookmarkEntity: vi.fn<VitestLooseMock>(),
  mockGetEntityBookmarks: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/bookmarks'), () => ({
  bookmarkEntity: mockBookmarkEntity,
  unbookmarkEntity: mockUnbookmarkEntity,
  getEntityBookmarks: mockGetEntityBookmarks,
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

describe('EntityBookmarkButton sibling refetch', () => {
  beforeEach(() => {
    mockBookmarkEntity.mockReset()
    mockUnbookmarkEntity.mockReset()
    mockGetEntityBookmarks.mockReset()
  })

  it('does not refetch sibling buttons with different predicates when one is toggled', async () => {
    mockBookmarkEntity.mockResolvedValue(undefined)

    render(
      <>
        <EntityBookmarkButton
          entityType='user'
          entityId='user-42'
          predicate='follow'
          inactiveLabel='Follow'
          activeLabel='Following'
          initialActive={false}
        />
        <EntityBookmarkButton
          entityType='user'
          entityId='user-42'
          predicate='subscribe'
          inactiveLabel='Subscribe'
          activeLabel='Subscribed'
          initialActive={false}
        />
        <EntityBookmarkButton
          entityType='user'
          entityId='user-42'
          preset='mute'
          initialActive={false}
        />
      </>,
    )

    expect(mockGetEntityBookmarks).not.toHaveBeenCalled()

    // Click Follow — emits a 'follow' bookmark change for user-42
    fireEvent.click(screen.getByRole('button', { name: 'Follow' }))
    await waitFor(() => {
      expect(mockBookmarkEntity).toHaveBeenCalledWith('user', 'user-42', 'follow')
    })

    // Subscribe ('subscribe') and Mute ('mute') have different predicates from 'follow'
    // — they must not react to the change and must not call getEntityBookmarks
    expect(mockGetEntityBookmarks).not.toHaveBeenCalled()
  })

  it('refetches a same-predicate sibling button when the other is toggled', async () => {
    mockBookmarkEntity.mockResolvedValue(undefined)
    mockGetEntityBookmarks.mockResolvedValue({ bookmarks: { follow: true } })

    render(
      <>
        <EntityBookmarkButton
          entityType='user'
          entityId='user-42'
          predicate='follow'
          inactiveLabel='Follow'
          activeLabel='Following'
          initialActive={false}
        />
        <EntityBookmarkButton
          entityType='user'
          entityId='user-42'
          predicate='follow'
          inactiveLabel='Follow'
          activeLabel='Following'
          initialActive={false}
        />
      </>,
    )

    expect(mockGetEntityBookmarks).not.toHaveBeenCalled()

    const followButtons = screen.getAllByRole('button', { name: 'Follow' })
    expect(followButtons.length).toBeGreaterThanOrEqual(2)
    fireEvent.click(followButtons[0]!)
    await waitFor(() => {
      expect(mockBookmarkEntity).toHaveBeenCalledWith('user', 'user-42', 'follow')
    })

    // The second Follow button has the same predicate — it must refetch
    await waitFor(() => {
      expect(mockGetEntityBookmarks).toHaveBeenCalledWith('user', 'user-42')
    })
  })

  it('notifies the follow button when muting a topic causes an implicit server-side unfollow', async () => {
    // Server removes the follow when mute is added (backend IMPLICIT_UNFOLLOW: topic:mute -> follow)
    mockBookmarkEntity.mockResolvedValue(undefined)
    mockGetEntityBookmarks.mockResolvedValue({ bookmarks: { follow: false, mute: true } })

    render(
      <>
        <EntityBookmarkButton
          entityType='topic'
          entityId='topic-99'
          predicate='follow'
          inactiveLabel='Follow'
          activeLabel='Following'
          initialActive
        />
        <EntityBookmarkButton
          entityType='topic'
          entityId='topic-99'
          preset='mute'
          initialActive={false}
        />
      </>,
    )

    expect(screen.getByRole('button', { name: 'Following' })).toBeDefined()
    expect(mockGetEntityBookmarks).not.toHaveBeenCalled()

    // Click Mute — backend also removes the follow
    fireEvent.click(screen.getByRole('button', { name: 'Mute' }))
    await waitFor(() => {
      expect(mockBookmarkEntity).toHaveBeenCalledWith('topic', 'topic-99', 'mute')
    })

    // Mute button emits 'follow' cascade event — Follow button must refetch and show unsubscribed
    await waitFor(() => {
      expect(mockGetEntityBookmarks).toHaveBeenCalledWith('topic', 'topic-99')
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Follow' })).toBeDefined()
    })
  })
})
