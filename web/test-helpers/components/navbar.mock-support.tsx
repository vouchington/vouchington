import type { ReactNode } from 'react'
import { configure } from '@testing-library/react'
import { vi } from 'vitest'

configure({ testIdAttribute: 'data-pw' })

import { Navbar as NavbarComponent } from '@/components/navbar'
import { toClientAuthUser, toProfileMenuUser } from '@/lib/auth/client-auth-user'
import type { User } from '@/types/user'

let mockCurrentUser: User | null = null

export function setNavbarUser(user: User | null) {
  mockCurrentUser = user
}

export function navbarUnderTest(Navbar: typeof NavbarComponent = NavbarComponent) {
  return <Navbar profileMenuUser={mockCurrentUser ? toProfileMenuUser(mockCurrentUser) : null} />
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

export { mockPathname, mockPush }

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
      // oxlint-disable-next-line react/only-export-components -- next/dynamic test double, never fast-refreshed
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
  KeyboardShortcutsDialog: () => <div data-pw='keyboard-shortcuts-dialog' />,
}))

vi.mock(import('@/components/command-search'), () => ({
  CommandSearch: ({ open }: { open: boolean }) => (
    <div
      data-open={String(open)}
      data-pw='command-search'
    />
  ),
}))

vi.mock(import('@/components/navbar/write-dialog'), () => ({
  WriteDialog: ({ open }: { open: boolean }) => (
    <div
      data-open={String(open)}
      data-pw='write-dialog'
    />
  ),
}))

vi.mock(import('@/components/notifications/inbox-button'), () => ({
  InboxButton: () => <div data-pw='inbox-button' />,
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
          data-pw='sidebar-trigger'
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

export const testUser: User = {
  id: 'u1',
  username: 'testuser',
  email_address: 'tests+test@voucha.ai',
  roles: ['user'],
}
