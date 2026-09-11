import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppSidebar } from '../app-sidebar'
import { SidebarProvider } from '@/components/ui/sidebar'
import { AuthProvider } from '@/lib/auth/auth-provider'
import { toClientAuthUser } from '@/lib/auth/client-auth-user'
import type { User } from '@/types/user'
import type { ReactNode } from 'react'

let mockPathname = '/'

vi.mock(
  import('next/navigation'),
  () =>
    ({
      usePathname: () => mockPathname,
      useRouter: vi.fn<() => { push: (path: string) => void }>(() => ({
        push: vi.fn<(path: string) => void>(),
      })),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        prefetch: _prefetch,
        ...props
      }: {
        children: ReactNode
        href: string
        prefetch?: boolean
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

vi.mock(import('../chat/chats-sidebar-group'), () => ({
  ChatsSidebarGroup: () => (
    <div data-sidebar='group'>
      <div data-sidebar='group-label'>Chats</div>
    </div>
  ),
}))

vi.mock(import('../messages/messages-sidebar-group'), () => ({
  MessagesSidebarGroup: () => null,
}))

vi.mock(
  import('../messages/messages-sidebar-group-view'),
  () =>
    ({
      MessagesSidebarGroupView: () => null,
    }) as unknown as typeof import('../messages/messages-sidebar-group-view'),
)

vi.mock(
  import('../communities/communities-sidebar-group'),
  () =>
    ({
      CommunitiesSidebarGroup: () => null,
    }) as unknown as typeof import('../communities/communities-sidebar-group'),
)

vi.mock(
  import('../lists/lists-sidebar-group'),
  () =>
    ({
      ListsSidebarGroup: () => null,
    }) as unknown as typeof import('../lists/lists-sidebar-group'),
)

vi.mock(import('../navbar/intent-switcher'), () => ({
  IntentSwitcher: () => <div data-testid='intent-switcher-stub' />,
}))

vi.mock(
  import('../sidebar-site-footer'),
  () =>
    ({
      SidebarSiteFooter: () => null,
    }) as unknown as typeof import('../sidebar-site-footer'),
)

function renderSidebar(currentUser: User | null = null) {
  return render(
    <AuthProvider initialUser={currentUser ? toClientAuthUser(currentUser) : null}>
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>
    </AuthProvider>,
  )
}

describe('AppSidebar Bookmarks — Media intents', () => {
  beforeEach(() => {
    mockPathname = '/'
  })

  describe('Podcasts intent Bookmarks group', () => {
    beforeEach(() => {
      mockPathname = '/podcast-episodes'
    })

    it('hides Bookmarks groups for unauthenticated users', () => {
      renderSidebar()
      expect(screen.queryByText('Episode Bookmarks')).toBeNull()
      expect(screen.queryByText('Source Bookmarks')).toBeNull()
    })

    it('shows Episode Bookmarks and Source Bookmarks groups for authenticated users', () => {
      renderSidebar({ id: 'u1', roles: ['user'] } as User)
      expect(screen.getByText('Episode Bookmarks')).toBeDefined()
      expect(screen.getByText('Source Bookmarks')).toBeDefined()
    })

    it('Saved Episodes link has correct href', () => {
      renderSidebar({ id: 'u1', roles: ['user'] } as User)
      expect(screen.getByRole('link', { name: /^Saved Episodes$/i }).getAttribute('href')).toBe(
        '/my/podcast-episodes/saved',
      )
    })

    it('Recently Viewed Podcasts link has correct href', () => {
      renderSidebar({ id: 'u1', roles: ['user'] } as User)
      expect(
        screen.getByRole('link', { name: /^Recently Viewed Podcasts$/i }).getAttribute('href'),
      ).toBe('/my/podcasts/viewed')
    })
  })

  describe('Videos intent Bookmarks group', () => {
    beforeEach(() => {
      mockPathname = '/videos'
    })

    it('hides Bookmarks groups for unauthenticated users', () => {
      renderSidebar()
      expect(screen.queryByText('Video Bookmarks')).toBeNull()
      expect(screen.queryByText('Source Bookmarks')).toBeNull()
    })

    it('shows Video Bookmarks and Source Bookmarks groups for authenticated users', () => {
      renderSidebar({ id: 'u1', roles: ['user'] } as User)
      expect(screen.getByText('Video Bookmarks')).toBeDefined()
      expect(screen.getByText('Source Bookmarks')).toBeDefined()
    })

    it('Saved Videos link has correct href', () => {
      renderSidebar({ id: 'u1', roles: ['user'] } as User)
      expect(screen.getByRole('link', { name: /^Saved Videos$/i }).getAttribute('href')).toBe(
        '/my/videos/saved',
      )
    })

    it('Recently Viewed Channels link has correct href', () => {
      renderSidebar({ id: 'u1', roles: ['user'] } as User)
      expect(
        screen.getByRole('link', { name: /^Recently Viewed Channels$/i }).getAttribute('href'),
      ).toBe('/my/channels/viewed')
    })
  })
})
