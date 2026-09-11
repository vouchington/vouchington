import type { UploadStateResponse } from '../image-upload-api'

export async function flushMicrotasks() {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

type ESListener = (event: MessageEvent) => void

export class MockEventSource {
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

  emitConnectionError() {
    if (this.onerror) this.onerror()
    const event = new MessageEvent('error', { data: undefined })
    this.listeners.get('error')?.forEach(fn => fn(event))
  }
}

export function makeState(overrides: Partial<UploadStateResponse> = {}): UploadStateResponse {
  return {
    id: 'img-1',
    upload_status: 'processing',
    upload_error: null,
    ready: false,
    blocked: false,
    ...overrides,
  }
}
