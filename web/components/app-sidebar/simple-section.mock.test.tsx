import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { SimpleSidebarSection } from './simple-section'

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

vi.mock(
  import('@/components/ui/collapsible'),
  () =>
    ({
      Collapsible: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      CollapsibleContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      CollapsibleTrigger: ({ children, ...props }: { children: ReactNode }) => (
        <button
          type='button'
          {...props}
        >
          {children}
        </button>
      ),
    }) as unknown as typeof import('@/components/ui/collapsible'),
)

vi.mock(
  import('@/components/ui/sidebar'),
  () =>
    ({
      SidebarGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      SidebarGroupContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      SidebarGroupLabel: ({ children }: { children: ReactNode; asChild?: boolean }) => children,
      SidebarMenu: ({ children }: { children: ReactNode }) => <nav>{children}</nav>,
      SidebarMenuButton: ({ children }: { children: ReactNode; asChild?: boolean }) => children,
      SidebarMenuItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    }) as unknown as typeof import('@/components/ui/sidebar'),
)

function Icon() {
  return <span aria-hidden='true' />
}

describe('SimpleSidebarSection', () => {
  it('renders predictable section and link data-pw values', () => {
    const { container } = render(
      <SimpleSidebarSection
        dataPw='sidebar-section-user-settings'
        label='User Settings'
        items={[
          {
            href: '/my/privacy',
            icon: Icon,
            label: 'Privacy',
            dataPw: 'sidebar-link-my-privacy',
          },
        ]}
      />,
    )

    expect(container.querySelector('[data-pw="sidebar-section-user-settings"]')).not.toBeNull()
    expect(container.querySelector('[data-pw="sidebar-link-my-privacy"]')).not.toBeNull()
  })
})
