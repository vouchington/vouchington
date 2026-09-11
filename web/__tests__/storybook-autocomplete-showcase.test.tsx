// @vitest-environment jsdom

import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { AutocompleteShowcase } from '../storybook/design-system/autocomplete-showcase'

describe('AutocompleteShowcase', () => {
  beforeEach(() => {
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  })

  it('installs fixture fetch with the original fetch receiver and restores it on unmount', async () => {
    const originalFetch: typeof fetch = function (this: Window, input, init) {
      expect(this).toBe(window)
      return Promise.resolve(
        new Response(JSON.stringify({ input: String(input), hasInit: init !== undefined }), {
          status: 200,
        }),
      )
    }
    window.fetch = originalFetch

    const { unmount } = render(<AutocompleteShowcase />)
    const fixtureFetch = window.fetch

    const fixtureResponse = await window.fetch('/api/v1/topics?q=card')
    await expect(fixtureResponse.json()).resolves.toMatchObject({
      topics: {
        'topic-1': { name: 'Chase Sapphire Reserve' },
      },
    })

    const fallbackResponse = await window.fetch('/api/v1/other')
    await expect(fallbackResponse.json()).resolves.toEqual({
      hasInit: false,
      input: '/api/v1/other',
    })

    unmount()

    expect(window.fetch).toBe(originalFetch)
    await expect(fixtureFetch('/api/v1/other')).rejects.toThrow('Original fetch is unavailable')
  })

  it('supports overlapping fixture providers without recursive fallback fetches', async () => {
    let fallbackCalls = 0
    const originalFetch: typeof fetch = function (this: Window, input) {
      expect(this).toBe(window)
      fallbackCalls += 1
      return Promise.resolve(
        new Response(JSON.stringify({ input: String(input) }), { status: 200 }),
      )
    }
    window.fetch = originalFetch

    const first = render(<AutocompleteShowcase />)
    const firstFixtureFetch = window.fetch
    const second = render(<AutocompleteShowcase />)

    expect(window.fetch).not.toBe(firstFixtureFetch)
    const fallbackResponse = await window.fetch('/api/v1/other')
    await expect(fallbackResponse.json()).resolves.toEqual({ input: '/api/v1/other' })
    expect(fallbackCalls).toBe(1)

    first.unmount()
    expect(window.fetch).not.toBe(originalFetch)
    const fallbackAfterFirstUnmount = await window.fetch('/api/v1/other-again')
    await expect(fallbackAfterFirstUnmount.json()).resolves.toEqual({
      input: '/api/v1/other-again',
    })
    expect(fallbackCalls).toBe(2)

    second.unmount()
    expect(window.fetch).toBe(originalFetch)
  })
})
