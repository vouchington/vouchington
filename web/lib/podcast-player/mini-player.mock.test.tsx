import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PodcastEpisode } from './types'
import { PodcastMiniPlayer } from './mini-player'

const { mockFetchPodcastEpisodeChapters } = vi.hoisted(() => ({
  mockFetchPodcastEpisodeChapters: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/podcast-episode-chapters'), () => ({
  fetchPodcastEpisodeChapters: mockFetchPodcastEpisodeChapters,
}))

const episode: PodcastEpisode = {
  episodeId: 'ep-link-test',
  enclosureUrl: 'https://example.com/audio/ep.mp3',
  title: 'Test Episode',
  showId: 'show-1',
  showTitle: 'Test Show',
  coverArtUrl: '/sideload/test-cover.jpg',
  showHref: '/source/test-show/latest',
}

function renderPlayer(ep: PodcastEpisode = episode) {
  const audioRef = { current: null as HTMLAudioElement | null }
  const result = render(
    <PodcastMiniPlayer
      episode={ep}
      onClose={() => {}}
      audioRef={audioRef}
    />,
  )
  return { ...result, audioRef }
}

describe('PodcastMiniPlayer', () => {
  beforeEach(() => {
    mockFetchPodcastEpisodeChapters.mockReset()
    mockFetchPodcastEpisodeChapters.mockResolvedValue({ chapters: [] })
  })

  it('renders visible chapter jump buttons after fetch', async () => {
    mockFetchPodcastEpisodeChapters.mockResolvedValueOnce({
      chapters: [
        {
          start_seconds: 42,
          end_seconds: 120,
          title: 'Introduction',
          url: 'https://example.com/chapters/intro',
          image_url: 'https://example.com/chapters/intro.jpg',
          is_visible: true,
        },
        {
          start_seconds: 120,
          end_seconds: 180,
          title: 'Hidden chapter',
          url: 'https://example.com/chapters/hidden',
          image_url: 'https://example.com/chapters/hidden.jpg',
          is_visible: false,
        },
      ],
    })

    renderPlayer()

    expect(screen.queryByText('Introduction')).toBeNull()
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: 'Jump to Introduction at 0:42' }),
      ).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: 'Jump to Hidden chapter at 2:00' })).toBeNull()
  })

  it('links cover art and title to the episode source modal', () => {
    const { container } = renderPlayer()
    const expectedHref = `/podcast-episodes?rss_item=${encodeURIComponent(episode.episodeId)}`

    expect(
      container.querySelector('[data-pw="podcast-mini-player-cover"]')?.getAttribute('href'),
    ).toBe(expectedHref)
    expect(
      container.querySelector('[data-pw="podcast-mini-player-title"]')?.getAttribute('href'),
    ).toBe(expectedHref)
  })

  it('links show title to the show page when showHref is set', () => {
    const { container } = renderPlayer()

    expect(
      container.querySelector('[data-pw="podcast-mini-player-show"]')?.getAttribute('href'),
    ).toBe('/source/test-show/latest')
  })

  it('omits cover link and renders plain show text when optional URLs are absent', () => {
    const { container } = renderPlayer({
      ...episode,
      coverArtUrl: undefined,
      showHref: undefined,
    })

    expect(container.querySelector('[data-pw="podcast-mini-player-cover"]')).toBeNull()
    expect(container.querySelector('[data-pw="podcast-mini-player-show"]')).toBeNull()
    expect(
      container.querySelector('[data-pw="podcast-mini-player"] p.text-muted-foreground')
        ?.textContent,
    ).toBe('Test Show')
  })

  it('seeks the shared audio element when a chapter button is clicked', async () => {
    mockFetchPodcastEpisodeChapters.mockResolvedValueOnce({
      chapters: [
        {
          start_seconds: 133,
          end_seconds: 180,
          title: 'Chapter 1',
          url: 'https://example.com/chapters/1',
          image_url: 'https://example.com/chapters/1.jpg',
          is_visible: true,
        },
      ],
    })

    const { audioRef } = renderPlayer()
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: 'Jump to Chapter 1 at 2:13' }),
      ).toBeInTheDocument()
    })

    const audio = document.querySelector('audio') as HTMLAudioElement
    Object.defineProperty(audio, 'currentTime', {
      configurable: true,
      writable: true,
      value: 0,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Jump to Chapter 1 at 2:13' }))

    expect(audioRef.current).toBe(audio)
    expect(audio.currentTime).toBe(133)
  })

  it('hides chapters UI when fetch fails', async () => {
    mockFetchPodcastEpisodeChapters.mockRejectedValueOnce(new Error('network error'))

    renderPlayer()
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Jump to/ })).toBeNull()
    })
  })

  it('sets playback speed with explicit buttons', async () => {
    const { container } = renderPlayer()
    const audio = container.querySelector('audio') as HTMLAudioElement
    Object.defineProperty(audio, 'playbackRate', {
      configurable: true,
      writable: true,
      value: 1,
    })

    expect(screen.getByRole('button', { name: 'Set playback speed to 1.5x' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Set playback speed to 1.5x' }))

    expect(audio.playbackRate).toBe(1.5)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Set playback speed to 1.5x' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
    })
  })
})
