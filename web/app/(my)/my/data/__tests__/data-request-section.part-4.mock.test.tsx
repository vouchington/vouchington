import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

import { act, render, screen, waitFor } from '@testing-library/react'

import { DataRequestSection } from '../data-request-section'

const { mockNow, mockOnError, mockOnSuccess } = vi.hoisted(() => ({
  mockNow: vi.fn<() => number | null>(() => Date.parse('2026-01-01T00:00:00.000Z')),
  mockOnError: vi.fn<VitestLooseMock>(),
  mockOnSuccess: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/hooks/use-now'), () => ({ useNow: mockNow }))

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
    mockNow.mockReturnValue(Date.parse('2026-01-01T00:00:00.000Z'))
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

  it('shows server message details when requesting an export fails', async () => {
    mockOnError.mockReturnValue('Export queue is paused')
    const fetchMock = vi.fn<VitestLooseMock>()
    vi.stubGlobal('fetch', fetchMock)

    fetchMock.mockResolvedValueOnce(createJsonResponse(404, { error: 'No request' }))
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(500, {
        message: 'Export queue is paused',
      }),
    )

    render(<DataRequestSection userId='user-request-message-error' />)

    await screen.findByRole('button', { name: 'Request Data Export' })
    screen.getByRole('button', { name: 'Request Data Export' }).click()

    expect(await screen.findByText('Export queue is paused')).toBeInTheDocument()
  })

  it('uses a neutral server snapshot before transitioning from valid to expired', async () => {
    mockNow.mockReturnValue(null)
    vi.stubGlobal(
      'fetch',
      vi.fn<VitestLooseMock>().mockResolvedValue(
        createJsonResponse(200, {
          id: 'request-expiry-transition',
          status: 'ready',
          created_at: '2026-01-01T00:00:00.000Z',
          expires_at: '2026-01-02T00:00:00.000Z',
          download_url: 'https://s3.example.com/export.zip',
        }),
      ),
    )

    const { rerender } = render(<DataRequestSection userId='user-expiry-transition' />)
    await screen.findByText('Loading…')
    expect(screen.queryByRole('link', { name: 'Download export' })).toBeNull()

    mockNow.mockReturnValue(Date.parse('2026-01-01T12:00:00.000Z'))
    rerender(<DataRequestSection userId='user-expiry-transition' />)
    expect(screen.getByRole('link', { name: 'Download export' })).toBeInTheDocument()

    mockNow.mockReturnValue(Date.parse('2026-01-02T00:00:00.000Z'))
    rerender(<DataRequestSection userId='user-expiry-transition' />)
    expect(screen.getByText(/Your previous export expired/)).toBeInTheDocument()
  })

  it('shows a refresh error and closes when the reconnect check itself fails non-retryably', async () => {
    const fetchMock = vi.fn<VitestLooseMock>()
    vi.stubGlobal('fetch', fetchMock)

    fetchMock.mockResolvedValueOnce(
      createJsonResponse(200, {
        id: 'request-refresh-forbidden',
        status: 'pending',
        created_at: '2026-01-01T00:00:00.000Z',
        expires_at: null,
      }),
    )
    // Reconnect fetch triggered by the SSE error: a non-retryable client error (not 429/5xx).
    fetchMock.mockResolvedValueOnce(createJsonResponse(403, { error: 'Forbidden' }))

    render(<DataRequestSection userId='user-sse-refresh-forbidden' />)

    await screen.findByText('Your export is being prepared. This may take a few minutes.')
    await waitFor(() => expect(MockEventSource.instances[0]).toBeDefined())
    const es = MockEventSource.instances[0]!

    await act(async () => {
      es.emit('error', { error: 'Stream timed out' })
    })

    expect(
      await screen.findByText('Failed to track export status. Please refresh.'),
    ).toBeInTheDocument()
    expect(es.closed).toBe(true)
  })

  it('keeps retrying when reconnect refresh returns ready without a download link', async () => {
    const fetchMock = vi.fn<VitestLooseMock>()
    vi.stubGlobal('fetch', fetchMock)

    fetchMock.mockResolvedValueOnce(
      createJsonResponse(200, {
        id: 'request-refresh-ready-no-url',
        status: 'pending',
        created_at: '2026-01-01T00:00:00.000Z',
        expires_at: null,
      }),
    )
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(200, {
        id: 'request-refresh-ready-no-url',
        status: 'ready',
        created_at: '2026-01-01T00:00:00.000Z',
        expires_at: null,
        download_url: null,
      }),
    )
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(200, {
        id: 'request-refresh-ready-no-url',
        status: 'ready',
        created_at: '2026-01-01T00:00:00.000Z',
        expires_at: '2027-01-01T00:00:00.000Z',
        download_url: 'https://s3.example.com/export.zip',
      }),
    )

    render(<DataRequestSection userId='user-sse-refresh-ready-no-url' />)

    await screen.findByText('Your export is being prepared. This may take a few minutes.')
    await waitFor(() => expect(MockEventSource.instances[0]).toBeDefined())
    vi.useFakeTimers()
    const es = MockEventSource.instances[0]!

    await act(async () => {
      es.emit('error', { error: 'Stream timed out' })
    })

    expect(
      screen.getByText('Your export is being prepared. This may take a few minutes.'),
    ).toBeInTheDocument()
    expect(es.closed).toBe(false)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })

    expect(screen.getByRole('link', { name: 'Download export' })).toBeInTheDocument()
  })
})
