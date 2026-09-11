import { describe, expect, it, vi } from 'vitest'

const { mockGet, mockDelete, mockPost } = vi.hoisted(() => ({
  mockGet: vi.fn<VitestLooseMock>(),
  mockDelete: vi.fn<VitestLooseMock>(),
  mockPost: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('@/lib/api/client/instance'),
  () =>
    ({
      clientApi: {
        get: mockGet,
        delete: mockDelete,
        post: mockPost,
      },
    }) as unknown as typeof import('@/lib/api/client/instance'),
)

import { deleteAuthSession, getAuthSessions, revokeAuthSessions } from '@/lib/api/client/auth'

describe('auth session client helpers', () => {
  it('getAuthSessions calls the auth/sessions endpoint', async () => {
    mockGet.mockResolvedValue({ results: [] })

    await getAuthSessions()

    expect(mockGet).toHaveBeenCalledWith('/api/v1/auth/sessions')
  })

  it('deleteAuthSession calls the session delete endpoint', async () => {
    mockDelete.mockResolvedValue(undefined)

    await deleteAuthSession('session-1')

    expect(mockDelete).toHaveBeenCalledWith('/api/v1/auth/sessions/session-1')
  })

  it('revokeAuthSessions calls the revocations endpoint', async () => {
    mockPost.mockResolvedValue(undefined)

    await revokeAuthSessions()

    expect(mockPost).toHaveBeenCalledWith('/api/v1/auth/sessions/revocations')
  })
})
