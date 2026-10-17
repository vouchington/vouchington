import { describe, expect, it } from 'vitest'
import { beginTransaction, createTestUser } from '@voucha/test-helpers'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { createSignedInCopyrightForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { readTestCopyrightStatementIntents } from '@voucha/test-helpers/copyright-statement-notices'
import {
  createCopyrightStatementDeliveriesInTransaction,
  type CopyrightStatementDeliveryInput,
} from './statement-delivery.mts'

describe('statement delivery batches', () => {
  useCopyrightIntakeEnvironment()

  async function deliver(deliveries: CopyrightStatementDeliveryInput[]) {
    await using transaction = await beginTransaction()
    await createCopyrightStatementDeliveriesInTransaction(deliveries, transaction)
    await transaction.commit()
  }

  it('delivers every recipient together and treats a repeated key as one delivery', async () => {
    const [first, second] = await Promise.all([createTestUser(), createTestUser()])
    const noticeId = (await createSignedInCopyrightForm(1)).intake.copyright_notice_id
    const deliveryFor = (userId: string, text: string): CopyrightStatementDeliveryInput => ({
      noticeId,
      recipientUserId: userId,
      recipientRole: 'poster',
      deliveryKind: 'poster_review_notice',
      correspondenceKind: 'decision_notice',
      key: `statement-batch:${userId}`,
      text,
    })
    const batch = [
      deliveryFor(first.id, 'First recipient.'),
      deliveryFor(second.id, 'Second recipient.'),
      deliveryFor(first.id, 'Repeated key, ignored.'),
    ]
    await deliver(batch)
    await deliver(batch)
    const intents = (await readTestCopyrightStatementIntents(noticeId)).filter(row =>
      [first.id, second.id].includes(row.recipient_user_id ?? ''),
    )
    expect(intents.map(row => [row.recipient_user_id, row.channel, row.text]).toSorted()).toEqual(
      [
        [first.id, 'email', 'First recipient.'],
        [first.id, 'in_app', 'First recipient.'],
        [second.id, 'email', 'Second recipient.'],
        [second.id, 'in_app', 'Second recipient.'],
      ].toSorted(),
    )
  })

  it('creates nothing for a deliveries list with no recipient', async () => {
    const noticeId = (await createSignedInCopyrightForm(1)).intake.copyright_notice_id
    const before = await readTestCopyrightStatementIntents(noticeId)
    await deliver([])
    expect(await readTestCopyrightStatementIntents(noticeId)).toEqual(before)
  })
})
