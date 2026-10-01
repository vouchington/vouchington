import { createTestUser } from '../../index.mts'
import { createParsedCopyrightEmailIntake } from '../../../services/copyright-notices/email-intake-test-fixtures.mts'
import { rejectCopyrightEmailIntake } from '../../../services/copyright-notices/email-rejection.mts'
import {
  markCopyrightDeliveryIntentBouncedBySesMessageId,
  markCopyrightDeliveryIntentSent,
} from '../../../services/copyright-notices/delivery-intents.mts'
import { prepareCopyrightEmailDelivery } from '../../../services/copyright-notices/delivery-transport.mts'

/** A staff-declined email intake and the one reply queued to its sender. */
export async function declineTestCopyrightEmailIntake(
  input: { receivedAt?: Date; rationale?: string } = {},
): Promise<{ intakeId: string; intentId: string }> {
  const moderator = await createTestUser()
  const intake = await createParsedCopyrightEmailIntake(input.receivedAt)
  const { responseId } = await rejectCopyrightEmailIntake({
    currentUser: { ...moderator, roles: ['moderator'] } as typeof moderator,
    intakeId: intake.id,
    recommendationId: null,
    manualFallbackReason: 'The extraction agent was unavailable.',
    rationale: input.rationale ?? 'The message lacks required declarations.',
    responseKind: 'needs_information',
    responseMessage: 'Please identify the work and material.',
  })
  if (!responseId) throw new Error('Declined intake did not queue a reply')
  return { intakeId: intake.id, intentId: responseId }
}

/** Sends the reply to SES's acceptance, then records a hard bounce from its addressee. */
export async function bounceTestCopyrightEmailIntakeReply(intentId: string): Promise<void> {
  const { leaseToken, recipientEmail } = await prepareCopyrightEmailDelivery(intentId)
  const sesMessageId = `ses-bounced-${crypto.randomUUID()}`
  await markCopyrightDeliveryIntentSent({ intentId, leaseToken, sesMessageId })
  await markCopyrightDeliveryIntentBouncedBySesMessageId({
    sesMessageId,
    recipientEmails: [recipientEmail],
  })
}
