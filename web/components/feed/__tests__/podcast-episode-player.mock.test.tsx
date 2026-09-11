import { fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PodcastEpisodePlayer } from '../podcast-episode-player'
import type { PodcastEpisode } from '@/lib/podcast-player/types'

const mockPlayEpisode = vi.fn<() => void>()

vi.mock(
  import('@/lib/podcast-player/use-podcast-player'),
  () =>
    ({
      usePodcastPlayer: () => ({
        currentEpisode: null,
        playEpisode: mockPlayEpisode,
        clearEpisode: vi.fn<() => void>(),
      }),
    }) as unknown as typeof import('@/lib/podcast-player/use-podcast-player'),
)

const episode: PodcastEpisode = {
  episodeId: 'ep-1',
  enclosureUrl: 'https://example.com/ep1.mp3',
  enclosureType: 'audio/mpeg',
  durationSeconds: 1800,
  title: 'Episode One',
  showId: 'show-1',
  showTitle: 'Test Show',
  coverArtUrl: undefined,
  showHref: '/source/test-show/latest',
}

describe('PodcastEpisodePlayer', () => {
  beforeEach(() => {
    mockPlayEpisode.mockReset()
  })

  it('calls playEpisode with the episode when the play button is clicked', () => {
    const { getByRole } = render(<PodcastEpisodePlayer episode={episode} />)
    fireEvent.click(getByRole('button', { name: /play episode one/i }))
    expect(mockPlayEpisode).toHaveBeenCalledWith(episode)
  })

  it('renders a formatted duration when durationSeconds is provided', () => {
    const { container } = render(<PodcastEpisodePlayer episode={episode} />)
    expect(container.querySelector('[data-pw="podcast-episode-duration"]')).toBeTruthy()
  })

  it('renders no duration when durationSeconds is undefined', () => {
    const noduration: PodcastEpisode = { ...episode, durationSeconds: undefined }
    const { container } = render(<PodcastEpisodePlayer episode={noduration} />)
    expect(container.querySelector('[data-pw="podcast-episode-duration"]')).toBeNull()
  })
})
