import {
  createFutureExpiresAt,
  createJsonResponse,
  installDataRequestDoubles,
  MockEventSource,
  mockOnSuccess,
  renderReadyWithoutDownloadLink,
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
  it('retries when REST refresh returns ready without a download link', async () => {
    const es = await renderReadyWithoutDownloadLink({
      refreshExpiresAt: createFutureExpiresAt(),
      requestId: 'request-pending-no-url',
      userId: 'user-sse-ready-no-url',
    })
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

  it('shows an expired export message and allows re-requesting', async () => {
    const fetchMock = vi.fn<VitestLooseMock>()
    vi.stubGlobal('fetch', fetchMock)

    fetchMock.mockResolvedValueOnce(
      createJsonResponse(200, {
        id: 'request-expired',
        status: 'expired',
        created_at: '2026-01-01T00:00:00.000Z',
        expires_at: '2026-01-02T00:00:00.000Z',
      }),
    )

    render(<DataRequestSection userId='user-expired' />)

    expect(
      await screen.findByText(
        'Your previous export expired. Request a new export to download your data.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Request Data Export' })).toBeInTheDocument()
  })

  it('requests a new export and reports success', async () => {
    const fetchMock = vi.fn<VitestLooseMock>()
    vi.stubGlobal('fetch', fetchMock)

    fetchMock.mockResolvedValueOnce(createJsonResponse(404, { error: 'No request' }))
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(201, {
        id: 'request-created',
        status: 'pending',
        created_at: '2026-01-03T00:00:00.000Z',
        expires_at: null,
      }),
    )

    render(<DataRequestSection userId='user-created' />)

    await screen.findByRole('button', { name: 'Request Data Export' })
    screen.getByRole('button', { name: 'Request Data Export' }).click()

    expect(
      await screen.findByText('Your export is being prepared. This may take a few minutes.'),
    ).toBeInTheDocument()
    expect(mockOnSuccess).toHaveBeenCalledWith('Data export requested')
    await waitFor(() => expect(MockEventSource.instances).toHaveLength(1))
  })

  it('keeps optimistic pending export when initial stream fallback returns 404', async () => {
    const fetchMock = vi.fn<VitestLooseMock>()
    vi.stubGlobal('fetch', fetchMock)

    fetchMock.mockResolvedValueOnce(createJsonResponse(404, { error: 'No request' }))
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(201, {
        id: 'request-created',
        status: 'pending',
        created_at: '2026-01-03T00:00:00.000Z',
        expires_at: null,
      }),
    )
    fetchMock.mockResolvedValueOnce(createJsonResponse(404, { error: 'No request' }))

    render(<DataRequestSection userId='user-created-replica-lag' />)

    await screen.findByRole('button', { name: 'Request Data Export' })
    screen.getByRole('button', { name: 'Request Data Export' }).click()

    await screen.findByText('Your export is being prepared. This may take a few minutes.')
    await waitFor(() => expect(MockEventSource.instances[0]).toBeDefined())
    const es = MockEventSource.instances[0]!
    await act(async () => {
      es.emitConnectionError()
    })

    expect(
      screen.getByText('Your export is being prepared. This may take a few minutes.'),
    ).toBeInTheDocument()
    expect(es.closed).toBe(false)
  })

  it('reconnects without closing when a named timeout error arrives and status is still pending', async () => {
    const fetchMock = vi.fn<VitestLooseMock>()
    vi.stubGlobal('fetch', fetchMock)

    fetchMock.mockResolvedValueOnce(
      createJsonResponse(200, {
        id: 'request-still-pending',
        status: 'pending',
        created_at: '2026-01-01T00:00:00.000Z',
        expires_at: null,
      }),
    )
    // Reconnect fetch triggered by the SSE timeout error: durable status is still non-terminal.
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(200, {
        id: 'request-still-pending',
        status: 'processing',
        created_at: '2026-01-01T00:00:00.000Z',
        expires_at: null,
      }),
    )

    render(<DataRequestSection userId='user-sse-timeout-pending' />)

    await screen.findByText('Your export is being prepared. This may take a few minutes.')
    await waitFor(() => expect(MockEventSource.instances[0]).toBeDefined())
    const es = MockEventSource.instances[0]!

    await act(async () => {
      es.emit('error', { error: 'Stream timed out' })
    })

    expect(
      screen.getByText('Your export is being prepared. This may take a few minutes.'),
    ).toBeInTheDocument()
    expect(es.closed).toBe(false)
  })

  it('closes and applies the terminal status when a named timeout error arrives after completion', async () => {
    const fetchMock = vi.fn<VitestLooseMock>()
    vi.stubGlobal('fetch', fetchMock)

    fetchMock.mockResolvedValueOnce(
      createJsonResponse(200, {
        id: 'request-completed-during-gap',
        status: 'pending',
        created_at: '2026-01-01T00:00:00.000Z',
        expires_at: null,
      }),
    )
    // Reconnect fetch triggered by the SSE timeout error: durable status turned terminal
    // while the stream was cycling.
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(200, {
        id: 'request-completed-during-gap',
        status: 'ready',
        created_at: '2026-01-01T00:00:00.000Z',
        expires_at: createFutureExpiresAt(),
        download_url: 'https://s3.example.com/export.zip',
      }),
    )

    render(<DataRequestSection userId='user-sse-timeout-terminal' />)

    await screen.findByText('Your export is being prepared. This may take a few minutes.')
    await waitFor(() => expect(MockEventSource.instances[0]).toBeDefined())
    const es = MockEventSource.instances[0]!

    await act(async () => {
      es.emit('error', { error: 'Stream timed out' })
    })

    expect(await screen.findByRole('link', { name: 'Download export' })).toBeInTheDocument()
    expect(es.closed).toBe(true)
  })
})
