import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useScrollCurrentRssItemIntoView } from './rss-feed-item-modal-shell-current-item-scroll'

function rssItemElement(id: string, top: number, height: number) {
  const element = document.createElement('article')
  element.dataset.rssItemId = id
  element.scrollIntoView = vi.fn<() => void>()
  element.getBoundingClientRect = vi.fn<() => DOMRect>(
    () =>
      ({
        top,
        height,
        bottom: top + height,
        left: 0,
        right: 0,
        width: 100,
        x: 0,
        y: top,
        toJSON: () => ({}),
      }) satisfies DOMRect,
  )
  document.body.append(element)
  return element
}

function mockReducedMotion(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn<(query: string) => MediaQueryList>(query => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn<(type: string, listener: EventListener) => void>(),
      removeEventListener: vi.fn<(type: string, listener: EventListener) => void>(),
      addListener: vi.fn<(listener: EventListener) => void>(),
      removeListener: vi.fn<(listener: EventListener) => void>(),
      dispatchEvent: vi.fn<(event: Event) => boolean>(() => true),
    })),
  })
}

describe('useScrollCurrentRssItemIntoView', () => {
  beforeEach(() => {
    document.body.replaceChildren()
    Reflect.deleteProperty(window, 'matchMedia')
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 800,
    })
  })

  it('does not scroll on initial mount or when no matching item exists', () => {
    const current = rssItemElement('item-1', 100, 20)

    const { rerender } = renderHook(({ id }) => useScrollCurrentRssItemIntoView(id), {
      initialProps: { id: 'item-1' },
    })

    expect(current.scrollIntoView).not.toHaveBeenCalled()

    rerender({ id: 'item-2' })

    expect(current.scrollIntoView).not.toHaveBeenCalled()
  })

  it('scrolls the matching item nearest the viewport center after navigation', () => {
    const farItem = rssItemElement('item-2', 40, 20)
    const centeredItem = rssItemElement('item-2', 388, 24)

    const { rerender } = renderHook(({ id }) => useScrollCurrentRssItemIntoView(id), {
      initialProps: { id: 'item-1' },
    })

    rerender({ id: 'item-2' })

    expect(farItem.scrollIntoView).not.toHaveBeenCalled()
    expect(centeredItem.scrollIntoView).toHaveBeenCalledWith({
      block: 'nearest',
      behavior: 'smooth',
    })
  })

  it('does not animate the scroll when reduced motion is requested', () => {
    mockReducedMotion(true)
    const centeredItem = rssItemElement('item-2', 388, 24)

    const { rerender } = renderHook(({ id }) => useScrollCurrentRssItemIntoView(id), {
      initialProps: { id: 'item-1' },
    })

    rerender({ id: 'item-2' })

    expect(centeredItem.scrollIntoView).toHaveBeenCalledWith({
      block: 'nearest',
      behavior: 'auto',
    })
  })
})
