import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { getUserIdsBlockedOrMutedEitherWay } from '@services/entity-relations'
import { CONVERSATION_PARTICIPANT_HARD_MAX } from '@services/messaging/participant-limits'
import { createDirectMessageNotifications } from '@services/notifications/create-direct-message-notification'
import { createModmailNotifications } from '@services/notifications/create-modmail-notification'
import { getConversationNotificationContext } from '@services/notifications/get-conversation-notification-context'
import { extractQueryName, getCapturedQueries } from '@voucha/test-helpers/explain-analyze'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { continueAfterFailure } from '../scenario-failures.mts'
import { seedUuid } from '../seed-data/common.mts'
import {
  seedExistingNotifications,
  withCapacityModmailConversation,
} from './message-notification-write-fixtures.mts'
import { runNotificationPushIntentClaimCapacity } from './notification-push-intent-claim-capacity.mts'

const senderId = seedUser.id

type NotificationRow = {
  id: string
  user_id: string
  target_path: string
  read_at: Date | null
  pushed_at: Date | null
  push_status: 'pending' | 'delivered' | 'suppressed' | null
}

type ReturnedNotification = Pick<NotificationRow, 'id' | 'user_id'>

async function readNotifications(conversationId: string, userIds: readonly string[]) {
  const { rows } = await write<NotificationRow>(sql`/* verifyExplainMessageNotifications */
    SELECT n.id, n.user_id, n.target_path, n.read_at, n.pushed_at, intent.status AS push_status
    FROM notifications n
    LEFT JOIN notification_push_intents intent
      ON intent.user_id = n.user_id AND intent.notification_id = n.id
    WHERE n.user_id = ANY(${userIds}::uuid[]) AND n.conversation_id = ${conversationId}
    ORDER BY n.user_id
  `)
  return rows
}
async function resetNotifications(conversationId: string, affected: ReturnedNotification[]) {
  if (affected.length === 0) return
  await write(sql`/* resetExplainMessageNotifications */
    DELETE FROM notifications
    WHERE conversation_id = ${conversationId}
      AND user_id = ANY(${affected.map(row => row.user_id)}::uuid[])
      AND id = ANY(${affected.map(row => row.id)}::uuid[])
  `)
}
async function captureNotificationUpsert(input: {
  conversationId: string
  kind: 'direct_message' | 'modmail'
  recipients: string[]
  targetPath: string
  upsert: () => Promise<ReturnedNotification[]>
}) {
  const { conversationId, kind, recipients, targetPath } = input
  const scenario =
    kind === 'modmail' ? 'modmail-notifications-at-cap' : 'direct-message-notifications-at-cap'
  const queryName =
    kind === 'modmail' ? 'createModmailNotifications' : 'createDirectMessageNotifications'
  const scope = [senderId, ...recipients]
  const oldRecipients = recipients.filter((_, index) => index % 2 === 0)
  const existingPath =
    kind === 'modmail' ? `/messages/modmail/prior-community-slug/${conversationId}` : targetPath

  // Current row bounds hold in both modes. Forced-custom trigger costs are tracked in #6399 and #6400.
  registerScenarioContract(scenario, {
    expectations: [{ kind: 'maxProcessedRows', relation: 'notifications', max: recipients.length }],
    forbidSequentialScans: ['notifications'],
  })
  await seedExistingNotifications(conversationId, kind, [senderId, ...oldRecipients], existingPath)
  const before = await readNotifications(conversationId, scope)
  assert.equal(before.length, oldRecipients.length + 1)
  const priorIds = new Set(before.map(row => row.id))
  const untouched = before.find(row => row.user_id === senderId)
  assert.ok(untouched, 'The excluded sender needs an existing notification to check')

  let affected: ReturnedNotification[] = []
  await runAndCapture(
    scenario,
    async () => {
      affected = await input.upsert()
      assert.deepEqual(affected.map(row => row.user_id).toSorted(), recipients.toSorted())
      assert.equal(new Set(affected.map(row => row.id)).size, recipients.length)
      assert.ok(
        affected.every(row => !priorIds.has(row.id)),
        'Every conflict advances its ID',
      )

      const after = await readNotifications(conversationId, scope)
      const byUser = new Map(after.map(row => [row.user_id, row]))
      assert.equal(after.length, recipients.length + 1)
      assert.deepEqual(byUser.get(senderId), untouched, 'The excluded sender row must survive')
      for (const row of affected) {
        assert.deepEqual(byUser.get(row.user_id), {
          id: row.id,
          user_id: row.user_id,
          target_path: targetPath,
          read_at: null,
          pushed_at: null,
          push_status: 'pending',
        })
      }
      assert.equal(
        getCapturedQueries().filter(query => extractQueryName(query.text) === queryName).length,
        1,
      )
    },
    undefined,
    queryName,
    {
      afterCapture: async () => {
        // Restore the conflict mix before EXPLAIN replays each mode in a rolled-back transaction.
        await resetNotifications(conversationId, affected)
        await seedExistingNotifications(conversationId, kind, oldRecipients, existingPath)
      },
    },
  )
}
async function runDirectMessageNotifications() {
  const participantIds = Array.from({ length: CONVERSATION_PARTICIPANT_HARD_MAX - 1 }, (_, index) =>
    seedUuid(10_000 + index, '01'),
  )
  const {
    rows: [conversation],
  } = await write<{ id: string }>(sql`/* seedExplainDirectMessageNotificationConversation */
    INSERT INTO conversations (channel_type, created_by_id)
    VALUES ('direct_message', ${senderId})
    RETURNING id
  `)
  assert.ok(conversation)
  const { id: conversationId } = conversation
  try {
    await write(sql`/* seedExplainDirectMessageNotificationParticipants */
      INSERT INTO conversation_participants (conversation_id, user_id, role, participant_slot)
      SELECT ${conversationId}, user_id,
        CASE WHEN ordinal = 1 THEN 'owner'::conversation_participant_roles ELSE 'member' END,
        ordinal::smallint
      FROM unnest(${[senderId, ...participantIds]}::uuid[]) WITH ORDINALITY AS fixture(user_id, ordinal)
    `)
    const context = await getConversationNotificationContext(conversationId, senderId)
    assert.equal(context?.channel_type, 'direct_message')
    const blocked = await getUserIdsBlockedOrMutedEitherWay(senderId, context.participant_user_ids)
    const recipients = context.participant_user_ids.filter(userId => !blocked.has(userId))
    assert.deepEqual(recipients.toSorted(), participantIds.toSorted())
    await captureNotificationUpsert({
      conversationId,
      kind: 'direct_message',
      recipients,
      targetPath: `/messages/${conversationId}`,
      upsert: () => createDirectMessageNotifications(recipients, conversationId),
    })
  } finally {
    await write(sql`/* cleanupExplainDirectMessageNotificationConversation */
      DELETE FROM conversations WHERE id = ${conversationId}
    `)
  }
}
async function runModmailNotifications() {
  await withCapacityModmailConversation(senderId, async (conversationId, expectedRecipients) => {
    const context = await getConversationNotificationContext(conversationId, senderId)
    assert.equal(context?.channel_type, 'modmail')
    assert.ok(context.community_slug)
    const recipients = context.participant_user_ids
    assert.deepEqual(recipients.toSorted(), expectedRecipients.toSorted())
    const targetPath = `/messages/modmail/${context.community_slug}/${conversationId}`
    await captureNotificationUpsert({
      conversationId,
      kind: 'modmail',
      recipients,
      targetPath,
      upsert: () => createModmailNotifications(recipients, conversationId, targetPath),
    })
  })
}
export async function runMessageNotificationWriteCapacity() {
  await continueAfterFailure('direct-message-notifications-at-cap', runDirectMessageNotifications)
  await continueAfterFailure('modmail-notifications-at-cap', runModmailNotifications)
  await continueAfterFailure(
    'notification-push-intent-claim-at-cap',
    runNotificationPushIntentClaimCapacity,
  )
}
