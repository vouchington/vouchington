import { beforeEach, describe, expect, it, vi } from 'vitest'
import { trackRssFeedItemView, trackRssFeedView } from '../rss-feed-analytics'

describe('rss-feed-analytics client', () => {
  const sendBeacon = vi.fn<(url: string, data?: BodyInit | null) => boolean>(() => true)

  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: true,
      value: sendBeacon,
    })
    Object.defineProperty(navigator, 'globalPrivacyControl', {
      configurable: true,
      value: undefined,
    })
  })

  it('sends a beacon when Global Privacy Control is inactive', () => {
    trackRssFeedView('feed-abc')
    expect(sendBeacon).toHaveBeenCalledTimes(1)
    expect(sendBeacon).toHaveBeenCalledWith('/api/v1/rss-feeds/feed-abc/views')
  })

  it('does not send a beacon when Global Privacy Control is active', () => {
    Object.defineProperty(navigator, 'globalPrivacyControl', {
      configurable: true,
      value: true,
    })
    trackRssFeedView('feed-abc')
    expect(sendBeacon).not.toHaveBeenCalled()
  })

  describe('trackRssFeedItemView', () => {
    it('sends a beacon when Global Privacy Control is inactive', () => {
      trackRssFeedItemView('item-xyz')
      expect(sendBeacon).toHaveBeenCalledTimes(1)
      expect(sendBeacon).toHaveBeenCalledWith('/api/v1/rss-feed-items/item-xyz/views')
    })

    it('does not send a beacon when Global Privacy Control is active', () => {
      Object.defineProperty(navigator, 'globalPrivacyControl', {
        configurable: true,
        value: true,
      })
      trackRssFeedItemView('item-xyz')
      expect(sendBeacon).not.toHaveBeenCalled()
    })

    it('does not send a beacon when sendBeacon is not available', () => {
      Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: undefined })
      trackRssFeedItemView('item-xyz')
      expect(sendBeacon).not.toHaveBeenCalled()
    })
  })
})
