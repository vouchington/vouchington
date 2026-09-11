import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reportPlaybackPosition, fetchPlaybackPosition } from './podcast-playback'

const { mockPut, mockGet } = vi.hoisted(() => ({
  mockPut: vi.fn<VitestLooseMock>(),
  mockGet: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('./instance'),
  () =>
    ({
      clientApi: {
        put: mockPut,
        get: mockGet,
      },
    }) as unknown as typeof import('./instance'),
)

describe('podcast-playback client api helpers', () => {
  beforeEach(() => {
    mockPut.mockReset()
    mockGet.mockReset()
    mockPut.mockResolvedValue(undefined)
    mockGet.mockResolvedValue({ playback_position: null })
  })

  describe('reportPlaybackPosition', () => {
    it('calls PUT /api/v1/podcast-episodes/:id/playback-position with body', async () => {
      await reportPlaybackPosition('episode-uuid-1', { position_seconds: 42.5 })
      expect(mockPut).toHaveBeenCalledWith(
        '/api/v1/podcast-episodes/episode-uuid-1/playback-position',
        { position_seconds: 42.5 },
      )
    })

    it('encodes the episode id in the URL', async () => {
      await reportPlaybackPosition('uuid/with/slashes', { position_seconds: 10 })
      expect(mockPut).toHaveBeenCalledWith(
        '/api/v1/podcast-episodes/uuid%2Fwith%2Fslashes/playback-position',
        { position_seconds: 10 },
      )
    })

    it('passes completed flag when provided', async () => {
      await reportPlaybackPosition('ep-1', { position_seconds: 3600, completed: true })
      expect(mockPut).toHaveBeenCalledWith('/api/v1/podcast-episodes/ep-1/playback-position', {
        position_seconds: 3600,
        completed: true,
      })
    })
  })

  describe('fetchPlaybackPosition', () => {
    it('calls GET /api/v1/podcast-episodes/:id/playback-position', async () => {
      await fetchPlaybackPosition('episode-uuid-2')
      expect(mockGet).toHaveBeenCalledWith(
        '/api/v1/podcast-episodes/episode-uuid-2/playback-position',
      )
    })

    it('returns null when playback_position is null', async () => {
      mockGet.mockResolvedValue({ playback_position: null })
      const result = await fetchPlaybackPosition('ep-1')
      expect(result).toBeNull()
    })

    it('returns the position object when present', async () => {
      const pos = { position_seconds: 99.9, completed_at: null }
      mockGet.mockResolvedValue({ playback_position: pos })
      const result = await fetchPlaybackPosition('ep-2')
      expect(result).toEqual(pos)
    })

    it('encodes the episode id in the URL', async () => {
      await fetchPlaybackPosition('uuid/with/slashes')
      expect(mockGet).toHaveBeenCalledWith(
        '/api/v1/podcast-episodes/uuid%2Fwith%2Fslashes/playback-position',
      )
    })
  })
})
