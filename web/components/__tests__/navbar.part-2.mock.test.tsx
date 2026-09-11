import type { ReactNode } from 'react'

import { beforeEach, describe, it, expect, vi } from 'vitest'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { Navbar as NavbarComponent } from '../navbar'

import type { User } from '@/types/user'
import { toClientAuthUser, toProfileMenuUser } from '@/lib/auth/client-auth-user'

import { logout } from '@/lib/auth/logout'

import { toast } from 'sonner'

let mockCurrentUser: User | null = null

function Navbar() {
  return (
    <NavbarComponent
      profileMenuUser={mockCurrentUser ? toProfileMenuUser(mockCurrentUser) : null}
    />
  )
}

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

const mockPathname = vi.hoisted(() => vi.fn<VitestLooseMock>(() => '/'))

const mockPush = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock(
  import('next/navigation'),
  () =>
    ({
      usePathname: mockPathname,
      useRouter: () => ({ push: mockPush }),
    }) as unknown as typeof import('next/navigation'),
)

const nextDynamicMock = vi.hoisted(() => {
  const React = require('react')
  return {
    default: (loader: () => Promise<unknown>) =>
      function MockDynamic(props: Record<string, unknown>) {
        const [dynamicComponent, setDynamicComponent] = React.useState(null)
        React.useEffect(() => {
          let active = true
          void loader().then((mod: unknown) => {
            if (active)
              setDynamicComponent(() =>
                typeof mod === 'function' ? mod : (mod as Record<string, unknown>).default,
              )
          })
          return () => {
            active = false
          }
        }, [])
        return dynamicComponent ? React.createElement(dynamicComponent, props) : null
      },
  }
})

vi.mock(import('next/dynamic'), () => nextDynamicMock as unknown as typeof import('next/dynamic'))

vi.mock(import('@/components/keyboard-shortcuts-dialog'), () => ({
  KeyboardShortcutsDialog: () => <div data-testid='keyboard-shortcuts-dialog' />,
}))

vi.mock(import('@/components/command-search'), () => ({
  CommandSearch: ({ open }: { open: boolean }) => (
    <div
      data-open={String(open)}
      data-testid='command-search'
    />
  ),
}))

vi.mock(import('@/components/navbar/write-dialog'), () => ({
  WriteDialog: ({ open }: { open: boolean }) => (
    <div
      data-open={String(open)}
      data-testid='write-dialog'
    />
  ),
}))

vi.mock(import('@/components/notifications/inbox-button'), () => ({
  InboxButton: () => <div data-testid='inbox-button' />,
}))

vi.mock(import('@/lib/auth/logout'), () => ({
  logout: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/auth/context'), () => ({
  useAuth: () => ({
    currentUser: mockCurrentUser ? toClientAuthUser(mockCurrentUser) : null,
    isAuthenticated: mockCurrentUser !== null,
  }),
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

vi.mock(
  import('@/components/ui/sidebar'),
  () =>
    ({
      SidebarTrigger: (props: Record<string, unknown>) => (
        <button
          type='button'
          data-testid='sidebar-trigger'
          {...props}
        />
      ),
    }) as unknown as typeof import('@/components/ui/sidebar'),
)

vi.mock(
  import('@/components/ui/dropdown-menu'),
  () =>
    ({
      DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      DropdownMenuTrigger: ({ children }: { children: ReactNode; asChild?: boolean }) => (
        <div>{children}</div>
      ),
      DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      DropdownMenuItem: ({
        children,
        asChild,
        ...props
      }: {
        children: ReactNode
        asChild?: boolean
        [k: string]: unknown
      }) => (asChild ? children : <div {...props}>{children}</div>),
      DropdownMenuLabel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      DropdownMenuSeparator: () => <hr />,
    }) as unknown as typeof import('@/components/ui/dropdown-menu'),
)

const testUser: User = {
  id: 'u1',
  username: 'testuser',
  email_address: 'tests+test@voucha.ai',
  roles: ['user'],
}

describe('Navbar user dropdown', () => {
  beforeEach(() => {
    mockCurrentUser = testUser
    mockPathname.mockReturnValue('/')
  })

  it('navigates authenticated users to preferences with Cmd+.', () => {
    mockPush.mockReset()
    render(<Navbar />)

    fireEvent.keyDown(window, { key: '.', metaKey: true })

    expect(mockPush).toHaveBeenCalledWith('/my/preferences')
  })

  it('does not navigate unauthenticated users to preferences with Cmd+.', () => {
    mockCurrentUser = null
    mockPush.mockReset()
    render(<Navbar />)

    fireEvent.keyDown(window, { key: '.', metaKey: true })

    expect(mockPush).not.toHaveBeenCalled()
  })

  it('renders Landing Pages and Referrals links in the dropdown', () => {
    render(<Navbar />)

    // "Landing Pages" also appears in the intent switcher dropdown.
    // Find the dropdown link by searching all elements with that text and taking the anchor.
    const allLandingPages = screen.getAllByText('Landing Pages')
    const landingPagesLink = allLandingPages.map(el => el.closest('a')).find(el => el !== null)
    expect(landingPagesLink).not.toBeNull()
    expect(landingPagesLink!.getAttribute('href')).toBe('/my/landing-pages')

    const referralsLink = screen.getByText('Referrals').closest('a')
    expect(referralsLink).not.toBeNull()
    expect(referralsLink!.getAttribute('href')).toBe('/my/referrals')
  })

  it('renders Profile, Identity, Preferences links in the dropdown', () => {
    render(<Navbar />)

    expect(screen.getByText('Profile').closest('a')?.getAttribute('href')).toBe('/my/profile')
    expect(screen.getByText('Identity').closest('a')?.getAttribute('href')).toBe('/my/identity')
    expect(screen.getByText('Preferences').closest('a')?.getAttribute('href')).toBe(
      '/my/preferences',
    )
  })

  it('does not show dropdown for unauthenticated users', () => {
    mockCurrentUser = null
    render(<Navbar />)
    expect(screen.queryByText('Profile')).toBeNull()
  })

  it('renders the authenticated write control without outline border styling', () => {
    render(<Navbar />)

    const writeButton = screen.getByRole('button', { name: 'Write' })
    expect(writeButton.className).toContain('hover:bg-accent')
    expect(writeButton.className).not.toContain('border')
    expect(writeButton.className).not.toContain('border-input')
    expect(writeButton.className).not.toContain('shadow-sm')
  })

  it('opens the write dialog from the authenticated write control', () => {
    render(<Navbar />)

    expect(screen.getByTestId('write-dialog')).toHaveAttribute('data-open', 'false')

    fireEvent.click(screen.getByRole('button', { name: 'Write' }))

    expect(screen.getByTestId('write-dialog')).toHaveAttribute('data-open', 'true')
  })

  it('omits the Sign In control on the login page', () => {
    mockCurrentUser = null
    mockPathname.mockReturnValue('/login')

    render(<Navbar />)

    expect(screen.queryByRole('link', { name: 'Sign In' })).toBeNull()
    expect(screen.queryByText('Sign In')).toBeNull()
  })

  it('links unauthenticated users to login away from the login page', () => {
    mockCurrentUser = null
    mockPathname.mockReturnValue('/')

    render(<Navbar />)

    expect(screen.getByRole('link', { name: 'Sign In' })).toHaveAttribute('href', '/login')
  })

  it('shows a toast when logout fails', async () => {
    vi.mocked(logout).mockRejectedValueOnce(new Error('Failed from API'))

    render(<Navbar />)

    fireEvent.click(screen.getByText('Sign out'))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to log out')
    })
  })
})
