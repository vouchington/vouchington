import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: {
        get: vi.fn<VitestLooseMock>(),
        post: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('../instance'),
)

import { clientApi } from '../instance'
import { ImageBlockedError, pollImageUntilTerminal, uploadImageFile } from '../images'

const mockPost = vi.mocked(clientApi.post)
const mockGet = vi.mocked(clientApi.get)

// Minimal EventSource mock — dedup tests open SSE only for same-user processing paths.
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
}

const UPLOAD_URL_POST = {
  upload: {
    image_id: 'new-id',
    upload_url: 'https://example.test/upload',
    content_type: 'image/png',
    expires_at: '2030-01-01T00:00:00Z',
  },
}

function makeCompletePost(overrides: { id: string; upload_status: string }) {
  return { image: { upload_error: null, ...overrides } }
}

describe('pollImageUntilTerminal — malformed SSE event', () => {
  beforeEach(() => {
    MockEventSource.instances = []
    vi.stubGlobal('EventSource', MockEventSource)
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('ignores malformed SSE state events and continues waiting', async () => {
    const promise = pollImageUntilTerminal('img-1', { timeoutMs: 5000 })
    const es = MockEventSource.instances[0]!
    // Emit a malformed (non-JSON) event — should be silently ignored
    const badEvent = new MessageEvent('state', { data: 'not-valid-json' })
    es.listeners.get('state')?.forEach(fn => fn(badEvent))
    // Stream is still open; emit a valid terminal event
    const goodEvent = new MessageEvent('state', {
      data: JSON.stringify({
        id: 'img-1',
        upload_status: 'complete',
        upload_error: null,
        ready: true,
        blocked: false,
      }),
    })
    es.listeners.get('state')?.forEach(fn => fn(goodEvent))
    const result = await promise
    expect(result.ready).toBe(true)
  })
})

describe('uploadImageFile — same-user dedup terminal states from REST probe', () => {
  beforeEach(() => {
    MockEventSource.instances = []
    vi.stubGlobal('EventSource', MockEventSource)
    vi.stubGlobal(
      'fetch',
      vi.fn<() => unknown>().mockResolvedValue(new Response(null, { status: 200 })),
    )
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('returns immediately when the REST probe reports the deduped image is already ready', async () => {
    mockPost
      .mockResolvedValueOnce(UPLOAD_URL_POST)
      .mockResolvedValueOnce(makeCompletePost({ id: 'existing-id', upload_status: 'complete' }))
    mockGet.mockResolvedValueOnce({
      upload_state: {
        id: 'existing-id',
        upload_status: 'processing',
        upload_error: null,
        ready: true,
        blocked: false,
      },
    })

    const file = new File(['x'], 'a.png', { type: 'image/png' })
    const id = await uploadImageFile(file)

    expect(id).toBe('existing-id')
    expect(MockEventSource.instances.some(e => e.url.includes('existing-id'))).toBe(false)
  })

  it('returns immediately when the REST probe reports upload complete and moderation pending', async () => {
    mockPost
      .mockResolvedValueOnce(UPLOAD_URL_POST)
      .mockResolvedValueOnce(makeCompletePost({ id: 'existing-id', upload_status: 'complete' }))
    mockGet.mockResolvedValueOnce({
      upload_state: {
        id: 'existing-id',
        upload_status: 'complete',
        upload_error: null,
        ready: false,
        blocked: false,
      },
    })

    const file = new File(['x'], 'a.png', { type: 'image/png' })
    const id = await uploadImageFile(file)

    expect(id).toBe('existing-id')
    expect(MockEventSource.instances.some(e => e.url.includes('existing-id'))).toBe(false)
  })

  it('throws ImageBlockedError when the REST probe shows the deduped image is blocked', async () => {
    mockPost
      .mockResolvedValueOnce(UPLOAD_URL_POST)
      .mockResolvedValueOnce(makeCompletePost({ id: 'existing-id', upload_status: 'complete' }))
    mockGet.mockResolvedValueOnce({
      upload_state: {
        id: 'existing-id',
        upload_status: 'complete',
        upload_error: null,
        ready: false,
        blocked: true,
      },
    })

    const file = new File(['x'], 'a.png', { type: 'image/png' })
    await expect(uploadImageFile(file)).rejects.toBeInstanceOf(ImageBlockedError)
  })

  it('throws ApiError when the REST probe shows the deduped image has failed', async () => {
    mockPost
      .mockResolvedValueOnce(UPLOAD_URL_POST)
      .mockResolvedValueOnce(makeCompletePost({ id: 'existing-id', upload_status: 'failed' }))
    mockGet.mockResolvedValueOnce({
      upload_state: {
        id: 'existing-id',
        upload_status: 'failed',
        upload_error: 'processing error',
        ready: false,
        blocked: false,
      },
    })

    const file = new File(['x'], 'a.png', { type: 'image/png' })
    await expect(uploadImageFile(file)).rejects.toMatchObject({
      name: 'ApiError',
      message: 'processing error',
    })
  })
})
