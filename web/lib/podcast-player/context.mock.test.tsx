import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { usePodcastPlayer } from './use-podcast-player'

const { mockFetchPlaybackPosition, mockReportPlaybackPosition } = vi.hoisted(() => ({
  mockFetchPlaybackPosition: vi.fn<VitestLooseMock>(),
  mockReportPlaybackPosition: vi.fn<VitestLooseMock>(),
}))

const { mockFetchPodcastEpisodeChapters } = vi.hoisted(() => ({
  mockFetchPodcastEpisodeChapters: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/podcast-playback'), () => ({
  fetchPlaybackPosition: mockFetchPlaybackPosition,
  reportPlaybackPosition: mockReportPlaybackPosition,
}))

vi.mock(import('@/lib/api/client/podcast-episode-chapters'), () => ({
  fetchPodcastEpisodeChapters: mockFetchPodcastEpisodeChapters,
}))

import {
  AuthedWrapper,
  CaptureContext,
  makeEpisode,
} from '@/test-helpers/lib/podcast-player-authed'

describe('PodcastPlayerProvider (authenticated)', () => {
  beforeEach(() => {
    mockFetchPlaybackPosition.mockReset()
    mockReportPlaybackPosition.mockReset()
    mockFetchPodcastEpisodeChapters.mockReset()
    mockFetchPlaybackPosition.mockResolvedValue(null)
    mockReportPlaybackPosition.mockResolvedValue(undefined)
    mockFetchPodcastEpisodeChapters.mockResolvedValue({ chapters: [] })
  })

  it('calls fetchPlaybackPosition when episode changes (authenticated)', async () => {
    let context: ReturnType<typeof usePodcastPlayer> | null = null
    render(
      <AuthedWrapper>
        <CaptureContext onContext={value => (context = value)} />
      </AuthedWrapper>,
    )

    await act(async () => {
      context!.playEpisode(makeEpisode('ep-1'))
    })

    expect(mockFetchPlaybackPosition).toHaveBeenCalledWith('ep-1')
  })

  it('renders the mini-player when an episode is set', async () => {
    let context: ReturnType<typeof usePodcastPlayer> | null = null
    render(
      <AuthedWrapper>
        <CaptureContext onContext={value => (context = value)} />
      </AuthedWrapper>,
    )

    expect(document.querySelector('[data-pw="podcast-mini-player"]')).toBeNull()

    await act(async () => {
      context!.playEpisode(makeEpisode('ep-show'))
    })

    expect(document.querySelector('[data-pw="podcast-mini-player"]')).not.toBeNull()
  })

  it('hides the mini-player after clearEpisode', async () => {
    let context: ReturnType<typeof usePodcastPlayer> | null = null
    render(
      <AuthedWrapper>
        <CaptureContext onContext={value => (context = value)} />
      </AuthedWrapper>,
    )

    await act(async () => {
      context!.playEpisode(makeEpisode('ep-clear'))
    })
    expect(document.querySelector('[data-pw="podcast-mini-player"]')).not.toBeNull()

    await act(async () => {
      context!.clearEpisode()
    })
    expect(document.querySelector('[data-pw="podcast-mini-player"]')).toBeNull()
  })

  it('shows episode title and show name in the mini-player', async () => {
    let context: ReturnType<typeof usePodcastPlayer> | null = null
    render(
      <AuthedWrapper>
        <CaptureContext onContext={value => (context = value)} />
      </AuthedWrapper>,
    )

    const ep = makeEpisode('ep-title')
    await act(async () => {
      context!.playEpisode(ep)
    })

    const titleEl = document.querySelector('[data-pw="podcast-mini-player-title"]')
    expect(titleEl?.textContent).toBe(ep.title)
  })

  it('reports position on pause and clears the timer', async () => {
    let context: ReturnType<typeof usePodcastPlayer> | null = null
    const { container } = render(
      <AuthedWrapper>
        <CaptureContext onContext={value => (context = value)} />
      </AuthedWrapper>,
    )

    const ep = makeEpisode('ep-pause')
    await act(async () => {
      context!.playEpisode(ep)
    })

    const audio = container.querySelector('audio')!
    await act(async () => {
      fireEvent.play(audio)
    })
    await act(async () => {
      fireEvent.pause(audio)
    })
    await act(async () => {})

    expect(mockReportPlaybackPosition).toHaveBeenCalledWith(
      'ep-pause',
      expect.objectContaining({ completed: false }),
    )
  })

  it('reports completed position on audio ended', async () => {
    let context: ReturnType<typeof usePodcastPlayer> | null = null
    const { container } = render(
      <AuthedWrapper>
        <CaptureContext onContext={value => (context = value)} />
      </AuthedWrapper>,
    )

    const ep = makeEpisode('ep-ended')
    await act(async () => {
      context!.playEpisode(ep)
    })

    const audio = container.querySelector('audio')!
    await act(async () => {
      fireEvent(audio, new Event('ended'))
    })
    await act(async () => {})

    expect(mockReportPlaybackPosition).toHaveBeenCalledWith(
      'ep-ended',
      expect.objectContaining({ completed: true }),
    )
  })

  it('waits for in-flight progress reports before reporting completion', async () => {
    let context: ReturnType<typeof usePodcastPlayer> | null = null
    let resolveProgressReport: (() => void) | undefined
    mockReportPlaybackPosition.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          resolveProgressReport = resolve
        }),
    )
    mockReportPlaybackPosition.mockResolvedValue(undefined)
    const { container } = render(
      <AuthedWrapper>
        <CaptureContext onContext={value => (context = value)} />
      </AuthedWrapper>,
    )
    const ep = makeEpisode('ep-ended-after-progress')
    await act(async () => context!.playEpisode(ep))
    const audio = container.querySelector('audio')!
    await act(async () => fireEvent.pause(audio))
    expect(mockReportPlaybackPosition).toHaveBeenCalledTimes(1)
    await act(async () => fireEvent(audio, new Event('ended')))
    expect(mockReportPlaybackPosition).toHaveBeenCalledTimes(1)
    await act(async () => resolveProgressReport?.())
    await waitFor(() => expect(mockReportPlaybackPosition).toHaveBeenCalledTimes(2))
    expect(mockReportPlaybackPosition).toHaveBeenLastCalledWith(
      'ep-ended-after-progress',
      expect.objectContaining({ completed: true }),
    )
  })

  it('seeks audio to resume position on loadedmetadata', async () => {
    let context: ReturnType<typeof usePodcastPlayer> | null = null
    mockFetchPlaybackPosition.mockResolvedValue({ position_seconds: 60, completed_at: null })

    const { container } = render(
      <AuthedWrapper>
        <CaptureContext onContext={value => (context = value)} />
      </AuthedWrapper>,
    )

    const ep = makeEpisode('ep-resume')
    await act(async () => {
      context!.playEpisode(ep)
    })
    await act(async () => {})

    const audio = container.querySelector('audio')!
    expect(audio).not.toBeNull()
    await act(async () => {
      fireEvent(audio, new Event('loadedmetadata'))
    })
    expect(audio).toBeInstanceOf(HTMLAudioElement)
  })

  it('falls back to position 0 when fetchPlaybackPosition throws', async () => {
    let context: ReturnType<typeof usePodcastPlayer> | null = null
    mockFetchPlaybackPosition.mockRejectedValue(new Error('network error'))

    render(
      <AuthedWrapper>
        <CaptureContext onContext={value => (context = value)} />
      </AuthedWrapper>,
    )

    await act(async () => {
      context!.playEpisode(makeEpisode('ep-err'))
    })
    await act(async () => {})
    expect(mockFetchPlaybackPosition).toHaveBeenCalledWith('ep-err')
  })

  it('reports position on pagehide when audio is playing', async () => {
    let context: ReturnType<typeof usePodcastPlayer> | null = null
    const { container } = render(
      <AuthedWrapper>
        <CaptureContext onContext={value => (context = value)} />
      </AuthedWrapper>,
    )

    const ep = makeEpisode('ep-hide')
    await act(async () => {
      context!.playEpisode(ep)
    })

    const audio = container.querySelector('audio')!
    Object.defineProperty(audio, 'paused', { get: () => false, configurable: true })

    await act(async () => {
      window.dispatchEvent(new Event('pagehide'))
    })
    await act(async () => {})

    expect(mockReportPlaybackPosition).toHaveBeenCalledWith(
      'ep-hide',
      expect.objectContaining({ completed: false }),
    )
  })
})
