import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { prepareActivityDistributionPage } from '@services/activitypub-delivery'
import type { isFederationEnabledForUser } from '@services/users'
import type { canDistributeActivityPubLike } from '@services/posts/activitypub-visibility'
import type { enqueueBulkDeliverActivity } from '@queues/activitypub/enqueues/delivery'
import { distributeActivity } from './delivery.mts'
import {
  FOLLOW_DATA,
  UNDO_FOLLOW_DATA,
  LIKE_DATA,
  LEGACY_UNDO_FOLLOW_DATA,
  LEGACY_UNDO_LIKE_DATA,
} from '@voucha/test-helpers/activitypub-distribution-worker-fixtures'

const enqueueBulkDeliverActivityMock = vi.fn<typeof enqueueBulkDeliverActivity>()
const isFederationEnabledForUserMock = vi.fn<typeof isFederationEnabledForUser>()
const canDistributeActivityPubLikeMock = vi.fn<typeof canDistributeActivityPubLike>()
const prepareActivityDistributionPageMock = vi.fn<typeof prepareActivityDistributionPage>()

function distributeDeps() {
  return {
    enqueueBulkDeliverActivity: enqueueBulkDeliverActivityMock,
    isFederationEnabledForUser: isFederationEnabledForUserMock,
    canDistributeActivityPubLike: canDistributeActivityPubLikeMock,
    prepareActivityDistributionPage: prepareActivityDistributionPageMock,
  }
}

describe('distributeActivity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isFederationEnabledForUserMock.mockResolvedValue(true)
    canDistributeActivityPubLikeMock.mockResolvedValue(true)
    enqueueBulkDeliverActivityMock.mockResolvedValue(undefined as never)
    prepareActivityDistributionPageMock.mockResolvedValue({
      nextRemoteActorId: 'remote-actor-1',
      inboxUrls: ['https://a.example/inbox'],
      hasMore: false,
    })
  })

  it.each([
    ['UndoFollow', LEGACY_UNDO_FOLLOW_DATA],
    ['UndoLike', LEGACY_UNDO_LIKE_DATA],
  ])('drops a %s with no original id', async (_name, data) => {
    await expect(distributeActivity(data, distributeDeps())).resolves.toEqual({
      enqueued: 0,
      completed: true,
      reason: 'missing-original-activity-id',
    })
    expect(prepareActivityDistributionPageMock).not.toHaveBeenCalled()
  })

  it('does not fan out when the source disables federation', async () => {
    isFederationEnabledForUserMock.mockResolvedValueOnce(false)
    await expect(distributeActivity(FOLLOW_DATA, distributeDeps())).resolves.toEqual({
      enqueued: 0,
      completed: true,
    })
    expect(prepareActivityDistributionPageMock).not.toHaveBeenCalled()
  })

  it('does not disclose a Follow or UndoFollow target that disables federation', async () => {
    isFederationEnabledForUserMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    await expect(distributeActivity(FOLLOW_DATA, distributeDeps())).resolves.toEqual({
      enqueued: 0,
      completed: true,
    })
    isFederationEnabledForUserMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    await expect(distributeActivity(UNDO_FOLLOW_DATA, distributeDeps())).resolves.toEqual({
      enqueued: 0,
      completed: true,
    })
    expect(prepareActivityDistributionPageMock).not.toHaveBeenCalled()
  })

  it('suppresses a Like when its post is no longer public before fan-out', async () => {
    canDistributeActivityPubLikeMock.mockResolvedValueOnce(false)
    await expect(distributeActivity(LIKE_DATA, distributeDeps())).resolves.toEqual({
      enqueued: 0,
      completed: true,
    })
    expect(prepareActivityDistributionPageMock).not.toHaveBeenCalled()
    expect(enqueueBulkDeliverActivityMock).not.toHaveBeenCalled()
  })

  it('admits the page and passes its cursor to the next dispatcher job', async () => {
    prepareActivityDistributionPageMock.mockResolvedValueOnce({
      nextRemoteActorId: 'remote-actor-2',
      inboxUrls: ['https://a.example/inbox', 'https://b.example/inbox'],
      hasMore: true,
    })
    await expect(distributeActivity(LIKE_DATA, distributeDeps())).resolves.toEqual({
      enqueued: 2,
      completed: false,
      cursor: 'remote-actor-2',
    })
    expect(prepareActivityDistributionPageMock).toHaveBeenCalledWith('user-1', null, undefined)
    expect(enqueueBulkDeliverActivityMock).toHaveBeenCalledWith([
      { ...LIKE_DATA, inboxUrl: 'https://a.example/inbox' },
      { ...LIKE_DATA, inboxUrl: 'https://b.example/inbox' },
    ])
  })

  it('retries the same page when Valkey rejects delivery admission', async () => {
    const error = new Error('Valkey rejected the batch')
    enqueueBulkDeliverActivityMock.mockRejectedValueOnce(error)
    await expect(distributeActivity(FOLLOW_DATA, distributeDeps())).rejects.toBe(error)
    expect(prepareActivityDistributionPageMock).toHaveBeenCalledTimes(1)
  })
})
