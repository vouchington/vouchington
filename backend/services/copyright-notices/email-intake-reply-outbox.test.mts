import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { expireTestCopyrightDeliveryIntentClaim } from '@voucha/test-helpers/data-stores/psql/copyright-delivery-claims'
import {
  countCopyrightStaffQueueKeysWithoutNotice,
  failTestCopyrightDeliveryIntent,
} from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { readTestCopyrightDeliveryIntentState } from '@voucha/test-helpers/copyright-lease-fencing'
import { declineTestCopyrightEmailIntake } from '@voucha/test-helpers/services/copyright-notices/declined-email-intake'
import { markCopyrightDeliveryIntentSent, prepareCopyrightEmailDelivery } from './index.mts'
import { replayFailedCopyrightDeliveryIntent } from './delivery-intents.mts'
import { findOutboundCopyrightEmailThreadMatch } from './email-threading-outbound.mts'

const rationale = 'INTERNAL-RATIONALE staff-only reasoning that must never reach the sender'

describe('the reply to a declined email intake', () => {
  it('sends the same stored text on every claim and never the staff rationale', async () => {
    const { intentId } = await declineTestCopyrightEmailIntake({ rationale })

    const first = await prepareCopyrightEmailDelivery(intentId)
    await expireTestCopyrightDeliveryIntentClaim(intentId, 1)
    const second = await prepareCopyrightEmailDelivery(intentId)
    await expireTestCopyrightDeliveryIntentClaim(intentId, 2)
    const third = await prepareCopyrightEmailDelivery(intentId)

    expect(first.text).toBe(
      'We need more information before we can evaluate your copyright notice.\n\n' +
        'Please identify the work and material.',
    )
    expect(first.subject).toBe('More information is needed for your copyright notice')
    expect(first.text).not.toContain('INTERNAL-RATIONALE')
    for (const retry of [second, third]) {
      expect(retry).toMatchObject({
        text: first.text,
        subject: first.subject,
        recipientEmail: first.recipientEmail,
        correspondenceId: null,
      })
    }
    expect(new Set([first, second, third].map(claim => claim.leaseToken)).size).toBe(3)
  })

  it('never becomes a case in the staff queue, a thread match, or a staff-replayable delivery', async () => {
    const failed = await declineTestCopyrightEmailIntake()
    await failTestCopyrightDeliveryIntent(failed.intentId)
    const sent = await declineTestCopyrightEmailIntake()
    const sesMessageId = `ses-intake-reply-${crypto.randomUUID()}`
    const { leaseToken } = await prepareCopyrightEmailDelivery(sent.intentId)
    await markCopyrightDeliveryIntentSent({ intentId: sent.intentId, leaseToken, sesMessageId })

    await expect(countCopyrightStaffQueueKeysWithoutNotice()).resolves.toBe(0)
    await expect(findOutboundCopyrightEmailThreadMatch([sesMessageId])).resolves.toBeNull()
    const staff = await createTestUser()
    await expect(
      replayFailedCopyrightDeliveryIntent({
        intentId: failed.intentId,
        noticeId: crypto.randomUUID(),
        actorUserId: staff.id,
      }),
    ).resolves.toBe(false)
    await expect(readTestCopyrightDeliveryIntentState(failed.intentId)).resolves.toBe('failed')
  })
})
