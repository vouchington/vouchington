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
  default: vi.fn<VitestLooseMock>(),
  onSuccess: vi.fn<VitestLooseMock>(),
}))

// Keep referenced so the mocked module shape matches production even though this file
// doesn't exercise updateTopic/add/remove-hostname paths directly.
void updateTopic
void addAdditionalHostname
void removeAdditionalHostname

const mockFetchRssFeeds = vi.mocked(fetchRssFeeds)
const mockFetchTopic = vi.mocked(fetchTopic)
const mockFetchAdditionalHostnames = vi.mocked(fetchAdditionalHostnames)
const mockGetRssFeedCrawls = vi.mocked(getRssFeedCrawls)

const initialData = { ...initialManageSourceState, loading: false }
const CREATED_AT = '2026-01-01T00:00:00.000Z'

function hostname(hostnameId: string, host: string, topicId = 'topic-1') {
  return { hostname_id: hostnameId, hostname: host, topic_id: topicId, created_at: CREATED_AT }
}

function pageInfo(hasNextPage: boolean, endCursor: string | null = null) {
  return { has_next_page: hasNextPage, end_cursor: endCursor, start_cursor: null }
}

describe('useManageSourcePage additional-hostnames pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads and appends the next page of additional hostnames', async () => {
    const seeded = {
      ...initialData,
      additionalHostnames: [hostname('h-1', 'first.example.com')],
      additionalHostnamesPageInfo: { has_next_page: true, end_cursor: 'cursor-1' },
    }
    mockFetchAdditionalHostnames.mockResolvedValueOnce({
      results: [hostname('h-2', 'second.example.com')],
      page_info: pageInfo(false),
    } as never)

    const { result } = renderHook(() =>
      useManageSourcePage('topic-1', seeded as typeof initialData),
    )

    await act(async () => {
      await result.current.handlers.handleLoadMoreHostnames()
    })

    expect(mockFetchAdditionalHostnames).toHaveBeenCalledWith('topic-1', { after: 'cursor-1' })
    expect(result.current.state.additionalHostnames).toEqual([
      hostname('h-1', 'first.example.com'),
      hostname('h-2', 'second.example.com'),
    ])
    // The reducer narrows to only has_next_page/end_cursor -- start_cursor is intentionally dropped.
    expect(result.current.state.additionalHostnamesPageInfo).toEqual({
      has_next_page: false,
      end_cursor: null,
    })
    expect(result.current.state.loadingMoreHostnames).toBe(false)
  })

  it('dedupes an overlapping hostname returned by the next page', async () => {
    const seeded = {
      ...initialData,
      additionalHostnames: [hostname('h-1', 'first.example.com')],
      additionalHostnamesPageInfo: { has_next_page: true, end_cursor: 'cursor-1' },
    }
    mockFetchAdditionalHostnames.mockResolvedValueOnce({
      results: [hostname('h-1', 'first.example.com')],
      page_info: pageInfo(false),
    } as never)

    const { result } = renderHook(() =>
      useManageSourcePage('topic-1', seeded as typeof initialData),
    )

    await act(async () => {
      await result.current.handlers.handleLoadMoreHostnames()
    })

    expect(result.current.state.additionalHostnames).toEqual([hostname('h-1', 'first.example.com')])
  })

  it('sets hostnamesFetchError when loading more hostnames fails', async () => {
    const seeded = {
      ...initialData,
      additionalHostnames: [hostname('h-1', 'first.example.com')],
      additionalHostnamesPageInfo: { has_next_page: true, end_cursor: 'cursor-1' },
    }
    const loadMoreError = new Error('Load more failed')
    mockFetchAdditionalHostnames.mockRejectedValueOnce(loadMoreError)

    const { result } = renderHook(() =>
      useManageSourcePage('topic-1', seeded as typeof initialData),
    )

    await act(async () => {
      await result.current.handlers.handleLoadMoreHostnames()
    })

    // The thrown Error instance is passed through unchanged (not re-wrapped or re-worded).
    expect(result.current.state.hostnamesFetchError).toBe(loadMoreError)
    expect(result.current.state.loadingMoreHostnames).toBe(false)
    // Existing hostnames are preserved on failure
    expect(result.current.state.additionalHostnames).toEqual([hostname('h-1', 'first.example.com')])
  })

  it('clears hostnamesFetchError via handleClearHostnamesError', async () => {
    const seeded = { ...initialData, hostnamesFetchError: new Error('Load more failed') }

    const { result } = renderHook(() =>
      useManageSourcePage('topic-1', seeded as typeof initialData),
    )

    act(() => {
      result.current.handlers.handleClearHostnamesError()
    })

    expect(result.current.state.hostnamesFetchError).toBeNull()
  })

  it('is a no-op when there is no next page or end cursor', async () => {
    const { result } = renderHook(() => useManageSourcePage('topic-1', initialData))

    await act(async () => {
      await result.current.handlers.handleLoadMoreHostnames()
    })

    expect(mockFetchAdditionalHostnames).not.toHaveBeenCalled()
  })

  it('ignores a stale load-more response after the id changes mid-flight', async () => {
    const seeded = {
      ...initialData,
      additionalHostnames: [hostname('h-1', 'first.example.com')],
      additionalHostnamesPageInfo: { has_next_page: true, end_cursor: 'cursor-1' },
    }

    let resolveLoadMore!: (value: never) => void
    mockFetchAdditionalHostnames.mockReturnValueOnce(
      new Promise(resolve => (resolveLoadMore = resolve)),
    )
    mockFetchTopic.mockResolvedValueOnce({
      id: 'topic-2',
      name: 'Topic Two',
      hostname_id: null,
    } as never)
    mockFetchRssFeeds.mockResolvedValueOnce({ results: [] } as never)
    mockFetchAdditionalHostnames.mockResolvedValueOnce({
      results: [hostname('h-9', 'topic-two.example.com', 'topic-2')],
      page_info: pageInfo(false),
    } as never)
    mockGetRssFeedCrawls.mockResolvedValue({ results: [] } as never)

    const { result, rerender } = renderHook(
      ({ id, seedData }: { id: string; seedData: typeof initialData | undefined }) =>
        useManageSourcePage(id, seedData),
      { initialProps: { id: 'topic-1', seedData: seeded as typeof initialData | undefined } },
    )

    act(() => {
      void result.current.handlers.handleLoadMoreHostnames()
    })

    rerender({ id: 'topic-2', seedData: undefined })
    await waitFor(() => expect(result.current.state.topicName).toBe('Topic Two'))

    await act(async () =>
      resolveLoadMore({
        results: [hostname('h-2', 'second.example.com')],
        page_info: pageInfo(false),
      } as never),
    )

    // The stale topic-1 load-more response must not leak into topic-2's state.
    expect(result.current.state.additionalHostnames).toEqual([
      hostname('h-9', 'topic-two.example.com', 'topic-2'),
    ])
    expect(result.current.state.loadingMoreHostnames).toBe(false)
  })

  it('drops a stale load-more rejection after the id changes mid-flight', async () => {
    const seeded = {
      ...initialData,
      additionalHostnames: [hostname('h-1', 'first.example.com')],
      additionalHostnamesPageInfo: { has_next_page: true, end_cursor: 'cursor-1' },
    }

    let rejectLoadMore!: (reason: unknown) => void
    mockFetchAdditionalHostnames.mockReturnValueOnce(
      new Promise((_resolve, reject) => (rejectLoadMore = reject)),
    )
    mockFetchTopic.mockResolvedValueOnce({
      id: 'topic-2',
      name: 'Topic Two',
      hostname_id: null,
    } as never)
    mockFetchRssFeeds.mockResolvedValueOnce({ results: [] } as never)
    mockFetchAdditionalHostnames.mockResolvedValueOnce({
      results: [hostname('h-9', 'topic-two.example.com', 'topic-2')],
      page_info: pageInfo(false),
    } as never)
    mockGetRssFeedCrawls.mockResolvedValue({ results: [] } as never)

    const { result, rerender } = renderHook(
      ({ id, seedData }: { id: string; seedData: typeof initialData | undefined }) =>
        useManageSourcePage(id, seedData),
      { initialProps: { id: 'topic-1', seedData: seeded as typeof initialData | undefined } },
    )

    act(() => {
      void result.current.handlers.handleLoadMoreHostnames()
    })

    rerender({ id: 'topic-2', seedData: undefined })
    await waitFor(() => expect(result.current.state.topicName).toBe('Topic Two'))

    await act(async () => rejectLoadMore(new Error('stale failure')))

    // The stale topic-1 rejection must not surface as topic-2's fetch error.
    expect(result.current.state.hostnamesFetchError).toBeNull()
    expect(result.current.state.additionalHostnames).toEqual([
      hostname('h-9', 'topic-two.example.com', 'topic-2'),
    ])
    expect(result.current.state.loadingMoreHostnames).toBe(false)
  })
})
