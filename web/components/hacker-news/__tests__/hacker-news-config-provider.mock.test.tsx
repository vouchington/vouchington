import '@/test-helpers/i18n/mock-json-messages'
import { useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createNavMock, navMockModule } from 'vouchington-tooling/next-navigation-mock'
import { HackerNewsConfigProvider } from '../hacker-news-config-provider'
import { HackerNewsFilterToggle } from '../hacker-news-filter-toggle'
import { HackerNewsReferenceLabel } from '../hacker-news-reference-label'
import { HackerNewsReferencesProvider } from '../hacker-news-references-context'

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)
const nav = createNavMock()

describe('Hacker News runtime visibility', () => {
  it('hides preloaded references and the filter when a refresh disables visibility', async () => {
    nav.reset()
    let resolve!: (value: Response) => void
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockReturnValue(
      new Promise(done => {
        resolve = done
      }),
    )
    const view = render(
      <HackerNewsConfigProvider
        initialConfig={{ references_visible: true, post_time_range_cap: '1y' }}
      >
        <HackerNewsFilterToggle />
        <HackerNewsReferencesProvider references={{ item: { story_count: 1, comment_count: 0 } }}>
          <HackerNewsReferenceLabel entityId='item' />
        </HackerNewsReferencesProvider>
      </HackerNewsConfigProvider>,
    )
    expect(screen.getByRole('checkbox')).toBeInTheDocument()
    expect(screen.getByText('Seen on Hacker News · 1')).toBeInTheDocument()
    await act(async () => {
      resolve(Response.json({ references_visible: false, post_time_range_cap: '1m' }))
    })
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByText('Seen on Hacker News · 1')).not.toBeInTheDocument()
    expect(nav.refresh).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledOnce()
    // A refreshed server tree can still carry the old values while config propagates.
    // Its new object identity must not reset polling or the newer client snapshot.
    view.rerender(
      <HackerNewsConfigProvider
        initialConfig={{ references_visible: true, post_time_range_cap: '1y' }}
      >
        <HackerNewsFilterToggle />
      </HackerNewsConfigProvider>,
    )
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(nav.refresh).toHaveBeenCalledOnce()
    fetchMock.mockRestore()
  })
})

function PersistentPlayer() {
  const [playing, setPlaying] = useState(false)
  return (
    <button
      type='button'
      onClick={() => setPlaying(true)}
    >
      {playing ? 'Playing episode' : 'Play episode'}
    </button>
  )
}

describe('server configuration refresh', () => {
  it('retries a stale server snapshot on the next poll without refetching on same-value renders', async () => {
    nav.reset()
    vi.useFakeTimers()
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () =>
        Response.json({ references_visible: true, post_time_range_cap: '1y' }),
      )
    try {
      const view = render(
        <HackerNewsConfigProvider
          initialConfig={{ references_visible: false, post_time_range_cap: '1y' }}
        >
          <HackerNewsFilterToggle />
        </HackerNewsConfigProvider>,
      )
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(screen.getByRole('checkbox')).toBeInTheDocument()
      expect(nav.refresh).toHaveBeenCalledOnce()
      view.rerender(
        <HackerNewsConfigProvider
          initialConfig={{ references_visible: false, post_time_range_cap: '1y' }}
        >
          <HackerNewsFilterToggle />
        </HackerNewsConfigProvider>,
      )
      expect(fetchMock).toHaveBeenCalledOnce()
      expect(nav.refresh).toHaveBeenCalledOnce()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000)
      })
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(nav.refresh).toHaveBeenCalledTimes(2)
      view.rerender(
        <HackerNewsConfigProvider
          initialConfig={{ references_visible: true, post_time_range_cap: '1y' }}
        >
          <HackerNewsFilterToggle />
        </HackerNewsConfigProvider>,
      )
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000)
      })
      expect(nav.refresh).toHaveBeenCalledTimes(2)
      view.unmount()
    } finally {
      fetchMock.mockRestore()
      vi.useRealTimers()
    }
  })

  it('updates server configuration without resetting descendant state', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}))
    const view = render(
      <HackerNewsConfigProvider
        initialConfig={{ references_visible: true, post_time_range_cap: '1y' }}
      >
        <PersistentPlayer />
        <HackerNewsFilterToggle />
      </HackerNewsConfigProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Play episode' }))
    view.rerender(
      <HackerNewsConfigProvider
        initialConfig={{ references_visible: false, post_time_range_cap: '1m' }}
      >
        <PersistentPlayer />
        <HackerNewsFilterToggle />
      </HackerNewsConfigProvider>,
    )
    expect(screen.getByRole('button', { name: 'Playing episode' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    fetchMock.mockRestore()
  })
})
