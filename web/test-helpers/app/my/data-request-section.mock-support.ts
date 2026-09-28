import { createElement } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { expect, vi } from 'vitest'

import { DataRequestSection } from '@/app/(my)/my/data/data-request-section'

const { mockOnError, mockOnSuccess } = vi.hoisted(() => ({
  mockOnError: vi.fn<VitestLooseMock>(),
  mockOnSuccess: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/on-error'), () => ({
  default: mockOnError,
  onSuccess: mockOnSuccess,
}))

function createJsonResponse(status: number, data: unknown): Response {
  return Response.json(data, { status })
}

type EventSourceListener = (event: MessageEvent) => void

class MockEventSource {
  static instances: MockEventSource[] = []
  readonly url: string
  readonly listeners = new Map<string, Set<EventSourceListener>>()
  closed = false

  constructor(url: string) {
    this.url = url
    MockEventSource.instances.push(this)
  }

  addEventListener(type: string, fn: EventSourceListener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(fn)
  }

  removeEventListener(type: string, fn: EventSourceListener) {
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

function installDataRequestDoubles() {
  MockEventSource.instances = []
  Object.defineProperty(globalThis, 'EventSource', {
    configurable: true,
    value: MockEventSource,
    writable: true,
  })
}

async function renderReadyWithoutDownloadLink(input: {
  refreshExpiresAt: string | null
  requestId: string
  userId: string
}) {
  const fetchMock = vi.fn<VitestLooseMock>()
  vi.stubGlobal('fetch', fetchMock)
  const createdAt = '2026-01-01T00:00:00.000Z'
  fetchMock.mockResolvedValueOnce(
    createJsonResponse(200, {
      id: input.requestId,
      status: 'pending',
      created_at: createdAt,
      expires_at: null,
    }),
  )
  fetchMock.mockResolvedValueOnce(
    createJsonResponse(200, {
      id: input.requestId,
      status: 'ready',
      created_at: createdAt,
      expires_at: input.refreshExpiresAt,
      download_url: null,
    }),
  )
  fetchMock.mockResolvedValueOnce(
    createJsonResponse(200, {
      id: input.requestId,
      status: 'ready',
      created_at: createdAt,
      expires_at: '2027-01-01T00:00:00.000Z',
      download_url: 'https://s3.example.com/export.zip',
    }),
  )

  render(createElement(DataRequestSection, { userId: input.userId }))
  await screen.findByText('Your export is being prepared. This may take a few minutes.')
  await waitFor(() => expect(MockEventSource.instances[0]).toBeDefined())
  vi.useFakeTimers()
  return MockEventSource.instances[0]!
}

function resetDataRequestDoubles() {
  Object.defineProperty(globalThis, 'EventSource', {
    configurable: true,
    value: originalEventSource,
    writable: true,
  })
  vi.restoreAllMocks()
  vi.clearAllMocks()
  vi.useRealTimers()
}

export {
  createJsonResponse,
  installDataRequestDoubles,
  MockEventSource,
  mockOnError,
  mockOnSuccess,
  renderReadyWithoutDownloadLink,
  resetDataRequestDoubles,
}
