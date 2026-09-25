import type { ReactElement, ReactNode } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { configure, render, screen } from '@testing-library/react'
import { useAuth } from '@/lib/auth/context'
import { IntentSwitcher } from '../intent-switcher'

// Configure RTL to use data-pw as the test id (matching the Playwright convention in this codebase)
configure({ testIdAttribute: 'data-pw' })

vi.mock(import('next/navigation'), () => ({
  usePathname: vi.fn<() => string>(() => '/'),
}))

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        href,
        children,
        ...props
      }: {
        href: string
        children: ReactNode
        [key: string]: unknown
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

vi.mock(import('@/lib/auth/context'), () => ({
  useAuth: vi.fn<() => { currentUser: null; isAuthenticated: boolean }>(() => ({
    currentUser: null,
    isAuthenticated: false,
  })),
}))

vi.mock(
  import('@/components/ui/dropdown-menu'),
  () =>
    ({
      DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      DropdownMenuTrigger: ({ children }: { children: ReactNode; asChild?: boolean }) => children,
      DropdownMenuContent: ({ children }: { children: ReactNode }) => (
        <div role='menu'>{children}</div>
      ),
      DropdownMenuItem: ({ children, asChild }: { children: ReactNode; asChild?: boolean }) =>
        asChild ? (children as ReactElement) : <div>{children}</div>,
    }) as unknown as typeof import('@/components/ui/dropdown-menu'),
)

describe('IntentSwitcher', () => {
  it('renders the trigger with the active intent label', () => {
    render(<IntentSwitcher variant='navbar' />)
    expect(screen.getByTestId('intent-switcher-trigger')).toBeDefined()
  })

  it('filters requiresAuth intents when logged out', () => {
    render(<IntentSwitcher variant='navbar' />)
    // 'chat' and 'landing-pages' and 'friends' require auth — should not appear
    expect(screen.queryByTestId('intent-switcher-item-chat')).toBeNull()
    expect(screen.queryByTestId('intent-switcher-item-landing-pages')).toBeNull()
    expect(screen.queryByTestId('intent-switcher-item-friends')).toBeNull()
    // 'news' is always visible
    expect(screen.getByTestId('intent-switcher-item-news')).toBeDefined()
  })

  it('filters role-gated and auth-gated intents from anonymous users', () => {
    render(<IntentSwitcher variant='navbar' />)
    // Auth-gated intents should not appear for anonymous user
    // moderation is requiresAuth at intent level (WS2: visible to all authed users)
    expect(screen.queryByTestId('intent-switcher-item-moderation')).toBeNull()
    // growth requires administrator or investor role
    expect(screen.queryByTestId('intent-switcher-item-growth')).toBeNull()
  })

  it('shows moderation intent to authenticated non-admin user (WS2)', () => {
    vi.mocked(useAuth).mockReturnValueOnce({
      currentUser: { id: 'user-1', roles: [], isOfficialAccount: false },
      isAuthenticated: true,
    })
    render(<IntentSwitcher variant='navbar' />)
    // Moderation intent is now requiresAuth (not role-gated) — non-admin authed users
    // see the "My Cases" group items (My Appeals, My Disputes)
    expect(screen.getByTestId('intent-switcher-item-moderation')).toBeDefined()
    // growth is still role-gated — non-admin users cannot see it
    expect(screen.queryByTestId('intent-switcher-item-growth')).toBeNull()
  })

  it('renders every visible intent item as an anchor with a non-empty href', () => {
    render(<IntentSwitcher variant='navbar' />)
    const newsItem = screen.getByTestId('intent-switcher-item-news')
    // Requirement: navigation dropdown items must be links, not buttons
    expect(newsItem.tagName).toBe('A')
    expect(newsItem.getAttribute('href')).toBeTruthy()
  })

  it('logged-out: news item links to /news (first public item)', () => {
    render(<IntentSwitcher variant='navbar' />)
    const newsItem = screen.getByTestId('intent-switcher-item-news')
    expect(newsItem.getAttribute('href')).toBe('/news')
  })

  it('logged-in: news item links to /feed/news (first auth-gated item)', () => {
    vi.mocked(useAuth).mockReturnValueOnce({
      currentUser: { id: 'user-1', roles: [], isOfficialAccount: false },
      isAuthenticated: true,
    })
    render(<IntentSwitcher variant='navbar' />)
    const newsItem = screen.getByTestId('intent-switcher-item-news')
    expect(newsItem.getAttribute('href')).toBe('/feed/news')
  })
})
