import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { FollowButton } from '../follow-button'
import type { User } from '@/types/user'

const mockNav = createNavMock()

let mockCurrentUser: User | null = null

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        ...props
      }: {
        children: ReactNode
        href: string
        [k: string]: unknown
      }) => (
        <a
          href={href}
          {...props}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

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

const {
  mockBookmarkEntity,
  mockUnbookmarkEntity,
  mockGetEntityBookmarks,
  mockToastError,
  mockToastSuccess,
} = vi.hoisted(() => ({
  mockBookmarkEntity: vi.fn<VitestLooseMock>(),
  mockUnbookmarkEntity: vi.fn<VitestLooseMock>(),
  mockGetEntityBookmarks: vi.fn<VitestLooseMock>(),
  mockToastError: vi.fn<VitestLooseMock>(),
  mockToastSuccess: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/bookmarks'), () => ({
  bookmarkEntity: mockBookmarkEntity,
  unbookmarkEntity: mockUnbookmarkEntity,
  getEntityBookmarks: mockGetEntityBookmarks,
}))

vi.mock(
  import('@/lib/auth/context'),
  () =>
    ({
      useAuth: () => ({
        currentUser: mockCurrentUser,
        isAuthenticated: mockCurrentUser !== null,
        logout: vi.fn<() => Promise<void>>(),
        setUser: vi.fn<(user: typeof mockCurrentUser) => void>(),
      }),
    }) as unknown as typeof import('@/lib/auth/context'),
)

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: { error: mockToastError, success: mockToastSuccess },
    }) as unknown as typeof import('sonner'),
)

describe('follow-button', () => {
  beforeEach(() => {
    mockBookmarkEntity.mockReset()
    mockUnbookmarkEntity.mockReset()
    mockGetEntityBookmarks.mockReset()
    mockToastError.mockReset()
    mockNav.reset()
    mockNav.setPathname('/topics/topic-1')
    mockCurrentUser = { id: 'user-123' } as User
    window.history.pushState(null, '', '/topics/topic-1')
  })

  describe('FollowButton', () => {
    it('renders "Follow" when not following', () => {
      render(
        <FollowButton
          entityType='topic'
          entityId='topic-1'
          isFollowing={false}
        />,
      )
      expect(screen.getByRole('button', { name: 'Follow' })).toBeDefined()
    })

    it('renders "Following" when following', () => {
      render(
        <FollowButton
          entityType='topic'
          entityId='topic-1'
          isFollowing
        />,
      )
      expect(screen.getByRole('button', { name: 'Following' })).toBeDefined()
    })

    it('optimistically toggles to Following on click when not following', async () => {
      mockBookmarkEntity.mockResolvedValue({})
      render(
        <FollowButton
          entityType='topic'
          entityId='topic-1'
          isFollowing={false}
        />,
      )
      fireEvent.click(screen.getByRole('button', { name: 'Follow' }))
      expect(screen.getByRole('button', { name: 'Following' })).toBeDefined()
      await waitFor(() =>
        expect(mockBookmarkEntity).toHaveBeenCalledWith('topic', 'topic-1', 'follow'),
      )
    })

    it('optimistically toggles to Follow on click when following', async () => {
      mockUnbookmarkEntity.mockResolvedValue(undefined)
      render(
        <FollowButton
          entityType='topic'
          entityId='topic-1'
          isFollowing
        />,
      )
      fireEvent.click(screen.getByRole('button', { name: 'Following' }))
      expect(screen.getByRole('button', { name: 'Follow' })).toBeDefined()
      await waitFor(() =>
        expect(mockUnbookmarkEntity).toHaveBeenCalledWith('topic', 'topic-1', 'follow'),
      )
    })

    it('reverts to Follow and shows error toast when bookmarkEntity fails', async () => {
      mockBookmarkEntity.mockRejectedValue(new Error('Network error'))
      render(
        <FollowButton
          entityType='topic'
          entityId='topic-1'
          isFollowing={false}
        />,
      )
      fireEvent.click(screen.getByRole('button', { name: 'Follow' }))
      await waitFor(() => expect(mockToastError).toHaveBeenCalled())
      expect(screen.getByRole('button', { name: 'Follow' })).toBeDefined()
    })

    it('reverts to Following and shows error toast when unbookmarkEntity fails', async () => {
      mockUnbookmarkEntity.mockRejectedValue(new Error('Network error'))
      render(
        <FollowButton
          entityType='topic'
          entityId='topic-1'
          isFollowing
        />,
      )
      fireEvent.click(screen.getByRole('button', { name: 'Following' }))
      await waitFor(() => expect(mockToastError).toHaveBeenCalled())
      expect(screen.getByRole('button', { name: 'Following' })).toBeDefined()
    })

    it('renders tooltip text when tooltip prop is provided', () => {
      render(
        <FollowButton
          entityType='user'
          entityId='user-1'
          isFollowing={false}
          tooltip="They'll be notified when you follow them"
        />,
      )
      expect(screen.getByRole('tooltip')).toBeDefined()
      expect(screen.getByText("They'll be notified when you follow them")).toBeDefined()
    })

    it('renders nothing when the viewer is the user target', () => {
      const { container } = render(
        <FollowButton
          entityType='user'
          entityId='user-123'
          isFollowing={false}
        />,
      )

      expect(container).toBeEmptyDOMElement()
    })

    describe('signed-out (no currentUserId)', () => {
      beforeEach(() => {
        mockCurrentUser = null
      })

      it('renders a login link with text "Follow" when currentUserId is undefined', () => {
        render(
          <FollowButton
            entityType='topic'
            entityId='topic-1'
          />,
        )
        const link = screen.getByRole('link', { name: /Follow — sign in to follow/i })
        expect(link).toBeDefined()
        expect(link.getAttribute('href')).toBe('/login?next=%2Ftopics%2Ftopic-1&intent=follow')
      })

      it('renders a login link with text "Follow" when currentUserId is null', () => {
        render(
          <FollowButton
            entityType='topic'
            entityId='topic-1'
          />,
        )
        const link = screen.getByRole('link', { name: /Follow — sign in to follow/i })
        expect(link.getAttribute('href')).toBe('/login?next=%2Ftopics%2Ftopic-1&intent=follow')
      })

      it('preserves the current query string in the login return link', () => {
        window.history.pushState(null, '', '/topics/topic-1?tab=posts')
        mockNav.setPathname('/topics/topic-1')
        render(
          <FollowButton
            entityType='topic'
            entityId='topic-1'
          />,
        )

        const link = screen.getByRole('link', { name: /Follow — sign in to follow/i })
        expect(link.getAttribute('href')).toBe(
          '/login?next=%2Ftopics%2Ftopic-1%3Ftab%3Dposts&intent=follow',
        )
      })

      it('does not call bookmarkEntity when the login link is rendered', () => {
        render(
          <FollowButton
            entityType='topic'
            entityId='topic-1'
          />,
        )
        expect(mockBookmarkEntity).not.toHaveBeenCalled()
      })

      it('renders "Sign in to follow" tooltip when tooltip prop and no currentUserId', () => {
        render(
          <FollowButton
            entityType='topic'
            entityId='topic-1'
            tooltip='Follow this topic to see its posts in your feed'
          />,
        )
        expect(screen.getByText('Sign in to follow')).toBeDefined()
      })
    })
  })
})
