import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { UserProfileHeader } from '../user-profile-header'
import type { User } from '@/types/user'

const mockNav = createNavMock()
let mockCurrentUser: User | null = null

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

vi.mock(
  import('next/dynamic'),
  () =>
    ({
      default: (_loader: () => Promise<unknown>) => {
        function DynamicComponent({ onChange }: { onChange?: (isActive: boolean) => void }) {
          return (
            <div data-testid='follow-button'>
              <button
                type='button'
                onClick={() => onChange?.(true)}
              >
                Complete follow
              </button>
              <button
                type='button'
                onClick={() => onChange?.(false)}
              >
                Complete unfollow
              </button>
            </div>
          )
        }
        return DynamicComponent
      },
    }) as unknown as typeof import('next/dynamic'),
)

vi.mock(
  import('@/lib/auth/context'),
  () =>
    ({
      useAuth: () => ({ currentUser: mockCurrentUser }),
    }) as unknown as typeof import('@/lib/auth/context'),
)

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({ children, href }: { children: ReactNode; href: string }) => (
        <a href={href}>{children}</a>
      ),
    }) as unknown as typeof import('next/link'),
)

vi.mock(import('@/components/shared/user-avatar'), () => ({
  UserAvatar: () => <div />,
}))

vi.mock(import('@/components/shared/rss-feed-link'), () => ({
  RssFeedLink: () => <div />,
}))

vi.mock(import('@/components/shared/user-official-badge'), () => ({
  UserOfficialBadge: () => <div />,
}))

const user = {
  id: 'user-abc',
  username: 'alice',
  display_account: { id: 'display-1', name: 'Alice Example' },
  profile_image_id: null,
  roles: [],
} as User

describe('UserProfileHeader follow vouch refresh', () => {
  beforeEach(() => {
    mockNav.reset()
    mockCurrentUser = null
  })

  it('refreshes server-backed vouch context after a successful non-official follow', async () => {
    mockCurrentUser = { id: 'user-xyz' } as User
    render(<UserProfileHeader user={user} />)

    await screen.findByTestId('follow-button')
    fireEvent.click(screen.getByRole('button', { name: 'Complete follow' }))

    expect(mockNav.refresh).toHaveBeenCalledOnce()
  })

  it('does not refresh vouch context after a successful unfollow', async () => {
    mockCurrentUser = { id: 'user-xyz' } as User
    render(<UserProfileHeader user={user} />)

    await screen.findByTestId('follow-button')
    fireEvent.click(screen.getByRole('button', { name: 'Complete unfollow' }))

    expect(mockNav.refresh).not.toHaveBeenCalled()
  })

  it('does not refresh vouch context for an official account follow', async () => {
    mockCurrentUser = { id: 'user-xyz', roles: ['administrator'] } as User
    render(<UserProfileHeader user={user} />)

    await screen.findByTestId('follow-button')
    fireEvent.click(screen.getByRole('button', { name: 'Complete follow' }))

    expect(mockNav.refresh).not.toHaveBeenCalled()
  })
})
