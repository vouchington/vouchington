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

const pending: DataRequest = {
  id: 'export-1',
  status: 'pending',
  created_at: '2026-01-01T00:00:00.000Z',
  expires_at: null,
  download_url: null,
}

function renderStream() {
  const applyRequest = vi.fn<(value: DataRequest | null) => void>()
  const setError = vi.fn<(value: string | null) => void>()
  const hook = renderHook(
    ({ userId, request }) => useDataRequestStream({ userId, request, applyRequest, setError }),
    { initialProps: { userId: 'user-1', request: pending } },
  )
  return { ...hook, applyRequest, setError }
}

describe('data export stream authentication recovery', () => {
  beforeEach(() => installDataRequestDoubles())
  afterEach(() => resetDataRequestDoubles())

  it.each(['connecting', 'closed'] as const)(
    'replaces a %s stream only after the status probe succeeds',
    async state => {
      vi.stubGlobal(
        'fetch',
        vi.fn<VitestLooseMock>().mockResolvedValue(createJsonResponse(200, pending)),
      )
      const { applyRequest, setError } = renderStream()
      const original = MockEventSource.instances[0]!

      await act(async () => original.emitConnectionError(state))

      expect(MockEventSource.instances).toHaveLength(state === 'closed' ? 2 : 1)
      expect(original.closed).toBe(state === 'closed')
      expect(MockEventSource.instances[1]?.url).toBe(state === 'closed' ? original.url : undefined)
      expect(original.listeners.get('error')?.size).toBe(state === 'closed' ? 0 : 1)
      expect(applyRequest).not.toHaveBeenCalled()
      expect(setError).not.toHaveBeenCalled()
    },
  )

  it('does not loop on another closed stream until a successful open', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<VitestLooseMock>()
        .mockResolvedValueOnce(createJsonResponse(200, pending))
        .mockResolvedValueOnce(createJsonResponse(200, pending))
        .mockResolvedValueOnce(createJsonResponse(200, pending)),
    )
    renderStream()
    await act(async () => MockEventSource.instances[0]!.emitConnectionError('closed'))
    await act(async () => MockEventSource.instances[1]!.emitConnectionError('closed'))
    expect(MockEventSource.instances).toHaveLength(2)

    expect(MockEventSource.instances[1]!.listeners.get('open')?.size).toBe(1)
    act(() => MockEventSource.instances[1]!.emitOpen())
    await act(async () => MockEventSource.instances[1]!.emitConnectionError('closed'))
    expect(MockEventSource.instances).toHaveLength(3)
  })

  it.each([429, 503])(
    'recovers a closed stream after a transient %i status probe',
    async status => {
      const fetchMock = vi
        .fn<VitestLooseMock>()
        .mockResolvedValueOnce(createJsonResponse(status, { error: 'Temporarily unavailable' }))
        .mockResolvedValueOnce(createJsonResponse(200, pending))
      vi.stubGlobal('fetch', fetchMock)
      vi.useFakeTimers()
      const { setError } = renderStream()

      await act(async () => MockEventSource.instances[0]!.emitConnectionError('closed'))
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(MockEventSource.instances).toHaveLength(1)

      await act(async () => vi.advanceTimersByTimeAsync(1_000))
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(MockEventSource.instances).toHaveLength(2)
      expect(setError).not.toHaveBeenCalled()
    },
  )

  it('keeps native reconnecting and does not schedule a probe retry for CONNECTING', async () => {
    const fetchMock = vi
      .fn<VitestLooseMock>()
      .mockResolvedValue(createJsonResponse(503, { error: 'Temporarily unavailable' }))
    vi.stubGlobal('fetch', fetchMock)
    vi.useFakeTimers()
    renderStream()

    await act(async () => MockEventSource.instances[0]!.emitConnectionError('connecting'))
    await act(async () => vi.advanceTimersByTimeAsync(3_000))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(MockEventSource.instances).toHaveLength(1)
    expect(MockEventSource.instances[0]!.closed).toBe(false)
  })

  it('stops after two failed closed-stream retries and shows a tracking error', async () => {
    const fetchMock = vi
      .fn<VitestLooseMock>()
      .mockResolvedValue(createJsonResponse(503, { error: 'Temporarily unavailable' }))
    vi.stubGlobal('fetch', fetchMock)
    vi.useFakeTimers()
    const { setError } = renderStream()

    await act(async () => MockEventSource.instances[0]!.emitConnectionError('closed'))
    await act(async () => vi.advanceTimersByTimeAsync(2_000))
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(setError).toHaveBeenCalledWith('Failed to track export status. Please refresh.')
    expect(MockEventSource.instances[0]!.closed).toBe(true)
    await act(async () => vi.advanceTimersByTimeAsync(3_000))
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('cancels a closed-stream retry when the request changes', async () => {
    const fetchMock = vi
      .fn<VitestLooseMock>()
      .mockResolvedValue(createJsonResponse(503, { error: 'Temporarily unavailable' }))
    vi.stubGlobal('fetch', fetchMock)
    vi.useFakeTimers()
    const { rerender } = renderStream()

    await act(async () => MockEventSource.instances[0]!.emitConnectionError('closed'))
    rerender({ userId: 'user-2', request: pending })
    await act(async () => vi.advanceTimersByTimeAsync(2_000))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(MockEventSource.instances[0]!.closed).toBe(true)
    expect(MockEventSource.instances).toHaveLength(2)
  })

  it('cancels a network-failure retry on unmount', async () => {
    const fetchMock = vi
      .fn<VitestLooseMock>()
      .mockRejectedValue(new TypeError('Network unavailable'))
    vi.stubGlobal('fetch', fetchMock)
    vi.useFakeTimers()
    const { unmount, setError } = renderStream()

    await act(async () => MockEventSource.instances[0]!.emitConnectionError('closed'))
    unmount()
    await act(async () => vi.advanceTimersByTimeAsync(2_000))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(setError).not.toHaveBeenCalled()
  })

  it('does not retry an unexpected status-probe error', async () => {
    const fetchMock = vi
      .fn<VitestLooseMock>()
      .mockRejectedValue(new Error('Invalid response shape'))
    vi.stubGlobal('fetch', fetchMock)
    vi.useFakeTimers()
    const { setError } = renderStream()

    await act(async () => MockEventSource.instances[0]!.emitConnectionError('closed'))
    await act(async () => vi.advanceTimersByTimeAsync(2_000))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(setError).toHaveBeenCalledWith('Failed to track export status. Please refresh.')
  })

  it('does not reopen an old identity after a delayed status probe', async () => {
    let finishProbe!: (response: Response) => void
    vi.stubGlobal(
      'fetch',
      vi.fn<VitestLooseMock>().mockImplementation(
        () =>
          new Promise<Response>(resolve => {
            finishProbe = resolve
          }),
      ),
    )
    const { rerender, unmount } = renderStream()
    const original = MockEventSource.instances[0]!
    act(() => original.emitConnectionError('closed'))
    rerender({ userId: 'user-2', request: pending })
    expect(original.closed).toBe(true)
    await act(async () => finishProbe(createJsonResponse(200, pending)))
    expect(MockEventSource.instances).toHaveLength(2)
    unmount()
    expect(MockEventSource.instances[1]?.closed).toBe(true)
  })
})
