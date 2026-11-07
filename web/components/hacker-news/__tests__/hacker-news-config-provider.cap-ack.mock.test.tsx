import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createNavMock, navMockModule } from 'vouchington-tooling/next-navigation-mock'
import { HackerNewsConfigProvider } from '../hacker-news-config-provider'
import {
  useHackerNewsConfig,
  useHackerNewsReferenceRefreshGeneration,
} from '../hacker-news-config-context'

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)
const nav = createNavMock()

function VisibilityGeneration() {
  const { references_visible } = useHackerNewsConfig()
  const generation = useHackerNewsReferenceRefreshGeneration()
  return <output>{`${references_visible}:${generation}`}</output>
}

describe('Hacker News visibility acknowledgement with range changes', () => {
  it('observes ON before the first poll after a range-only server acknowledgement', async () => {
    nav.reset()
    vi.useFakeTimers()
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () =>
        Response.json({ references_visible: false, post_time_range_cap: 'all' }),
      )
    try {
      const view = render(
        <HackerNewsConfigProvider
          initialConfig={{ references_visible: true, post_time_range_cap: '1y' }}
        >
          <VisibilityGeneration />
        </HackerNewsConfigProvider>,
      )
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(screen.getByText('false:0')).toBeInTheDocument()
      const refreshesBefore = nav.refresh.mock.calls.length
      fetchMock.mockImplementation(async () =>
        Response.json({ references_visible: true, post_time_range_cap: 'all' }),
      )
      await act(async () => {
        view.rerender(
          <HackerNewsConfigProvider
            initialConfig={{ references_visible: true, post_time_range_cap: 'all' }}
          >
            <VisibilityGeneration />
          </HackerNewsConfigProvider>,
        )
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(screen.getByText('true:0')).toBeInTheDocument()
      expect(nav.refresh.mock.calls.length).toBeGreaterThan(refreshesBefore)
      await act(async () =>
        view.rerender(
          <HackerNewsConfigProvider
            initialConfig={{ references_visible: true, post_time_range_cap: 'all' }}
          >
            <VisibilityGeneration />
          </HackerNewsConfigProvider>,
        ),
      )
      expect(screen.getByText('true:1')).toBeInTheDocument()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000)
      })
      expect(screen.getByText('true:1')).toBeInTheDocument()
    } finally {
      fetchMock.mockRestore()
      vi.useRealTimers()
    }
  })
  it.each([false, true])(
    'consumes a missed OFF cycle with cap acknowledgement before ON: %s',
    async capBeforeOn => {
      nav.reset()
      vi.useFakeTimers()
      const fetchMock = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async () =>
          Response.json({ references_visible: false, post_time_range_cap: 'all' }),
        )
      try {
        const view = render(
          <HackerNewsConfigProvider
            initialConfig={{ references_visible: true, post_time_range_cap: '1y' }}
          >
            <VisibilityGeneration />
          </HackerNewsConfigProvider>,
        )
        await act(async () => {
          await vi.advanceTimersByTimeAsync(0)
        })
        expect(screen.getByText('false:0')).toBeInTheDocument()
        if (capBeforeOn) {
          await act(async () =>
            view.rerender(
              <HackerNewsConfigProvider
                initialConfig={{ references_visible: true, post_time_range_cap: 'all' }}
              >
                <VisibilityGeneration />
              </HackerNewsConfigProvider>,
            ),
          )
        }
        // A range acknowledgement must preserve the last observed hidden state.
        expect(screen.getByText('false:0')).toBeInTheDocument()
        fetchMock.mockImplementation(async () =>
          Response.json({ references_visible: true, post_time_range_cap: 'all' }),
        )
        await act(async () => {
          await vi.advanceTimersByTimeAsync(30_000)
        })
        expect(screen.getByText('true:0')).toBeInTheDocument()
        await act(async () =>
          view.rerender(
            <HackerNewsConfigProvider
              initialConfig={{ references_visible: true, post_time_range_cap: 'all' }}
            >
              <VisibilityGeneration />
            </HackerNewsConfigProvider>,
          ),
        )
        expect(screen.getByText('true:1')).toBeInTheDocument()
        await act(async () =>
          view.rerender(
            <HackerNewsConfigProvider
              initialConfig={{ references_visible: true, post_time_range_cap: 'all' }}
            >
              <VisibilityGeneration />
            </HackerNewsConfigProvider>,
          ),
        )
        expect(screen.getByText('true:1')).toBeInTheDocument()
      } finally {
        fetchMock.mockRestore()
        vi.useRealTimers()
      }
    },
  )
})
