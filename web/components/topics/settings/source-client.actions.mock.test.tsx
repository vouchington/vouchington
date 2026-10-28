import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SourceClient } from './source-client'
import { updateRssFeed } from '@/lib/api/client'

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        prefetch: _prefetch,
        ...props
      }: {
        children: React.ReactNode
        href: string
        prefetch?: boolean
        [k: string]: unknown
      }) => (
        <a
          href={href}
          {...props}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

vi.mock(import('@/lib/api/client/topics'), () => ({
  updateTopic: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/topic-additional-hostnames'), () => ({
  addAdditionalHostname: vi.fn<VitestLooseMock>(),
  removeAdditionalHostname: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client'), () => ({
  deleteRssFeed: vi.fn<VitestLooseMock>(),
  getRssFeedCrawls: vi.fn<VitestLooseMock>().mockResolvedValue({ results: [] }),
  refreshRssFeed: vi.fn<VitestLooseMock>(),
  updateRssFeed: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: { success: vi.fn<VitestLooseMock>(), error: vi.fn<VitestLooseMock>() },
    }) as unknown as typeof import('sonner'),
)

const mockUpdateRssFeed = vi.mocked(updateRssFeed)

const mockRssFeed = {
  id: 'feed-1',
  title: 'Test Feed',
  rss_feed_url: { url: 'https://example.com/feed.xml' },
  home_page_url: null,
  is_enabled: true,
  is_discoverable: true,
  last_fetched_at: null,
  etag: null,
  last_modified_at: null,
}

const baseInitialData = {
  additionalHostnames: [],
  crawls: [],
  loading: false,
  primaryHostname: null,
  rssFeed: null,
  topicName: 'Topic',
}

describe('SourceClient — load error', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the error banner when loadError is set', () => {
    render(
      <SourceClient
        id='topic-1'
        initialData={{ loadError: 'Failed to load source data', loading: false }}
      />,
    )

    expect(screen.getByText('Failed to load source data')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Domains' })).not.toBeInTheDocument()
  })
})

describe('SourceClient — feed actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateRssFeed.mockResolvedValue({
      rss_feed: { ...mockRssFeed },
    } as unknown as Awaited<ReturnType<typeof updateRssFeed>>)
  })

  it('submitting the Update Source form calls updateRssFeed and dispatches result', async () => {
    render(
      <SourceClient
        id='topic-1'
        initialData={{ ...baseInitialData, rssFeed: mockRssFeed }}
      />,
    )
    expect(screen.getByRole('button', { name: 'Update Source' })).toBeInTheDocument()

    const urlInput = screen.getByLabelText('Source URL') as HTMLInputElement
    fireEvent.change(urlInput, { target: { value: 'https://example.com/feed.xml' } })
    await act(async () => {
      fireEvent.submit(urlInput.closest('form')!)
    })

    expect(mockUpdateRssFeed).toHaveBeenCalledWith(
      'feed-1',
      expect.objectContaining({ rss_feed_url: 'https://example.com/feed.xml' }),
    )
  })

  it('clicking Disable calls updateRssFeed with is_enabled: false and dispatches result', async () => {
    render(
      <SourceClient
        id='topic-1'
        initialData={{ ...baseInitialData, rssFeed: mockRssFeed }}
      />,
    )
    expect(screen.getByRole('button', { name: 'Disable' })).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Disable' }))
    })

    expect(mockUpdateRssFeed).toHaveBeenCalledWith(
      'feed-1',
      expect.objectContaining({ is_enabled: false }),
    )
  })

  it('clicking Hide from Discovery calls updateRssFeed with discoverable: false and dispatches result', async () => {
    render(
      <SourceClient
        id='topic-1'
        initialData={{ ...baseInitialData, rssFeed: mockRssFeed }}
      />,
    )
    expect(screen.getByRole('button', { name: 'Hide from Discovery' })).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Hide from Discovery' }))
    })

    expect(mockUpdateRssFeed).toHaveBeenCalledWith(
      'feed-1',
      expect.objectContaining({ discoverable: false }),
    )
  })
})
