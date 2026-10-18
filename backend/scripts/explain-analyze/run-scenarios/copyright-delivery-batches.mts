import { beginTransaction, read } from '@data-stores/psql'
import { createDeterministicCopyrightCorrespondencesInTransaction } from '@services/copyright-notices/correspondence'
import {
  createCopyrightDeliveryIntents,
  insertCopyrightDeliveryRecipients,
} from '@services/copyright-notices/delivery-intent-batch'
import { createCopyrightStatementDeliveriesInTransaction } from '@services/copyright-notices/statement-delivery'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { runCopyrightReadBatchScenarios } from './copyright-read-batches.mts'

const LISTED = 10

/**
 * The development seed files a notice against one hosted post image. Each statement here answers
 * for a whole page of recipients, targets or complaints at once, so it must stay bounded by that
 * page and not by the notice's delivery history.
 */
export async function runCopyrightDeliveryBatchScenarios(): Promise<void> {
  const { rows } = await read<{ notice_id: string; target_id: string }>(
    `/* findCopyrightDeliveryBatchTarget */
    SELECT target.copyright_notice_id AS notice_id, target.id AS target_id
    FROM copyright_notice_targets target
    JOIN image_placements binding ON binding.placement_id = target.placement_id
    ORDER BY target.id
    LIMIT 1`,
  )
  const seeded = rows[0]
  if (!seeded)
    throw new Error(
      'The copyright delivery batch scenarios need the development seed notice; run backend/scripts/seeds/dev-seed.mts before the EXPLAIN seed',
    )
  await runCopyrightReadBatchScenarios({ noticeId: seeded.notice_id, targetId: seeded.target_id })
  await runDeliveryWrites(seeded.notice_id)
  await runDeliveryRecipients(seeded.notice_id)
  await runDeliveryRecipientEmails()
}

// Correspondence and delivery intents for a page of recipients. The intents carry no
// correspondence: the captured statement is replayed after the fixture rolls back, so it cannot
// reference a message created in that transaction.
async function runDeliveryWrites(noticeId: string): Promise<void> {
  registerScenarioContract('copyright-delivery-batches', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'copyright_notices', max: 3 },
      { kind: 'maxProcessedRows', relation: 'copyright_notice_correspondence_messages', max: 12 },
    ],
  })
  await runAndCapture(
    'copyright-delivery-batches',
    async () => {
      await using transaction = await beginTransaction()
      await createDeterministicCopyrightCorrespondencesInTransaction(
        Array.from({ length: LISTED }, () => ({
          noticeId,
          submissionId: null,
          correspondenceKind: 'decision_notice' as const,
          bodyText: 'Seeded EXPLAIN statement',
        })),
        transaction,
      )
      await createCopyrightDeliveryIntents(
        Array.from({ length: LISTED }, (_, index) => ({
          noticeId,
          submissionId: null,
          correspondenceId: null,
          recipientUserId: seedUser.id,
          recipientRole: 'poster' as const,
          deliveryKind: 'status_update' as const,
          channel: 'in_app' as const,
          idempotencyKey: `explain-copyright-delivery:${index}`,
        })),
        transaction,
      )
      await transaction.rollback()
    },
    undefined,
    ['createDeterministicCopyrightCorrespondencesInTransaction', 'createCopyrightDeliveryIntents'],
  )
}

// The recipient lifecycle lock and the live-account check cover every recipient in one statement.
async function runDeliveryRecipients(noticeId: string): Promise<void> {
  registerScenarioContract('copyright-delivery-recipients', {
    expectations: [{ kind: 'maxProcessedRows', relation: 'users', max: 2 }],
    // The existence probe finds no delivery for a key that was never used. The development seed
    // files a handful of deliveries; the unique key index serves a larger table.
    allowEmptyResult: true,
    seededRows: { copyright_notice_delivery_work_items: 100 },
  })
  await runAndCapture(
    'copyright-delivery-recipients',
    async () => {
      await using transaction = await beginTransaction()
      await createCopyrightStatementDeliveriesInTransaction(
        [
          {
            noticeId,
            recipientUserId: seedUser.id,
            recipientRole: 'poster',
            deliveryKind: 'poster_restriction_notice',
            correspondenceKind: 'restriction_notice',
            key: 'explain-copyright-statement:poster',
            text: 'Seeded EXPLAIN statement',
          },
        ],
        transaction,
      )
      await transaction.rollback()
    },
    undefined,
    [
      'createCopyrightStatementDeliveriesInTransaction:existing',
      'createCopyrightStatementDeliveriesInTransaction:recipientLifecycleLock',
      'createCopyrightStatementDeliveriesInTransaction:activeRecipient',
    ],
  )
}

// The email addresses of several intents are stored with one statement. It cannot reference an
// intent created in the fixture transaction, so it targets the seeded intents, and an insert
// with no RETURNING reports no rows.
async function runDeliveryRecipientEmails(): Promise<void> {
  const { rows } = await read<{ id: string }>(
    `/* findCopyrightDeliveryRecipientIntents */
    SELECT id FROM copyright_notice_delivery_work_items ORDER BY id LIMIT ${LISTED}`,
  )
  if (rows.length === 0) throw new Error('The recipient scenario needs seeded delivery intents')
  registerScenarioContract('copyright-delivery-recipient-emails', {
    expectations: [],
    allowEmptyResult: true,
  })
  await runAndCapture(
    'copyright-delivery-recipient-emails',
    async () => {
      await using transaction = await beginTransaction()
      await insertCopyrightDeliveryRecipients(
        rows.map(({ id }) => ({ intentId: id, recipientEmail: 'seeded-explain@example.com' })),
        transaction,
      )
      await transaction.rollback()
    },
    undefined,
    'insertCopyrightDeliveryRecipients',
  )
}
