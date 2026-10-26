import { beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import type {
  deliverActivityToInbox,
  prepareActivityDistributionPage,
} from '@services/activitypub-delivery'
import type { isFederationEnabledForUser } from '@services/users'
import { createTestUserDirect, insertTestPost } from '@voucha/test-helpers'
import { observePostgresReadRoutingForTest } from '@voucha/test-helpers/postgres-read-routing'
import { updateUserFields } from '@services/users/update-fields'
import { getOrCreateActorKeyPair } from '@services/ap-actor-keys'
import type { enqueueBulkDeliverActivity } from '@queues/activitypub/enqueues/delivery'
import { deliverActivity, distributeActivity } from './delivery.mts'
import {
  FOLLOW_DATA,
  UNDO_FOLLOW_DATA,
  LIKE_DATA,
  LEGACY_UNDO_FOLLOW_DATA,
  LEGACY_UNDO_LIKE_DATA,
} from '@voucha/test-helpers/activitypub-distribution-worker-fixtures'

const enqueueBulkDeliverActivityMock = vi.fn<typeof enqueueBulkDeliverActivity>()
const isFederationEnabledForUserMock = vi.fn<typeof isFederationEnabledForUser>()
const prepareActivityDistributionPageMock = vi.fn<typeof prepareActivityDistributionPage>()

function distributeDeps() {
  return {
    enqueueBulkDeliverActivity: enqueueBulkDeliverActivityMock,
    isFederationEnabledForUser: isFederationEnabledForUserMock,
    prepareActivityDistributionPage: prepareActivityDistributionPageMock,
  }
}

describe('distributeActivity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isFederationEnabledForUserMock.mockResolvedValue(true)
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
    const author = await createTestUserDirect()
    const postId = await insertTestPost({
      createdById: author.id,
      title: 'Private distribution target',
      slug: `private-distribution-${randomUUID()}`,
      markdown: 'Only the author can read this post.',
      broadcast: 'users',
      privacy: 'private',
    })
    await expect(
      distributeActivity(
        {
          activityId: LIKE_DATA.activityId,
          activityType: 'Like',
          sourceUserId: LIKE_DATA.sourceUserId,
          targetPostId: postId,
        },
        distributeDeps(),
      ),
    ).resolves.toEqual({
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
    await expect(distributeActivity(FOLLOW_DATA, distributeDeps())).resolves.toEqual({
      enqueued: 2,
      completed: false,
      cursor: 'remote-actor-2',
    })
    expect(prepareActivityDistributionPageMock).toHaveBeenCalledWith('user-1', null, undefined)
    expect(enqueueBulkDeliverActivityMock).toHaveBeenCalledWith([
      { ...FOLLOW_DATA, inboxUrl: 'https://a.example/inbox' },
      { ...FOLLOW_DATA, inboxUrl: 'https://b.example/inbox' },
    ])
  })

  it('retries the same page when Valkey rejects delivery admission', async () => {
    const error = new Error('Valkey rejected the batch')
    enqueueBulkDeliverActivityMock.mockRejectedValueOnce(error)
    await expect(distributeActivity(FOLLOW_DATA, distributeDeps())).rejects.toBe(error)
    expect(prepareActivityDistributionPageMock).toHaveBeenCalledTimes(1)
  })
})

describe('ActivityPub terminal eligibility reads', () => {
  it('checks both Follow participants on primary before completing distribution', async () => {
    const source = await createTestUserDirect()
    const target = await createTestUserDirect()
    await Promise.all([
      updateUserFields(source.id, { is_fediverse_federation_enabled: true }),
      updateUserFields(target.id, { is_fediverse_federation_enabled: true }),
    ])
    const data = {
      activityId: randomUUID(),
      activityType: 'Follow' as const,
      sourceUserId: source.id,
      targetUserId: target.id,
    }

    const routing = await observePostgresReadRoutingForTest()
    try {
      await expect(routing.run(() => distributeActivity(data))).resolves.toEqual({
        enqueued: 0,
        completed: true,
      })
      // Source opt-in, target opt-in, and the admitted follower page each acquire primary.
      expect(routing.primaryAcquisitions()).toBe(3)
      expect(routing.replicaAcquisitions()).toBe(0)

      await updateUserFields(target.id, { is_fediverse_federation_enabled: false })
      await expect(routing.run(() => distributeActivity(data))).resolves.toEqual({
        enqueued: 0,
        completed: true,
      })
      // The disabled target prevents the page read after the two authoritative opt-in reads.
      expect(routing.primaryAcquisitions()).toBe(5)
      expect(routing.replicaAcquisitions()).toBe(0)
    } finally {
      await routing.close()
    }
  })

  it('checks both opt-ins and the actor key on primary before delivering', async () => {
    const source = await createTestUserDirect()
    const target = await createTestUserDirect()
    await Promise.all([
      updateUserFields(source.id, { is_fediverse_federation_enabled: true }),
      updateUserFields(target.id, { is_fediverse_federation_enabled: true }),
    ])
    await getOrCreateActorKeyPair(source.id)
    const send = vi.fn<typeof deliverActivityToInbox>().mockResolvedValue(undefined)
    const routing = await observePostgresReadRoutingForTest()
    try {
      await expect(
        routing.run(() =>
          deliverActivity(
            {
              activityId: randomUUID(),
              activityType: 'Follow',
              sourceUserId: source.id,
              targetUserId: target.id,
              inboxUrl: 'https://follower.example/inbox',
            },
            { deliverActivityToInbox: send },
          ),
        ),
      ).resolves.toEqual({ delivered: true })
      expect(send).toHaveBeenCalledOnce()
      // Two opt-in reads and the actor-key read must all reach the writer before HTTP delivery.
      expect(routing.primaryAcquisitions()).toBe(3)
      expect(routing.replicaAcquisitions()).toBe(0)
    } finally {
      await routing.close()
    }
  })
})
