import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getMock } = vi.hoisted(() => ({
  getMock: vi.fn<(path: string, options?: object) => unknown>(),
}))
vi.mock(
  import('./instance'),
  () => ({ clientApi: { get: getMock } }) as unknown as typeof import('./instance'),
)

import {
  fetchCommunityModerationTransparency,
  fetchModerationTransparency,
} from './moderation-transparency'

describe('moderation transparency client API', () => {
  beforeEach(() => getMock.mockReset())

  it('requests a global all-time continuation cursor', async () => {
    getMock.mockResolvedValueOnce({})
    await fetchModerationTransparency({ range: 'all', after: 'older cursor' })
    expect(getMock).toHaveBeenCalledWith('/api/v1/moderation-transparency', {
      searchParams: { range: 'all', after: 'older cursor' },
    })
  })

  it('encodes community slugs and omits an absent cursor', async () => {
    getMock.mockResolvedValueOnce({})
    await fetchCommunityModerationTransparency('cards & points', { range: '30d' })
    expect(getMock).toHaveBeenCalledWith(
      '/api/v1/communities/cards%20%26%20points/moderation-transparency',
      { searchParams: { range: '30d' } },
    )
  })
})
