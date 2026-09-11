import type { ReactElement, ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

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

vi.mock(import('@/lib/asides/activity-signals'), () => ({
  hasCreatedPost: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/components/asides/dismissible-aside'), () => ({
  DismissibleAside: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

import { getCurrentUser } from '@/lib/auth/get-current-user'
import { hasCreatedPost } from '@/lib/asides/activity-signals'
import { CreateFirstPostAside } from './create-first-post-aside'

const mockGetCurrentUser = vi.mocked(getCurrentUser)
const mockHasCreatedPost = vi.mocked(hasCreatedPost)

describe('CreateFirstPostAside', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when not authenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null)
    const result = await CreateFirstPostAside()
    const { container } = render(result as ReactElement)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when user has already created a post', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1', roles: [], username: 'alice' })
    mockHasCreatedPost.mockResolvedValue(true)
    const result = await CreateFirstPostAside()
    const { container } = render(result as ReactElement)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders first post nudge when user has not yet posted', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1', roles: [], username: 'alice' })
    mockHasCreatedPost.mockResolvedValue(false)
    const result = await CreateFirstPostAside()
    render(result as ReactElement)
    expect(screen.getByText('Share your first review')).toBeDefined()
    expect(screen.getByRole('link', { name: 'Write a review' })).toBeDefined()
  })

  it('links to /reviews/create', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1', roles: [], username: 'alice' })
    mockHasCreatedPost.mockResolvedValue(false)
    const result = await CreateFirstPostAside()
    render(result as ReactElement)
    expect(screen.getByRole('link', { name: 'Write a review' }).getAttribute('href')).toBe(
      '/reviews/create',
    )
  })
})
