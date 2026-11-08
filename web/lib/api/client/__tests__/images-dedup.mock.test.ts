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
import { ImageBlockedError, uploadImageFile } from '../images'

const mockPost = vi.mocked(clientApi.post)
const mockGet = vi.mocked(clientApi.get)

// Records unexpected subscriptions so deduplicated uploads can assert none were opened.
class MockEventSource {
  static instances: MockEventSource[] = []

  constructor(readonly url: string) {
    MockEventSource.instances.push(this)
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

describe('uploadImageFile — same-user dedup terminal states from REST probe', () => {
  beforeEach(() => {
    MockEventSource.instances = []
    vi.stubGlobal('EventSource', MockEventSource)
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 })),
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

describe('uploadImageFile object upload failure', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('reports an unsuccessful object upload before requesting completion', async () => {
    mockPost.mockResolvedValueOnce(UPLOAD_URL_POST)
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(null, { status: 403, statusText: 'Forbidden' })),
    )
    const file = new File(['x'], 'a.png', { type: 'image/png' })

    await expect(uploadImageFile(file)).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Failed to upload image: Forbidden',
    })
    expect(mockPost).toHaveBeenCalledTimes(1)
  })
})
