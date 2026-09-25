import { useEffect, useRef, useState, type ReactNode } from 'react'

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { FollowerShareActions } from '../follower-share-actions'

import { sendPostToFollowers } from '@/lib/api/client/posts'

import { fetchFollowerUsers } from '@/lib/api/client/users'

import type { FollowerDistributionAcceptedResponseBody } from '@/types/api-responses'
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

interface EntityAutocompleteMockProps {
  getKey: (item: { id: string }) => string
  onSelect: (item: { id: string }, helpers: { setQuery: (query: string) => void }) => void
  renderItem: (item: { id: string }) => ReactNode
  search: (query: string, signal: AbortSignal) => Promise<{ id: string }[]>
}

vi.mock(import('@/components/shared/entity-autocomplete'), () => {
  return {
    EntityAutocomplete: ({ getKey, onSelect, renderItem, search }: EntityAutocompleteMockProps) => {
      const [items, setItems] = useState<{ id: string }[]>([])
      const searchRef = useRef(search)
      searchRef.current = search

      useEffect(() => {
        const controller = new AbortController()
        void searchRef.current('', controller.signal).then(setItems)
        return () => controller.abort()
      }, [])

      return (
        <div>
          {items.map(item => (
            <button
              key={getKey(item)}
              type='button'
              onClick={() => onSelect(item, { setQuery: vi.fn<VitestLooseMock>() })}
            >
              {renderItem(item)}
            </button>
          ))}
        </div>
      )
    },
  } as unknown as typeof import('@/components/shared/entity-autocomplete')
})

describe('FollowerShareActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCurrentUser = { id: 'user-1' } as User
    vi.mocked(fetchFollowerUsers).mockResolvedValue({
      results: [
        { id: '01900000-0000-7000-8000-000000000002', username: 'alpha' },
        { id: 'user-3', username: 'beta' },
      ],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    })
  })

  it('sends to all followers by default', async () => {
    vi.mocked(sendPostToFollowers).mockResolvedValue({
      status: 'accepted',
      distribution_id: 'distribution-1',
    })

    render(
      <FollowerShareActions
        entityType='post'
        entityId='post-1'
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Send to followers' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send now' }))

    await waitFor(() => {
      expect(sendPostToFollowers).toHaveBeenCalledWith('post-1', { audience: 'all_followers' })
    })
    expect(fetchFollowerUsers).not.toHaveBeenCalled()
  })

  it('sends to selected followers', async () => {
    vi.mocked(sendPostToFollowers).mockResolvedValue({
      status: 'accepted',
      distribution_id: 'distribution-1',
    })

    render(
      <FollowerShareActions
        entityType='post'
        entityId='post-1'
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Send to followers' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Selected followers' }))

    await waitFor(() => {
      expect(fetchFollowerUsers).toHaveBeenCalledWith('user-1', {
        after: undefined,
        q: undefined,
        limit: 5,
        signal: expect.any(AbortSignal),
      })
    })

    fireEvent.click(await screen.findByRole('button', { name: /alpha/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Send now' }))

    await waitFor(() => {
      expect(sendPostToFollowers).toHaveBeenCalledWith('post-1', {
        audience: 'selected_followers',
        recipient_user_ids: ['01900000-0000-7000-8000-000000000002'],
      })
    })
  })

  it('clears recipient state when the target entity changes', async () => {
    vi.mocked(sendPostToFollowers).mockResolvedValue({
      status: 'accepted',
      distribution_id: 'distribution-1',
    })
    const { rerender } = render(
      <FollowerShareActions
        entityType='post'
        entityId='post-1'
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Send to followers' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Selected followers' }))
    fireEvent.click(await screen.findByRole('button', { name: /alpha/i }))

    rerender(
      <FollowerShareActions
        entityType='post'
        entityId='post-2'
      />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Send to followers' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send now' }))
    await waitFor(() => {
      expect(sendPostToFollowers).toHaveBeenCalledWith('post-2', { audience: 'all_followers' })
    })
  })

  it('keeps a new entity dialog open when an earlier send completes', async () => {
    let resolveFirstSend!: (response: FollowerDistributionAcceptedResponseBody) => void
    let resolveSecondSend!: (response: FollowerDistributionAcceptedResponseBody) => void
    vi.mocked(sendPostToFollowers)
      .mockImplementationOnce(
        () =>
          new Promise<FollowerDistributionAcceptedResponseBody>(resolve => {
            resolveFirstSend = resolve
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<FollowerDistributionAcceptedResponseBody>(resolve => {
            resolveSecondSend = resolve
          }),
      )

    const { rerender } = render(
      <FollowerShareActions
        entityType='post'
        entityId='post-1'
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Send to followers' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send now' }))
    await waitFor(() => expect(sendPostToFollowers).toHaveBeenCalledTimes(1))

    rerender(
      <FollowerShareActions
        entityType='post'
        entityId='post-2'
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Send to followers' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send now' }))
    await waitFor(() => expect(sendPostToFollowers).toHaveBeenCalledTimes(2))

    await act(async () => resolveFirstSend(acceptedResponse('distribution-1')))

    expect(screen.getByRole('heading', { name: 'Send to followers' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sending...' })).toBeDisabled()

    await act(async () => resolveSecondSend(acceptedResponse('distribution-2')))
  })
})

function acceptedResponse(distributionId: string): FollowerDistributionAcceptedResponseBody {
  return { status: 'accepted', distribution_id: distributionId }
}
