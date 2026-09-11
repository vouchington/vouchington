import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getFeatureFlags } from './feature-flags'

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

describe('feature-flags server api helpers', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue({ flags: {}, overrides: {} })
  })

  it('getFeatureFlags calls the feature-flags endpoint', async () => {
    await getFeatureFlags()
    expect(mockGet).toHaveBeenCalledWith('/api/v1/feature-flags', undefined)
  })

  it('getFeatureFlags forwards header options', async () => {
    const options = { headers: { 'x-test': '1' } }
    await getFeatureFlags(options)
    expect(mockGet).toHaveBeenCalledWith('/api/v1/feature-flags', options)
  })
})
