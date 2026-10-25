import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockTrackRssFeedItemView } = vi.hoisted(() => ({
  mockTrackRssFeedItemView: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/rss-feed-analytics'), () => ({
  trackRssFeedItemView: mockTrackRssFeedItemView,
}))

import { RssFeedItemViewTracker } from '../rss-feed-item-view-tracker'

describe('RssFeedItemViewTracker', () => {
  beforeEach(() => {
    mockTrackRssFeedItemView.mockReset()
  })

  it('calls trackRssFeedItemView with the itemId on mount', () => {
    render(<RssFeedItemViewTracker itemId='item-123' />)
    expect(mockTrackRssFeedItemView).toHaveBeenCalledWith('item-123')
    expect(mockTrackRssFeedItemView).toHaveBeenCalledTimes(1)
  })

  it('does not call trackRssFeedItemView a second time on re-render', () => {
    const { rerender } = render(<RssFeedItemViewTracker itemId='item-123' />)
    rerender(<RssFeedItemViewTracker itemId='item-123' />)
    expect(mockTrackRssFeedItemView).toHaveBeenCalledTimes(1)
  })

  it('renders null', () => {
    const { container } = render(<RssFeedItemViewTracker itemId='item-123' />)
    expect(container.firstChild).toBeNull()
  })
})
