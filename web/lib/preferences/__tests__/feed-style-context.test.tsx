import { describe, it, expect, beforeEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { hydrateRoot, type Root } from 'react-dom/client'
import { FeedStyleProvider } from '../feed-style-context'
import { useFeedStyle } from '../use-feed-style'

function FeedStyleConsumer({
  onRender,
}: {
  onRender: (v: ReturnType<typeof useFeedStyle>) => void
}) {
  const value = useFeedStyle()
  onRender(value)
  return null
}

describe('FeedStyleProvider', () => {
  beforeEach(() => {
    localStorage.clear()
    document.body.innerHTML = ''
  })

  it('initializes with default feed style when localStorage is empty', () => {
    let captured: ReturnType<typeof useFeedStyle> | null = null
    render(
      <FeedStyleProvider>
        <FeedStyleConsumer onRender={v => (captured = v)} />
      </FeedStyleProvider>,
    )
    expect(captured!.feedStyle).toBe('summary')
  })

  it('setFeedStyle updates state', () => {
    let captured: ReturnType<typeof useFeedStyle> | null = null
    render(
      <FeedStyleProvider>
        <FeedStyleConsumer onRender={v => (captured = v)} />
      </FeedStyleProvider>,
    )
    act(() => captured!.setFeedStyle('compact'))
    expect(captured!.feedStyle).toBe('compact')
  })

  it('setFeedStyle writes to localStorage', () => {
    let captured: ReturnType<typeof useFeedStyle> | null = null
    render(
      <FeedStyleProvider>
        <FeedStyleConsumer onRender={v => (captured = v)} />
      </FeedStyleProvider>,
    )
    act(() => captured!.setFeedStyle('compact'))
    expect(localStorage.getItem('feed-style')).toBe('compact')
  })

  it('syncs state from localStorage on mount', () => {
    localStorage.setItem('feed-style', 'compact')
    let captured: ReturnType<typeof useFeedStyle> | null = null
    render(
      <FeedStyleProvider>
        <FeedStyleConsumer onRender={v => (captured = v)} />
      </FeedStyleProvider>,
    )
    expect(captured!.feedStyle).toBe('compact')
  })

  it('hydrates with the default before syncing compact from localStorage', async () => {
    localStorage.setItem('feed-style', 'compact')
    const renderValues: string[] = []
    const tree = (
      <FeedStyleProvider>
        <FeedStyleConsumer
          onRender={({ feedStyle }) => {
            renderValues.push(feedStyle)
          }}
        />
      </FeedStyleProvider>
    )
    const consoleErrors: unknown[][] = []
    const testConsole = globalThis['console']
    const originalConsoleError = testConsole.error
    const container = document.createElement('div')
    container.innerHTML = renderToString(tree)
    document.body.append(container)
    let root: Root | null = null

    testConsole.error = (...args: unknown[]) => {
      consoleErrors.push(args)
    }
    try {
      await act(async () => {
        root = hydrateRoot(container, tree)
      })

      expect(
        consoleErrors.some(call =>
          call.some(arg => typeof arg === 'string' && arg.includes('hydration')),
        ),
      ).toBe(false)
      expect(renderValues).toContain('summary')
      expect(renderValues.at(-1)).toBe('compact')
    } finally {
      await act(async () => {
        root?.unmount()
      })
      testConsole.error = originalConsoleError
    }
  })

  it('uses default when localStorage has invalid value', () => {
    localStorage.setItem('feed-style', 'invalid')
    let captured: ReturnType<typeof useFeedStyle> | null = null
    render(
      <FeedStyleProvider>
        <FeedStyleConsumer onRender={v => (captured = v)} />
      </FeedStyleProvider>,
    )
    expect(captured!.feedStyle).toBe('summary')
  })
})
