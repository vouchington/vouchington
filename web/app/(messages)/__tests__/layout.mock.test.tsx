import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const { mockGetCurrentUser, mockRedirect } = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn<VitestLooseMock>(),
  mockRedirect: vi.fn<VitestLooseMock>(() => {
    throw new Error('REDIRECT')
  }),
}))

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: mockGetCurrentUser,
}))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      redirect: mockRedirect,
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(
  import('@/lib/seo/metadata'),
  () =>
    ({
      createNoIndexMetadata: (t: string) => ({ title: t }),
    }) as unknown as typeof import('@/lib/seo/metadata'),
)

import MessagesLayout from '../layout'

describe('MessagesLayout', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockRedirect.mockImplementation(() => {
      throw new Error('REDIRECT')
    })
  })

  it('renders children when user is logged in', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({ id: 'user-1' })
    const result = await MessagesLayout({ children: <div>content</div> })
    render(result as React.ReactElement)
    expect(screen.getByText('content')).toBeDefined()
  })

  it('redirects to /login when user is not logged in', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(null)
    await expect(MessagesLayout({ children: <div>content</div> })).rejects.toThrow('REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/login')
  })
})
