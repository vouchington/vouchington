import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { FollowerShareActions } from '../follower-share-actions'

import { sharePostWithFollowers } from '@/lib/api/client/posts'

import { shareRssFeedItemWithFollowers } from '@/lib/api/client/rss-feeds'

import { fetchFollowerUsers } from '@/lib/api/client/users'

import type { User } from '@/types/user'

const { toast } = vi.hoisted(() => ({
  toast: {
    success: vi.fn<VitestLooseMock>(),
    error: vi.fn<VitestLooseMock>(),
  },
}))

let mockCurrentUser: User | null = { id: 'user-1' } as User

vi.mock(import('sonner'), () => ({ toast }) as unknown as typeof import('sonner'))

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

vi.mock(import('@/lib/api/client/posts'), () => ({
  sharePostWithFollowers: vi.fn<VitestLooseMock>(),
  sendPostToFollowers: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/rss-feeds'), () => ({
  shareRssFeedItemWithFollowers: vi.fn<VitestLooseMock>(),
  sendRssFeedItemToFollowers: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/users'), () => ({
  fetchFollowerUsers: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({ href, children }: { href: string; children: React.ReactNode }) => (
        <a href={href}>{children}</a>
      ),
    }) as unknown as typeof import('next/link'),
)

vi.mock(import('@/components/shared/user-avatar'), () => ({
  UserAvatar: ({ username }: { username: string }) => <div>{username}</div>,
}))

vi.mock(
  import('@/components/ui/dialog'),
  () =>
    ({
      Dialog: ({
        open,
        children,
      }: {
        open: boolean
        onOpenChange?: (open: boolean) => void
        children: React.ReactNode
      }) => (open ? <div>{children}</div> : null),
      DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
      DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
    }) as unknown as typeof import('@/components/ui/dialog'),
)

vi.mock(import('@/components/ui/popover'), () => {
  return {
    Popover: ({ children }: { open?: boolean; children: React.ReactNode }) => <div>{children}</div>,
    PopoverTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  } as unknown as typeof import('@/components/ui/popover')
})

vi.mock(
  import('@/components/ui/command'),
  () =>
    ({
      Command: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      CommandInput: ({
        value,
        onValueChange,
        placeholder,
      }: {
        value?: string
        onValueChange?: (value: string) => void
        placeholder?: string
      }) => (
        <input
          aria-label={placeholder ?? 'command-input'}
          value={value ?? ''}
          onChange={event => onValueChange?.(event.target.value)}
        />
      ),
      CommandList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      CommandEmpty: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      CommandItem: ({
        children,
        onSelect,
      }: {
        children: React.ReactNode
        onSelect?: () => void
      }) => (
        <button
          type='button'
          onClick={onSelect}
        >
          {children}
        </button>
      ),
    }) as unknown as typeof import('@/components/ui/command'),
)

describe('FollowerShareActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCurrentUser = { id: 'user-1' } as User
    vi.mocked(fetchFollowerUsers).mockResolvedValue({
      results: [
        { id: 'user-2', username: 'alpha' },
        { id: 'user-3', username: 'beta' },
      ],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    })
  })

  it('hides actions for the owner', () => {
    const { container } = render(
      <FollowerShareActions
        entityType='post'
        entityId='post-1'
        ownerUserId='user-1'
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing for signed-out viewers', () => {
    mockCurrentUser = null

    const { container } = render(
      <FollowerShareActions
        entityType='post'
        entityId='post-1'
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('queues a post share with followers', async () => {
    vi.mocked(sharePostWithFollowers).mockResolvedValue({
      status: 'accepted',
      distribution_id: 'distribution-1',
    })

    render(
      <FollowerShareActions
        entityType='post'
        entityId='post-1'
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Share with followers' }))

    await waitFor(() => {
      expect(sharePostWithFollowers).toHaveBeenCalledWith('post-1')
    })
  })

  it('queues an RSS feed item share with followers', async () => {
    vi.mocked(shareRssFeedItemWithFollowers).mockResolvedValue({
      status: 'accepted',
      distribution_id: 'distribution-1',
    })

    render(
      <FollowerShareActions
        entityType='rss_feed_item'
        entityId='item-1'
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Share with followers' }))

    await waitFor(() => {
      expect(shareRssFeedItemWithFollowers).toHaveBeenCalledWith('item-1')
      expect(toast.success).toHaveBeenCalledWith('Share queued')
    })
  })

  it('surfaces share failures', async () => {
    vi.mocked(sharePostWithFollowers).mockRejectedValue(new Error('API unavailable'))

    render(
      <FollowerShareActions
        entityType='post'
        entityId='post-1'
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Share with followers' }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled()
    })
  })
})
