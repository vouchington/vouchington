import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RssFeedViewTracker } from '../rss-feed-view-tracker'

const sendBeacon = vi.fn<(url: string, data?: BodyInit | null) => boolean>(() => true)

describe('RssFeedViewTracker', () => {
  beforeEach(() => {
    sendBeacon.mockClear()
    vi.stubGlobal('navigator', { sendBeacon, globalPrivacyControl: false })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders no markup and sends one view beacon per mount', () => {
    const { container, rerender } = render(<RssFeedViewTracker rssFeedId='feed-123' />)
    expect(container.firstChild).toBeNull()
    expect(sendBeacon).toHaveBeenCalledExactlyOnceWith('/api/v1/rss-feeds/feed-123/views')

    rerender(<RssFeedViewTracker rssFeedId='feed-123' />)
    rerender(<RssFeedViewTracker rssFeedId='feed-456' />)
    expect(container.firstChild).toBeNull()
    expect(sendBeacon).toHaveBeenCalledExactlyOnceWith('/api/v1/rss-feeds/feed-123/views')
  })
})
