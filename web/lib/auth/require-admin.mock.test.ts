import { afterEach, describe, expect, it, vi } from 'vitest'
import { redirect } from 'next/navigation'
import { getCurrentUser } from './get-current-user'
import { requireAdmin } from './require-admin'

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

describe('requireAdmin', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns the current user when they are an administrator', async () => {
    const admin = { id: 'u1', roles: ['administrator'] } as any
    mockGetCurrentUser.mockResolvedValue(admin)

    await expect(requireAdmin()).resolves.toBe(admin)
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('redirects to / when the user is signed in but lacks the administrator role', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'u2', roles: ['member'] } as any)

    await expect(requireAdmin()).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/')
  })

  it('redirects to / when the user is signed out (null)', async () => {
    mockGetCurrentUser.mockResolvedValue(null)

    await expect(requireAdmin()).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/')
  })
})
