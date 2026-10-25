import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: {
        get: vi.fn<VitestLooseMock>(),
        delete: vi.fn<VitestLooseMock>(),
        post: vi.fn<VitestLooseMock>(),
        put: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('../instance'),
)

import { clientApi } from '../instance'
import { ApiError } from '../../error'
import {
  createUserDataRequest,
  deleteUser,
  fetchFollowerUsers,
  getUserDataRequest,
  searchUsers,
  suspendUser,
  unsuspendUser,
} from '../users'

const mockGet = vi.mocked(clientApi.get)
const mockDelete = vi.mocked(clientApi.delete)
const mockPost = vi.mocked(clientApi.post)
const mockPut = vi.mocked(clientApi.put)

describe('users client api helpers', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('searches users with query and limit', async () => {
    const response = { results: [], page_info: { has_next_page: false } }
    mockGet.mockResolvedValueOnce(response)

    const result = await searchUsers({ q: 'ada', limit: 25 })

    expect(mockGet).toHaveBeenCalledWith('/api/v1/users', {
      searchParams: { q: 'ada', after: undefined, limit: 25 },
      signal: undefined,
    })
    expect(result).toBe(response)
  })

  it('forwards the cursor when continuing a user search', async () => {
    const response = { results: [], page_info: { has_next_page: false } }
    mockGet.mockResolvedValueOnce(response)

    await searchUsers({ q: 'ada', after: 'opaque-cursor', limit: 25 })

    expect(mockGet).toHaveBeenCalledWith('/api/v1/users', {
      searchParams: { q: 'ada', after: 'opaque-cursor', limit: 25 },
      signal: undefined,
    })
  })

  it('forwards the cursor when continuing a follower search', async () => {
    const response = { results: [], page_info: { has_next_page: false } }
    mockGet.mockResolvedValueOnce(response)

    const result = await fetchFollowerUsers('user-1', {
      after: 'opaque-cursor',
      q: 'ada',
      limit: 25,
    })

    expect(mockGet).toHaveBeenCalledWith('/api/v1/users/user-1/users/followers', {
      searchParams: { after: 'opaque-cursor', q: 'ada', limit: 25 },
      signal: undefined,
    })
    expect(result).toBe(response)
  })

  it('suspends a user through the suspension endpoint', async () => {
    const response = { user: { id: 'user-1' } }
    mockPut.mockResolvedValueOnce(response)

    const result = await suspendUser('user-1', { reason: 'moderation' })

    expect(mockPut).toHaveBeenCalledWith('/api/v1/users/user-1/suspension', {
      reason: 'moderation',
    })
    expect(result).toBe(response)
  })

  it('unsuspends a user through the suspension endpoint', async () => {
    const response = { user: { id: 'user-1' } }
    mockDelete.mockResolvedValueOnce(response)

    const result = await unsuspendUser('user-1')

    expect(mockDelete).toHaveBeenCalledWith('/api/v1/users/user-1/suspension')
    expect(result).toBe(response)
  })

  it('deletes a user through the user endpoint', async () => {
    const response = { logout: true }
    mockDelete.mockResolvedValueOnce(response)

    const result = await deleteUser('user-1')

    expect(mockDelete).toHaveBeenCalledWith('/api/v1/users/user-1')
    expect(result).toBe(response)
  })

  it('throws an ApiError with status when loading a data request returns non-JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<VitestLooseMock>().mockResolvedValue(
        new Response('upstream failure', {
          status: 502,
          headers: { 'Content-Type': 'text/plain' },
        }),
      ),
    )

    await expect(getUserDataRequest('user-1')).rejects.toMatchObject({
      name: 'ApiError',
      status: 502,
      data: 'upstream failure',
    } satisfies Partial<ApiError>)
  })

  it('creates a data request through the mutation client', async () => {
    const response = { id: 'request-1', status: 'pending' as const }
    mockPost.mockResolvedValueOnce(response)

    await expect(createUserDataRequest('user-1')).resolves.toBe(response)
    expect(mockPost).toHaveBeenCalledWith('/api/v1/users/user-1/data-request')
  })

  it('throws an ApiError when loading a data request returns malformed success JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<VitestLooseMock>().mockResolvedValue(
        new Response('not json', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    await expect(getUserDataRequest('user-1')).rejects.toMatchObject({
      name: 'ApiError',
      status: 200,
      message: 'Invalid export status response',
    } satisfies Partial<ApiError>)
  })
})
