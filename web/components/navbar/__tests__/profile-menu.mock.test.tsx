import type { ReactNode } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { configure, render, screen } from '@testing-library/react'
import { ProfileMenu } from '../profile-menu'

// Configure RTL to use data-pw as the test id (matching the Playwright convention in this codebase)
configure({ testIdAttribute: 'data-pw' })

vi.mock(
  import('@/lib/auth/context'),
  () =>
    ({
      useAuth: vi.fn<
        () => {
          currentUser: {
            id: string
            username: string
            profile_image_id: null
            email_address: string
          } | null
          isAuthenticated: boolean
        }
      >(() => ({
        currentUser: {
          id: '00000000-0000-0000-0000-000000000000',
          username: 'testuser',
          profile_image_id: null,
          email_address: 'tests+profile-menu@voucha.ai',
        },
        isAuthenticated: true,
      })),
    }) as unknown as typeof import('@/lib/auth/context'),
)

vi.mock(
  import('@/components/ui/dropdown-menu'),
  () =>
    ({
      DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      DropdownMenuTrigger: ({ children }: { children: ReactNode; asChild?: boolean }) => (
        <div>{children}</div>
      ),
      DropdownMenuContent: ({ children }: { children: ReactNode }) => (
        <div role='menu'>{children}</div>
      ),
      DropdownMenuItem: ({
        children,
        onClick,
        'data-pw': dataPw,
        className,
      }: {
        children: ReactNode
        onClick?: () => void
        asChild?: boolean
        'data-pw'?: string
        className?: string
      }) => (
        <button
          type='button'
          onClick={onClick}
          data-pw={dataPw}
          className={className}
        >
          {children}
        </button>
      ),
      DropdownMenuSeparator: () => <hr />,
    }) as unknown as typeof import('@/components/ui/dropdown-menu'),
)

describe('ProfileMenu', () => {
  it('renders the current user header link with avatar and username', () => {
    render(
      <ProfileMenu
        user={{
          avatarLabel: 'testuser',
          displayLabel: 'testuser',
          href: '/user/testuser',
          profileImageId: null,
        }}
        onLogout={vi.fn<() => void>()}
      />,
    )

    const headerLink = screen.getByTestId('profile-menu-current-user')
    expect(headerLink).toBeInTheDocument()
    expect(headerLink).toHaveAttribute('href', '/user/testuser')

    // Avatar should be present inside the header link
    expect(screen.getByTestId('user-avatar')).toBeInTheDocument()

    // Username text should be visible
    expect(screen.getByText('testuser')).toBeInTheDocument()
  })
})
