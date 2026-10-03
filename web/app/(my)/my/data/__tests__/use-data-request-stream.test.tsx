import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataRequest } from '@/lib/api/client/users'
import {
  createJsonResponse,
  installDataRequestDoubles,
  MockEventSource,
  resetDataRequestDoubles,
} from '@/test-helpers/app/my/data-request-section.mock-support'
import { useDataRequestStream } from '../use-data-request-stream'

function request(id: string): DataRequest {
  return {
    id,
    status: 'pending',
    created_at: '2026-01-01T00:00:00.000Z',
    expires_at: null,
    download_url: null,
  }
}

function deferredResponse() {
  let resolve!: (response: Response) => void
  let reject!: (error: Error) => void
  const promise = new Promise<Response>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

describe('useDataRequestStream request lifetime', () => {
  beforeEach(() => installDataRequestDoubles())
  afterEach(() => resetDataRequestDoubles())

  it.each(['success', 'failure'])(
    'ignores an old status refresh %s after request change',
    async outcome => {
      const refresh = deferredResponse()
      const fetchMock = vi.fn<VitestLooseMock>().mockReturnValue(refresh.promise)
      vi.stubGlobal('fetch', fetchMock)
      const applyRequest = vi.fn<(value: DataRequest | null) => void>()
      const setError = vi.fn<(value: string | null) => void>()
      const { rerender } = renderHook(
        ({ current }) =>
          useDataRequestStream({ userId: 'user-1', request: current, applyRequest, setError }),
        { initialProps: { current: request('old-request') } },
      )
      const oldStream = MockEventSource.instances[0]!

      act(() =>
        oldStream.emit('status', { status: 'ready', download_url: 'https://example.test/old.zip' }),
      )
      expect(fetchMock).toHaveBeenCalledTimes(1)
      rerender({ current: request('new-request') })
      expect(oldStream.closed).toBe(true)
      expect(MockEventSource.instances[1]?.url).toContain('request_id=new-request')

      await act(async () => {
        if (outcome === 'success') {
          refresh.resolve(
            createJsonResponse(200, {
              ...request('old-request'),
              status: 'ready',
              download_url: 'https://example.test/old.zip',
            }),
          )
        } else {
          refresh.reject(new Error('old refresh failed'))
        }
        await refresh.promise.catch(() => undefined)
      })

      expect(applyRequest).not.toHaveBeenCalled()
      expect(setError).not.toHaveBeenCalled()
    },
  )

  it('ignores a status refresh that finishes after unmount', async () => {
    const refresh = deferredResponse()
    vi.stubGlobal('fetch', vi.fn<VitestLooseMock>().mockReturnValue(refresh.promise))
    const applyRequest = vi.fn<(value: DataRequest | null) => void>()
    const setError = vi.fn<(value: string | null) => void>()
    const { unmount } = renderHook(() =>
      useDataRequestStream({
        userId: 'user-1',
        request: request('old-request'),
        applyRequest,
        setError,
      }),
    )
    const stream = MockEventSource.instances[0]!

    act(() => stream.emit('status', { status: 'ready' }))
    unmount()
    expect(stream.closed).toBe(true)

    await act(async () => {
      refresh.resolve(createJsonResponse(200, { ...request('old-request'), status: 'ready' }))
      await refresh.promise
    })

    expect(applyRequest).not.toHaveBeenCalled()
    expect(setError).not.toHaveBeenCalled()
  })

  it('ignores a status refresh after changing user with the same request ID', async () => {
    const refresh = deferredResponse()
    vi.stubGlobal('fetch', vi.fn<VitestLooseMock>().mockReturnValue(refresh.promise))
    const applyRequest = vi.fn<(value: DataRequest | null) => void>()
    const setError = vi.fn<(value: string | null) => void>()
    const current = request('shared-request')
    const { rerender } = renderHook(
      ({ userId }) => useDataRequestStream({ userId, request: current, applyRequest, setError }),
      { initialProps: { userId: 'user-1' } },
    )

    act(() => MockEventSource.instances[0]!.emit('status', { status: 'ready' }))
    rerender({ userId: 'user-2' })
    expect(MockEventSource.instances[0]?.closed).toBe(true)
    expect(MockEventSource.instances[1]?.url).toContain('/users/user-2/')

    await act(async () => {
      refresh.resolve(createJsonResponse(200, { ...current, status: 'ready' }))
      await refresh.promise
    })

    expect(applyRequest).not.toHaveBeenCalled()
    expect(setError).not.toHaveBeenCalled()
  })

  it.each(['ready', 'forbidden'])(
    'ignores an old reconnect refresh returning %s after request change',
    async outcome => {
      const refresh = deferredResponse()
      const fetchMock = vi.fn<VitestLooseMock>().mockReturnValue(refresh.promise)
      vi.stubGlobal('fetch', fetchMock)
      const applyRequest = vi.fn<(value: DataRequest | null) => void>()
      const setError = vi.fn<(value: string | null) => void>()
      const { rerender } = renderHook(
        ({ current }) =>
          useDataRequestStream({ userId: 'user-1', request: current, applyRequest, setError }),
        { initialProps: { current: request('old-request') } },
      )
      const oldStream = MockEventSource.instances[0]!

      act(() => oldStream.emitConnectionError())
      expect(fetchMock).toHaveBeenCalledTimes(1)
      rerender({ current: request('new-request') })
      expect(oldStream.closed).toBe(true)
      expect(MockEventSource.instances[1]?.closed).toBe(false)

      await act(async () => {
        refresh.resolve(
          outcome === 'ready'
            ? createJsonResponse(200, { ...request('old-request'), status: 'ready' })
            : createJsonResponse(403, { error: 'Forbidden' }),
        )
        await refresh.promise
      })

      expect(applyRequest).not.toHaveBeenCalled()
      expect(setError).not.toHaveBeenCalled()
      expect(MockEventSource.instances[1]?.closed).toBe(false)
    },
  )

  it.each(['lagging', 'unavailable'])(
    'shows a failed export when the status event arrives but REST is %s',
    async outcome => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn<VitestLooseMock>()
          .mockResolvedValue(
            outcome === 'lagging'
              ? createJsonResponse(200, request('current'))
              : createJsonResponse(500, { error: 'Refresh unavailable' }),
          ),
      )
      const applyRequest = vi.fn<(value: DataRequest | null) => void>()
      const setError = vi.fn<(value: string | null) => void>()
      renderHook(() =>
        useDataRequestStream({
          userId: 'user-1',
          request: request('current'),
          applyRequest,
          setError,
        }),
      )

      await act(async () => MockEventSource.instances[0]!.emit('status', { status: 'failed' }))

      expect(applyRequest).toHaveBeenCalledWith({ ...request('current'), status: 'failed' })
      expect(setError).toHaveBeenCalledWith('Your data export failed. Please try again.')
    },
  )

  it.each(['success', 'failure'])(
    'ignores an old download-link retry %s after request change',
    async outcome => {
      const retry = deferredResponse()
      const fetchMock = vi
        .fn<VitestLooseMock>()
        .mockResolvedValueOnce(
          createJsonResponse(200, { ...request('old-request'), status: 'ready' }),
        )
        .mockReturnValueOnce(retry.promise)
      vi.stubGlobal('fetch', fetchMock)
      const applyRequest = vi.fn<(value: DataRequest | null) => void>()
      const setError = vi.fn<(value: string | null) => void>()
      const { rerender } = renderHook(
        ({ current }) =>
          useDataRequestStream({ userId: 'user-1', request: current, applyRequest, setError }),
        { initialProps: { current: request('old-request') } },
      )

      vi.useFakeTimers()
      await act(async () => {
        MockEventSource.instances[0]!.emit('status', { status: 'ready' })
      })
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(vi.getTimerCount()).toBe(1)
      await act(async () => vi.advanceTimersByTimeAsync(5000))
      expect(fetchMock).toHaveBeenCalledTimes(2)
      rerender({ current: request('new-request') })

      await act(async () => {
        if (outcome === 'success') {
          retry.resolve(
            createJsonResponse(200, {
              ...request('old-request'),
              status: 'ready',
              download_url: 'https://example.test/old.zip',
            }),
          )
        } else {
          retry.reject(new Error('old retry failed'))
        }
        await retry.promise.catch(() => undefined)
      })

      expect(applyRequest).not.toHaveBeenCalled()
      expect(setError).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)
    },
  )

  it('reports when an active ready export cannot fetch its download link', async () => {
    const fetchMock = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce(createJsonResponse(200, { ...request('current'), status: 'ready' }))
      .mockRejectedValue(new Error('link unavailable'))
    vi.stubGlobal('fetch', fetchMock)
    const applyRequest = vi.fn<(value: DataRequest | null) => void>()
    const setError = vi.fn<(value: string | null) => void>()
    renderHook(() =>
      useDataRequestStream({
        userId: 'user-1',
        request: request('current'),
        applyRequest,
        setError,
      }),
    )

    vi.useFakeTimers()
    await act(async () => MockEventSource.instances[0]!.emit('status', { status: 'ready' }))
    expect(setError).not.toHaveBeenCalled()
    await act(async () => vi.advanceTimersByTimeAsync(15_000))

    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(setError).toHaveBeenCalledWith(
      'Your export is ready but the download link could not be fetched. Please refresh.',
    )
    expect(applyRequest).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
