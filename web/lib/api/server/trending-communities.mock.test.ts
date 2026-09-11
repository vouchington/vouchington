import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeCommunitiesSearchResponse } from '@/test-helpers/api-responses'

const { mockGet } = vi.hoisted(() => ({
  mockGet: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('./instance'),
  () =>
    ({
      serverApi: {
        get: mockGet,
      },
    }) as unknown as typeof import('./instance'),
)

vi.mock<typeof import('react')>(import('react'), async importOriginal => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    cache: ((fn: (...args: never[]) => unknown) => fn) as unknown as typeof actual.cache,
  }
})

import { getTrendingCommunities } from './trending-communities'

describe('getTrendingCommunities', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue(makeCommunitiesSearchResponse())
  })

  it('calls the correct endpoint with no options', async () => {
    await getTrendingCommunities()

    expect(mockGet).toHaveBeenCalledWith('/api/v1/communities', {})
  })

  it('forwards searchParams to the endpoint', async () => {
    await getTrendingCommunities({ searchParams: { sort: 'members', limit: 5 } })

    expect(mockGet).toHaveBeenCalledWith('/api/v1/communities', {
      searchParams: { sort: 'members', limit: 5 },
    })
  })
})
