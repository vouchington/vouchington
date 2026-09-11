import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  commitActivityDistributionPage,
  prepareActivityDistributionPage,
} from '@services/activitypub-delivery'
import type { isFederationEnabledForUser } from '@services/users'
import type {
  enqueueBulkDeliverActivity,
  enqueueDistributeActivity,
  DistributeActivityData,
} from '@queues/activitypub-delivery/enqueues'
import { distributeActivity } from './processors.mts'

const enqueueBulkDeliverActivityMock = vi.fn<typeof enqueueBulkDeliverActivity>()
const enqueueDistributeActivityMock = vi.fn<typeof enqueueDistributeActivity>()
const isFederationEnabledForUserMock = vi.fn<typeof isFederationEnabledForUser>()
const prepareActivityDistributionPageMock = vi.fn<typeof prepareActivityDistributionPage>()
const commitActivityDistributionPageMock = vi.fn<typeof commitActivityDistributionPage>()

const FOLLOW_DATA: DistributeActivityData = {
  activityId: 'activity-1',
  activityType: 'Follow',
  sourceUserId: 'user-1',
  targetUserId: 'user-2',
}

const UNDO_FOLLOW_DATA: DistributeActivityData = {
  activityId: 'activity-3',
  activityType: 'UndoFollow',
  originalActivityId: 'activity-1',
  sourceUserId: 'user-1',
  targetUserId: 'user-2',
}

const LIKE_DATA: DistributeActivityData = {
  activityId: 'activity-2',
  activityType: 'Like',
  sourceUserId: 'user-1',
  targetPostId: 'post-1',
}

const LEGACY_UNDO_FOLLOW_DATA = {
  activityId: 'legacy-undo-follow',
  activityType: 'UndoFollow',
  sourceUserId: 'user-1',
  targetUserId: 'user-2',
} as unknown as DistributeActivityData

const LEGACY_UNDO_LIKE_DATA = {
  activityId: 'legacy-undo-like',
  activityType: 'UndoLike',
  sourceUserId: 'user-1',
  targetPostId: 'post-1',
} as unknown as DistributeActivityData

const BLANK_UNDO_LIKE_DATA: DistributeActivityData = {
  activityId: 'blank-undo-like',
  activityType: 'UndoLike',
  originalActivityId: '   ',
  sourceUserId: 'user-1',
  targetPostId: 'post-1',
}

function distributeDeps() {
  return {
    enqueueBulkDeliverActivity: enqueueBulkDeliverActivityMock,
    enqueueDistributeActivity: enqueueDistributeActivityMock,
    isFederationEnabledForUser: isFederationEnabledForUserMock,
    prepareActivityDistributionPage: prepareActivityDistributionPageMock,
    commitActivityDistributionPage: commitActivityDistributionPageMock,
  }
}

describe('distributeActivity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isFederationEnabledForUserMock.mockResolvedValue(true)
    enqueueBulkDeliverActivityMock.mockResolvedValue(undefined as never)
    enqueueDistributeActivityMock.mockResolvedValue(undefined as never)
    prepareActivityDistributionPageMock.mockResolvedValue({
      status: 'ready',
      expectedRemoteActorId: null,
      nextRemoteActorId: 'remote-actor-1',
      inboxUrls: ['https://a.example/inbox'],
      hasMore: false,
    })
    commitActivityDistributionPageMock.mockResolvedValue(true)
  })

  it.each([
    ['UndoFollow', LEGACY_UNDO_FOLLOW_DATA],
    ['UndoLike', LEGACY_UNDO_LIKE_DATA],
    ['UndoLike with a blank original id', BLANK_UNDO_LIKE_DATA],
  ])('terminally drops a legacy %s job without fanout', async (_name, data) => {
    const result = await distributeActivity(data, distributeDeps())

    expect(result).toEqual({ enqueued: 0, reason: 'missing-original-activity-id' })
    expect(isFederationEnabledForUserMock).not.toHaveBeenCalled()
    expect(prepareActivityDistributionPageMock).not.toHaveBeenCalled()
    expect(enqueueBulkDeliverActivityMock).not.toHaveBeenCalled()
  })

  it('short-circuits without streaming followers when the source has federation disabled', async () => {
    isFederationEnabledForUserMock.mockResolvedValueOnce(false)

    const result = await distributeActivity(FOLLOW_DATA, distributeDeps())

    expect(result).toEqual({ enqueued: 0 })
    expect(prepareActivityDistributionPageMock).not.toHaveBeenCalled()
  })

  it('short-circuits a Follow without streaming followers when the target has federation disabled', async () => {
    isFederationEnabledForUserMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false)

    const result = await distributeActivity(FOLLOW_DATA, distributeDeps())

    expect(result).toEqual({ enqueued: 0 })
    expect(isFederationEnabledForUserMock).toHaveBeenNthCalledWith(1, 'user-1')
    expect(isFederationEnabledForUserMock).toHaveBeenNthCalledWith(2, 'user-2')
    expect(prepareActivityDistributionPageMock).not.toHaveBeenCalled()
  })

  it('short-circuits an UndoFollow without streaming followers when the target has federation disabled', async () => {
    isFederationEnabledForUserMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false)

    const result = await distributeActivity(UNDO_FOLLOW_DATA, distributeDeps())

    expect(result).toEqual({ enqueued: 0 })
    expect(prepareActivityDistributionPageMock).not.toHaveBeenCalled()
  })

  it('does not check a target opt-in for Like activities', async () => {
    await distributeActivity(LIKE_DATA, distributeDeps())

    expect(isFederationEnabledForUserMock).toHaveBeenCalledTimes(1)
    expect(isFederationEnabledForUserMock).toHaveBeenCalledWith('user-1')
  })

  it('enqueues one bounded prepared page before committing its cursor', async () => {
    prepareActivityDistributionPageMock.mockResolvedValueOnce({
      status: 'ready',
      expectedRemoteActorId: 'remote-actor-0',
      nextRemoteActorId: 'remote-actor-3',
      inboxUrls: ['https://a.example/inbox', 'https://b.example/inbox'],
      hasMore: false,
    })

    const result = await distributeActivity(FOLLOW_DATA, distributeDeps())

    expect(result).toEqual({ enqueued: 2, completed: true })
    expect(enqueueBulkDeliverActivityMock).toHaveBeenCalledWith([
      { ...FOLLOW_DATA, inboxUrl: 'https://a.example/inbox' },
      { ...FOLLOW_DATA, inboxUrl: 'https://b.example/inbox' },
    ])
    expect(commitActivityDistributionPageMock).toHaveBeenCalledWith(
      'activity-1',
      'user-1',
      'remote-actor-0',
      'remote-actor-3',
      true,
    )
    expect(enqueueBulkDeliverActivityMock.mock.invocationCallOrder[0]).toBeLessThan(
      commitActivityDistributionPageMock.mock.invocationCallOrder[0]!,
    )
  })

  it('enqueues exactly one continuation after committing a nonterminal page', async () => {
    prepareActivityDistributionPageMock.mockResolvedValueOnce({
      status: 'ready',
      expectedRemoteActorId: null,
      nextRemoteActorId: 'remote-actor-1',
      inboxUrls: ['https://a.example/inbox'],
      hasMore: true,
    })

    const result = await distributeActivity(FOLLOW_DATA, distributeDeps())

    expect(result).toEqual({ enqueued: 1, completed: false })
    expect(enqueueDistributeActivityMock).toHaveBeenCalledWith(FOLLOW_DATA)
  })

  it('does not commit or continue when the delivery batch rejects', async () => {
    const error = new Error('Valkey rejected the batch')
    enqueueBulkDeliverActivityMock.mockRejectedValueOnce(error)

    await expect(distributeActivity(FOLLOW_DATA, distributeDeps())).rejects.toBe(error)

    expect(commitActivityDistributionPageMock).not.toHaveBeenCalled()
    expect(enqueueDistributeActivityMock).not.toHaveBeenCalled()
  })

  it('retries a rejected later page without rereading or enqueueing the committed first page', async () => {
    let committedCursor: string | null = null
    const readCursors: Array<string | null> = []
    const pageOne = {
      status: 'ready' as const,
      expectedRemoteActorId: null,
      nextRemoteActorId: 'remote-actor-500',
      inboxUrls: ['https://page-one.example/inbox'],
      hasMore: true,
    }
    const pageTwo = {
      status: 'ready' as const,
      expectedRemoteActorId: 'remote-actor-500',
      nextRemoteActorId: 'remote-actor-501',
      inboxUrls: ['https://page-two.example/inbox'],
      hasMore: false,
    }
    prepareActivityDistributionPageMock.mockImplementation(async () => {
      readCursors.push(committedCursor)
      return committedCursor === null ? pageOne : pageTwo
    })
    commitActivityDistributionPageMock.mockImplementation(
      async (_activityId, _sourceUserId, expectedCursor, nextCursor) => {
        if (expectedCursor !== committedCursor) return false
        committedCursor = nextCursor
        return true
      },
    )
    const enqueueError = new Error('Valkey rejected page two')
    enqueueBulkDeliverActivityMock.mockResolvedValueOnce(undefined as never)
    enqueueBulkDeliverActivityMock.mockRejectedValueOnce(enqueueError)
    enqueueBulkDeliverActivityMock.mockResolvedValueOnce(undefined as never)

    await distributeActivity(FOLLOW_DATA, distributeDeps())
    await expect(distributeActivity(FOLLOW_DATA, distributeDeps())).rejects.toBe(enqueueError)
    await distributeActivity(FOLLOW_DATA, distributeDeps())

    expect(committedCursor).toBe('remote-actor-501')
    expect(readCursors).toEqual([null, 'remote-actor-500', 'remote-actor-500'])
    expect(enqueueBulkDeliverActivityMock).toHaveBeenNthCalledWith(1, [
      { ...FOLLOW_DATA, inboxUrl: 'https://page-one.example/inbox' },
    ])
    expect(enqueueBulkDeliverActivityMock).toHaveBeenNthCalledWith(2, [
      { ...FOLLOW_DATA, inboxUrl: 'https://page-two.example/inbox' },
    ])
    expect(enqueueBulkDeliverActivityMock).toHaveBeenNthCalledWith(3, [
      { ...FOLLOW_DATA, inboxUrl: 'https://page-two.example/inbox' },
    ])
  })

  it('surfaces a continuation failure after committing the page', async () => {
    const error = new Error('Valkey rejected the continuation')
    prepareActivityDistributionPageMock.mockResolvedValueOnce({
      status: 'ready',
      expectedRemoteActorId: null,
      nextRemoteActorId: 'remote-actor-1',
      inboxUrls: ['https://a.example/inbox'],
      hasMore: true,
    })
    enqueueDistributeActivityMock.mockRejectedValueOnce(error)

    await expect(distributeActivity(FOLLOW_DATA, distributeDeps())).rejects.toBe(error)

    expect(commitActivityDistributionPageMock).toHaveBeenCalledTimes(1)
  })

  it('does not enqueue or commit a completed checkpoint', async () => {
    prepareActivityDistributionPageMock.mockResolvedValueOnce({ status: 'completed' })

    const result = await distributeActivity(FOLLOW_DATA, distributeDeps())

    expect(result).toEqual({ enqueued: 0, completed: true })
    expect(enqueueBulkDeliverActivityMock).not.toHaveBeenCalled()
    expect(commitActivityDistributionPageMock).not.toHaveBeenCalled()
    expect(enqueueDistributeActivityMock).not.toHaveBeenCalled()
  })

  it('commits an empty page without enqueueing a delivery batch', async () => {
    prepareActivityDistributionPageMock.mockResolvedValueOnce({
      status: 'ready',
      expectedRemoteActorId: null,
      nextRemoteActorId: null,
      inboxUrls: [],
      hasMore: false,
    })

    const result = await distributeActivity(FOLLOW_DATA, distributeDeps())

    expect(result).toEqual({ enqueued: 0, completed: true })
    expect(enqueueBulkDeliverActivityMock).not.toHaveBeenCalled()
    expect(commitActivityDistributionPageMock).toHaveBeenCalledWith(
      'activity-1',
      'user-1',
      null,
      null,
      true,
    )
  })

  it('does not enqueue a continuation after a stale checkpoint compare-and-swap', async () => {
    commitActivityDistributionPageMock.mockResolvedValueOnce(false)

    const result = await distributeActivity(FOLLOW_DATA, distributeDeps())

    expect(result).toEqual({ enqueued: 1, completed: false, stale: true })
    expect(enqueueDistributeActivityMock).not.toHaveBeenCalled()
  })
})
