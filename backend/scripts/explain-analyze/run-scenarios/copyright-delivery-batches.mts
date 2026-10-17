import { beginTransaction, read } from '@data-stores/psql'
import { createDeterministicCopyrightCorrespondencesInTransaction } from '@services/copyright-notices/correspondence'
import { createCopyrightDeliveryIntents } from '@services/copyright-notices/delivery-intent-batch'
import { getCopyrightJurisdictionAvailability } from '@services/copyright-notices/jurisdiction-policy'
import { selectCopyrightTargetPosters } from '@services/copyright-notices/restriction-poster-notices'
import { createCopyrightStatementDeliveriesInTransaction } from '@services/copyright-notices/statement-delivery'
import { getTerritorialInformedWindows } from '@services/copyright-notices/territorial-informed-at'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'

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
  await runTargetPosters(seeded.target_id)
  await runInformedWindows(seeded.notice_id)
  await runDeliveryWrites(seeded.notice_id)
  await runDeliveryRecipients(seeded.notice_id)
  await runJurisdictionAvailability()
}

// Poster and community-owner recipients of one target come back in one statement.
async function runTargetPosters(targetId: string): Promise<void> {
  registerScenarioContract('copyright-target-posters', {
    expectations: [{ kind: 'maxProcessedRows', relation: 'posts', max: 2 }],
  })
  await runAndCapture(
    'copyright-target-posters',
    async () => {
      await using transaction = await beginTransaction()
      const parties = await selectCopyrightTargetPosters([targetId], transaction, [
        'notify',
        'inform',
      ])
      await transaction.rollback()
      if (parties.length === 0) throw new Error('The seeded target needs at least one poster')
    },
    undefined,
    'selectCopyrightTargetPosters',
  )
}

// One statement answers the informed-at window of every listed complaint.
async function runInformedWindows(noticeId: string): Promise<void> {
  registerScenarioContract('copyright-informed-windows', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'copyright_notice_delivery_work_items', max: 3 },
    ],
    // The development seed files a handful of deliveries; the notice index serves a larger table.
    seededRows: { copyright_notice_delivery_work_items: 100 },
  })
  await runAndCapture(
    'copyright-informed-windows',
    async () => {
      await using transaction = await beginTransaction()
      const windows = await getTerritorialInformedWindows(
        Array.from({ length: LISTED }, (_, index) => ({
          noticeId,
          decidedAt: new Date(0),
          notifier: true,
          posterUserId: index % 2 === 0 ? seedUser.id : undefined,
        })),
        transaction,
      )
      await transaction.rollback()
      if (windows.length !== LISTED) throw new Error('Every listed complaint needs a window')
    },
    undefined,
    'getTerritorialInformedWindows',
  )
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
      'createCopyrightStatementDeliveriesInTransaction:recipientLifecycleLock',
      'createCopyrightStatementDeliveriesInTransaction:activeRecipient',
    ],
  )
}

// Both territories' availability comes back in one statement; the seed approves neither.
async function runJurisdictionAvailability(): Promise<void> {
  registerScenarioContract('copyright-jurisdiction-availability', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'copyright_jurisdiction_policy_approvals', max: 5 },
    ],
    allowEmptyResult: true,
  })
  await runAndCapture(
    'copyright-jurisdiction-availability',
    () => getCopyrightJurisdictionAvailability(),
    undefined,
    'getCopyrightJurisdictionAvailability',
  )
}
