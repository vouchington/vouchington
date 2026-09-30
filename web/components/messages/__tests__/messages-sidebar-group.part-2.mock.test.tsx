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

const makeConversation = (id: string, title = 'Conversation') => ({
  id,
  channel_type: 'direct_message' as const,
  title,
  created_at: '',
  updated_at: '',
})

import '@/test-helpers/components/messages/messages-sidebar-group.mock-support'
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
