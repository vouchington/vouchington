import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockTrackRssFeedView } = vi.hoisted(() => ({
  mockTrackRssFeedView: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/rss-feed-analytics'), () => ({
  trackRssFeedView: mockTrackRssFeedView,
}))

import { RssFeedViewTracker } from '../rss-feed-view-tracker'

describe('RssFeedViewTracker', () => {
  beforeEach(() => {
    mockTrackRssFeedView.mockReset()
  })

  it('calls trackRssFeedView with the rssFeedId on mount', () => {
    render(<RssFeedViewTracker rssFeedId='feed-123' />)
    expect(mockTrackRssFeedView).toHaveBeenCalledWith('feed-123')
    expect(mockTrackRssFeedView).toHaveBeenCalledTimes(1)
  })

  it('does not call trackRssFeedView a second time on re-render', () => {
    const { rerender } = render(<RssFeedViewTracker rssFeedId='feed-123' />)
    rerender(<RssFeedViewTracker rssFeedId='feed-123' />)
    expect(mockTrackRssFeedView).toHaveBeenCalledTimes(1)
  })

  it('renders null', () => {
    const { container } = render(<RssFeedViewTracker rssFeedId='feed-123' />)
    expect(container.firstChild).toBeNull()
  })
})
