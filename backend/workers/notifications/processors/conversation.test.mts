import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTestGroupConversation,
  createTestChatConversationWithParticipant,
  createTestUser,
  insertTestBlock,
  insertTestMute,
  insertTestCommunity,
  insertTestCommunityMember,
  softDeleteEntityRelationTest,
} from '@voucha/test-helpers'
import {
  withCapturedTestQueries,
  countCapturedQueriesByAnnotation,
} from '@voucha/test-helpers/query-capture'
import { openModmailThread } from '@services/modmail/threads'
import { listNotifications } from '@services/notifications/list'
import { processConversationMessageNotification } from './conversation.mts'
import type { enqueueBulkDeliverNotificationPushIntents } from '@queues/notifications/enqueues'

const enqueuePushes = vi.fn<typeof enqueueBulkDeliverNotificationPushIntents>()

async function dispatch(conversationId: string, senderId: string) {
  return withCapturedTestQueries(() =>
    processConversationMessageNotification(
      { conversationId, senderId, messageId: crypto.randomUUID() },
      { enqueueBulkDeliverNotificationPushIntents: enqueuePushes },
    ),
  )
}

describe('conversation notification relation filtering', () => {
  beforeEach(() => {
    enqueuePushes.mockReset().mockResolvedValue(undefined)
  })

  it('filters blocks and mutes in both directions with one relation query and one insert', async () => {
    const [sender, outboundBlock, inboundBlock, outboundMute, inboundMute, unblocked] =
      await Promise.all(Array.from({ length: 6 }, () => createTestUser()))
    const conversation = await createTestGroupConversation({
      createdById: sender.id,
      memberUserIds: [outboundBlock, inboundBlock, outboundMute, inboundMute, unblocked].map(
        user => user.id,
      ),
    })
    await insertTestBlock(sender.id, outboundBlock.id)
    await insertTestBlock(inboundBlock.id, sender.id)
    await insertTestMute(sender.id, outboundMute.id)
    await insertTestMute(inboundMute.id, sender.id)

    const { queries } = await dispatch(conversation.id, sender.id)

    expect(countCapturedQueriesByAnnotation(queries, 'getUserIdsBlockedOrMutedEitherWay')).toBe(1)
    expect(countCapturedQueriesByAnnotation(queries, 'createDirectMessageNotifications')).toBe(1)
    const payload = enqueuePushes.mock.calls[0]?.[0]
    expect(payload).toHaveLength(1)
    expect(payload?.[0]?.userId).toBe(unblocked.id)
    for (const recipient of [outboundBlock, inboundBlock, outboundMute, inboundMute]) {
      expect((await listNotifications(recipient.id)).results).toHaveLength(0)
    }
    expect((await listNotifications(unblocked.id)).results.map(row => row.id)).toEqual([
      payload?.[0]?.notificationId,
    ])

    await softDeleteEntityRelationTest('relation__user__block__user', sender.id, outboundBlock.id)
    await softDeleteEntityRelationTest('relation__user__block__user', inboundBlock.id, sender.id)
    await softDeleteEntityRelationTest('relation__user__mute__user', sender.id, outboundMute.id)
    await softDeleteEntityRelationTest('relation__user__mute__user', inboundMute.id, sender.id)
    enqueuePushes.mockClear()
    const second = await dispatch(conversation.id, sender.id)
    expect(
      countCapturedQueriesByAnnotation(second.queries, 'getUserIdsBlockedOrMutedEitherWay'),
    ).toBe(1)
    expect(
      countCapturedQueriesByAnnotation(second.queries, 'createDirectMessageNotifications'),
    ).toBe(1)
    const secondPayload = enqueuePushes.mock.calls[0]?.[0] ?? []
    expect(new Set(secondPayload.map(intent => intent.userId))).toEqual(
      new Set(
        [outboundBlock, inboundBlock, outboundMute, inboundMute, unblocked].map(user => user.id),
      ),
    )
    for (const intent of secondPayload) {
      expect((await listNotifications(intent.userId)).results.map(row => row.id)).toEqual([
        intent.notificationId,
      ])
    }
  })

  it('delivers modmail despite a block and does not query relations', async () => {
    const owner = await createTestUser()
    const subject = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    const thread = await openModmailThread(subject.id, community.id, subject.id)
    await insertTestBlock(subject.id, owner.id)

    const { queries } = await dispatch(thread.id, owner.id)

    expect(countCapturedQueriesByAnnotation(queries, 'getUserIdsBlockedOrMutedEitherWay')).toBe(0)
    expect(countCapturedQueriesByAnnotation(queries, 'createModmailNotifications')).toBe(1)
    const payload = enqueuePushes.mock.calls[0]?.[0]
    expect(payload).toHaveLength(1)
    expect(payload?.[0]?.userId).toBe(subject.id)
    expect((await listNotifications(subject.id)).results.map(row => row.id)).toEqual([
      payload?.[0]?.notificationId,
    ])
  })

  it('does not write notifications when every direct-message recipient is blocked', async () => {
    const sender = await createTestUser()
    const recipient = await createTestUser()
    const conversation = await createTestGroupConversation({
      createdById: sender.id,
      memberUserIds: [recipient.id],
    })
    await insertTestBlock(recipient.id, sender.id)

    const { queries } = await dispatch(conversation.id, sender.id)

    expect(countCapturedQueriesByAnnotation(queries, 'getUserIdsBlockedOrMutedEitherWay')).toBe(1)
    expect(countCapturedQueriesByAnnotation(queries, 'createDirectMessageNotifications')).toBe(0)
    expect((await listNotifications(recipient.id)).results).toHaveLength(0)
    expect(enqueuePushes).toHaveBeenCalledExactlyOnceWith([])
  })

  it('rejects a chat event routed to the conversation notification worker', async () => {
    const sender = await createTestUser()
    const recipient = await createTestUser()
    const conversation = await createTestChatConversationWithParticipant(sender.id, recipient.id)

    await expect(dispatch(conversation.id, sender.id)).rejects.toThrow('unknown channel_type: chat')
    expect((await listNotifications(recipient.id)).results).toHaveLength(0)
    expect(enqueuePushes).not.toHaveBeenCalled()
  })
})
