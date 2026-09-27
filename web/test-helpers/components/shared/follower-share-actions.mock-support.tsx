import { useEffect, useRef, useState, type ReactNode } from 'react'
import { vi } from 'vitest'
import { Button } from '@/components/ui/button'
import type { User } from '@/types/user'

const { mockAuth, toast } = vi.hoisted(() => ({
  mockAuth: {
    currentUser: { id: 'user-1' } as User | null,
  },
  toast: {
    success: vi.fn<VitestLooseMock>(),
    error: vi.fn<VitestLooseMock>(),
  },
}))

vi.mock(import('sonner'), () => ({ toast }) as unknown as typeof import('sonner'))

vi.mock(
  import('@/lib/auth/context'),
  () =>
    ({
      useAuth: () => ({
        currentUser: mockAuth.currentUser,
        isAuthenticated: mockAuth.currentUser !== null,
        logout: vi.fn<() => Promise<void>>(),
        setUser: vi.fn<(user: User | null) => void>(),
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
      default: ({ href, children }: { href: string; children: ReactNode }) => (
        <a href={href}>{children}</a>
      ),
    }) as unknown as typeof import('next/link'),
)

vi.mock(
  import('@/components/shared/user-avatar'),
  () =>
    ({
      UserAvatar: ({ username }: { username: string }) => <div>{username}</div>,
    }) as unknown as typeof import('@/components/shared/user-avatar'),
)

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
        children: ReactNode
      }) => (open ? <div>{children}</div> : null),
      DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
      DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
    }) as unknown as typeof import('@/components/ui/dialog'),
)

interface EntityAutocompleteMockProps {
  getKey: (item: { id: string }) => string
  onSelect: (item: { id: string }, helpers: { setQuery: (query: string) => void }) => void
  renderItem: (item: { id: string }) => ReactNode
  search: (query: string, signal: AbortSignal) => Promise<{ id: string }[]>
}

vi.mock(
  import('@/components/shared/entity-autocomplete'),
  () =>
    ({
      EntityAutocomplete: ({
        getKey,
        onSelect,
        renderItem,
        search,
      }: EntityAutocompleteMockProps) => {
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
              <Button
                key={getKey(item)}
                type='button'
                onClick={() => onSelect(item, { setQuery: vi.fn<VitestLooseMock>() })}
              >
                {renderItem(item)}
              </Button>
            ))}
          </div>
        )
      },
    }) as unknown as typeof import('@/components/shared/entity-autocomplete'),
)

export { mockAuth, toast }
