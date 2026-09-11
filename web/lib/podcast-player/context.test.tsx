import { act, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '@/lib/auth/auth-provider'
import { PodcastPlayerProvider } from './context'
import { usePodcastPlayer } from './use-podcast-player'
import type { PodcastEpisode } from './types'

vi.stubGlobal(
  'fetch',
  vi.fn<VitestLooseMock>().mockResolvedValue(
    new Response(JSON.stringify({ chapters: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  ),
)

function makeEpisode(id: string, title: string): PodcastEpisode {
  return {
    episodeId: id,
    enclosureUrl: `https://example.com/audio/${id}.mp3`,
    enclosureType: 'audio/mpeg',
    durationSeconds: 1800,
    title,
    showId: 'show-1',
    showTitle: 'Test Podcast Show',
    coverArtUrl: '/sideload/test-cover.jpg',
  }
}

function CaptureContext({
  onContext,
}: {
  onContext: (ctx: ReturnType<typeof usePodcastPlayer>) => void
}) {
  onContext(usePodcastPlayer())
  return null
}

/** Wrap with AuthProvider (logged-out) so PodcastPlayerProvider can call useAuth(). */
function TestWrapper({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider initialUser={null}>
      <PodcastPlayerProvider>{children}</PodcastPlayerProvider>
    </AuthProvider>
  )
}

describe('PodcastPlayerProvider', () => {
  it('starts with no current episode', () => {
    let context: ReturnType<typeof usePodcastPlayer> | null = null
    render(
      <TestWrapper>
        <CaptureContext onContext={value => (context = value)} />
      </TestWrapper>,
    )

    expect(context!.currentEpisode).toBeNull()
  })

  it('registers an episode as current on playEpisode', () => {
    let context: ReturnType<typeof usePodcastPlayer> | null = null
    render(
      <TestWrapper>
        <CaptureContext onContext={value => (context = value)} />
      </TestWrapper>,
    )

    const ep = makeEpisode('ep-1', 'Episode One')
    act(() => {
      context!.playEpisode(ep)
    })

    expect(context!.currentEpisode).toEqual(ep)
  })

  it('replaces the current episode when a new one plays', () => {
    let context: ReturnType<typeof usePodcastPlayer> | null = null
    render(
      <TestWrapper>
        <CaptureContext onContext={value => (context = value)} />
      </TestWrapper>,
    )

    act(() => {
      context!.playEpisode(makeEpisode('ep-1', 'Episode One'))
    })
    act(() => {
      context!.playEpisode(makeEpisode('ep-2', 'Episode Two'))
    })

    expect(context!.currentEpisode?.episodeId).toBe('ep-2')
  })

  it('clears the current episode on clearEpisode', () => {
    let context: ReturnType<typeof usePodcastPlayer> | null = null
    render(
      <TestWrapper>
        <CaptureContext onContext={value => (context = value)} />
      </TestWrapper>,
    )

    act(() => {
      context!.playEpisode(makeEpisode('ep-1', 'Episode One'))
    })
    act(() => {
      context!.clearEpisode()
    })

    expect(context!.currentEpisode).toBeNull()
  })

  it('upgrades http enclosure URLs to https on the audio element', () => {
    let context: ReturnType<typeof usePodcastPlayer> | null = null
    const { container } = render(
      <TestWrapper>
        <CaptureContext onContext={value => (context = value)} />
      </TestWrapper>,
    )

    const httpEpisode = makeEpisode('ep-http', 'HTTP Episode')
    act(() => {
      context!.playEpisode({ ...httpEpisode, enclosureUrl: 'http://example.com/audio/ep-http.mp3' })
    })

    const audio = container.querySelector('audio')
    expect(audio?.getAttribute('src')).toBe('https://example.com/audio/ep-http.mp3')
  })

  it('throws when usePodcastPlayer is used outside PodcastPlayerProvider', () => {
    expect(() => {
      render(<CaptureContext onContext={() => undefined} />)
    }).toThrow('usePodcastPlayer must be used within a PodcastPlayerProvider')
  })
})
