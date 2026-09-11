import type { ReactElement, ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { User } from '@/types/user'

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

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/components/asides/dismissible-aside'), () => ({
  DismissibleAside: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

import { getCurrentUser } from '@/lib/auth/get-current-user'
import { ConnectSocialAside } from './connect-social-aside'

const mockGetCurrentUser = vi.mocked(getCurrentUser)

const baseUser: User = {
  id: 'user-1',
  username: 'testuser',
  roles: [],
}

describe('ConnectSocialAside', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when not authenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null)
    const result = await ConnectSocialAside()
    const { container } = render(result as ReactElement)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when 3 or more accounts are connected', async () => {
    mockGetCurrentUser.mockResolvedValue({
      ...baseUser,
      github_account: { id: 'gh-1', name: 'user', email_address: null },
      google_account: { id: 'g-1', name: 'user', email_address: null },
      x_account: { id: 'x-1', name: 'user', email_address: null },
    } as User)
    const result = await ConnectSocialAside()
    const { container } = render(result as ReactElement)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders when fewer than 3 accounts are connected', async () => {
    mockGetCurrentUser.mockResolvedValue({
      ...baseUser,
      github_account: { id: 'gh-1', name: 'user', email_address: null },
    } as User)
    const result = await ConnectSocialAside()
    render(result as ReactElement)
    expect(screen.getByText('Connect your accounts')).toBeDefined()
  })

  it('renders when no accounts are connected', async () => {
    mockGetCurrentUser.mockResolvedValue(baseUser)
    const result = await ConnectSocialAside()
    render(result as ReactElement)
    expect(screen.getByText('Connect your accounts')).toBeDefined()
    expect(screen.getByRole('link', { name: 'Connect accounts' })).toBeDefined()
  })

  it('links to /my/identity', async () => {
    mockGetCurrentUser.mockResolvedValue(baseUser)
    const result = await ConnectSocialAside()
    render(result as ReactElement)
    expect(screen.getByRole('link', { name: 'Connect accounts' }).getAttribute('href')).toBe(
      '/my/identity',
    )
  })
})
