import { beforeEach, describe, expect, it, vi } from 'vitest'
import createHttpError from 'http-errors'
import { UnrecoverableError } from '@modules/queue-errors'
import { generateRsaSha256KeyPair } from '@modules/http-signatures'
import { deliverActivityToInbox, type buildActivityJson } from '@services/activitypub-delivery'
import type { getActorPrivateKeyPem } from '@services/ap-actor-keys'
import type { isFederationEnabledForUser } from '@services/users'
import type { DeliverActivityData } from '@queues/activitypub-delivery/enqueues'
import { deliverActivity } from './processors.mts'

const isFederationEnabledForUserMock = vi.fn<typeof isFederationEnabledForUser>()
const buildActivityJsonMock = vi.fn<typeof buildActivityJson>()
const deliverActivityToInboxMock = vi.fn<typeof deliverActivityToInbox>()
const getActorPrivateKeyPemMock = vi.fn<typeof getActorPrivateKeyPem>()

const FOLLOW_DATA: DeliverActivityData = {
  activityId: 'activity-1',
  activityType: 'Follow',
  sourceUserId: 'user-1',
  targetUserId: 'user-2',
  inboxUrl: 'https://a.example/inbox',
}

const UNDO_FOLLOW_DATA: DeliverActivityData = {
  activityId: 'activity-3',
  activityType: 'UndoFollow',
  originalActivityId: 'activity-1',
  sourceUserId: 'user-1',
  targetUserId: 'user-2',
  inboxUrl: 'https://a.example/inbox',
}

const LEGACY_UNDO_FOLLOW_DATA = {
  activityId: 'legacy-undo-follow',
  activityType: 'UndoFollow',
  sourceUserId: 'user-1',
  targetUserId: 'user-2',
  inboxUrl: 'https://a.example/inbox',
} as unknown as DeliverActivityData

const LEGACY_UNDO_LIKE_DATA = {
  activityId: 'legacy-undo-like',
  activityType: 'UndoLike',
  sourceUserId: 'user-1',
  targetPostId: 'post-1',
  inboxUrl: 'https://a.example/inbox',
} as unknown as DeliverActivityData

const BLANK_UNDO_LIKE_DATA: DeliverActivityData = {
  activityId: 'blank-undo-like',
  activityType: 'UndoLike',
  originalActivityId: '   ',
  sourceUserId: 'user-1',
  targetPostId: 'post-1',
  inboxUrl: 'https://a.example/inbox',
}

function deliverDeps() {
  return {
    buildActivityJson: buildActivityJsonMock,
    deliverActivityToInbox: deliverActivityToInboxMock,
    getActorPrivateKeyPem: getActorPrivateKeyPemMock,
    isFederationEnabledForUser: isFederationEnabledForUserMock,
  }
}

describe('deliverActivity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isFederationEnabledForUserMock.mockResolvedValue(true)
    getActorPrivateKeyPemMock.mockResolvedValue('-----BEGIN PRIVATE KEY-----\nfake\n-----END-----')
    buildActivityJsonMock.mockReturnValue({ type: 'Follow' })
    deliverActivityToInboxMock.mockResolvedValue(undefined)
  })

  it.each([
    ['UndoFollow', LEGACY_UNDO_FOLLOW_DATA],
    ['UndoLike', LEGACY_UNDO_LIKE_DATA],
    ['UndoLike with a blank original id', BLANK_UNDO_LIKE_DATA],
  ])('terminally drops a legacy %s job before build or HTTP', async (_name, data) => {
    const result = await deliverActivity(data, deliverDeps())

    expect(result).toEqual({ delivered: false, reason: 'missing-original-activity-id' })
    expect(isFederationEnabledForUserMock).not.toHaveBeenCalled()
    expect(getActorPrivateKeyPemMock).not.toHaveBeenCalled()
    expect(buildActivityJsonMock).not.toHaveBeenCalled()
    expect(deliverActivityToInboxMock).not.toHaveBeenCalled()
  })

  it('drops the job without throwing when the source had federation disabled after the job was enqueued', async () => {
    isFederationEnabledForUserMock.mockResolvedValueOnce(false)

    const result = await deliverActivity(FOLLOW_DATA, deliverDeps())

    expect(result).toEqual({ delivered: false, reason: 'federation-disabled' })
    expect(getActorPrivateKeyPemMock).not.toHaveBeenCalled()
    expect(deliverActivityToInboxMock).not.toHaveBeenCalled()
  })

  it('drops a Follow job without throwing when the target had federation disabled after the job was enqueued', async () => {
    isFederationEnabledForUserMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false)

    const result = await deliverActivity(FOLLOW_DATA, deliverDeps())

    expect(result).toEqual({ delivered: false, reason: 'federation-disabled' })
    expect(isFederationEnabledForUserMock).toHaveBeenNthCalledWith(1, 'user-1')
    expect(isFederationEnabledForUserMock).toHaveBeenNthCalledWith(2, 'user-2')
    expect(getActorPrivateKeyPemMock).not.toHaveBeenCalled()
    expect(deliverActivityToInboxMock).not.toHaveBeenCalled()
  })

  it('drops the job without throwing when the sender has no actor keypair', async () => {
    getActorPrivateKeyPemMock.mockResolvedValueOnce(null)

    const result = await deliverActivity(FOLLOW_DATA, deliverDeps())

    expect(result).toEqual({ delivered: false, reason: 'missing-actor-keypair' })
    expect(deliverActivityToInboxMock).not.toHaveBeenCalled()
  })

  it('drops an UndoFollow job without throwing when the target had federation disabled after the job was enqueued', async () => {
    isFederationEnabledForUserMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false)

    const result = await deliverActivity(UNDO_FOLLOW_DATA, deliverDeps())

    expect(result).toEqual({ delivered: false, reason: 'federation-disabled' })
    expect(deliverActivityToInboxMock).not.toHaveBeenCalled()
  })

  it('builds the activity and signs+delivers it to the inbox', async () => {
    const result = await deliverActivity(FOLLOW_DATA, deliverDeps())

    expect(result).toEqual({ delivered: true })
    expect(buildActivityJsonMock).toHaveBeenCalledWith(FOLLOW_DATA)
    expect(deliverActivityToInboxMock).toHaveBeenCalledWith({
      inboxUrl: FOLLOW_DATA.inboxUrl,
      activity: { type: 'Follow' },
      keyId: expect.stringContaining('user-1'),
      privateKeyPem: '-----BEGIN PRIVATE KEY-----\nfake\n-----END-----',
    })
  })

  it('converts a permanent 4xx delivery failure to UnrecoverableError', async () => {
    deliverActivityToInboxMock.mockRejectedValueOnce(createHttpError(410, 'Gone'))

    await expect(deliverActivity(FOLLOW_DATA, deliverDeps())).rejects.toBeInstanceOf(
      UnrecoverableError,
    )
  })

  it('rethrows a retryable 5xx delivery failure as-is', async () => {
    const serverError = createHttpError(503, 'Unavailable')
    deliverActivityToInboxMock.mockRejectedValueOnce(serverError)

    await expect(deliverActivity(FOLLOW_DATA, deliverDeps())).rejects.toBe(serverError)
  })

  it('requeues a 429 for the remote Retry-After through the real delivery request', async () => {
    const { privateKeyPem } = generateRsaSha256KeyPair()
    const fetch = vi
      .fn<VitestLooseMock>()
      .mockResolvedValue(
        new Response('slow down', { status: 429, headers: { 'Retry-After': '120' } }),
      )
    getActorPrivateKeyPemMock.mockResolvedValueOnce(privateKeyPem)
    deliverActivityToInboxMock.mockImplementationOnce(input =>
      deliverActivityToInbox(input, {
        validateUrl: vi.fn<VitestLooseMock>().mockResolvedValue([]),
        fetch,
      }),
    )

    const thrown: unknown = await deliverActivity(FOLLOW_DATA, deliverDeps()).catch(
      (err: unknown) => err,
    )

    expect(thrown).toMatchObject({
      name: 'RateLimitError',
      delayMs: 120_000,
      cause: { status: 429, retryAfterMs: 120_000 },
    })
  })

  it('keeps a 429 that names no wait on the bounded attempt path', async () => {
    const limited = Object.assign(createHttpError(429, 'Too Many Requests'), { retryAfterMs: null })
    deliverActivityToInboxMock.mockRejectedValueOnce(limited)

    await expect(deliverActivity(FOLLOW_DATA, deliverDeps())).rejects.toBe(limited)
  })
})
