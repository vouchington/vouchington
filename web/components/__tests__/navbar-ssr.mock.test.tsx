// @vitest-environment node
import type { ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { Navbar as NavbarComponent } from '../navbar'

function Navbar() {
  return <NavbarComponent profileMenuUser={null} />
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

vi.mock(
  import('next/navigation'),
  () =>
    ({
      usePathname: () => '/',
      useRouter: () => ({ push: vi.fn<VitestLooseMock>() }),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('next/dynamic'), () => ({
  default: () =>
    function MockDynamic() {
      return null
    },
}))

vi.mock(
  import('@/components/command-search'),
  () =>
    ({
      CommandSearch: () => null,
    }) as unknown as typeof import('@/components/command-search'),
)

vi.mock(
  import('@/components/navbar/write-dialog'),
  () =>
    ({
      WriteDialog: () => null,
    }) as unknown as typeof import('@/components/navbar/write-dialog'),
)

vi.mock(
  import('@/components/notifications/inbox-button'),
  () =>
    ({
      InboxButton: () => null,
    }) as unknown as typeof import('@/components/notifications/inbox-button'),
)

vi.mock(import('@/lib/auth/context'), () => ({
  useAuth: () => ({
    currentUser: null,
    isAuthenticated: false,
    logout: vi.fn<() => Promise<void>>(),
    setUser: vi.fn<(user: null) => void>(),
  }),
}))

vi.mock(
  import('@/components/ui/sidebar'),
  () =>
    ({
      SidebarTrigger: (props: Record<string, unknown>) => (
        <button
          type='button'
          {...props}
        />
      ),
    }) as unknown as typeof import('@/components/ui/sidebar'),
)

describe('Navbar SSR', () => {
  it('server-renders without useLayoutEffect warnings', () => {
    expect(globalThis.window).toBeUndefined()

    const consoleError = vi.spyOn(console, 'error').mockReturnValue(undefined)

    try {
      renderToString(<Navbar />)
      expect(
        consoleError.mock.calls
          .flat()
          .some(arg => String(arg).includes('useLayoutEffect does nothing on the server')),
      ).toBe(false)
    } finally {
      consoleError.mockRestore()
    }
  })
})
