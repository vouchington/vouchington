import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPost, mockGet } = vi.hoisted(() => ({
  mockPost: vi.fn<VitestLooseMock>(),
  mockGet: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('./instance'),
  () =>
    ({
      clientApi: {
        post: mockPost,
        get: mockGet,
      },
    }) as unknown as typeof import('./instance'),
)

import { getExposureState, recordMediaReveal } from './moderation-exposure'

const exposure = { count: 0, threshold: 10, in_cooldown: false, cooldown_ends_at: null }

describe('moderation-exposure client helpers', () => {
  beforeEach(() => {
    mockPost.mockResolvedValue({ exposure })
    mockGet.mockResolvedValue({ exposure })
  })

  it('recordMediaReveal calls POST /api/v1/moderation/reveals', async () => {
    await recordMediaReveal({ surface: 'mod_queue', postId: 'post-1' })
    expect(mockPost).toHaveBeenCalledWith('/api/v1/moderation/reveals', {
      surface: 'mod_queue',
      postId: 'post-1',
    })
  })

  it('getExposureState calls GET /api/v1/moderation/exposure', async () => {
    const result = await getExposureState()
    expect(mockGet).toHaveBeenCalledWith('/api/v1/moderation/exposure')
    expect(result).toEqual({ exposure })
  })
})
