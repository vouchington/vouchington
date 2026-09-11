import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

import { act, render, screen, waitFor } from '@testing-library/react'

import { DataRequestSection } from '../data-request-section'

const { mockOnError, mockOnSuccess } = vi.hoisted(() => ({
  mockOnError: vi.fn<VitestLooseMock>(),
  mockOnSuccess: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/on-error'), () => ({
  default: mockOnError,
  onSuccess: mockOnSuccess,
}))

const createJsonResponse = (status: number, data: unknown): Response => {
  return Response.json(data, { status })
}

// Minimal EventSource stub. When the request is pending/processing, use-data-request
// opens an SSE stream — the stub prevents "EventSource is not defined" in jsdom.
type ESListener = (event: MessageEvent) => void

class MockEventSource {
  static instances: MockEventSource[] = []
  readonly url: string
  readonly listeners = new Map<string, Set<ESListener>>()
  closed = false

  constructor(url: string) {
    this.url = url
    MockEventSource.instances.push(this)
  }

  addEventListener(type: string, fn: ESListener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(fn)
  }

  removeEventListener(type: string, fn: ESListener) {
    this.listeners.get(type)?.delete(fn)
  }

  close() {
    this.closed = true
  }

  emit(type: string, data: unknown) {
    const event = new MessageEvent(type, { data: JSON.stringify(data) })
    this.listeners.get(type)?.forEach(fn => fn(event))
  }

  emitConnectionError() {
    const event = new MessageEvent('error', { data: undefined })
    this.listeners.get('error')?.forEach(fn => fn(event))
  }
}

const originalEventSource = globalThis.EventSource

describe('DataRequestSection', () => {
  beforeEach(() => {
    MockEventSource.instances = []
    Object.defineProperty(globalThis, 'EventSource', {
      configurable: true,
      value: MockEventSource,
      writable: true,
    })
  })

  afterEach(() => {
    Object.defineProperty(globalThis, 'EventSource', {
      configurable: true,
      value: originalEventSource,
      writable: true,
    })
    vi.restoreAllMocks()
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('retries when REST refresh returns ready without a download link', async () => {
    const fetchMock = vi.fn<VitestLooseMock>()
    vi.stubGlobal('fetch', fetchMock)

    fetchMock.mockResolvedValueOnce(
      createJsonResponse(200, {
        id: 'request-pending-no-url',
        status: 'pending',
        created_at: '2026-01-01T00:00:00.000Z',
        expires_at: null,
      }),
    )
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(200, {
        id: 'request-pending-no-url',
        status: 'ready',
        created_at: '2026-01-01T00:00:00.000Z',
        expires_at: '2027-01-01T00:00:00.000Z',
        download_url: null,
      }),
    )
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(200, {
        id: 'request-pending-no-url',
        status: 'ready',
        created_at: '2026-01-01T00:00:00.000Z',
        expires_at: '2027-01-01T00:00:00.000Z',
        download_url: 'https://s3.example.com/export.zip',
      }),
    )

    render(<DataRequestSection userId='user-sse-ready-no-url' />)

    await screen.findByText('Your export is being prepared. This may take a few minutes.')
    await waitFor(() => expect(MockEventSource.instances[0]).toBeDefined())
    vi.useFakeTimers()

    const es = MockEventSource.instances[0]!
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
        expires_at: '2027-01-01T00:00:00.000Z',
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
