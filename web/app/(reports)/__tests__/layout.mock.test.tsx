import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetCurrentUser, mockRedirect } = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn<VitestLooseMock>(),
  mockRedirect: vi.fn<VitestLooseMock>(() => {
    throw new Error('NEXT_REDIRECT')
  }),
}))

vi.mock(import('@/lib/auth/get-current-user'), () => ({ getCurrentUser: mockGetCurrentUser }))
vi.mock(
  import('next/navigation'),
  () => ({ redirect: mockRedirect }) as unknown as typeof import('next/navigation'),
)

import ReportsLayout from '../layout'

describe('reports layout (signed-in only)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders children for any signed-in user', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1', roles: [] })

    render(await ReportsLayout({ children: <span data-testid='child' /> }))

    expect(mockGetCurrentUser).toHaveBeenCalled()
    expect(mockRedirect).not.toHaveBeenCalled()
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  it('redirects signed-out visitors to /login', async () => {
    mockGetCurrentUser.mockResolvedValue(null)

    await expect(ReportsLayout({ children: <span /> })).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/login')
  })
})
