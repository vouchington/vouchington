import { act, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '@/lib/auth/auth-provider'
import { PodcastPlayerProvider } from './context'
import { usePodcastPlayer } from './use-podcast-player'
import { PodcastPlayerSpacer } from './spacer'
import type { PodcastEpisode } from './types'
import type { User } from '@/types/user'

const { mockFetchPlaybackPosition, mockReportPlaybackPosition } = vi.hoisted(() => ({
  mockFetchPlaybackPosition: vi.fn<VitestLooseMock>(),
  mockReportPlaybackPosition: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/podcast-playback'), () => ({
  fetchPlaybackPosition: mockFetchPlaybackPosition,
  reportPlaybackPosition: mockReportPlaybackPosition,
}))

const testUser: User = {
  id: 'user-1',
  username: 'tester',
  email_address: 'tests+tester@voucha.ai',
  roles: ['user'],
}
const clientTestUser = { id: testUser.id, roles: testUser.roles, isOfficialAccount: false }

function makeEpisode(id: string): PodcastEpisode {
  return {
    episodeId: id,
    enclosureUrl: `https://example.com/audio/${id}.mp3`,
    enclosureType: 'audio/mpeg',
    durationSeconds: 1800,
    title: `Episode ${id}`,
    showId: 'show-1',
    showTitle: 'Test Show',
    coverArtUrl: '/sideload/test-cover.jpg',
    showHref: '/source/test-show/latest',
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

function AuthedWrapper({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider initialUser={clientTestUser}>
      <PodcastPlayerProvider>{children}</PodcastPlayerProvider>
    </AuthProvider>
  )
}

describe('PodcastPlayerSpacer', () => {
  let resizeObserverCallback: ResizeObserverCallback | null = null
  let getBoundingClientRectSpy: ReturnType<typeof vi.spyOn> | null = null

  beforeEach(() => {
    resizeObserverCallback = null
    mockFetchPlaybackPosition.mockReset()
    mockFetchPlaybackPosition.mockResolvedValue(null)
    mockReportPlaybackPosition.mockReset()
  })

  afterEach(() => {
    getBoundingClientRectSpy?.mockRestore()
    vi.unstubAllGlobals()
  })

  it('renders spacer div when episode is active and removes it when cleared', async () => {
    let context: ReturnType<typeof usePodcastPlayer> | null = null
    const { container } = render(
      <AuthProvider initialUser={clientTestUser}>
        <PodcastPlayerProvider>
          <CaptureContext onContext={value => (context = value)} />
          <PodcastPlayerSpacer />
        </PodcastPlayerProvider>
      </AuthProvider>,
    )

    expect(container.querySelector('[aria-hidden="true"]')).toBeNull()

    await act(async () => {
      context!.playEpisode(makeEpisode('ep-spacer'))
    })
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull()

    await act(async () => {
      context!.clearEpisode()
    })
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull()
  })

  it('tracks the mounted mini-player height as it changes', async () => {
    let miniPlayerHeight = 176
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resizeObserverCallback = callback
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      } as typeof ResizeObserver,
    )
    getBoundingClientRectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        const height = this.getAttribute('data-pw') === 'podcast-mini-player' ? miniPlayerHeight : 0
        return {
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          right: 0,
          bottom: height,
          width: 0,
          height,
          toJSON() {
            return {}
          },
        } as DOMRect
      })

    let context: ReturnType<typeof usePodcastPlayer> | null = null
    const { container } = render(
      <AuthProvider initialUser={clientTestUser}>
        <PodcastPlayerProvider>
          <CaptureContext onContext={value => (context = value)} />
          <PodcastPlayerSpacer />
        </PodcastPlayerProvider>
      </AuthProvider>,
    )

    await act(async () => {
      context!.playEpisode(makeEpisode('ep-height'))
    })

    const spacer = container.querySelector('[aria-hidden="true"]') as HTMLDivElement
    expect(spacer).toHaveStyle({ height: '176px' })

    miniPlayerHeight = 224
    await act(async () => {
      resizeObserverCallback?.([] as unknown as ResizeObserverEntry[], {} as ResizeObserver)
    })

    expect(spacer).toHaveStyle({ height: '224px' })
  })

  it('exposes setQueue on the context', async () => {
    let context: ReturnType<typeof usePodcastPlayer> | null = null
    render(
      <AuthedWrapper>
        <CaptureContext onContext={value => (context = value)} />
      </AuthedWrapper>,
    )
    expect(typeof context!.setQueue).toBe('function')
  })

  it('auto-advances to next episode in queue on ended', async () => {
    let context: ReturnType<typeof usePodcastPlayer> | null = null
    const { container } = render(
      <AuthedWrapper>
        <CaptureContext onContext={value => (context = value)} />
      </AuthedWrapper>,
    )

    const ep1 = makeEpisode('ep-q1')
    const ep2 = makeEpisode('ep-q2')
    await act(async () => {
      context!.setQueue([ep1, ep2])
      context!.playEpisode(ep1)
    })

    const audio = container.querySelector('audio')!
    await act(async () => {
      fireEvent(audio, new Event('ended'))
    })
    await act(async () => {})

    expect(context!.currentEpisode?.episodeId).toBe('ep-q2')
  })

  it('does not advance past end of queue', async () => {
    let context: ReturnType<typeof usePodcastPlayer> | null = null
    const { container } = render(
      <AuthedWrapper>
        <CaptureContext onContext={value => (context = value)} />
      </AuthedWrapper>,
    )

    const ep1 = makeEpisode('ep-last')
    await act(async () => {
      context!.setQueue([ep1])
      context!.playEpisode(ep1)
    })

    const audio = container.querySelector('audio')!
    await act(async () => {
      fireEvent(audio, new Event('ended'))
    })
    await act(async () => {})

    expect(context!.currentEpisode?.episodeId).toBe('ep-last')
  })
})
