import {
  createFutureExpiresAt,
  createJsonResponse,
  installDataRequestDoubles,
  MockEventSource,
  resetDataRequestDoubles,
} from '@/test-helpers/app/my/data-request-section.mock-support'

import { act, render, screen, waitFor } from '@testing-library/react'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DataRequestSection } from '../data-request-section'

describe('DataRequestSection', () => {
  beforeEach(() => {
    installDataRequestDoubles()
  })

  afterEach(() => {
    resetDataRequestDoubles()
  })
  it('starts the mount status fetch without queueMicrotask deferral', () => {
    const fetchMock = vi.fn<VitestLooseMock>().mockReturnValue(new Promise(() => {}))
    vi.stubGlobal('fetch', fetchMock)
    const queueMicrotaskSpy = vi.spyOn(globalThis, 'queueMicrotask')

    render(<DataRequestSection userId='user-immediate' />)

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/users/user-immediate/data-request')
    expect(queueMicrotaskSpy).not.toHaveBeenCalled()
  })

  it('clears stale failed error when a later fetch returns non-failed status', async () => {
    const fetchMock = vi.fn<VitestLooseMock>()
    vi.stubGlobal('fetch', fetchMock)

    fetchMock.mockResolvedValueOnce(
      createJsonResponse(200, {
        id: 'request-failed',
        status: 'failed',
        created_at: '2026-01-01T00:00:00.000Z',
        expires_at: null,
      }),
    )

    fetchMock.mockResolvedValueOnce(
      createJsonResponse(200, {
        id: 'request-ready',
        status: 'ready',
        created_at: '2026-01-02T00:00:00.000Z',
        expires_at: createFutureExpiresAt(),
        download_url: 'https://s3.example.com/export.zip?X-Amz-Signature=abc',
      }),
    )

    const { rerender } = render(<DataRequestSection userId='user-1' />)

    expect(
      await screen.findByText('Your data export failed. Please try again.'),
    ).toBeInTheDocument()
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/v1/users/user-1/data-request')

    rerender(<DataRequestSection userId='user-2' />)

    await screen.findByRole('link', { name: 'Download export' })
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/v1/users/user-2/data-request')

    await waitFor(() => {
      expect(screen.queryByText('Your data export failed. Please try again.')).toBeNull()
    })
  })

  it('opens an SSE stream when request is pending and closes it on unmount', async () => {
    const fetchMock = vi.fn<VitestLooseMock>()
    vi.stubGlobal('fetch', fetchMock)

    fetchMock.mockResolvedValueOnce(
      createJsonResponse(200, {
        id: 'request-pending',
        status: 'pending',
        created_at: '2026-01-01T00:00:00.000Z',
        expires_at: null,
      }),
    )
    // Second fetch triggered by the SSE status event resolves to completed.
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(200, {
        id: 'request-pending',
        status: 'ready',
        created_at: '2026-01-01T00:00:00.000Z',
        expires_at: createFutureExpiresAt(),
        download_url: 'https://s3.example.com/export.zip',
      }),
    )

    const { unmount } = render(<DataRequestSection userId='user-sse-pending' />)

    await screen.findByText('Your export is being prepared. This may take a few minutes.')
    await waitFor(() => expect(MockEventSource.instances[0]).toBeDefined())

    const es = MockEventSource.instances[0]!
    expect(es).toBeDefined()
    expect(es.url).toContain('request_id=request-pending')
    expect(es.closed).toBe(false)

    // Emit a status event; the hook fetches fresh data and updates UI.
    await act(async () => {
      es.emit('status', { status: 'ready', download_url: 'https://s3.example.com/export.zip' })
    })

    await screen.findByRole('link', { name: 'Download export' })

    unmount()
    expect(es.closed).toBe(true)
  })

  it('retries fetching a download link when SSE reports ready without a URL', async () => {
    const fetchMock = vi.fn<VitestLooseMock>()
    vi.stubGlobal('fetch', fetchMock)

    fetchMock.mockResolvedValueOnce(
      createJsonResponse(200, {
        id: 'request-pending-rest-fail',
        status: 'pending',
        created_at: '2026-01-01T00:00:00.000Z',
        expires_at: null,
      }),
    )
    // REST refresh after SSE status event fails
    fetchMock.mockRejectedValueOnce(new Error('network error'))
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(200, {
        id: 'request-pending-rest-fail',
        status: 'ready',
        created_at: '2026-01-01T00:00:00.000Z',
        expires_at: createFutureExpiresAt(),
        download_url: 'https://s3.example.com/export.zip',
      }),
    )

    render(<DataRequestSection userId='user-sse-rest-fail' />)

    await screen.findByText('Your export is being prepared. This may take a few minutes.')
    await waitFor(() => expect(MockEventSource.instances[0]).toBeDefined())
    vi.useFakeTimers()

    const es = MockEventSource.instances[0]!
    // Emit a ready event with no download_url in the SSE payload
    await act(async () => {
      es.emit('status', { status: 'ready' })
    })

    expect(
      screen.getByText('Your export is being prepared. This may take a few minutes.'),
    ).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })

    expect(screen.getByRole('link', { name: 'Download export' })).toBeInTheDocument()
  })
})
