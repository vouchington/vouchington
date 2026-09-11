import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeTopicsSearchResponse } from '@/test-helpers/api-responses'

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

import { getTrendingReferralPrograms } from './trending-referral-programs'

describe('getTrendingReferralPrograms', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue(makeTopicsSearchResponse())
  })

  it('calls the correct endpoint with default referral_program filter', async () => {
    await getTrendingReferralPrograms()

    expect(mockGet).toHaveBeenCalledWith('/api/v1/topics', {
      searchParams: { topic_types: 'referral_program', sort: 'best', limit: 5 },
    })
  })

  it('merges caller searchParams while preserving defaults', async () => {
    await getTrendingReferralPrograms({ searchParams: { limit: 3 } })

    expect(mockGet).toHaveBeenCalledWith('/api/v1/topics', {
      searchParams: { topic_types: 'referral_program', sort: 'best', limit: 3 },
    })
  })
})
