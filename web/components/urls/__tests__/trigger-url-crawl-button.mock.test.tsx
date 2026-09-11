import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { enqueueUrlCrawl, refreshRssFeed } from '@/lib/api/client'
import { TriggerUrlCrawlButton } from '../trigger-url-crawl-button'

vi.mock(import('@/lib/api/client'), () => ({
  enqueueUrlCrawl: vi.fn<VitestLooseMock>(),
  refreshRssFeed: vi.fn<VitestLooseMock>(),
}))

const { mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockToastSuccess: vi.fn<VitestLooseMock>(),
  mockToastError: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: {
        success: mockToastSuccess,
        error: mockToastError,
      },
    }) as unknown as typeof import('sonner'),
)

const mockEnqueueUrlCrawl = vi.mocked(enqueueUrlCrawl)
const mockRefreshRssFeed = vi.mocked(refreshRssFeed)

describe('TriggerUrlCrawlButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls enqueueUrlCrawl and shows success toast on Trigger Crawl click', async () => {
    mockEnqueueUrlCrawl.mockResolvedValueOnce({ success: true, message: 'Crawl enqueued' })

    render(
      <TriggerUrlCrawlButton
        id='url-1'
        urlType='url'
        rssFeedId={null}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /trigger crawl/i }))

    await waitFor(() => {
      expect(mockEnqueueUrlCrawl).toHaveBeenCalledWith('url-1')
      expect(mockToastSuccess).toHaveBeenCalledWith('Crawl enqueued')
    })
  })

  it('shows error toast when enqueueUrlCrawl rejects', async () => {
    mockEnqueueUrlCrawl.mockRejectedValueOnce(new Error('Network error'))

    render(
      <TriggerUrlCrawlButton
        id='url-1'
        urlType='url'
        rssFeedId={null}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /trigger crawl/i }))

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Network error')
      expect(mockToastSuccess).not.toHaveBeenCalled()
    })
  })

  it('shows RSS Sync button when urlType is rss_feed and rssFeedId is set', () => {
    render(
      <TriggerUrlCrawlButton
        id='url-1'
        urlType='rss_feed'
        rssFeedId='feed-1'
      />,
    )

    expect(screen.getByRole('button', { name: /trigger crawl/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /trigger rss sync/i })).toBeDefined()
  })

  it('calls refreshRssFeed and shows success toast on Trigger RSS Sync click', async () => {
    mockRefreshRssFeed.mockResolvedValueOnce({
      success: true,
      message: 'RSS feed refresh enqueued',
      rss_feed_id: 'feed-1',
      force: false,
    })

    render(
      <TriggerUrlCrawlButton
        id='url-1'
        urlType='rss_feed'
        rssFeedId='feed-1'
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /trigger rss sync/i }))

    await waitFor(() => {
      expect(mockRefreshRssFeed).toHaveBeenCalledWith('feed-1', {})
      expect(mockToastSuccess).toHaveBeenCalledWith('RSS sync triggered')
    })
  })

  it('does not render RSS Sync button for non-rss urlType', () => {
    render(
      <TriggerUrlCrawlButton
        id='url-1'
        urlType='url'
        rssFeedId={null}
      />,
    )

    expect(screen.queryByRole('button', { name: /trigger rss sync/i })).toBeNull()
  })
})
