import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
import { uploadImageFile } from '../images'

const mockPost = vi.mocked(clientApi.post)
const mockGet = vi.mocked(clientApi.get)

// Minimal EventSource mock matching the SSE image-state stream.
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

describe('uploadImageFile upload URLs', () => {
  beforeEach(() => {
    MockEventSource.instances = []
    vi.stubGlobal('EventSource', MockEventSource)
  })

  afterEach(() => {
    vi.resetAllMocks()
    vi.unstubAllGlobals()
  })

  it('allows local HTTP upload URLs for Playwright and development servers', async () => {
    mockPost
      .mockResolvedValueOnce({
        upload: {
          image_id: 'new-id',
          upload_url: 'http://localhost:3000/mock-s3-upload',
          content_type: 'image/png',
          expires_at: '2030-01-01T00:00:00Z',
        },
      })
      .mockResolvedValueOnce({ image: { id: 'new-id', upload_status: 'complete' } })
    mockGet.mockResolvedValueOnce({
      upload_state: {
        id: 'new-id',
        upload_status: 'complete',
        upload_error: null,
        ready: false,
        blocked: false,
      },
    })

    const fetchMock = vi.fn<() => unknown>().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const file = new File(['x'], 'a.png', { type: 'image/png' })
    await expect(uploadImageFile(file)).resolves.toBe('new-id')
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('http://localhost:3000/mock-s3-upload'),
      expect.any(Object),
    )
  })

  it('allows IPv6 loopback HTTP upload URLs', async () => {
    mockPost
      .mockResolvedValueOnce({
        upload: {
          image_id: 'new-id',
          upload_url: 'http://[::1]:3000/mock-s3-upload',
          content_type: 'image/png',
          expires_at: '2030-01-01T00:00:00Z',
        },
      })
      .mockResolvedValueOnce({ image: { id: 'new-id', upload_status: 'complete' } })
    mockGet.mockResolvedValueOnce({
      upload_state: {
        id: 'new-id',
        upload_status: 'complete',
        upload_error: null,
        ready: false,
        blocked: false,
      },
    })

    const fetchMock = vi.fn<() => unknown>().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const file = new File(['x'], 'a.png', { type: 'image/png' })
    await expect(uploadImageFile(file)).resolves.toBe('new-id')
  })

  it('rejects non-local HTTP upload URLs', async () => {
    mockPost.mockResolvedValueOnce({
      upload: {
        image_id: 'new-id',
        upload_url: 'http://example.test/upload',
        content_type: 'image/png',
        expires_at: '2030-01-01T00:00:00Z',
      },
    })

    const file = new File(['x'], 'a.png', { type: 'image/png' })
    await expect(uploadImageFile(file)).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Invalid upload URL',
    })
  })
})
