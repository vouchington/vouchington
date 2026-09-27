import { act } from '@testing-library/react'
import { vi } from 'vitest'
import {
  clearCache,
  fetchCacheGroups,
  flushValkey,
  rebuildBloomFilter,
} from '@/lib/api/client/valkey'
import { toast } from 'sonner'

type ValkeyClient = typeof import('@/lib/api/client/valkey')

const { toastMock } = vi.hoisted(() => {
  const mock = Object.assign(vi.fn<VitestLooseMock>(), {
    error: vi.fn<VitestLooseMock>(),
    success: vi.fn<VitestLooseMock>(),
  })
  return { toastMock: mock }
})

vi.mock(import('@/lib/api/client/valkey'), () => ({
  clearCache: vi.fn<ValkeyClient['clearCache']>(),
  fetchCacheGroups: vi.fn<ValkeyClient['fetchCacheGroups']>(),
  flushValkey: vi.fn<ValkeyClient['flushValkey']>(),
  rebuildBloomFilter: vi.fn<ValkeyClient['rebuildBloomFilter']>(),
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

const mockedClearCache = vi.mocked(clearCache)
const mockedFetchCacheGroups = vi.mocked(fetchCacheGroups)
const mockedFlushValkey = vi.mocked(flushValkey)
const mockedRebuildBloomFilter = vi.mocked(rebuildBloomFilter)
const mockedToast = vi.mocked(toast)

type ESListener = (event: MessageEvent) => void

class MockEventSource {
  static instances: MockEventSource[] = []
  readonly listeners = new Map<string, Set<ESListener>>()
  onerror: (() => void) | null = null
  closed = false

  constructor() {
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
    this.onerror?.()
  }
}

async function emitDefaultSnapshot() {
  const es = MockEventSource.instances.at(-1)!
  await act(async () => {
    es.emit('snapshot', {
      groups: [{ name: 'posts', prefixes: ['post:'] }],
    })
  })
  return es
}

function defer<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(res => {
    resolve = res
  })
  return { promise, resolve }
}

export {
  defer,
  emitDefaultSnapshot,
  MockEventSource,
  mockedClearCache,
  mockedFetchCacheGroups,
  mockedFlushValkey,
  mockedRebuildBloomFilter,
  mockedToast,
}
