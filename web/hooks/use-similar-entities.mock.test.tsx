import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSimilarEntities } from './use-similar-entities'

const { onErrorMock } = vi.hoisted(() => ({ onErrorMock: vi.fn<VitestLooseMock>() }))

vi.mock(import('@/lib/on-error'), () => ({ default: onErrorMock }))

describe('useSimilarEntities', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns data after debounce fires', async () => {
    const expected = { results: [] }
    const fetcher = vi.fn<() => Promise<typeof expected>>().mockResolvedValue(expected)

    const { result } = renderHook(() =>
      useSimilarEntities({
        query: 'developer tools',
        fetcher,
      }),
    )

    // Not loading yet — debounce has not fired
    expect(result.current.isLoading).toBe(true)
    expect(result.current.data).toBeNull()
    expect(fetcher).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })

    expect(fetcher).toHaveBeenCalledOnce()
    expect(result.current.data).toEqual(expected)
    expect(result.current.isLoading).toBe(false)
  })

  it('debounces: does not fetch until after debounce window', async () => {
    const fetcher = vi.fn<() => Promise<{ results: [] }>>().mockResolvedValue({ results: [] })

    const { rerender } = renderHook(
      ({ query }: { query: string }) => useSimilarEntities({ query, debounceMs: 400, fetcher }),
      { initialProps: { query: 'dev' } },
    )

    // Advance halfway — no fetch yet
    await act(async () => {
      vi.advanceTimersByTime(200)
    })
    expect(fetcher).not.toHaveBeenCalled()

    // Change query before debounce fires — resets timer
    rerender({ query: 'developer' })

    await act(async () => {
      vi.advanceTimersByTime(200)
    })
    expect(fetcher).not.toHaveBeenCalled()

    // Full debounce from the last change — use async to also flush the promise
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('aborts in-flight request when query changes before result arrives', async () => {
    let capturedSignal: AbortSignal | null = null
    const fetcher = vi.fn<(q: string, signal: AbortSignal) => Promise<{ results: [] }>>(
      (_q, signal) => {
        capturedSignal = signal
        return Promise.resolve({ results: [] })
      },
    )

    const { rerender } = renderHook(
      ({ query }: { query: string }) => useSimilarEntities({ query, debounceMs: 400, fetcher }),
      { initialProps: { query: 'dev' } },
    )

    // First debounce fires and fetch starts
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })

    expect(capturedSignal).not.toBeNull()
    expect(capturedSignal!.aborted).toBe(false)

    // Change query — first controller should be aborted
    rerender({ query: 'developer tools' })

    expect(capturedSignal!.aborted).toBe(true)
  })

  it('skips fetch when enabled=false', async () => {
    const fetcher = vi.fn<() => Promise<{ results: [] }>>().mockResolvedValue({ results: [] })

    const { result } = renderHook(() =>
      useSimilarEntities({ query: 'developer tools', enabled: false, fetcher }),
    )

    await act(async () => {
      vi.advanceTimersByTime(400)
    })

    expect(fetcher).not.toHaveBeenCalled()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.data).toBeNull()
  })

  it('skips fetch when query is below minLength', async () => {
    const fetcher = vi.fn<() => Promise<{ results: [] }>>().mockResolvedValue({ results: [] })

    const { result } = renderHook(() => useSimilarEntities({ query: 'hi', minLength: 3, fetcher }))

    await act(async () => {
      vi.advanceTimersByTime(400)
    })

    expect(fetcher).not.toHaveBeenCalled()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.data).toBeNull()
  })

  it('calls onError and clears loading when fetcher rejects', async () => {
    const error = new Error('network error')
    const fetcher = vi.fn<() => Promise<never>>().mockRejectedValue(error)

    const { result } = renderHook(() => useSimilarEntities({ query: 'developer tools', fetcher }))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })

    expect(onErrorMock).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ fallback: expect.any(String) }),
    )
    expect(result.current.isLoading).toBe(false)
    expect(result.current.data).toBeNull()
  })

  it('uses the latest fetcher without restarting the debounce timer', async () => {
    const firstFetcher = vi.fn<() => Promise<string>>().mockResolvedValue('first')
    const latestFetcher = vi.fn<() => Promise<string>>().mockResolvedValue('latest')
    const { result, rerender } = renderHook(
      ({ fetcher }: { fetcher: (q: string, signal: AbortSignal) => Promise<string> }) =>
        useSimilarEntities({ query: 'developer', fetcher }),
      { initialProps: { fetcher: firstFetcher } },
    )

    await act(async () => vi.advanceTimersByTimeAsync(200))
    rerender({ fetcher: latestFetcher })
    await act(async () => vi.advanceTimersByTimeAsync(200))

    expect(firstFetcher).not.toHaveBeenCalled()
    expect(latestFetcher).toHaveBeenCalledOnce()
    expect(result.current.data).toBe('latest')
  })

  it('does not expose results from a previous query while the next query is debouncing', async () => {
    const fetcher = vi.fn<(q: string) => Promise<string>>(q => Promise.resolve(q))
    const { result, rerender } = renderHook(
      ({ query }: { query: string }) => useSimilarEntities({ query, fetcher }),
      { initialProps: { query: 'first query' } },
    )
    await act(async () => vi.advanceTimersByTimeAsync(400))
    expect(result.current.data).toBe('first query')

    rerender({ query: 'second query' })

    expect(result.current.data).toBeNull()
    expect(result.current.isLoading).toBe(true)
  })
})
