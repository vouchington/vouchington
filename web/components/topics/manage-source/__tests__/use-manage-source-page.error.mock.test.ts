import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getRssFeedCrawls } from '@/lib/api/client'
import { fetchRssFeeds, fetchTopic, updateTopic } from '@/lib/api/client/topics'
import {
  addAdditionalHostname,
  fetchAdditionalHostnames,
  removeAdditionalHostname,
} from '@/lib/api/client/topic-additional-hostnames'
import { useManageSourcePage } from '../use-manage-source-page'
import { initialManageSourceState } from '../manage-source-model'

vi.mock(import('@/lib/api/client'), () => ({
  deleteRssFeed: vi.fn<VitestLooseMock>(),
  getRssFeedCrawls: vi.fn<VitestLooseMock>(),
  refreshRssFeed: vi.fn<VitestLooseMock>(),
  updateRssFeed: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/topics'), () => ({
  fetchRssFeeds: vi.fn<VitestLooseMock>(),
  fetchTopic: vi.fn<VitestLooseMock>(),
  updateTopic: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/topic-additional-hostnames'), () => ({
  addAdditionalHostname: vi.fn<VitestLooseMock>(),
  fetchAdditionalHostnames: vi.fn<VitestLooseMock>(),
  removeAdditionalHostname: vi.fn<VitestLooseMock>(),
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

const mockUpdateTopic = vi.mocked(updateTopic)
const mockFetchRssFeeds = vi.mocked(fetchRssFeeds)
const mockFetchTopic = vi.mocked(fetchTopic)
const mockFetchAdditionalHostnames = vi.mocked(fetchAdditionalHostnames)
const mockGetRssFeedCrawls = vi.mocked(getRssFeedCrawls)
const mockAddHostname = vi.mocked(addAdditionalHostname)
const mockRemoveHostname = vi.mocked(removeAdditionalHostname)

const initialData = { ...initialManageSourceState, loading: false }

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

describe('useManageSourcePage error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reports primary-hostname submit failure via onError fallback', async () => {
    mockUpdateTopic.mockRejectedValueOnce(new Error('Domain failed'))

    const { result } = renderHook(() => useManageSourcePage('topic-1', initialData))

    await act(async () => {
      await result.current.handlers.handlePrimaryHostnameSubmit(
        makeFormEvent({ primary_hostname: 'example.com' }),
      )
    })

    expect(toastMock.error).toHaveBeenCalledWith('Failed to update primary domain')
  })

  it('loads source state when initial data is omitted', async () => {
    mockFetchRssFeeds.mockResolvedValueOnce({
      results: [
        {
          id: 'feed-1',
          title: 'Feed',
          rss_feed_url: { url: 'https://example.com/feed.xml' },
          home_page_url: null,
          is_enabled: true,
          is_discoverable: true,
          last_fetched_at: null,
          etag: null,
          last_modified_at: null,
        },
      ],
    } as never)
    mockFetchTopic.mockResolvedValueOnce({
      id: 'topic-1',
      name: 'Example Topic',
      hostname_id: 'hostname-1',
      hostname: { id: 'hostname-1', hostname: 'example.com' },
    } as never)
    mockFetchAdditionalHostnames.mockResolvedValueOnce({
      results: [],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    } as never)
    mockGetRssFeedCrawls.mockResolvedValueOnce({ results: [] } as never)

    const { result } = renderHook(() => useManageSourcePage('topic-1'))

    await waitFor(() => {
      expect(result.current.state.loading).toBe(false)
    })
    expect(result.current.state.topicName).toBe('Example Topic')
    expect(result.current.state.primaryHostname).toEqual({
      id: 'hostname-1',
      hostname: 'example.com',
    })
  })

  it('skips loading the seeded id but loads after the id changes', async () => {
    const { result, rerender } = renderHook(
      ({ id, seedData }: { id: string; seedData: typeof initialData | undefined }) =>
        useManageSourcePage(id, seedData),
      {
        initialProps: {
          id: 'topic-1',
          seedData: initialData as typeof initialData | undefined,
        },
      },
    )

    rerender({ id: 'topic-1', seedData: undefined })

    expect(mockFetchTopic).not.toHaveBeenCalled()
    expect(mockFetchRssFeeds).not.toHaveBeenCalled()
    expect(mockFetchAdditionalHostnames).not.toHaveBeenCalled()
    expect(mockGetRssFeedCrawls).not.toHaveBeenCalled()

    mockFetchTopic.mockResolvedValueOnce({ id: 'topic-2', name: 'Topic Two' } as never)
    mockFetchRssFeeds.mockResolvedValueOnce({ results: [] } as never)
    mockFetchAdditionalHostnames.mockResolvedValueOnce({
      results: [],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    } as never)
    rerender({ id: 'topic-2', seedData: undefined })

    await waitFor(() => expect(result.current.state.topicName).toBe('Topic Two'))

    mockFetchTopic.mockResolvedValueOnce({ id: 'topic-1', name: 'Reloaded Topic One' } as never)
    mockFetchRssFeeds.mockResolvedValueOnce({ results: [] } as never)
    mockFetchAdditionalHostnames.mockResolvedValueOnce({
      results: [],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    } as never)
    rerender({ id: 'topic-1', seedData: undefined })

    await waitFor(() => expect(result.current.state.topicName).toBe('Reloaded Topic One'))
    expect(mockFetchTopic).toHaveBeenNthCalledWith(2, 'topic-1')
  })

  it('reloads for a new id and ignores the stale prior load', async () => {
    let resolveFirstTopic!: (value: never) => void
    mockFetchTopic
      .mockReturnValueOnce(new Promise(resolve => (resolveFirstTopic = resolve)))
      .mockResolvedValueOnce({ id: 'topic-2', name: 'Topic Two', hostname_id: null } as never)
    mockFetchRssFeeds.mockResolvedValue({ results: [] } as never)
    mockFetchAdditionalHostnames.mockResolvedValue({
      results: [],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    } as never)

    const { result, rerender } = renderHook(({ id }: { id: string }) => useManageSourcePage(id), {
      initialProps: { id: 'topic-1' },
    })
    rerender({ id: 'topic-2' })

    await waitFor(() => expect(result.current.state.topicName).toBe('Topic Two'))
    await act(async () =>
      resolveFirstTopic({
        id: 'topic-1',
        name: 'Stale Topic One',
        hostname_id: null,
      } as never),
    )

    expect(mockFetchTopic).toHaveBeenNthCalledWith(1, 'topic-1')
    expect(mockFetchTopic).toHaveBeenNthCalledWith(2, 'topic-2')
    expect(result.current.state.topicName).toBe('Topic Two')
  })

  it('reports add-hostname failure via onError fallback', async () => {
    mockAddHostname.mockRejectedValueOnce(new Error('Add failed'))

    const { result } = renderHook(() => useManageSourcePage('topic-1', initialData))

    await act(async () => {
      await result.current.handlers.handleAddHostname(
        makeFormEvent({ new_hostname: 'sub.example.com' }),
      )
    })

    expect(toastMock.error).toHaveBeenCalledWith('Failed to add hostname')
  })

  it('emits validation toast when add-hostname submitted empty', async () => {
    const { result } = renderHook(() => useManageSourcePage('topic-1', initialData))

    await act(async () => {
      await result.current.handlers.handleAddHostname(makeFormEvent({ new_hostname: '' }))
    })

    expect(toastMock.error).toHaveBeenCalledWith('Hostname is required')
    expect(mockAddHostname).not.toHaveBeenCalled()
  })

  it('reports remove-hostname failure via onError fallback', async () => {
    mockRemoveHostname.mockRejectedValueOnce(new Error('Remove failed'))

    const { result } = renderHook(() => useManageSourcePage('topic-1', initialData))

    await act(async () => {
      await result.current.handlers.handleRemoveHostname('hostname-1', 'sub.example.com')
    })

    expect(toastMock.error).toHaveBeenCalledWith('Failed to remove hostname')
  })

  it('emits success after successful add-hostname', async () => {
    mockAddHostname.mockResolvedValueOnce({
      additional_hostname: { hostname_id: 'h-1', hostname: 'new.example.com' },
    } as never)

    const { result } = renderHook(() => useManageSourcePage('topic-1', initialData))

    await act(async () => {
      await result.current.handlers.handleAddHostname(
        makeFormEvent({ new_hostname: 'new.example.com' }),
      )
    })

    expect(toastMock.success).toHaveBeenCalledWith('Added new.example.com')
  })

  it('emits success after successful remove-hostname', async () => {
    mockRemoveHostname.mockResolvedValueOnce({} as never)

    const { result } = renderHook(() => useManageSourcePage('topic-1', initialData))

    await act(async () => {
      await result.current.handlers.handleRemoveHostname('hostname-1', 'old.example.com')
    })

    expect(toastMock.success).toHaveBeenCalledWith('Removed old.example.com')
  })
})
