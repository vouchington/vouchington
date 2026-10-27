import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RssFeedItemViewTracker } from '../rss-feed-item-view-tracker'

const sendBeacon = vi.fn<(url: string, data?: BodyInit | null) => boolean>(() => true)

describe('RssFeedItemViewTracker', () => {
  beforeEach(() => {
    sendBeacon.mockClear()
    vi.stubGlobal('navigator', { sendBeacon, globalPrivacyControl: false })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders no markup and sends one view beacon per mount', () => {
    const { container, rerender } = render(<RssFeedItemViewTracker itemId='item-123' />)
    expect(container.firstChild).toBeNull()
    expect(sendBeacon).toHaveBeenCalledExactlyOnceWith('/api/v1/rss-feed-items/item-123/views')

    rerender(<RssFeedItemViewTracker itemId='item-123' />)
    rerender(<RssFeedItemViewTracker itemId='item-456' />)
    expect(container.firstChild).toBeNull()
    expect(sendBeacon).toHaveBeenCalledExactlyOnceWith('/api/v1/rss-feed-items/item-123/views')
  })
})
