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
import { ImageBlockedError, POLL_INTERVAL_MS, uploadImageFile } from '../images'
import { ApiError } from '../../error'
import {
  flushMicrotasks,
  makeState,
  MockEventSource,
} from '../../../../test-helpers/lib/api/client/images'

const mockPost = vi.mocked(clientApi.post)
const mockGet = vi.mocked(clientApi.get)

describe('images', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    MockEventSource.instances = []
    vi.stubGlobal('EventSource', MockEventSource)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  describe('uploadImageFile', () => {
    it('resolves with image id after REST reports upload complete while moderation is pending', async () => {
      mockPost
        .mockResolvedValueOnce({
          upload: {
            image_id: 'new-id',
            upload_url: 'https://example.test/upload',
            content_type: 'image/png',
            expires_at: '2030-01-01T00:00:00Z',
          },
        })
        .mockResolvedValueOnce({ image: { id: 'new-id', upload_status: 'complete' } })
      mockGet.mockResolvedValueOnce({
        upload_state: makeState({ id: 'new-id', ready: false, upload_status: 'complete' }),
      })

      const fetchMock = vi
        .fn<() => unknown>()
        .mockResolvedValue(new Response(null, { status: 200 }))
      vi.stubGlobal('fetch', fetchMock)

      const file = new File(['x'], 'a.png', { type: 'image/png' })
      const id = await uploadImageFile(file)
      expect(id).toBe('new-id')
    })

    it('polls until upload complete when completion returns processing', async () => {
      mockPost
        .mockResolvedValueOnce({
          upload: {
            image_id: 'new-id',
            upload_url: 'https://example.test/upload',
            content_type: 'image/png',
            expires_at: '2030-01-01T00:00:00Z',
          },
        })
        .mockResolvedValueOnce({ image: { id: 'new-id', upload_status: 'processing' } })
      mockGet
        .mockResolvedValueOnce({ upload_state: makeState({ id: 'new-id' }) })
        .mockResolvedValueOnce({
          upload_state: makeState({ id: 'new-id', ready: false, upload_status: 'complete' }),
        })

      const fetchMock = vi
        .fn<() => unknown>()
        .mockResolvedValue(new Response(null, { status: 200 }))
      vi.stubGlobal('fetch', fetchMock)

      const file = new File(['x'], 'a.png', { type: 'image/png' })
      const uploadPromise = uploadImageFile(file)
      await flushMicrotasks()
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)

      const id = await uploadPromise
      expect(id).toBe('new-id')
    })

    it('propagates ImageBlockedError when moderation blocks the image', async () => {
      mockPost
        .mockResolvedValueOnce({
          upload: {
            image_id: 'new-id',
            upload_url: 'https://example.test/upload',
            content_type: 'image/png',
            expires_at: '2030-01-01T00:00:00Z',
          },
        })
        .mockResolvedValueOnce({ image: { id: 'new-id', upload_status: 'processing' } })
      mockGet.mockResolvedValueOnce({
        upload_state: makeState({ id: 'new-id', blocked: true, upload_status: 'complete' }),
      })

      const fetchMock = vi
        .fn<() => unknown>()
        .mockResolvedValue(new Response(null, { status: 200 }))
      vi.stubGlobal('fetch', fetchMock)

      const file = new File(['x'], 'a.png', { type: 'image/png' })
      await expect(uploadImageFile(file)).rejects.toBeInstanceOf(ImageBlockedError)
    })

    it('propagates ApiError when the image reaches a failed state', async () => {
      mockPost
        .mockResolvedValueOnce({
          upload: {
            image_id: 'new-id',
            upload_url: 'https://example.test/upload',
            content_type: 'image/png',
            expires_at: '2030-01-01T00:00:00Z',
          },
        })
        .mockResolvedValueOnce({ image: { id: 'new-id', upload_status: 'processing' } })
      mockGet.mockResolvedValueOnce({
        upload_state: makeState({
          id: 'new-id',
          upload_status: 'failed',
          upload_error: 'corrupt png',
        }),
      })

      const fetchMock = vi
        .fn<() => unknown>()
        .mockResolvedValue(new Response(null, { status: 200 }))
      vi.stubGlobal('fetch', fetchMock)

      const file = new File(['x'], 'a.png', { type: 'image/png' })
      await expect(uploadImageFile(file)).rejects.toMatchObject({ name: 'ApiError' })
    })
  })
})
