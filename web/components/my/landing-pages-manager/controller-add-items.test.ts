import { describe, expect, it, vi } from 'vitest'
import { addFreeformLinkItem } from './controller-add-items'

describe('addFreeformLinkItem', () => {
  it('adds a link item to the draft list and returns true', () => {
    const setDraftItems = vi.fn<VitestLooseMock>()
    const result = addFreeformLinkItem({
      label: 'My Website',
      url: 'https://example.com',
      setDraftItems,
    })

    expect(result).toBe(true)
    expect(setDraftItems).toHaveBeenCalledOnce()
    const updater = setDraftItems.mock.calls[0]![0] as (prev: unknown[]) => unknown[]
    const updated = updater([]) as Array<{ type: string; label: string; url: string }>
    expect(updated).toHaveLength(1)
    expect(updated[0]!.type).toBe('link')
    expect(updated[0]!.label).toBe('My Website')
    expect(updated[0]!.url).toBe('https://example.com')
  })

  it('trims whitespace from label and url', () => {
    const setDraftItems = vi.fn<VitestLooseMock>()
    addFreeformLinkItem({
      label: '  My Website  ',
      url: '  https://example.com  ',
      setDraftItems,
    })

    const updater = setDraftItems.mock.calls[0]![0] as (prev: unknown[]) => unknown[]
    const item = (updater([]) as Array<{ type: string; label: string; url: string }>)[0]!
    expect(item.label).toBe('My Website')
    expect(item.url).toBe('https://example.com')
  })

  it('returns false and does not call setDraftItems when label is empty', () => {
    const setDraftItems = vi.fn<VitestLooseMock>()
    const result = addFreeformLinkItem({ label: '', url: 'https://example.com', setDraftItems })

    expect(result).toBe(false)
    expect(setDraftItems).not.toHaveBeenCalled()
  })

  it('returns false and does not call setDraftItems when label is whitespace only', () => {
    const setDraftItems = vi.fn<VitestLooseMock>()
    const result = addFreeformLinkItem({ label: '   ', url: 'https://example.com', setDraftItems })

    expect(result).toBe(false)
    expect(setDraftItems).not.toHaveBeenCalled()
  })

  it('returns false and does not call setDraftItems when url is empty', () => {
    const setDraftItems = vi.fn<VitestLooseMock>()
    const result = addFreeformLinkItem({ label: 'My Link', url: '', setDraftItems })

    expect(result).toBe(false)
    expect(setDraftItems).not.toHaveBeenCalled()
  })

  it('returns false for URLs with fragments', () => {
    const setDraftItems = vi.fn<VitestLooseMock>()
    const result = addFreeformLinkItem({
      label: 'Section link',
      url: 'https://example.com/#section',
      setDraftItems,
    })

    expect(result).toBe(false)
    expect(setDraftItems).not.toHaveBeenCalled()
  })

  it('returns false for javascript: URLs', () => {
    const setDraftItems = vi.fn<VitestLooseMock>()
    const scriptUrl = 'javascript:alert(1)'
    const result = addFreeformLinkItem({
      label: 'Evil',
      url: scriptUrl,
      setDraftItems,
    })

    expect(result).toBe(false)
    expect(setDraftItems).not.toHaveBeenCalled()
  })

  it('accepts http:// URLs', () => {
    const setDraftItems = vi.fn<VitestLooseMock>()
    const result = addFreeformLinkItem({
      label: 'HTTP link',
      url: 'http://example.com',
      setDraftItems,
    })

    expect(result).toBe(true)
  })
})
