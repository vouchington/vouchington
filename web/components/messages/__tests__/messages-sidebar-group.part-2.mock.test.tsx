import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'

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

vi.mock(import('@/lib/utils/path'), () => ({
  isActivePath: (pathname: string, href: string) => pathname === href,
}))

vi.mock(
  import('@/components/ui/sidebar'),
  () =>
    ({
      SidebarGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      SidebarGroupLabel: ({
        children,
        asChild: _asChild,
        ...props
      }: {
        children: ReactNode
        asChild?: boolean
        [k: string]: unknown
      }) => <div {...props}>{children}</div>,
      SidebarGroupContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      SidebarMenu: ({ children }: { children: ReactNode }) => <ul>{children}</ul>,
      SidebarMenuItem: ({ children, ...props }: { children: ReactNode; [k: string]: unknown }) => (
        <li {...props}>{children}</li>
      ),
      SidebarMenuButton: ({
        children,
        asChild: _asChild,
        isActive: _isActive,
        ...props
      }: {
        children: ReactNode
        asChild?: boolean
        isActive?: boolean
        [k: string]: unknown
      }) => <div {...props}>{children}</div>,
    }) as unknown as typeof import('@/components/ui/sidebar'),
)

vi.mock(
  import('@/components/ui/collapsible'),
  () =>
    ({
      Collapsible: ({ children, ...props }: { children: ReactNode; [k: string]: unknown }) => (
        <div {...props}>{children}</div>
      ),
      CollapsibleTrigger: ({
        children,
        ...props
      }: {
        children: ReactNode
        [k: string]: unknown
      }) => (
        <button
          type='button'
          {...props}
        >
          {children}
        </button>
      ),
      CollapsibleContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    }) as unknown as typeof import('@/components/ui/collapsible'),
)

const makeConversation = (id: string, title = 'Conversation') => ({
  id,
  channel_type: 'direct_message' as const,
  title,
  created_at: '',
  updated_at: '',
})

import { MessagesSidebarGroupView } from '../messages-sidebar-group-view'

describe('MessagesSidebarGroupView', () => {
  const defaultProps = {
    conversations: [],
    pathname: '/messages',
  }

  it('always renders the "All Messages" link', () => {
    const { getByText } = render(<MessagesSidebarGroupView {...defaultProps} />)
    expect(getByText('All Messages')).toBeDefined()
  })

  it('renders conversation titles', () => {
    const conversations = [makeConversation('c1', 'Alice'), makeConversation('c2', 'Bob')]
    const { getByText } = render(
      <MessagesSidebarGroupView
        {...defaultProps}
        conversations={conversations}
      />,
    )
    expect(getByText('Alice')).toBeDefined()
    expect(getByText('Bob')).toBeDefined()
  })
})
