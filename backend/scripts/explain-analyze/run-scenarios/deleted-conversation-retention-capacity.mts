import assert from 'node:assert/strict'
import { beginTransaction, write, type TransactionQuery } from '@data-stores/psql'
import { cleanupDeletedConversationPage } from '@services/data-retention/cleanup-deleted-conversations'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import {
  conversationRetentionPageSize as pageSize,
  seedDeletedConversationRetentionCapacity,
} from './deleted-conversation-retention-fixture.mts'

export async function runDeletedConversationRetentionCapacityScenarios() {
  const fixture = await seedDeletedConversationRetentionCapacity()
  try {
    await write(`/* analyzeConversationRetentionCapacity */
      ANALYZE conversations, conversation_messages, conversation_participants,
        notification_push_intent_subscription_receipts`)
    await runReceiptPage(fixture)
    await runMessagePage(fixture)
    await runParticipantPage(fixture)
  } finally {
    await fixture.cleanup()
  }
}

type Fixture = Awaited<ReturnType<typeof seedDeletedConversationRetentionCapacity>>

async function advanceAfter(query: TransactionQuery, previousId: string | null) {
  await query(sql`
    /* positionConversationRetentionCapacity */
    INSERT INTO operational_tombstone_retention_cursors (cleanup_name, cursor_at, cursor_record_id, sweep_cutoff_at)
    VALUES ('deleted_conversations', (SELECT deleted_at FROM conversations WHERE id = ${previousId}),
      ${previousId}, '1900-01-02'::timestamptz)
    ON CONFLICT (cleanup_name) DO UPDATE SET cursor_at = EXCLUDED.cursor_at,
      cursor_record_id = EXCLUDED.cursor_record_id, sweep_cutoff_at = EXCLUDED.sweep_cutoff_at
  `)
}

async function runReceiptPage(fixture: Fixture) {
  const scenario = 'deleted-conversation-receipt-retention-at-cap'
  const name = 'deleteDeletedConversationNotificationReceiptPage'
  registerScenarioContract(scenario, {
    allowEmptyResult: true,
    // Main's custom plan scans receipts from other conversations. Tighten with the plan fix.
    expectations: [
      {
        kind: 'maxProcessedRows',
        relation: 'notification_push_intent_subscription_receipts',
        max: 11_001,
      },
    ],
    seededRows: fixture.seededRows,
  })
  await runAndCapture(
    scenario,
    async () => {
      await using query = await beginTransaction()
      await advanceAfter(query, null)
      assert.equal((await cleanupDeletedConversationPage(query, pageSize, {})).hasMore, true)
      assert.deepEqual(
        await remainingReceipts(query, fixture.notificationId),
        fixture.receiptIds.slice(pageSize),
      )
      assert.deepEqual(
        await remainingReceipts(query, fixture.backgroundNotification),
        fixture.otherReceiptIds,
      )
      await query.rollback()
    },
    undefined,
    name,
  )
}

async function remainingReceipts(query: TransactionQuery, notificationId: string) {
  const { rows } = await query<{ subscription_id: string }>(sql`
    /* inspectConversationRetentionCapacity:receipts */
    SELECT subscription_id FROM notification_push_intent_subscription_receipts
    WHERE user_id = ${seedUser.id} AND notification_id = ${notificationId}
    ORDER BY subscription_id
  `)
  return rows.map(row => row.subscription_id)
}

async function runMessagePage(fixture: Fixture) {
  const scenario = 'deleted-conversation-message-retention-at-cap'
  const name = 'deleteConversationMessagePage'
  registerScenarioContract(scenario, {
    allowEmptyResult: true,
    expectations: [
      { kind: 'singleLeaf', parent: 'conversation_messages', key: 'conversation_id' },
      // Main scans the target leaf twice in the custom plan. Tighten with the plan fix.
      { kind: 'maxProcessedRows', relation: 'conversation_messages', max: 23_002 },
    ],
    seededRows: fixture.seededRows,
  })
  await runAndCapture(
    scenario,
    async () => {
      await using query = await beginTransaction()
      await advanceAfter(query, fixture.receiptConversation)
      assert.equal((await cleanupDeletedConversationPage(query, pageSize, {})).hasMore, true)
      const { rows } = await query<{ id: string }>(sql`
        /* inspectConversationRetentionCapacity:messages */
        SELECT id FROM conversation_messages
        WHERE conversation_id IN (${fixture.messageConversation}, ${fixture.backgroundId})
        ORDER BY id
      `)
      const expected = [
        ...fixture.messageIds.slice(pageSize),
        ...fixture.otherMessageIds,
      ].toSorted()
      assert.deepEqual(
        rows.map(row => row.id),
        expected,
      )
      await query.rollback()
    },
    undefined,
    name,
  )
}

async function runParticipantPage(fixture: Fixture) {
  const scenario = 'deleted-conversation-participant-retention-at-cap'
  const name = 'deleteConversationParticipantPage'
  registerScenarioContract(scenario, {
    allowEmptyResult: true,
    // Main's custom plan scans unrelated participants. Tighten with the plan fix.
    expectations: [{ kind: 'maxProcessedRows', relation: 'conversation_participants', max: 4_100 }],
    seededRows: fixture.seededRows,
  })
  await runAndCapture(
    scenario,
    async () => {
      await using query = await beginTransaction()
      await advanceAfter(query, fixture.messageConversation)
      assert.equal(fixture.participantIds.length, 50)
      assert.equal((await cleanupDeletedConversationPage(query, pageSize, {})).hasMore, true)
      const { rows } = await query<{ id: string }>(sql`
        /* inspectConversationRetentionCapacity:participants */
        SELECT id FROM conversation_participants
        WHERE conversation_id IN (${fixture.participantConversation}, ${fixture.backgroundId})
        ORDER BY id
      `)
      assert.deepEqual(
        rows.map(row => row.id),
        fixture.otherParticipantIds,
      )
      await query.rollback()
    },
    undefined,
    name,
  )
}
