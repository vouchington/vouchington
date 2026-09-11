import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchPodcastEpisodeChapters } from './podcast-episode-chapters'

const { mockGet } = vi.hoisted(() => ({
  mockGet: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('./instance'),
  () =>
    ({
      clientApi: {
        get: mockGet,
      },
    }) as unknown as typeof import('./instance'),
)

describe('podcast-episode-chapters client api helper', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue({ chapters: [] })
  })

  it('calls GET /api/v1/podcast-episodes/:id/chapters', async () => {
    await fetchPodcastEpisodeChapters('episode-uuid-1')
    expect(mockGet).toHaveBeenCalledWith('/api/v1/podcast-episodes/episode-uuid-1/chapters')
  })

  it('encodes the episode id in the URL', async () => {
    await fetchPodcastEpisodeChapters('uuid/with/slashes')
    expect(mockGet).toHaveBeenCalledWith('/api/v1/podcast-episodes/uuid%2Fwith%2Fslashes/chapters')
  })

  it('returns the chapters response', async () => {
    const chapters = [
      {
        start_seconds: 12,
        end_seconds: 18,
        title: 'Intro',
        url: 'https://example.com/intro',
        image_url: 'https://example.com/intro.jpg',
        is_visible: true,
      },
    ]
    mockGet.mockResolvedValueOnce({ chapters })
    await expect(fetchPodcastEpisodeChapters('episode-uuid-2')).resolves.toEqual({ chapters })
  })
})
