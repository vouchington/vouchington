import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { expectInputEnterSubmits } from '@/test-helpers/form-keyboard'
import { ManageSourceClient } from '../manage-source-client'
import { updateTopic } from '@/lib/api/client/topics'
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

const mockUpdateTopic = vi.mocked(updateTopic)
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

describe('ManageSourceClient — load error', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the error banner when loadError is set', () => {
    render(
      <ManageSourceClient
        id='topic-1'
        initialData={{ loadError: 'Failed to load source data', loading: false }}
      />,
    )

    expect(screen.getByText('Failed to load source data')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Domains' })).not.toBeInTheDocument()
  })
})

describe('ManageSourceClient — keyboard submit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateTopic.mockResolvedValue({
      topic: { hostname_id: 'hn-1', hostname: { id: 'hn-1', hostname: 'example.com' } },
    } as unknown as Awaited<ReturnType<typeof updateTopic>>)
  })

  it('Enter on the primary hostname input submits via updateTopic', async () => {
    render(
      <ManageSourceClient
        id='topic-1'
        initialData={baseInitialData}
      />,
    )
    await screen.findByRole('heading', { level: 2, name: 'Domains' })

    const input = screen.getByLabelText('Primary domain') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'example.com' } })

    void expectInputEnterSubmits({ input, onSubmit: mockUpdateTopic })

    await waitFor(() => {
      expect(mockUpdateTopic).toHaveBeenCalledWith(
        'topic-1',
        expect.objectContaining({ hostname: 'example.com' }),
      )
    })
  })
})

describe('ManageSourceClient — feed actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateRssFeed.mockResolvedValue({
      rss_feed: { ...mockRssFeed },
    } as unknown as Awaited<ReturnType<typeof updateRssFeed>>)
  })

  it('submitting the Update Source form calls updateRssFeed and dispatches result', async () => {
    render(
      <ManageSourceClient
        id='topic-1'
        initialData={{ ...baseInitialData, rssFeed: mockRssFeed }}
      />,
    )
    await screen.findByRole('button', { name: 'Update Source' })

    const urlInput = screen.getByLabelText('Source URL') as HTMLInputElement
    fireEvent.change(urlInput, { target: { value: 'https://example.com/feed.xml' } })
    fireEvent.submit(urlInput.closest('form')!)

    await waitFor(() => {
      expect(mockUpdateRssFeed).toHaveBeenCalledWith(
        'feed-1',
        expect.objectContaining({ rss_feed_url: 'https://example.com/feed.xml' }),
      )
    })
  })

  it('clicking Disable calls updateRssFeed with enabled: false and dispatches result', async () => {
    render(
      <ManageSourceClient
        id='topic-1'
        initialData={{ ...baseInitialData, rssFeed: mockRssFeed }}
      />,
    )
    await screen.findByRole('button', { name: 'Disable' })

    fireEvent.click(screen.getByRole('button', { name: 'Disable' }))

    await waitFor(() => {
      expect(mockUpdateRssFeed).toHaveBeenCalledWith(
        'feed-1',
        expect.objectContaining({ enabled: false }),
      )
    })
  })

  it('clicking Hide from Discovery calls updateRssFeed with discoverable: false and dispatches result', async () => {
    render(
      <ManageSourceClient
        id='topic-1'
        initialData={{ ...baseInitialData, rssFeed: mockRssFeed }}
      />,
    )
    await screen.findByRole('button', { name: 'Hide from Discovery' })

    fireEvent.click(screen.getByRole('button', { name: 'Hide from Discovery' }))

    await waitFor(() => {
      expect(mockUpdateRssFeed).toHaveBeenCalledWith(
        'feed-1',
        expect.objectContaining({ discoverable: false }),
      )
    })
  })
})
