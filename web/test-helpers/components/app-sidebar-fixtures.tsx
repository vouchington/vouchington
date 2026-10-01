/* oxlint-disable no-mistakes/playwright-consistent-attribute -- test support preserves existing Testing Library selectors */
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { vi } from 'vitest'
import { SidebarProvider } from '@/components/ui/sidebar'
import { AuthProvider } from '@/lib/auth/auth-provider'
import { toClientAuthUser } from '@/lib/auth/client-auth-user'
import { createNavMock, navMockModule } from '@/test-helpers/next-navigation-mock'
import type { User } from '@/types/user'

vi.mock(import('next/navigation'), () => navMockModule)

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

vi.mock(import('../../components/messages/messages-sidebar-group'), () => ({
  MessagesSidebarGroup: () => null,
}))

vi.mock(
  import('../../components/messages/messages-sidebar-group-view'),
  () =>
    ({
      MessagesSidebarGroupView: () => null,
    }) as unknown as typeof import('../../components/messages/messages-sidebar-group-view'),
)

vi.mock(import('../../components/communities/communities-sidebar-group'), () => ({
  CommunitiesSidebarGroup: () => (
    <div data-sidebar='group'>
      <div data-sidebar='group-label'>Communities</div>
      <a href='/communities'>Explore Communities</a>
    </div>
  ),
}))

vi.mock(
  import('../../components/lists/lists-sidebar-group'),
  () =>
    ({
      ListsSidebarGroup: () => null,
    }) as unknown as typeof import('../../components/lists/lists-sidebar-group'),
)

vi.mock(import('../../components/navbar/intent-switcher'), () => ({
  IntentSwitcher: () => <div data-testid='intent-switcher-stub' />,
}))

vi.mock(
  import('../../components/sidebar-site-footer'),
  () =>
    ({
      SidebarSiteFooter: () => null,
    }) as unknown as typeof import('../../components/sidebar-site-footer'),
)

import { AppSidebar } from '../../components/app-sidebar'

const mockNav = createNavMock()

export function setMockPathname(pathname: string) {
  mockNav.setPathname(pathname)
}

export function renderSidebar(currentUser: User | null = null) {
  return render(
    <AuthProvider initialUser={currentUser ? toClientAuthUser(currentUser) : null}>
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>
    </AuthProvider>,
  )
}

export function getSectionLabels(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[data-sidebar="group-label"]')].map(
    el => el.textContent?.trim() ?? '',
  )
}
