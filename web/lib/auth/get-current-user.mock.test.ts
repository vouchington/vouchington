import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cookies } from 'next/headers'
import { decodeSessionJwt } from '@ts-shared/session-jwt'
import { ApiError } from '@/lib/api/error'
import { getAuthMe } from '@/lib/api/server'
import { getCurrentUser } from './get-current-user'

vi.mock(
  import('react'),
  () =>
    ({
      cache: ((fn: (...args: never[]) => unknown) => fn) as unknown as typeof import('react').cache,
    }) as unknown as typeof import('react'),
)

vi.mock(import('next/headers'), () => ({
  cookies: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@ts-shared/session-jwt'), () => ({
  decodeSessionJwt: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/server'), () => ({
  getAuthMe: vi.fn<VitestLooseMock>(),
}))

const mockCookies = vi.mocked(cookies)
const mockDecodeSessionJwt = vi.mocked(decodeSessionJwt)
const mockGetAuthMe = vi.mocked(getAuthMe)

describe('getCurrentUser', () => {
  beforeEach(() => {
    mockCookies.mockResolvedValue({
      get: (key: string) => {
        if (key === 'dt') return { value: 'dt-val' }
        if (key === 'st') return { value: 'st-val' }
        return undefined
      },
    } as any)

    mockDecodeSessionJwt.mockReturnValue({ uid: '123' } as any)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns null when getAuthMe throws an ApiError with status 401', async () => {
    const error = new ApiError('Unauthorized', 401)
    mockGetAuthMe.mockRejectedValue(error)

    const result = await getCurrentUser()

    expect(result).toBeNull()
    expect(mockGetAuthMe).toHaveBeenCalledTimes(1)
  })

  it('re-throws when getAuthMe throws a 429 ApiError', async () => {
    const error = new ApiError('Rate limit exceeded', 429)
    mockGetAuthMe.mockRejectedValue(error)

    await expect(getCurrentUser()).rejects.toThrow(error)
    expect(mockGetAuthMe).toHaveBeenCalledTimes(1)
  })

  it('re-throws when getAuthMe throws a 500 ApiError', async () => {
    const error = new ApiError('Internal server error', 500)
    mockGetAuthMe.mockRejectedValue(error)

    await expect(getCurrentUser()).rejects.toThrow(error)
    expect(mockGetAuthMe).toHaveBeenCalledTimes(1)
  })

  it('re-throws when getAuthMe throws a network error', async () => {
    const error = new Error('fetch failed')
    mockGetAuthMe.mockRejectedValue(error)

    await expect(getCurrentUser()).rejects.toThrow(error)
    expect(mockGetAuthMe).toHaveBeenCalledTimes(1)
  })
})
