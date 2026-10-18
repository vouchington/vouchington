import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, safeUsername } from '@voucha/test-helpers'
import type { ChannelSubscription, DataRequestStreamStatus } from '@data-stores/valkey-pubsub'
import * as valkey from '@data-stores/valkey-pubsub'
import type { PrivateUser } from '@services/users/types'
import { createDataRequest } from '@services/account-data-requests'
import * as accountDataRequests from '@services/account-data-requests'
import * as sseHelpers from '../../../sse-helpers.mts'

const subscribeSpy = vi.spyOn(valkey.dataRequestPubSub, 'subscribe')
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

describe('GET /api/v1/users/:idOrSlug/data-request/stream subscription failures and aborts', () => {
  beforeAll(async () => {
    owner = await createTestUser({ username: safeUsername('dr-stream-fail-owner') })
    await import('../data-request.mts')
  })

  beforeEach(() => {
    subscribeSpy.mockReset()
    pipeChannelToSSESpy.mockReset()
    subscribeSpy.mockResolvedValue(makeSubscription())
    pipeChannelToSSESpy.mockResolvedValue(undefined)
  })

  async function streamAs(actor: PrivateUser, subjectId: string, requestId: string) {
    const request = createRequest()
    await request.authenticateAs(actor)
    return request.get(`/api/v1/users/${subjectId}/data-request/stream?request_id=${requestId}`)
  }

  it('returns 404 rather than a 5xx when pub/sub is down and the request does not exist', async () => {
    subscribeSpy.mockRejectedValue(new Error('valkey down'))

    const response = await streamAs(owner, owner.id, '019e0000-0000-7000-8000-000000000000')

    expect(response.status).toBe(404)
    expect(pipeChannelToSSESpy).not.toHaveBeenCalled()
  })

  it('fails with the pub/sub error when pub/sub is down and the request exists', async () => {
    const user = await createTestUser({ username: safeUsername('dr-stream-down') })
    const dr = await createDataRequest(user.id, user.id)
    subscribeSpy.mockRejectedValue(new Error('valkey down'))

    const response = await streamAs(user, user.id, dr.id)

    expect(response.status).toBe(500)
    expect(pipeChannelToSSESpy).not.toHaveBeenCalled()
  })

  it('closes a subscription acquired after the client aborted, without reading the request', async () => {
    const user = await createTestUser({ username: safeUsername('dr-stream-late-abort') })
    const dr = await createDataRequest(user.id, user.id)
    const subscription = makeSubscription()
    const controller = new AbortController()
    watchForAbortSpy.mockImplementationOnce((_signal, closeSubscription) =>
      realWatchForAbortBeforeSSE(controller.signal, closeSubscription),
    )
    subscribeSpy.mockImplementation(() => {
      controller.abort()
      return Promise.resolve(subscription)
    })
    const readSpy = vi.spyOn(accountDataRequests, 'getDataRequestById')

    await streamAs(user, user.id, dr.id)

    expect(readSpy).not.toHaveBeenCalled()
    expect(subscription.close).toHaveBeenCalledTimes(1)
    expect(pipeChannelToSSESpy).not.toHaveBeenCalled()
    readSpy.mockRestore()
  })

  it('closes a latest-request subscription acquired after the client aborted', async () => {
    const user = await createTestUser({ username: safeUsername('dr-stream-latest-abort') })
    await createDataRequest(user.id, user.id)
    const subscription = makeSubscription()
    const controller = new AbortController()
    watchForAbortSpy.mockImplementationOnce((_signal, closeSubscription) =>
      realWatchForAbortBeforeSSE(controller.signal, closeSubscription),
    )
    subscribeSpy.mockImplementation(() => {
      controller.abort()
      return Promise.resolve(subscription)
    })
    const request = createRequest()
    await request.authenticateAs(user)

    await request.get(`/api/v1/users/${user.id}/data-request/stream`)

    expect(subscription.close).toHaveBeenCalledTimes(1)
    expect(pipeChannelToSSESpy).not.toHaveBeenCalled()
  })
})
