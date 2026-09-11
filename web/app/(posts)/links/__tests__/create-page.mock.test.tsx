import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetCurrentUser, mockRedirect, mockHeaders } = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn<VitestLooseMock>().mockResolvedValue(null),
  mockRedirect: vi.fn<VitestLooseMock>(() => {
    throw new Error('redirect')
  }),
  mockHeaders: vi.fn<VitestLooseMock>().mockResolvedValue({ get: () => null }),
}))

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: mockGetCurrentUser,
}))

vi.mock(import('next/headers'), () => ({
  headers: mockHeaders,
}))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      redirect: mockRedirect,
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/components/page-with-aside'), () => ({
  PageWithAside: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock(
  import('@/components/asides/posts-discovery-aside'),
  () =>
    ({
      PostsDiscoveryAside: () => null,
    }) as unknown as typeof import('@/components/asides/posts-discovery-aside'),
)

vi.mock(import('@/components/posts/submit-link-form'), () => ({
  SubmitLinkForm: () => <div data-testid='submit-link-form' />,
}))

import CreateLinkPage from '../create/page'

describe('CreateLinkPage', () => {
  beforeEach(() => {
    mockGetCurrentUser.mockReset()
    mockGetCurrentUser.mockResolvedValue(null)
    mockRedirect.mockReset()
    mockRedirect.mockImplementation(() => {
      throw new Error('redirect')
    })
  })

  it('redirects to /login when unauthenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null)
    await expect(CreateLinkPage()).rejects.toThrow('redirect')
    expect(mockRedirect).toHaveBeenCalledWith('/login')
  })

  it('renders the submit link form for authenticated user', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1', username: 'tester' })
    const ui = await CreateLinkPage()
    render(ui)
    expect(screen.getByTestId('submit-link-form')).toBeDefined()
    expect(screen.getByText('Submit a Link')).toBeDefined()
  })
})
