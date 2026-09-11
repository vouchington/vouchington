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

  it('keeps processing and retries the download link when REST refresh is stale processing', async () => {
    const fetchMock = vi.fn<VitestLooseMock>()
    vi.stubGlobal('fetch', fetchMock)

    fetchMock.mockResolvedValueOnce(
      createJsonResponse(200, {
        id: 'request-terminal-stale-rest',
        status: 'processing',
        created_at: '2026-01-01T00:00:00.000Z',
        expires_at: null,
      }),
    )
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(200, {
        id: 'request-terminal-stale-rest',
        status: 'processing',
        created_at: '2026-01-01T00:00:00.000Z',
        expires_at: null,
      }),
    )
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(200, {
        id: 'request-terminal-stale-rest',
        status: 'ready',
        created_at: '2026-01-01T00:00:00.000Z',
        expires_at: '2027-01-01T00:00:00.000Z',
        download_url: 'https://s3.example.com/export.zip',
      }),
    )

    render(<DataRequestSection userId='user-terminal-stale-rest' />)

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

  it('reports API error payloads returned from export request responses', async () => {
    mockOnError.mockReturnValue('Export is disabled')
    const fetchMock = vi.fn<VitestLooseMock>()
    vi.stubGlobal('fetch', fetchMock)

    fetchMock.mockResolvedValueOnce(createJsonResponse(404, { error: 'No request' }))
    fetchMock.mockResolvedValueOnce(createJsonResponse(200, { error: 'Export is disabled' }))

    render(<DataRequestSection userId='user-disabled' />)

    await screen.findByRole('button', { name: 'Request Data Export' })
    screen.getByRole('button', { name: 'Request Data Export' }).click()

    expect(await screen.findByText('Export is disabled')).toBeInTheDocument()
    expect(mockOnError).toHaveBeenCalledWith(expect.any(Error), {
      fallback: 'Export is disabled',
      tags: { form: 'my-data-export' },
      skipSentry: true,
    })
  })

  it('uses conflict response bodies as the current export state', async () => {
    const fetchMock = vi.fn<VitestLooseMock>()
    vi.stubGlobal('fetch', fetchMock)

    fetchMock.mockResolvedValueOnce(createJsonResponse(404, { error: 'No request' }))
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(409, {
        id: 'request-conflict',
        status: 'pending',
        created_at: '2026-01-03T00:00:00.000Z',
        expires_at: null,
      }),
    )

    render(<DataRequestSection userId='user-conflict-body' />)

    await screen.findByRole('button', { name: 'Request Data Export' })
    screen.getByRole('button', { name: 'Request Data Export' }).click()

    expect(
      await screen.findByText('Your export is being prepared. This may take a few minutes.'),
    ).toBeInTheDocument()
    await waitFor(() => expect(MockEventSource.instances).toHaveLength(1))
    expect(mockOnSuccess).toHaveBeenCalledWith('Data export request already in progress')
  })

  it('refreshes status after POST 409 with only an error message', async () => {
    const fetchMock = vi.fn<VitestLooseMock>()
    vi.stubGlobal('fetch', fetchMock)

    fetchMock.mockResolvedValueOnce(createJsonResponse(404, { error: 'No request' }))
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(409, {
        error: 'A data export is already in progress',
      }),
    )
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(200, {
        id: 'request-conflict-followup',
        status: 'pending',
        created_at: '2026-01-03T00:00:00.000Z',
        expires_at: null,
      }),
    )

    render(<DataRequestSection userId='user-conflict-no-body' />)

    await screen.findByRole('button', { name: 'Request Data Export' })
    screen.getByRole('button', { name: 'Request Data Export' }).click()

    expect(
      await screen.findByText('Your export is being prepared. This may take a few minutes.'),
    ).toBeInTheDocument()
    expect(mockOnSuccess).toHaveBeenCalledWith('Data export request already in progress')
    await waitFor(() => expect(MockEventSource.instances).toHaveLength(1))
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/v1/users/user-conflict-no-body/data-request')
  })

  it('shows server error details when requesting an export fails', async () => {
    mockOnError.mockReturnValue('Data export service is unavailable')
    const fetchMock = vi.fn<VitestLooseMock>()
    vi.stubGlobal('fetch', fetchMock)

    fetchMock.mockResolvedValueOnce(createJsonResponse(404, { error: 'No request' }))
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(500, {
        error: 'Data export service is unavailable',
      }),
    )

    render(<DataRequestSection userId='user-request-error' />)

    await screen.findByRole('button', { name: 'Request Data Export' })
    screen.getByRole('button', { name: 'Request Data Export' }).click()

    expect(await screen.findByText('Data export service is unavailable')).toBeInTheDocument()
    expect(mockOnError).toHaveBeenCalledWith(expect.anything(), {
      fallback: 'An unexpected error occurred',
      tags: { form: 'my-data-export' },
    })
  })
})
