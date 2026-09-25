import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteRssFeed, getRssFeedCrawls, refreshRssFeed, updateRssFeed } from '@/lib/api/client'
import { fetchRssFeeds } from '@/lib/api/client/topics'
import { useSourceActions } from '../use-manage-source-actions'
import { initialManageSourceState, type ManageSourceRssFeed } from '../manage-source-model'

vi.mock(import('@/lib/api/client'), () => ({
  deleteRssFeed: vi.fn<VitestLooseMock>(),
  getRssFeedCrawls: vi.fn<VitestLooseMock>(),
  refreshRssFeed: vi.fn<VitestLooseMock>(),
  updateRssFeed: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/topics'), () => ({
  fetchRssFeeds: vi.fn<VitestLooseMock>(),
}))

const { toastMock } = vi.hoisted(() => {
  const mock = Object.assign(vi.fn<VitestLooseMock>(), {
    error: vi.fn<VitestLooseMock>(),
    success: vi.fn<VitestLooseMock>(),
  })
  return { toastMock: mock }
})

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: toastMock,
    }) as unknown as typeof import('sonner'),
)

vi.mock(import('@/lib/on-error'), () => ({
  default: (_err: unknown, options: { fallback: string }) => {
    toastMock.error(options.fallback)
    return options.fallback
  },
  onSuccess: (message: string) => {
    toastMock.success(message)
  },
}))

const mockUpdate = vi.mocked(updateRssFeed)
const mockDelete = vi.mocked(deleteRssFeed)
const mockRefresh = vi.mocked(refreshRssFeed)
const mockGetCrawls = vi.mocked(getRssFeedCrawls)
const mockFetchRssFeeds = vi.mocked(fetchRssFeeds)

const rssFeed: ManageSourceRssFeed = {
  id: 'feed-1',
  title: null,
  rss_feed_url: { url: 'https://example.com/feed' },
  home_page_url: null,
  is_enabled: true,
  is_discoverable: false,
  last_fetched_at: null,
  etag: null,
  last_modified_at: null,
}

const baseState = { ...initialManageSourceState, rssFeed, loading: false }

function makeFormEvent(values: Record<string, string> = {}) {
  const form = document.createElement('form')
  for (const [name, value] of Object.entries(values)) {
    const input = document.createElement('input')
    input.name = name
    input.value = value
    form.append(input)
  }
  return {
    preventDefault: () => {},
    currentTarget: form,
  } as unknown as React.FormEvent<HTMLFormElement>
}

describe('useSourceActions error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reports save failure via onError fallback', async () => {
    mockUpdate.mockRejectedValueOnce(new Error('Save failed'))
    const dispatch = vi.fn<VitestLooseMock>()

    const { result } = renderHook(() => useSourceActions('topic-1', baseState, dispatch))

    await act(async () => {
      await result.current.handleSubmit(
        makeFormEvent({ title: 'My title', rss_feed_url: 'https://x.example/feed' }),
      )
    })

    expect(toastMock.error).toHaveBeenCalledWith('Failed to save source')
  })

  it('reports toggle failure via onError fallback', async () => {
    mockUpdate.mockRejectedValueOnce(new Error('Toggle failed'))
    const dispatch = vi.fn<VitestLooseMock>()

    const { result } = renderHook(() => useSourceActions('topic-1', baseState, dispatch))

    await act(async () => {
      await result.current.handleToggle()
    })

    expect(toastMock.error).toHaveBeenCalledWith('Failed to toggle source')
  })

  it('reports discoverability failure via onError fallback', async () => {
    mockUpdate.mockRejectedValueOnce(new Error('Discover failed'))
    const dispatch = vi.fn<VitestLooseMock>()

    const { result } = renderHook(() => useSourceActions('topic-1', baseState, dispatch))

    await act(async () => {
      await result.current.handleToggleDiscoverability()
    })

    expect(toastMock.error).toHaveBeenCalledWith('Failed to update discoverability')
  })

  it('reports delete failure via onError fallback', async () => {
    mockDelete.mockRejectedValueOnce(new Error('Delete failed'))
    const dispatch = vi.fn<VitestLooseMock>()

    const { result } = renderHook(() => useSourceActions('topic-1', baseState, dispatch))

    await act(async () => {
      await result.current.handleDelete()
    })

    expect(toastMock.error).toHaveBeenCalledWith('Failed to delete source')
  })

  it('reports refresh failure via onError fallback', async () => {
    mockRefresh.mockRejectedValueOnce(new Error('Refresh failed'))
    const dispatch = vi.fn<VitestLooseMock>()

    const { result } = renderHook(() => useSourceActions('topic-1', baseState, dispatch))

    await act(async () => {
      await result.current.handleRefresh()
    })

    expect(toastMock.error).toHaveBeenCalledWith('Failed to refresh source')
  })

  it('emits onSuccess on a successful delete', async () => {
    mockDelete.mockResolvedValueOnce({} as never)
    const dispatch = vi.fn<VitestLooseMock>()

    const { result } = renderHook(() => useSourceActions('topic-1', baseState, dispatch))

    await act(async () => {
      await result.current.handleDelete()
    })

    expect(toastMock.success).toHaveBeenCalledWith('Source deleted')
  })

  it('emits onSuccess and refetches crawls and feed metadata on a successful refresh', async () => {
    mockRefresh.mockResolvedValueOnce({
      success: true,
      message: 'RSS feed refresh enqueued',
      rss_feed_id: 'feed-1',
      force: true,
    } as never)
    mockGetCrawls.mockResolvedValueOnce({ results: [{ id: 'crawl-1' }] } as never)
    mockFetchRssFeeds.mockResolvedValueOnce({ results: [rssFeed] } as never)
    const dispatch = vi.fn<VitestLooseMock>()

    const { result } = renderHook(() => useSourceActions('topic-1', baseState, dispatch))

    await act(async () => {
      await result.current.handleRefresh()
    })

    expect(toastMock.success).toHaveBeenCalledWith('RSS refresh enqueued')
    expect(mockFetchRssFeeds).toHaveBeenCalledWith('topic-1', { enabled: null, discoverable: null })
  })
})
