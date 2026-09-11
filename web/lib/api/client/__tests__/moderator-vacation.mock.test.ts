import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: {
        get: vi.fn<VitestLooseMock>(),
        put: vi.fn<VitestLooseMock>(),
        patch: vi.fn<VitestLooseMock>(),
        delete: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('../instance'),
)

import { clientApi } from '../instance'
import {
  fetchMyModeratorVacation,
  setMyModeratorVacation,
  clearMyModeratorVacation,
  setSuppressCommunityDigestsWhileOnVacation,
} from '../moderator-vacation'

const mockGet = vi.mocked(clientApi.get)
const mockPut = vi.mocked(clientApi.put)
const mockDelete = vi.mocked(clientApi.delete)
const mockPatch = vi.mocked(clientApi.patch)

describe('moderator-vacation client', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('fetches the moderator vacation for a community', async () => {
    const response = { moderator_vacation: null }
    mockGet.mockResolvedValueOnce(response)

    const result = await fetchMyModeratorVacation('my-community')

    expect(result).toBe(response)
    expect(mockGet).toHaveBeenCalledWith(
      `/api/v1/communities/${encodeURIComponent('my-community')}/moderator-vacation`,
    )
  })

  it('sets moderator vacation with an endsAt date', async () => {
    const response = {
      moderator_vacation: {
        ends_at: '2026-06-16T00:00:00.000Z',
        starts_at: '2026-06-09T00:00:00.000Z',
      },
    }
    mockPut.mockResolvedValueOnce(response)

    const result = await setMyModeratorVacation('my-community', {
      endsAt: '2026-06-16T00:00:00.000Z',
    })

    expect(result).toBe(response)
    expect(mockPut).toHaveBeenCalledWith(
      `/api/v1/communities/${encodeURIComponent('my-community')}/moderator-vacation`,
      { ends_at: '2026-06-16T00:00:00.000Z' },
    )
  })

  it('sets moderator vacation with no options (indefinite, ends_at null)', async () => {
    const response = {
      moderator_vacation: { ends_at: null, starts_at: '2026-06-09T00:00:00.000Z' },
    }
    mockPut.mockResolvedValueOnce(response)

    await setMyModeratorVacation('my-community')

    expect(mockPut).toHaveBeenCalledWith(
      `/api/v1/communities/${encodeURIComponent('my-community')}/moderator-vacation`,
      { ends_at: null },
    )
  })

  it('sets moderator vacation with explicit null endsAt', async () => {
    mockPut.mockResolvedValueOnce({ moderator_vacation: null })

    await setMyModeratorVacation('my-community', { endsAt: null })

    expect(mockPut).toHaveBeenCalledWith(
      `/api/v1/communities/${encodeURIComponent('my-community')}/moderator-vacation`,
      { ends_at: null },
    )
  })

  it('clears the moderator vacation for a community', async () => {
    mockDelete.mockResolvedValueOnce(undefined)

    await clearMyModeratorVacation('my-community')

    expect(mockDelete).toHaveBeenCalledWith(
      `/api/v1/communities/${encodeURIComponent('my-community')}/moderator-vacation`,
    )
  })

  it('encodes special characters in the community slug', async () => {
    mockGet.mockResolvedValueOnce({ moderator_vacation: null })

    await fetchMyModeratorVacation('my community/slug')

    expect(mockGet).toHaveBeenCalledWith(
      `/api/v1/communities/${encodeURIComponent('my community/slug')}/moderator-vacation`,
    )
  })

  it('updates digest suppression with an encoded community slug', async () => {
    const response = { suppress_community_digests_while_on_vacation: true }
    mockPatch.mockResolvedValueOnce(response)

    await expect(
      setSuppressCommunityDigestsWhileOnVacation('my community/slug', true),
    ).resolves.toBe(response)
    expect(mockPatch).toHaveBeenCalledWith(
      `/api/v1/communities/${encodeURIComponent('my community/slug')}/moderator-vacation`,
      { suppress_community_digests_while_on_vacation: true },
    )
  })
})
