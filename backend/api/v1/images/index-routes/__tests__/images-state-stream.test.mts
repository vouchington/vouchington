import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import type { ChannelSubscription } from '@data-stores/valkey-pubsub'
import * as valkey from '@data-stores/valkey-pubsub'
import type { ImageUploadState } from '@services/images/get-upload-state'
import * as imageUploadState from '@services/images/get-upload-state'
import type { PrivateUser } from '@services/users/types'

const subscribeSpy = vi.spyOn(valkey.imageStatePubSub, 'subscribe')
const getImageUploadStateSpy = vi.spyOn(imageUploadState, 'getImageUploadState')

const FAKE_IMAGE_ID = '00000000-0000-0000-0000-000000000001'

function makeSubscription(
  onSetHandler?: (fn: ((value: ImageUploadState) => void) | null) => void,
): ChannelSubscription<ImageUploadState> {
  const sub: ChannelSubscription<ImageUploadState> = {
    setHandler(fn) {
      onSetHandler?.(fn)
    },
    close: vi.fn<() => void>(),
  }
  return sub
}

function makePendingState(): ImageUploadState {
  return {
    id: FAKE_IMAGE_ID,
    ready: false,
    blocked: false,
    upload_status: 'pending',
    upload_error: null,
  } as ImageUploadState
}

function makeReadyState(): ImageUploadState {
  return {
    id: FAKE_IMAGE_ID,
    ready: true,
    blocked: false,
    upload_status: 'complete',
    upload_error: null,
  } as ImageUploadState
}

let user: PrivateUser

describe('GET /api/v1/images/:id/state/stream', () => {
  beforeAll(async () => {
    user = await createTestUser()
    await import('../images-by-imageid-state-stream-get.mts')
  })

  beforeEach(() => {
    subscribeSpy.mockReset()
    getImageUploadStateSpy.mockReset()
    subscribeSpy.mockResolvedValue(makeSubscription())
  })

  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.get(`/api/v1/images/${FAKE_IMAGE_ID}/state/stream`).expect(401)
  })

  it('returns 422 for non-UUID image ID', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request.get('/api/v1/images/not-a-uuid/state/stream').expect(422)
  })

  it('propagates error when getImageUploadState throws 404', async () => {
    const notFoundErr = Object.assign(new Error('Image not found'), { status: 404 })
    getImageUploadStateSpy.mockRejectedValue(notFoundErr)
    subscribeSpy.mockResolvedValue(makeSubscription())

    const request = createRequest()
    await request.authenticateAs(user)

    await request.get(`/api/v1/images/${FAKE_IMAGE_ID}/state/stream`).expect(404)
  })

  it('closes stream immediately when initial state is already ready', async () => {
    getImageUploadStateSpy.mockResolvedValue(makeReadyState())
    subscribeSpy.mockResolvedValue(makeSubscription())

    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get(`/api/v1/images/${FAKE_IMAGE_ID}/state/stream`).expect(200)

    expect(response.headers['content-type']).toContain('text/event-stream')
    expect(response.text).toContain('event: state')
    expect(response.text).toContain('"ready":true')
  })

  it('closes stream immediately when initial state is blocked', async () => {
    const blockedState = {
      ...makePendingState(),
      blocked: true,
      upload_status: 'failed' as const,
    }
    getImageUploadStateSpy.mockResolvedValue(blockedState)
    subscribeSpy.mockResolvedValue(makeSubscription())

    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get(`/api/v1/images/${FAKE_IMAGE_ID}/state/stream`).expect(200)

    expect(response.text).toContain('"blocked":true')
  })

  it('closes stream immediately when initial state is failed', async () => {
    const failedState = {
      ...makePendingState(),
      upload_status: 'failed' as const,
      upload_error: 'Processing failed',
    }
    getImageUploadStateSpy.mockResolvedValue(failedState)
    subscribeSpy.mockResolvedValue(makeSubscription())

    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get(`/api/v1/images/${FAKE_IMAGE_ID}/state/stream`).expect(200)

    expect(response.text).toContain('"upload_status":"failed"')
    expect(response.text).toContain('"upload_error":"Processing failed"')
  })

  it('forwards pub/sub ready event and closes stream', async () => {
    getImageUploadStateSpy.mockResolvedValue(makePendingState())

    let capturedHandler: ((value: ImageUploadState) => void) | null = null
    const handlerReady = Promise.withResolvers<void>()
    const sub = makeSubscription(fn => {
      capturedHandler = fn
      handlerReady.resolve()
    })
    subscribeSpy.mockImplementation(() => {
      void handlerReady.promise.then(() => {
        capturedHandler?.(makeReadyState())
      })
      return Promise.resolve(sub)
    })

    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get(`/api/v1/images/${FAKE_IMAGE_ID}/state/stream`).expect(200)

    expect(response.headers['content-type']).toContain('text/event-stream')
    expect(response.text).toContain('event: state')
    // First event = pending state, second event = ready state
    expect(response.text).toContain('"ready":true')
  })

  it('closes subscription in finally when getImageUploadState throws after subscribe', async () => {
    const err = Object.assign(new Error('Image not found'), { status: 404 })
    let subCreated: ChannelSubscription<ImageUploadState> | null = null
    subscribeSpy.mockImplementation(() => {
      const s = makeSubscription()
      subCreated = s
      return Promise.resolve(s)
    })
    getImageUploadStateSpy.mockRejectedValue(err)

    const request = createRequest()
    await request.authenticateAs(user)

    await request.get(`/api/v1/images/${FAKE_IMAGE_ID}/state/stream`).expect(404)

    expect(subCreated).not.toBeNull()
    expect(
      (subCreated as unknown as ChannelSubscription<ImageUploadState>).close,
    ).toHaveBeenCalled()
  })
})
