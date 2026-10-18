import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, safeUsername } from '@voucha/test-helpers'
import type { ChannelSubscription, DataRequestStreamStatus } from '@data-stores/valkey-pubsub'
import * as valkey from '@data-stores/valkey-pubsub'
import type { PrivateUser } from '@services/users/types'
import {
  createDataRequest,
  markDataRequestProcessing,
  markDataRequestFailed,
  markDataRequestReady,
} from '@services/account-data-requests'
import * as accountDataRequests from '@services/account-data-requests'
import * as sseHelpers from '../../../sse-helpers.mts'

const subscribeSpy = vi.spyOn(valkey.dataRequestPubSub, 'subscribe')
const getExportDownloadUrlSpy = vi.spyOn(accountDataRequests, 'getExportDownloadUrl')
const pipeChannelToSSESpy = vi.spyOn(sseHelpers, 'pipeChannelToSSE')
const realWatchForAbortBeforeSSE = sseHelpers.watchForAbortBeforeSSE
const watchForAbortSpy = vi.spyOn(sseHelpers, 'watchForAbortBeforeSSE')

function makeSubscription(): ChannelSubscription<DataRequestStreamStatus> {
  return {
    setHandler: vi.fn<VitestLooseMock>(),
    close: vi.fn<() => void>(),
  }
}

let owner: PrivateUser
let otherUser: PrivateUser

describe('GET /api/v1/users/:idOrSlug/data-request/stream', () => {
  beforeAll(async () => {
    ;[owner, otherUser] = await Promise.all([
      createTestUser({ username: safeUsername('dr-stream-owner') }),
      createTestUser({ username: safeUsername('dr-stream-other') }),
    ])
    await import('../data-request.mts')
  })

  beforeEach(() => {
    subscribeSpy.mockReset()
    pipeChannelToSSESpy.mockReset()
    getExportDownloadUrlSpy.mockReset()
    getExportDownloadUrlSpy.mockResolvedValue('https://example.test/export.zip')
    subscribeSpy.mockResolvedValue(makeSubscription())
    pipeChannelToSSESpy.mockImplementation(
      async (options: {
        emit: (event: { event: string; data: unknown }) => void
        initialValue?: unknown
        eventName: string
        subscription: { setHandler: (fn: null) => void }
      }) => {
        if (options.initialValue !== undefined) {
          options.emit({ event: options.eventName, data: options.initialValue })
        }
        options.subscription.setHandler(null)
      },
    )
  })

  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.get(`/api/v1/users/${owner.id}/data-request/stream`).expect(401)
  })

  it('returns 403 when other user tries to access', async () => {
    const request = createRequest()
    await request.authenticateAs(otherUser)
    await request.get(`/api/v1/users/${owner.id}/data-request/stream`).expect(403)
  })

  it('returns 404 when no data request exists', async () => {
    const user = await createTestUser({ username: safeUsername('dr-stream-none') })
    const request = createRequest()
    await request.authenticateAs(user)
    await request.get(`/api/v1/users/${user.id}/data-request/stream`).expect(404)
  })

  it('sets SSE headers and sends initial terminal status when request is already ready', async () => {
    const user = await createTestUser({ username: safeUsername('dr-stream-ready') })
    await createDataRequest(user.id, user.id)

    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get(`/api/v1/users/${user.id}/data-request/stream`).expect(200)

    expect(response.headers['content-type']).toContain('text/event-stream')
    expect(pipeChannelToSSESpy).toHaveBeenCalled()
    expect(subscribeSpy).toHaveBeenCalled()
  })

  it('sends ready status with a download URL when completed export has an s3 key', async () => {
    const user = await createTestUser({ username: safeUsername('dr-stream-ready-url') })
    const dr = await createDataRequest(user.id, user.id)
    await markDataRequestProcessing(dr.id)
    await markDataRequestReady(
      dr.id,
      `account-data-requests/${dr.id}.zip`,
      new Date(Date.now() + 60_000),
    )

    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get(`/api/v1/users/${user.id}/data-request/stream`).expect(200)
    const pipeOptions = pipeChannelToSSESpy.mock.calls[0][0] as {
      isTerminal: (status: DataRequestStreamStatus) => boolean
      abortSignal: AbortSignal
    }

    expect(getExportDownloadUrlSpy).toHaveBeenCalledWith(`account-data-requests/${dr.id}.zip`)
    expect(response.text).toContain('event: status')
    expect(response.text).toContain('"status":"ready"')
    expect(response.text).toContain('"download_url":"https://example.test/export.zip"')
    expect(pipeOptions.isTerminal({ status: 'ready', download_url: null })).toBe(true)
    expect(pipeOptions.isTerminal({ status: 'processing' })).toBe(false)
    expect(pipeOptions.abortSignal).toBeInstanceOf(AbortSignal)
  })

  it('sends failed status as initial terminal value when request has already failed', async () => {
    const user = await createTestUser({ username: safeUsername('dr-stream-failed') })
    const dr = await createDataRequest(user.id, user.id)
    await markDataRequestProcessing(dr.id)
    await markDataRequestFailed(dr.id)

    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get(`/api/v1/users/${user.id}/data-request/stream`).expect(200)

    expect(response.text).toContain('event: status')
    expect(response.text).toContain('"failed"')
  })

  it('subscribes before re-reading status to avoid race conditions', async () => {
    const user = await createTestUser({ username: safeUsername('dr-stream-race') })
    await createDataRequest(user.id, user.id)

    const request = createRequest()
    await request.authenticateAs(user)

    await request.get(`/api/v1/users/${user.id}/data-request/stream`).expect(200)

    // subscribe must be called before pipeChannelToSSE
    const subscribeOrder = subscribeSpy.mock.invocationCallOrder[0] ?? Infinity
    const pipeOrder = pipeChannelToSSESpy.mock.invocationCallOrder[0] ?? Infinity
    expect(subscribeOrder).toBeLessThan(pipeOrder)
  })

  it('binds the stream to the request_id query parameter', async () => {
    const user = await createTestUser({ username: safeUsername('dr-stream-bound') })
    const dr = await createDataRequest(user.id, user.id)

    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .get(`/api/v1/users/${user.id}/data-request/stream?request_id=${dr.id}`)
      .expect(200)

    expect(subscribeSpy).toHaveBeenCalledWith(dr.id)
  })

  it('closes the subscription in finally block on success', async () => {
    const user = await createTestUser({ username: safeUsername('dr-stream-finally') })
    await createDataRequest(user.id, user.id)

    let capturedSub: ReturnType<typeof makeSubscription> | null = null
    subscribeSpy.mockImplementation(() => {
      capturedSub = makeSubscription()
      return Promise.resolve(capturedSub)
    })

    const request = createRequest()
    await request.authenticateAs(user)

    await request.get(`/api/v1/users/${user.id}/data-request/stream`).expect(200)

    expect(capturedSub).not.toBeNull()
    expect((capturedSub as unknown as ReturnType<typeof makeSubscription>).close).toHaveBeenCalled()
  })

  describe('with request_id', () => {
    async function streamAs(actor: PrivateUser, subjectId: string, requestId: string) {
      const request = createRequest()
      await request.authenticateAs(actor)
      return request.get(`/api/v1/users/${subjectId}/data-request/stream?request_id=${requestId}`)
    }

    function trackSubscription() {
      const subscription = makeSubscription()
      subscribeSpy.mockResolvedValue(subscription)
      return subscription
    }

    it('emits the terminal status when the worker completed before the stream subscribed', async () => {
      const user = await createTestUser({ username: safeUsername('dr-stream-before') })
      const dr = await createDataRequest(user.id, user.id)
      await markDataRequestProcessing(dr.id)
      await markDataRequestFailed(dr.id)
      trackSubscription()

      const response = await streamAs(user, user.id, dr.id)

      expect(response.status).toBe(200)
      expect(response.text).toContain('"status":"failed"')
    })

    it('emits the terminal status when the worker completes after the stream subscribed', async () => {
      const user = await createTestUser({ username: safeUsername('dr-stream-after') })
      const dr = await createDataRequest(user.id, user.id)
      await markDataRequestProcessing(dr.id)
      const subscription = makeSubscription()
      subscribeSpy.mockImplementation(async () => {
        await markDataRequestFailed(dr.id)
        return subscription
      })

      const response = await streamAs(user, user.id, dr.id)

      expect(response.status).toBe(200)
      expect(response.text).toContain('"status":"failed"')
      expect(subscribeSpy).toHaveBeenCalledTimes(1)
      expect(subscription.close).toHaveBeenCalledTimes(1)
    })

    it('returns 404 and closes the subscription when the request does not exist', async () => {
      const user = await createTestUser({ username: safeUsername('dr-stream-missing') })
      const subscription = trackSubscription()

      const response = await streamAs(user, user.id, '019e0000-0000-7000-8000-000000000000')

      expect(response.status).toBe(404)
      expect(subscription.close).toHaveBeenCalledTimes(1)
      expect(pipeChannelToSSESpy).not.toHaveBeenCalled()
    })

    it('returns 404 and closes the subscription for a request the caller did not make', async () => {
      const subject = await createTestUser({ username: safeUsername('dr-stream-foreign') })
      const dr = await createDataRequest(subject.id, subject.id)
      const subscription = trackSubscription()

      const response = await streamAs(otherUser, otherUser.id, dr.id)

      expect(response.status).toBe(404)
      expect(subscription.close).toHaveBeenCalledTimes(1)
      expect(pipeChannelToSSESpy).not.toHaveBeenCalled()
    })

    it('returns 403 before subscribing when the caller cannot access the subject', async () => {
      const subject = await createTestUser({ username: safeUsername('dr-stream-subject') })
      const dr = await createDataRequest(subject.id, subject.id)
      trackSubscription()

      const response = await streamAs(otherUser, subject.id, dr.id)

      expect(response.status).toBe(403)
      expect(subscribeSpy).not.toHaveBeenCalled()
    })

    it('returns 422 before subscribing for a malformed request id', async () => {
      trackSubscription()

      const response = await streamAs(owner, owner.id, 'not-a-uuid')

      expect(response.status).toBe(422)
      expect(subscribeSpy).not.toHaveBeenCalled()
    })

    it('closes the subscription and never starts SSE when the client aborted before SSE', async () => {
      const user = await createTestUser({ username: safeUsername('dr-stream-abort') })
      const dr = await createDataRequest(user.id, user.id)
      const subscription = trackSubscription()
      watchForAbortSpy.mockImplementationOnce((_signal, closeSubscription) =>
        realWatchForAbortBeforeSSE(AbortSignal.abort(), closeSubscription),
      )

      await streamAs(user, user.id, dr.id)

      expect(subscription.close).toHaveBeenCalledTimes(1)
      expect(pipeChannelToSSESpy).not.toHaveBeenCalled()
    })
  })
})
