import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { FollowButton } from '../follow-button'

const mockNav = createNavMock()
const { mockBookmarkEntity, mockGetEntityBookmarks, mockToastError } = vi.hoisted(() => ({
  mockBookmarkEntity: vi.fn<VitestLooseMock>(),
  mockGetEntityBookmarks: vi.fn<VitestLooseMock>(),
  mockToastError: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({ children, href }: { children: ReactNode; href: string }) => (
        <a href={href}>{children}</a>
      ),
    }) as unknown as typeof import('next/link'),
)

vi.mock(
  import('@/lib/auth/context'),
  () =>
    ({
      useAuth: () => ({ currentUser: { id: 'viewer-1' }, isAuthenticated: true }),
    }) as unknown as typeof import('@/lib/auth/context'),
)

vi.mock(import('@/lib/api/client/bookmarks'), () => ({
  bookmarkEntity: mockBookmarkEntity,
  getEntityBookmarks: mockGetEntityBookmarks,
  unbookmarkEntity: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: { error: mockToastError },
    }) as unknown as typeof import('sonner'),
)

describe('FollowButton change callback', () => {
  beforeEach(() => {
    mockNav.reset()
    mockNav.setPathname('/user/example')
    mockBookmarkEntity.mockReset()
    mockGetEntityBookmarks.mockReset()
    mockToastError.mockReset()
  })

  it('notifies the parent after a successful follow', async () => {
    const onChange = vi.fn<(isActive: boolean) => void>()
    mockBookmarkEntity.mockResolvedValue({})
    render(
      <FollowButton
        entityType='user'
        entityId='user-1'
        isFollowing={false}
        onChange={onChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Follow' }))

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(true))
  })

  it('does not notify the parent when follow fails', async () => {
    const onChange = vi.fn<(isActive: boolean) => void>()
    mockBookmarkEntity.mockRejectedValue(new Error('Network error'))
    render(
      <FollowButton
        entityType='user'
        entityId='user-1'
        isFollowing={false}
        onChange={onChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Follow' }))

    await waitFor(() => expect(mockToastError).toHaveBeenCalled())
    expect(onChange).not.toHaveBeenCalled()
  })
})
