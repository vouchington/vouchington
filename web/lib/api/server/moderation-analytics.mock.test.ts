import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getAdminModerationAnalytics,
  getCommunityModerationAnalytics,
  getCommunityModerationAnalyticsOrNull,
  getCommunityModerationTransparency,
  getCommunityModerationTransparencyOrNull,
  getModerationTransparency,
  getModerationTransparencyOrNull,
} from './moderation-analytics'
import { ApiError } from '../error'
import type { ModerationTransparency } from '@/types/moderation-analytics'

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

describe('moderation analytics server api helpers', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue({})
  })

  it('calls the admin moderation analytics endpoint with range and headers', async () => {
    const headers = { cookie: 'session=1' }
    await getAdminModerationAnalytics({ range: '90d', headers })

    expect(mockGet).toHaveBeenCalledWith('/api/v1/admin/moderation-analytics', {
      searchParams: { range: '90d' },
      headers,
    })
  })

  it('calls the community moderation analytics endpoint with range and headers', async () => {
    const headers = { cookie: 'session=1' }
    await getCommunityModerationAnalytics('credit-cards', { range: '7d', headers })

    expect(mockGet).toHaveBeenCalledWith('/api/v1/communities/credit-cards/moderation-analytics', {
      searchParams: { range: '7d' },
      headers,
    })
  })

  it('calls the paid moderation transparency endpoint with range and headers', async () => {
    const headers = { cookie: 'session=1' }
    const response: ModerationTransparency = {
      range: '30d',
      buckets: [
        {
          date: '2026-01-01',
          metric: 'automated_moderation',
          category: 'community_ai',
          count: 25,
        },
      ],
    }
    mockGet.mockResolvedValueOnce(response)

    await expect(getModerationTransparency({ range: '30d', headers })).resolves.toEqual(response)

    expect(mockGet).toHaveBeenCalledWith('/api/v1/moderation-transparency', {
      searchParams: { range: '30d' },
      headers,
    })
  })

  it('calls the community AI transparency endpoint with range and headers', async () => {
    const headers = { cookie: 'session=1' }
    await getCommunityModerationTransparency('credit-cards', { range: '30d', headers })

    expect(mockGet).toHaveBeenCalledWith(
      '/api/v1/communities/credit-cards/moderation-transparency',
      {
        searchParams: { range: '30d' },
        headers,
      },
    )
  })

  it('does not return stale community AI transparency after an entitlement downgrade', async () => {
    mockGet.mockRejectedValue(new ApiError('Forbidden', 403))

    await expect(
      getCommunityModerationTransparencyOrNull('credit-cards', { range: '30d' }),
    ).resolves.toBeNull()
  })

  it('returns null for global paid transparency after an entitlement downgrade', async () => {
    mockGet.mockRejectedValue(new ApiError('Forbidden', 403))

    await expect(getModerationTransparencyOrNull({ range: '30d' })).resolves.toBeNull()
  })

  it('returns null for missing community moderation analytics', async () => {
    mockGet.mockRejectedValue(new ApiError('Not found', 404))

    await expect(
      getCommunityModerationAnalyticsOrNull('private-community', { range: '30d' }),
    ).resolves.toBeNull()
  })

  it('returns null for forbidden community moderation analytics', async () => {
    mockGet.mockRejectedValue(new ApiError('Forbidden', 403))

    await expect(
      getCommunityModerationAnalyticsOrNull('forbidden-community', { range: '30d' }),
    ).resolves.toBeNull()
  })
})
