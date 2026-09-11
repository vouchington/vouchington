import type { ReactNode } from 'react'

import { beforeEach, describe, it, expect, vi } from 'vitest'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { Navbar as NavbarComponent } from '../navbar'

import type { User } from '@/types/user'
import { toClientAuthUser, toProfileMenuUser } from '@/lib/auth/client-auth-user'

import { logout } from '@/lib/auth/logout'
import { UiLocaleProvider } from '@/lib/i18n/ui-locale-provider'
import { seedMessages } from '@/lib/i18n/use-translations'
import esMessages from '@ts-shared/ui-messages/messages/es'

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

describe('Navbar sidebar trigger visibility', () => {
  beforeEach(() => {
    mockCurrentUser = null
    mockPathname.mockReturnValue('/')
  })

  it('animates the trigger slot closed at desktop viewports when sidebar is expanded', () => {
    const { container } = render(<Navbar />)
    const trigger = container.querySelector('[data-testid="sidebar-trigger"]')
    const triggerSlot = trigger?.parentElement
    // Visibility is CSS-driven via group-data selectors on the sidebar wrapper's data-state
    // attribute — no mounted/isMobile flags, so there is no SSR/hydration flip.
    // At >=md viewports with data-state="expanded", the slot animates to width 0 so the Voucha
    // logo moves horizontally instead of jumping. has-[:focus-visible] restores space when tabbing.
    expect(triggerSlot?.className).toContain('transition-[width,margin-right]')
    expect(triggerSlot?.className).toContain('duration-300')
    expect(triggerSlot?.className).toContain('md:group-data-[state=expanded]/sidebar-wrapper:w-0')
    expect(triggerSlot?.className).toContain('md:group-data-[state=expanded]/sidebar-wrapper:mr-0')
    expect(triggerSlot?.className).toContain(
      'md:group-data-[state=expanded]/sidebar-wrapper:has-[:focus-visible]:w-11',
    )
    expect(triggerSlot?.className).toContain(
      'md:group-data-[state=expanded]/sidebar-wrapper:has-[:focus-visible]:mr-2',
    )
    // Must not use hidden/invisible/opacity-0 which either remove from a11y tree or preserve space
    expect(triggerSlot?.className).not.toMatch(/(?:^|\s)hidden(?:\s|$)/)
    expect(trigger?.className).not.toContain('sr-only')
    expect(trigger?.className).not.toContain('invisible')
    expect(trigger?.className).not.toContain('opacity-0')
    expect(trigger?.getAttribute('tabindex')).toBeNull()
    expect(trigger?.getAttribute('aria-hidden')).toBeNull()
  })
})

describe('Navbar layout', () => {
  beforeEach(() => {
    mockCurrentUser = null
    mockPathname.mockReturnValue('/')
  })

  it('inner nav wrapper is centered to content column via mx-auto max-w-[1200px]', () => {
    const { container } = render(<Navbar />)
    // The outer <nav> has px-* padding; the inner flex row must be mx-auto max-w-[1200px]
    // so the SidebarTrigger aligns with the 1200px content column on wide viewports.
    const nav = container.querySelector('nav[aria-label="Main"]')
    const inner = nav?.firstElementChild
    expect(inner?.className).toContain('mx-auto')
    expect(inner?.className).toContain('max-w-[1200px]')
    expect(inner?.className).toContain('w-full')
  })

  it('keeps the search label visible at mobile and desktop breakpoints', () => {
    render(<Navbar />)

    const searchButton = screen.getByRole('button', { name: 'Open search' })
    expect(searchButton.textContent).toContain('Search...')

    const searchLabel = screen.getByText('Search...')
    expect(searchLabel.className).toContain('truncate')
    expect(searchLabel.className).not.toContain('hidden')
    expect(searchLabel.className).not.toContain('sm:inline')
  })

  it('uses a touch-safe search hit target with a compact visual shell', () => {
    const { container } = render(<Navbar />)

    const searchButton = screen.getByRole('button', { name: 'Open search' })
    expect(searchButton.className).toContain('h-11')
    expect(searchButton.className).toContain('sm:h-8')

    const searchShell = container.querySelector('[data-pw="navbar-search-shell"]')
    expect(searchShell?.className).toContain('h-8')
    expect(searchShell?.className).toContain('border')
  })

  it('opens search from the topbar search control', () => {
    render(<Navbar />)

    expect(screen.getByTestId('command-search')).toHaveAttribute('data-open', 'false')

    fireEvent.click(screen.getByRole('button', { name: 'Open search' }))

    expect(screen.getByTestId('command-search')).toHaveAttribute('data-open', 'true')
  })

  it('renders topbar chrome from the resolved non-English UI locale catalog', () => {
    mockCurrentUser = testUser
    seedMessages('es', esMessages)

    render(
      <UiLocaleProvider uiLocale='es'>
        <Navbar />
      </UiLocaleProvider>,
    )

    expect(screen.getByRole('button', { name: 'Abrir búsqueda' })).toBeInTheDocument()
    expect(screen.getByText('Buscar...')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Escribir' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open search' })).toBeNull()
    expect(screen.queryByText('Search...')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Write' })).toBeNull()
  })
})
