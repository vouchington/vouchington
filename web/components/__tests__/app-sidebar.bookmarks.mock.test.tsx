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

vi.mock(import('../communities/communities-sidebar-group'), () => ({
  CommunitiesSidebarGroup: () => (
    <>
      <div data-sidebar='group'>
        <div data-sidebar='group-label'>Communities</div>
        <a href='/communities'>Explore Communities</a>
      </div>
      <div data-sidebar='group'>
        <div data-sidebar='group-label'>Bookmarks</div>
        <a
          href='/my/communities/saved'
          data-pw='sidebar-nav-my-communities-saved'
        >
          Saved Communities
        </a>
        <a
          href='/my/communities/proxy-following'
          data-pw='sidebar-nav-my-communities-proxy-following'
        >
          Proxy-Followed Communities
        </a>
        <a
          href='/my/communities/proxy-muted'
          data-pw='sidebar-nav-my-communities-proxy-muted'
        >
          Proxy-Muted Communities
        </a>
      </div>
    </>
  ),
}))

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

describe('AppSidebar Bookmarks', () => {
  beforeEach(() => {
    mockPathname = '/'
  })

  describe('Posts intent Bookmarks group', () => {
    beforeEach(() => {
      mockPathname = '/posts'
    })

    it('hides Bookmarks group for unauthenticated users', () => {
      renderSidebar()
      expect(screen.queryByText('Bookmarks')).toBeNull()
    })

    it('shows Bookmarks group for authenticated users', () => {
      renderSidebar({ id: 'u1', roles: ['user'] } as User)
      expect(screen.getByText('Bookmarks')).toBeDefined()
    })

    it('Saved Posts link has correct href', () => {
      renderSidebar({ id: 'u1', roles: ['user'] } as User)
      expect(screen.getByRole('link', { name: /^Saved Posts$/i }).getAttribute('href')).toBe(
        '/my/posts/saved',
      )
    })
  })

  describe('Topics intent Bookmarks group', () => {
    beforeEach(() => {
      mockPathname = '/topics'
    })

    it('hides Bookmarks group for unauthenticated users', () => {
      renderSidebar()
      expect(screen.queryByText('Bookmarks')).toBeNull()
    })

    it('shows Bookmarks group for authenticated users', () => {
      renderSidebar({ id: 'u1', roles: ['user'] } as User)
      expect(screen.getByText('Bookmarks')).toBeDefined()
    })

    it('Followed Topics link has correct href', () => {
      renderSidebar({ id: 'u1', roles: ['user'] } as User)
      expect(screen.getByRole('link', { name: /^Followed Topics$/i }).getAttribute('href')).toBe(
        '/my/topics/following',
      )
    })
  })

  describe('Web Search intent Bookmarks group', () => {
    beforeEach(() => {
      mockPathname = '/domains'
    })

    it('hides Bookmarks group for unauthenticated users', () => {
      renderSidebar()
      expect(screen.queryByText('Bookmarks')).toBeNull()
    })

    it('shows Bookmarks group for authenticated users', () => {
      renderSidebar({ id: 'u1', roles: ['user'] } as User)
      expect(screen.getByText('Bookmarks')).toBeDefined()
    })

    it('Saved Links link has correct href', () => {
      renderSidebar({ id: 'u1', roles: ['user'] } as User)
      expect(screen.getByRole('link', { name: /^Saved Links$/i }).getAttribute('href')).toBe(
        '/my/urls/saved',
      )
    })
  })

  describe('Communities intent Bookmarks group', () => {
    beforeEach(() => {
      mockPathname = '/communities'
    })

    it('hides Bookmarks group for unauthenticated users', () => {
      // Unauthenticated communities renders config-driven groups (CommunitiesSidebarGroup
      // only mounts for authenticated users). The Bookmarks group has requiresAuth:true so
      // it is filtered out for unauthenticated visitors.
      renderSidebar()
      expect(screen.queryByText('Bookmarks')).toBeNull()
    })
    // Note: authenticated communities Bookmarks come from CommunitiesSidebarGroup (dynamic
    // import), which does not resolve synchronously in vitest/jsdom. Authenticated coverage
    // is provided by the Playwright spec (sidebar-bookmarks.spec.mts).
  })

  describe('News intent Bookmarks group', () => {
    beforeEach(() => {
      mockPathname = '/news'
    })

    it('hides Bookmarks groups for unauthenticated users', () => {
      renderSidebar()
      expect(screen.queryByText('News Bookmarks')).toBeNull()
      expect(screen.queryByText('Source Bookmarks')).toBeNull()
    })

    it('shows News Bookmarks and Source Bookmarks groups for authenticated users', () => {
      renderSidebar({ id: 'u1', roles: ['user'] } as User)
      expect(screen.getByText('News Bookmarks')).toBeDefined()
      expect(screen.getByText('Source Bookmarks')).toBeDefined()
    })

    it('Saved News link has correct href', () => {
      renderSidebar({ id: 'u1', roles: ['user'] } as User)
      expect(screen.getByRole('link', { name: /^Saved News$/i }).getAttribute('href')).toBe(
        '/my/news-items/saved',
      )
    })

    it('Followed News Sources link has correct href', () => {
      renderSidebar({ id: 'u1', roles: ['user'] } as User)
      expect(
        screen.getByRole('link', { name: /^Followed News Sources$/i }).getAttribute('href'),
      ).toBe('/my/news-sources')
    })

    it('Recently Viewed News Sources link has correct href', () => {
      renderSidebar({ id: 'u1', roles: ['user'] } as User)
      expect(
        screen.getByRole('link', { name: /^Recently Viewed News Sources$/i }).getAttribute('href'),
      ).toBe('/my/news-sources/viewed')
    })
  })

  describe('Friends intent Bookmarks group', () => {
    beforeEach(() => {
      mockPathname = '/users'
    })

    it('hides Bookmarks group for unauthenticated users', () => {
      renderSidebar()
      expect(screen.queryByText('Bookmarks')).toBeNull()
    })

    it('shows Bookmarks group for authenticated users', () => {
      renderSidebar({ id: 'u1', roles: ['user'] } as User)
      expect(screen.getByText('Bookmarks')).toBeDefined()
    })

    it('Following link has correct href', () => {
      renderSidebar({ id: 'u1', roles: ['user'] } as User)
      expect(screen.getByRole('link', { name: /^Following$/i }).getAttribute('href')).toBe(
        '/my/users/following',
      )
    })
  })
})
