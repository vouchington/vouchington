import { afterEach, describe, expect, it, vi } from 'vitest'
import { redirect } from 'next/navigation'
import { getCurrentUser } from './get-current-user'
import { requireCurrentUser } from './require-current-user'

vi.mock(
  import('next/navigation'),
  () =>
    ({
      redirect: vi.fn<VitestLooseMock>(() => {
        throw new Error('NEXT_REDIRECT')
      }),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('./get-current-user'), () => ({
  getCurrentUser: vi.fn<VitestLooseMock>(),
}))

const mockRedirect = vi.mocked(redirect)
const mockGetCurrentUser = vi.mocked(getCurrentUser)

describe('requireCurrentUser', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns the current user when signed in', async () => {
    const user = { id: 'u1', roles: [] } as any
    mockGetCurrentUser.mockResolvedValue(user)

    await expect(requireCurrentUser()).resolves.toBe(user)
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('redirects to /login when the user is signed out', async () => {
    mockGetCurrentUser.mockResolvedValue(null)

    await expect(requireCurrentUser()).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/login')
  })
})
