import { describe, expect, it } from 'vitest'
import { beginTransaction, createTestUser } from '@voucha/test-helpers'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { createSignedInCopyrightForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { createCopyrightDeliveryIntents } from './delivery-intent-batch.mts'
import type { CopyrightDeliveryIntentInput } from './delivery-types.mts'

describe('delivery intent batches', () => {
  useCopyrightIntakeEnvironment()

  function posterIntent(noticeId: string, userId: string, key: string) {
    return {
      noticeId,
      submissionId: null,
      correspondenceId: null,
      recipientUserId: userId,
      recipientRole: 'poster',
      deliveryKind: 'poster_review_notice',
      channel: 'in_app',
      idempotencyKey: key,
    } satisfies CopyrightDeliveryIntentInput
  }

  it('maps a repeated key in one batch to one intent', async () => {
    const noticeId = (await createSignedInCopyrightForm(1)).intake.copyright_notice_id
    const user = await createTestUser()
    const key = `intent-batch:${crypto.randomUUID()}`
    await using transaction = await beginTransaction()
    const [first, second] = await createCopyrightDeliveryIntents(
      [posterIntent(noticeId, user.id, key), posterIntent(noticeId, user.id, key)],
      transaction,
    )
    expect(second!.id).toBe(first!.id)
  })

  it('rejects a repeated key that describes a different delivery in the same batch', async () => {
    const noticeId = (await createSignedInCopyrightForm(1)).intake.copyright_notice_id
    const user = await createTestUser()
    const key = `intent-batch:${crypto.randomUUID()}`
    await using transaction = await beginTransaction()
    await expect(
      createCopyrightDeliveryIntents(
        [
          posterIntent(noticeId, user.id, key),
          { ...posterIntent(noticeId, user.id, key), deliveryKind: 'poster_restriction_notice' },
        ],
        transaction,
      ),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('keeps a reversed multi-case batch mapped to each notice', async () => {
    const firstNoticeId = (await createSignedInCopyrightForm(1)).intake.copyright_notice_id
    const secondNoticeId = (await createSignedInCopyrightForm(1)).intake.copyright_notice_id
    const user = await createTestUser()
    const [earlier, later] = [firstNoticeId, secondNoticeId].toSorted()
    const inputs = [
      posterIntent(later!, user.id, `intent-batch:${crypto.randomUUID()}`),
      posterIntent(earlier!, user.id, `intent-batch:${crypto.randomUUID()}`),
    ]
    await using transaction = await beginTransaction()
    const intents = await createCopyrightDeliveryIntents(inputs, transaction)

    expect(intents.map(intent => intent.copyright_notice_id)).toEqual([later, earlier])
    expect(intents[0]!.id).not.toBe(intents[1]!.id)
  })
})
