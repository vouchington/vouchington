/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createContext, runInContext } from 'node:vm'
import { vi } from 'vitest'

const source = readFileSync(resolve(process.cwd(), 'web/public/service-worker.js'), 'utf8')
const pushSource = readFileSync(resolve(process.cwd(), 'web/public/service-worker-push.js'), 'utf8')
export const scriptUrl = `javascript:alert(1)`

function createSelf(origin = 'https://example.com') {
  const handlers: Record<string, (event: unknown) => void> = {}
  return {
    location: { origin },
    registration: {
      showNotification: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
      getNotifications: vi.fn<VitestLooseMock>().mockResolvedValue([]),
    },
    clients: {
      claim: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
      matchAll: vi.fn<VitestLooseMock>().mockResolvedValue([]),
      openWindow: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
    },
    skipWaiting: vi.fn<VitestLooseMock>(),
    addEventListener(type: string, fn: (event: unknown) => void) {
      handlers[type] = fn
    },
    fire(type: string, event: unknown) {
      handlers[type]?.(event)
    },
  }
}

export function loadSW(origin = 'https://example.com', globals: Record<string, unknown> = {}) {
  const self = createSelf(origin)
  const context = createContext({
    self,
    URL,
    Promise,
    console,
    Request,
    Response,
    crypto,
    indexedDB: createMemoryIndexedDb(),
    ...globals,
  })
  Object.assign(context, {
    importScripts: (path: string) => {
      if (path !== '/service-worker-push.js') throw new Error(`Unexpected worker import: ${path}`)
      runInContext(pushSource, context)
    },
  })
  runInContext(source, context)
  return self
}

export function createMemoryIndexedDb() {
  const stores = new Map<string, Map<string, unknown>>()
  return {
    open: vi.fn<VitestLooseMock>((_name: string) => {
      const request: Record<string, unknown> = { result: undefined }
      const database = {
        createObjectStore(storeName: string) {
          const values = stores.get(storeName) ?? new Map<string, unknown>()
          stores.set(storeName, values)
          return values
        },
        transaction(storeName: string) {
          const values = stores.get(storeName) ?? new Map<string, unknown>()
          stores.set(storeName, values)
          const transaction: Record<string, unknown> = { error: null }
          transaction.objectStore = () => ({
            get(key: string) {
              return memoryRequest(
                values.get(key),
                () => transaction.oncomplete as (() => void) | undefined,
              )
            },
            put(value: unknown, key: string) {
              values.set(key, value)
              return memoryRequest(key, () => transaction.oncomplete as (() => void) | undefined)
            },
          })
          return transaction
        },
      }
      request.result = database
      queueMicrotask(() => {
        ;(request.onupgradeneeded as (() => void) | undefined)?.()
        ;(request.onsuccess as (() => void) | undefined)?.()
      })
      return request
    }),
  }
}

function memoryRequest(result: unknown, complete: () => (() => void) | undefined) {
  const request: Record<string, unknown> = { result, error: null }
  queueMicrotask(() => {
    ;(request.onsuccess as (() => void) | undefined)?.()
    queueMicrotask(() => complete()?.())
  })
  return request
}

interface WaitUntilEvent {
  waitUntil: ReturnType<typeof vi.fn>
  _promises: Promise<unknown>[]
}

function waitUntilParts() {
  const promises: Promise<unknown>[] = []
  return {
    waitUntil: vi.fn<VitestLooseMock>((promise: Promise<unknown>) => promises.push(promise)),
    _promises: promises,
  }
}

export function makePushEvent(jsonData: unknown, throws = false) {
  return {
    data: {
      json: throws
        ? vi.fn<VitestLooseMock>().mockImplementation(() => {
            throw new Error('bad json')
          })
        : vi.fn<VitestLooseMock>().mockReturnValue(jsonData),
    },
    ...waitUntilParts(),
  }
}

export function makeNullDataPushEvent() {
  return { data: null, ...waitUntilParts() }
}

export function makePushBindingMessage(
  action: 'begin-reconciliation' | 'bind' | 'clear' | 'read-or-initialize',
  binding?: { endpoint: string; subscription_id: string },
  expectedRevision?: string,
) {
  const messages: unknown[] = []
  return {
    data: {
      type: 'voucha:web-push',
      version: 1,
      action,
      ...(binding ? { binding } : {}),
      ...(expectedRevision ? { expected_revision: expectedRevision } : {}),
    },
    ports: [{ postMessage: vi.fn<VitestLooseMock>((message: unknown) => messages.push(message)) }],
    messages,
    ...waitUntilParts(),
  }
}

export function makeClickEvent(url: string | undefined) {
  return {
    notification: { close: vi.fn<VitestLooseMock>(), data: { url } },
    ...waitUntilParts(),
  }
}

export function makeInstallEvent(): WaitUntilEvent {
  const promises: Promise<unknown>[] = []
  return {
    waitUntil: vi.fn<VitestLooseMock>((promise: Promise<unknown>) => promises.push(promise)),
    _promises: promises,
  }
}

export function makeFetchEvent(request: Request) {
  const event = {
    request,
    ...waitUntilParts(),
    respondWith: vi.fn<VitestLooseMock>((promise: Promise<Response>) => {
      event.responsePromise = promise
    }),
    responsePromise: undefined as Promise<Response> | undefined,
  }
  return event
}
