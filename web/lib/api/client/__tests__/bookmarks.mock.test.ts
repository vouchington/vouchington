import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockClientApiGet } = vi.hoisted(() => ({
  mockClientApiGet: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('@/lib/api/client/instance'),
  () =>
    ({
      clientApi: {
        get: mockClientApiGet,
      },
    }) as unknown as typeof import('@/lib/api/client/instance'),
)

import { getEntityBookmarks } from '@/lib/api/client/bookmarks'

describe('getEntityBookmarks', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('concurrent calls with the same args return the same promise and fire only 1 fetch', async () => {
    mockClientApiGet.mockResolvedValue({ bookmarks: { follow: false } })

    const p1 = getEntityBookmarks('topic', '1')
    const p2 = getEntityBookmarks('topic', '1')

    expect(p1).toBe(p2)
    expect(mockClientApiGet).toHaveBeenCalledTimes(1)

    await p1
  })

  it('sequential calls after the promise settles fire a new fetch', async () => {
    mockClientApiGet.mockResolvedValue({ bookmarks: { follow: false } })

    await getEntityBookmarks('topic', '1')
    await getEntityBookmarks('topic', '1')

    expect(mockClientApiGet).toHaveBeenCalledTimes(2)
  })

  it('different keys fire separate fetches and return distinct promises', async () => {
    mockClientApiGet.mockResolvedValue({ bookmarks: {} })

    const p1 = getEntityBookmarks('topic', '1')
    const p2 = getEntityBookmarks('user', '1')

    expect(p1).not.toBe(p2)
    expect(mockClientApiGet).toHaveBeenCalledTimes(2)

    await Promise.all([p1, p2])
  })

  it('error propagates to all concurrent waiters and clears cache so a new call retries', async () => {
    const err = new Error('network error')
    mockClientApiGet.mockRejectedValueOnce(err)

    const p1 = getEntityBookmarks('topic', '2')
    const p1Rejection = p1.catch((error: unknown) => error)
    const p2 = getEntityBookmarks('topic', '2')
    const p2Rejection = p2.catch((error: unknown) => error)

    // Both callers see the same rejection
    await expect(p1Rejection).resolves.toBe(err)
    await expect(p2Rejection).resolves.toBe(err)
    expect(p1).toBe(p2)
    expect(mockClientApiGet).toHaveBeenCalledTimes(1)

    // After rejection the cache is cleared; a new call fires a fresh fetch
    mockClientApiGet.mockResolvedValueOnce({ bookmarks: {} })
    await getEntityBookmarks('topic', '2')
    expect(mockClientApiGet).toHaveBeenCalledTimes(2)
  })
})
