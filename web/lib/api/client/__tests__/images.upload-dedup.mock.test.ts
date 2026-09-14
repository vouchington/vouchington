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
import { POLL_INTERVAL_MS, uploadImageFile } from '../images'
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
    it('fails cross-user dedup when probe returns 404', async () => {
      // Cross-user dedup: backend returns an existing image owned by another user.
      // The REST probe returns 404 (ownership check), so the returned id would not
      // be usable by post image validation.
      mockPost
        .mockResolvedValueOnce({
          upload: {
            image_id: 'new-id',
            upload_url: 'https://example.test/upload',
            content_type: 'image/png',
            expires_at: '2030-01-01T00:00:00Z',
          },
        })
        .mockResolvedValueOnce({ image: { id: 'existing-id', upload_status: 'complete' } })

      mockGet.mockRejectedValueOnce(new ApiError('Image not found', 404))

      const fetchMock = vi
        .fn<() => unknown>()
        .mockResolvedValue(new Response(null, { status: 200 }))
      vi.stubGlobal('fetch', fetchMock)

      const file = new File(['x'], 'a.png', { type: 'image/png' })
      await expect(uploadImageFile(file)).rejects.toMatchObject({
        name: 'ApiError',
        status: 409,
      })

      // No SSE connection should have been opened for the cross-user image.
      expect(MockEventSource.instances.some(e => e.url.includes('existing-id'))).toBe(false)
    })

    it('fails cross-user dedup when retryable probe failure falls through to REST polling 404', async () => {
      mockPost
        .mockResolvedValueOnce({
          upload: {
            image_id: 'new-id',
            upload_url: 'https://example.test/upload',
            content_type: 'image/png',
            expires_at: '2030-01-01T00:00:00Z',
          },
        })
        .mockResolvedValueOnce({ image: { id: 'existing-id', upload_status: 'processing' } })

      mockGet
        .mockRejectedValueOnce(new ApiError('temporary outage', 503))
        .mockRejectedValueOnce(new ApiError('Image not found', 404))

      const fetchMock = vi
        .fn<() => unknown>()
        .mockResolvedValue(new Response(null, { status: 200 }))
      vi.stubGlobal('fetch', fetchMock)

      const file = new File(['x'], 'a.png', { type: 'image/png' })
      const uploadPromise = uploadImageFile(file)
      uploadPromise.catch(() => {})
      await flushMicrotasks()
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)

      await expect(uploadPromise).rejects.toMatchObject({
        name: 'ApiError',
        status: 409,
      })
    })

    it('waits via REST polling until upload complete when same-user race dedup is still processing', async () => {
      // Same-user race dedup: backend returns an image accessible to this user but
      // not yet in a terminal state. The REST probe returns 200 (still processing);
      // fall through to REST polling.
      mockPost
        .mockResolvedValueOnce({
          upload: {
            image_id: 'new-id',
            upload_url: 'https://example.test/upload',
            content_type: 'image/png',
            expires_at: '2030-01-01T00:00:00Z',
          },
        })
        .mockResolvedValueOnce({ image: { id: 'existing-id', upload_status: 'processing' } })

      mockGet
        .mockResolvedValueOnce({
          upload_state: {
            id: 'existing-id',
            upload_status: 'processing',
            upload_error: null,
            ready: false,
            blocked: false,
          },
        })
        .mockResolvedValueOnce({
          upload_state: makeState({
            id: 'existing-id',
            ready: false,
            upload_status: 'complete',
          }),
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
      expect(id).toBe('existing-id')
      expect(MockEventSource.instances.some(e => e.url.includes('existing-id'))).toBe(false)
    })

    it('returns a same-user deduped image after REST polling reports upload complete', async () => {
      mockPost
        .mockResolvedValueOnce({
          upload: {
            image_id: 'new-id',
            upload_url: 'https://s3.test/upload',
            content_type: 'image/png',
            expires_at: new Date().toISOString(),
          },
        })
        .mockResolvedValueOnce({ image: { id: 'existing-id', upload_status: 'processing' } })

      mockGet
        .mockResolvedValueOnce({
          upload_state: makeState({
            id: 'existing-id',
            ready: false,
            upload_status: 'complete',
          }),
        })
        .mockResolvedValueOnce({
          upload_state: makeState({
            id: 'existing-id',
            ready: false,
            upload_status: 'complete',
          }),
        })

      const fetchMock = vi
        .fn<() => unknown>()
        .mockResolvedValue(new Response(null, { status: 200, statusText: 'OK' }))
      vi.stubGlobal('fetch', fetchMock)

      const file = new File(['x'], 'a.png', { type: 'image/png' })
      await expect(uploadImageFile(file)).resolves.toBe('existing-id')
      expect(MockEventSource.instances.some(e => e.url.includes('existing-id'))).toBe(false)
    })
  })
})
