import { act, fireEvent, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { getArticleSyncStatus, triggerArticleSync } from '@/lib/api/client/admin'
import { toast } from 'sonner'

type AdminClient = typeof import('@/lib/api/client/admin')

const { toastMock } = vi.hoisted(() => {
  const mock = Object.assign(vi.fn<VitestLooseMock>(), {
    error: vi.fn<VitestLooseMock>(),
    success: vi.fn<VitestLooseMock>(),
  })
  return { toastMock: mock }
})

vi.mock(import('@/lib/api/client/admin'), () => ({
  getArticleSyncStatus: vi.fn<AdminClient['getArticleSyncStatus']>(),
  triggerArticleSync: vi.fn<AdminClient['triggerArticleSync']>(),
}))

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: toastMock,
    }) as unknown as typeof import('sonner'),
)

vi.mock(import('@/lib/on-error'), () => ({
  default: (_err: unknown, options: { fallback: string }) => {
    toastMock.error(options.fallback)
    return options.fallback
  },
  onSuccess: (message: string) => {
    toastMock.success(message)
  },
}))

vi.mock(import('@/lib/api/error'), () => {
  class ApiError extends Error {
    status: number
    constructor(message: string, status: number) {
      super(message)
      this.name = 'ApiError'
      this.status = status
    }
  }
  return { ApiError }
})

const mockedGetStatus = vi.mocked(getArticleSyncStatus)
const mockedToast = vi.mocked(toast)
const mockedTrigger = vi.mocked(triggerArticleSync)

type ESListener = (event: MessageEvent) => void

class MockEventSource {
  static instances: MockEventSource[] = []
  readonly url: string
  readonly listeners = new Map<string, Set<ESListener>>()
  onerror: (() => void) | null = null
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

  simulateError() {
    if (this.onerror) this.onerror()
  }
}

/** Click the sync button and flush microtasks so the trigger promise settles. */
async function clickAndSettle() {
  fireEvent.click(screen.getByRole('button', { name: 'Sync Articles' }))
  await act(async () => {
    /* microtask flush */
  })
}

export { clickAndSettle, MockEventSource, mockedGetStatus, mockedToast, mockedTrigger }
